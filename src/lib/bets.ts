// Points Exchange — wagering with live leaderboard points as the currency.
//
// Balance model: a user's spendable balance = their prediction points
// (userMetrics.totalPoints, owned by the scorer) + their wager delta
// (userMetrics.wagerBalance, owned here). Placing a bet immediately subtracts
// the stake from wagerBalance; settling a winner adds the payout back. So a lost
// bet nets -stake (deducted at placement, nothing added at settle) and a won bet
// nets (payout - stake). This keeps betting P&L separate from prediction points
// so re-scoring can never clobber it, while both roll up into the leaderboard.
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";
import type { Match } from "./types";

export type BetMarket = "matchWinner" | "correctScore";
export type BetStatus = "pending" | "won" | "lost" | "void";

export interface Bet {
  id?: string;
  userId: string;
  matchId: string;
  matchLabel: string;
  market: BetMarket;
  selection: string;        // "home"|"draw"|"away", or "2:1"
  selectionLabel: string;   // human readable
  odds: number;             // decimal, locked at placement
  stake: number;
  expectedPayout: number;   // stake * odds (returned if it wins)
  potentialProfit: number;  // expectedPayout - stake
  placedAt: string;
  status: BetStatus;
  settledAt: string | null;
  payout: number;           // actual points returned on settlement
  resultScore: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

// Correct Score is a fixed-payout market in this game: nail the exact final
// scoreline and you double your stake, regardless of how likely the score was.
export const EXACT_SCORE_PAYOUT = 2.0;
export const MAX_STAKE = 10;          // most you can stake on a single bet
export const MAX_BETS_PER_MATCH = 2;  // most bets one player can place on a game

function selectionLabelFor(market: BetMarket, selection: string, m: Match): string {
  if (market === "matchWinner") {
    if (selection === "home") return `${m.homeTeam} to win`;
    if (selection === "away") return `${m.awayTeam} to win`;
    return "Draw";
  }
  return `Exact score ${selection.replace(":", "–")} (${m.homeTeam} first)`;
}

// American moneyline (from ESPN's DraftKings feed) → decimal payout multiplier.
export function americanToDecimal(a: number | null | undefined): number | null {
  if (a == null || a === 0) return null;
  const d = a < 0 ? 1 + 100 / -a : 1 + a / 100;
  return Math.round(d * 100) / 100;
}

// Decimal odds for a selection. Match Winner uses the match's DraftKings
// moneyline (via ESPN); Correct Score is a flat 2x for any exact scoreline.
function oddsForSelection(m: Match, market: BetMarket, selection: string): number | null {
  if (market === "matchWinner") {
    const o = m.odds;
    if (!o) return null;
    const am = selection === "home" ? o.homeML : selection === "away" ? o.awayML : selection === "draw" ? o.drawML : null;
    const dec = americanToDecimal(am);
    return dec && dec > 1 ? dec : null;
  }
  if (market === "correctScore") {
    return /^[0-9]:[0-9]$/.test(selection) ? EXACT_SCORE_PAYOUT : null;
  }
  return null;
}

export interface PlaceBetInput { matchId: string; market: BetMarket; selection: string; stake: number; }

// Places a bet atomically: validates the match is still open, the odds exist,
// and the user can afford the stake, then writes the bet and debits the stake in
// one transaction (no double-spend, never goes negative).
export async function placeBet(db: Firestore, uid: string, input: PlaceBetInput): Promise<Bet> {
  const { matchId, market, selection } = input;
  const stake = round1(Number(input.stake));

  if (!(stake > 0)) throw new Error("Stake must be greater than 0.");
  if (stake > MAX_STAKE) throw new Error(`Max stake is ${MAX_STAKE} points per bet.`);
  if (market !== "matchWinner" && market !== "correctScore") throw new Error("Unknown market.");

  const matchSnap = await db.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) throw new Error("Match not found.");
  const match = matchSnap.data() as Match;

  if (match.bettingDisabled) throw new Error("Betting is closed for this match.");
  if (match.status !== "upcoming" || new Date(match.kickoffTimeUTC).getTime() <= Date.now()) {
    throw new Error("Betting is closed for this match (it has started or finished).");
  }
  const odds = oddsForSelection(match, market, selection);
  if (!odds) throw new Error("Those odds aren't available for this match.");

  const matchLabel = `${match.homeTeam} v ${match.awayTeam}`;
  const selectionLabel = selectionLabelFor(market, selection, match);
  const expectedPayout = round1(stake * odds);
  const now = new Date().toISOString();

  const betRef = db.collection("bets").doc();
  const metricsRef = db.collection("userMetrics").doc(uid);

  const bet: Bet = {
    userId: uid, matchId, matchLabel, market, selection, selectionLabel,
    odds, stake, expectedPayout, potentialProfit: round1(expectedPayout - stake),
    placedAt: now, status: "pending", settledAt: null, payout: 0, resultScore: null,
  };

  const existingQuery = db.collection("bets").where("userId", "==", uid).where("matchId", "==", matchId);

  await db.runTransaction(async (tx) => {
    // All reads before any writes.
    const [mSnap, existing] = await Promise.all([tx.get(metricsRef), tx.get(existingQuery)]);
    if (existing.size >= MAX_BETS_PER_MATCH) {
      throw new Error(`Max ${MAX_BETS_PER_MATCH} bets per game — you already have ${existing.size} on this match.`);
    }
    const data = mSnap.exists ? mSnap.data()! : {};
    const predictionPoints = (data.totalPoints as number) ?? 0;
    const wagerBalance = (data.wagerBalance as number) ?? 0;
    const available = round1(predictionPoints + wagerBalance);
    if (stake > available) {
      throw new Error(`Not enough points — you have ${available}, tried to stake ${stake}.`);
    }
    tx.set(metricsRef, { userId: uid, wagerBalance: round1(wagerBalance - stake) }, { merge: true });
    tx.set(betRef, bet);
  });

  return { ...bet, id: betRef.id };
}

// Settle every pending bet whose match is now final. Idempotent — only touches
// status "pending", marks each won/lost with its payout, and credits winners'
// wagerBalance. Match Winner and Correct Score both settle on the recorded
// final score (a knockout won on penalties counts as a draw for 1X2 / the level
// scoreline for Correct Score).
export async function settleBetsCore(db: Firestore): Promise<{ settled: number; won: number; paidOut: number }> {
  const pendingSnap = await db.collection("bets").where("status", "==", "pending").get();
  if (pendingSnap.empty) return { settled: 0, won: 0, paidOut: 0 };

  const matchIds = [...new Set(pendingSnap.docs.map((d) => d.data().matchId as string))];
  const matchDocs = await db.getAll(...matchIds.map((id) => db.collection("matches").doc(id)));
  const matchById: Record<string, Match> = {};
  for (const d of matchDocs) if (d.exists) matchById[d.id] = d.data() as Match;

  const payoutByUser: Record<string, number> = {};
  const updates: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] = [];
  let settled = 0, won = 0, paidOut = 0;

  for (const d of pendingSnap.docs) {
    const bet = d.data() as Bet;
    const m = matchById[bet.matchId];
    if (!m || m.status !== "final" || m.homeScore == null || m.awayScore == null) continue;

    const reg = m.homeScore > m.awayScore ? "home" : m.awayScore > m.homeScore ? "away" : "draw";
    const isWin = bet.market === "matchWinner"
      ? bet.selection === reg
      : bet.selection === `${m.homeScore}:${m.awayScore}`;

    const payout = isWin ? round1(bet.stake * bet.odds) : 0;
    updates.push({ ref: d.ref, data: { status: isWin ? "won" : "lost", payout, settledAt: new Date().toISOString(), resultScore: `${m.homeScore}:${m.awayScore}` } });
    settled++;
    if (isWin) { won++; paidOut = round1(paidOut + payout); payoutByUser[bet.userId] = round1((payoutByUser[bet.userId] ?? 0) + payout); }
  }

  // Write bet settlements + credit winners (increment is safe under concurrency).
  for (let i = 0; i < updates.length; i += 400) {
    const batch = db.batch();
    for (const u of updates.slice(i, i + 400)) batch.update(u.ref, u.data);
    await batch.commit();
  }
  const userIds = Object.keys(payoutByUser);
  for (let i = 0; i < userIds.length; i += 400) {
    const batch = db.batch();
    for (const uid of userIds.slice(i, i + 400)) {
      batch.set(db.collection("userMetrics").doc(uid), { userId: uid, wagerBalance: FieldValue.increment(payoutByUser[uid]) }, { merge: true });
    }
    await batch.commit();
  }

  return { settled, won, paidOut };
}

// Public book for one match: who bet what, the stake, and the payout. Used for
// the "who's betting on this game" view. Sorted by stake (biggest first).
export async function getMatchBets(db: Firestore, matchId: string): Promise<{
  matchLabel: string | null;
  bets: { username: string; selectionLabel: string; market: BetMarket; odds: number; stake: number; expectedPayout: number; status: BetStatus }[];
  totalStaked: number;
}> {
  const betsSnap = await db.collection("bets").where("matchId", "==", matchId).get();
  if (betsSnap.empty) return { matchLabel: null, bets: [], totalStaked: 0 };

  const usersSnap = await db.collection("users").get();
  const nameByUid: Record<string, string> = {};
  for (const d of usersSnap.docs) { const u = d.data(); if (u.username) nameByUid[d.id] = u.username as string; }

  let matchLabel: string | null = null;
  let totalStaked = 0;
  const bets = betsSnap.docs.map((d) => {
    const b = d.data() as Bet;
    matchLabel = b.matchLabel;
    totalStaked = round1(totalStaked + b.stake);
    return {
      username: nameByUid[b.userId] ?? "someone",
      selectionLabel: b.selectionLabel, market: b.market, odds: b.odds,
      stake: b.stake, expectedPayout: b.expectedPayout, status: b.status,
    };
  }).sort((a, b) => b.stake - a.stake);

  return { matchLabel, bets, totalStaked };
}

// Everything the betting UI needs for one user: balance breakdown + their bets.
export async function getBettingContext(db: Firestore, uid: string): Promise<{
  predictionPoints: number; wagerBalance: number; available: number; bets: Bet[];
}> {
  const [mSnap, betsSnap] = await Promise.all([
    db.collection("userMetrics").doc(uid).get(),
    db.collection("bets").where("userId", "==", uid).get(),
  ]);
  const data = mSnap.exists ? mSnap.data()! : {};
  const predictionPoints = (data.totalPoints as number) ?? 0;
  const wagerBalance = (data.wagerBalance as number) ?? 0;
  const bets = betsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as Bet) }))
    .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
  return { predictionPoints, wagerBalance, available: round1(predictionPoints + wagerBalance), bets };
}
