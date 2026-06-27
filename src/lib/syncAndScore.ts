// Shared core logic for pulling match data from ESPN and scoring predictions.
// Used by both the admin-only routes (sync-matches, score-matches) and the
// combined /api/refresh route any signed-in user can trigger.
import type { Firestore } from "firebase-admin/firestore";
import { WC2026_TOURNAMENT, isWorldCup2026 } from "./tournament";
import { PREDICTIONS_LOCK_UTC } from "./lock";
import { resolveChampion, buildStandings, resolveSlot, BRACKET_MAP } from "./bracket";
import type { Match, Prediction } from "./types";

const ESPN_WC = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

// 2026 FIFA World Cup group assignments (sourced from ESPN standings)
const TEAM_GROUP: Record<string, string> = {
  "Mexico": "A", "Czechia": "A", "South Korea": "A", "South Africa": "A",
  "Canada": "B", "Bosnia-Herzegovina": "B", "Switzerland": "B", "Qatar": "B",
  "Brazil": "C", "Scotland": "C", "Haiti": "C", "Morocco": "C",
  "Paraguay": "D", "Türkiye": "D", "Australia": "D", "United States": "D",
  "Ecuador": "E", "Germany": "E", "Ivory Coast": "E", "Curaçao": "E",
  "Netherlands": "F", "Sweden": "F", "Japan": "F", "Tunisia": "F",
  "Belgium": "G", "Iran": "G", "Egypt": "G", "New Zealand": "G",
  "Spain": "H", "Uruguay": "H", "Saudi Arabia": "H", "Cape Verde": "H",
  "Norway": "I", "France": "I", "Senegal": "I", "Iraq": "I",
  "Argentina": "J", "Austria": "J", "Algeria": "J", "Jordan": "J",
  "Colombia": "K", "Portugal": "K", "Uzbekistan": "K", "Congo DR": "K",
  "England": "L", "Croatia": "L", "Panama": "L", "Ghana": "L",
};

function mapStatus(espnStatus: string): "upcoming" | "live" | "final" {
  if (espnStatus === "STATUS_FULL_TIME" || espnStatus === "STATUS_FINAL") return "final";
  if (espnStatus.includes("IN_PROGRESS") || espnStatus === "STATUS_HALFTIME") return "live";
  return "upcoming";
}

function mapRound(slugOrName: string): string {
  const s = slugOrName?.toLowerCase() ?? "";
  if (s.includes("group")) return "Group Stage";
  if (s.includes("round of 32") || s.includes("round-of-32")) return "Round of 32";
  if (s.includes("round of 16") || s.includes("round-of-16")) return "Round of 16";
  if (s.includes("quarter")) return "Quarterfinal";
  if (s.includes("semi")) return "Semifinal";
  if (s.includes("final")) return "Final";
  return "Group Stage";
}

async function fetchAllEspnEvents() {
  // One continuous window covering the whole tournament. (The old two-range
  // split skipped June 27 — the last group-stage matchday — so those 6 games
  // never synced.)
  const ranges = ["20260611-20260719"];
  const all = [];
  for (const range of ranges) {
    const res = await fetch(`${ESPN_WC}/scoreboard?dates=${range}&limit=200`, { next: { revalidate: 0 } });
    const data = await res.json();
    all.push(...(data.events ?? []));
  }
  return all;
}

export async function syncMatchesCore(db: Firestore): Promise<{ synced: number }> {
  const events = await fetchAllEspnEvents();
  const batch = db.batch();
  let synced = 0;

  for (const event of events) {
    const comps = event.competitions?.[0];
    if (!comps) continue;

    const competitors = comps.competitors ?? [];
    const home = competitors.find((c: Record<string, unknown>) => c.homeAway === "home") ?? competitors[0];
    const away = competitors.find((c: Record<string, unknown>) => c.homeAway === "away") ?? competitors[1];
    if (!home || !away) continue;

    const homeTeam = home.team?.displayName ?? "TBD";
    const awayTeam = away.team?.displayName ?? "TBD";
    const status = mapStatus(event.status?.type?.name ?? "");

    const homeScore = status !== "upcoming" ? parseInt(home.score ?? "0") : null;
    const awayScore = status !== "upcoming" ? parseInt(away.score ?? "0") : null;

    let winner: string | null = null;
    if (status === "final" && homeScore !== null && awayScore !== null) {
      if (homeScore > awayScore) winner = homeTeam;
      else if (awayScore > homeScore) winner = awayTeam;
      else winner = "draw";
    }

    const group = TEAM_GROUP[homeTeam] ?? TEAM_GROUP[awayTeam] ?? null;
    const round = mapRound(event.season?.slug ?? "group-stage");

    const oddsData = comps.odds?.[0] ?? null;
    const odds = oddsData ? {
      homeML: oddsData.moneyline?.home?.close?.odds ? parseInt(oddsData.moneyline.home.close.odds) : null,
      awayML: oddsData.moneyline?.away?.close?.odds ? parseInt(oddsData.moneyline.away.close.odds) : null,
      drawML: oddsData.drawOdds?.moneyLine ?? null,
      overUnder: oddsData.overUnder ?? null,
    } : null;

    const matchData = {
      matchId: `espn-${event.id}`,
      espnId: event.id,
      tournament: WC2026_TOURNAMENT,
      homeTeam,
      awayTeam,
      homeTeamLogo: home.team?.logo ?? null,
      awayTeamLogo: away.team?.logo ?? null,
      round,
      group,
      venue: comps.venue?.fullName ?? "TBD",
      kickoffTimeUTC: event.date,
      status,
      homeScore,
      awayScore,
      winner,
      odds,
      updatedAt: new Date().toISOString(),
    };

    batch.set(db.collection("matches").doc(`espn-${event.id}`), matchData, { merge: true });
    synced++;
  }

  await batch.commit();
  return { synced };
}

const ROUND_PTS: Record<string, { advance: number; exact: number }> = {
  "Group Stage":   { advance: 1,  exact: 2  },
  "Round of 32":  { advance: 5,  exact: 5  },
  "Round of 16":  { advance: 10, exact: 10 },
  "Quarterfinal": { advance: 20, exact: 20 },
  "Semifinal":    { advance: 40, exact: 40 },
  "Final":        { advance: 50, exact: 50 },
};

// Predictions submitted after the global deadline shouldn't have existed at
// all. Rather than deleting them retroactively, they score at a steep
// penalty instead of zero. See src/lib/lock.ts for the deadline itself.
const LATE_SUBMISSION_MULTIPLIER = 0.1;

function calcPoints(
  round: string,
  predictedWinner: string,
  predictedHome: number | null,
  predictedAway: number | null,
  actualWinner: string,
  actualHome: number | null,
  actualAway: number | null
): number {
  const pts = ROUND_PTS[round];
  if (!pts) return 0;

  const correctOutcome = predictedWinner === actualWinner;
  const exactScore =
    actualHome !== null &&
    actualAway !== null &&
    predictedHome === actualHome &&
    predictedAway === actualAway;

  if (round === "Group Stage") {
    if (exactScore) return 2;
    if (correctOutcome) return 1;
    return 0;
  }

  let total = 0;
  if (correctOutcome) total += pts.advance;
  if (exactScore) total += pts.exact;
  return total;
}

export interface ScoreResult {
  scored: number;        // predictions (re)scored this run
  finalMatches: number;  // total final WC matches
  newlyScored: number;   // matches that actually needed scoring this run
  users: number;         // users whose total changed
  lateSubmissions: number;
  deltas: Record<string, number>;
}

// Marker stored on a match doc recording the result it was last scored against.
// A match only needs (re)scoring when this doesn't match its current result.
function resultKey(m: FirebaseFirestore.DocumentData): string {
  return `${m.homeScore}-${m.awayScore}-${m.winner ?? ""}`;
}

// Incremental scoring: only touches matches whose final result hasn't been
// scored yet (or changed since), and adjusts each user's total by the delta
// rather than zeroing and recomputing every prediction from scratch. A match
// already scored at its current result is skipped entirely — no prediction
// reads, no writes — so a refresh on a day with a couple of new results costs
// a few dozen reads instead of scanning the whole predictions collection.
export async function scoreMatchesCore(db: Firestore): Promise<ScoreResult> {
  // World Cup 2026 only — scoring must never read any other tournament's data.
  const matchSnap = await db.collection("matches").where("status", "==", "final").get();
  const wcDocs = matchSnap.docs.filter((d) => isWorldCup2026(d.data()));

  // Only matches whose current result hasn't been scored yet.
  const toScore = wcDocs.filter((d) => d.data().lastScoredResult !== resultKey(d.data()));
  if (toScore.length === 0) {
    return { scored: 0, finalMatches: wcDocs.length, newlyScored: 0, users: 0, lateSubmissions: 0, deltas: {} };
  }

  const matchData: Record<string, FirebaseFirestore.DocumentData> = {};
  for (const d of toScore) matchData[d.id] = d.data();
  const ids = toScore.map((d) => d.id);

  const CHUNK = 30;
  const userDelta: Record<string, number> = {};
  let totalScored = 0;
  let lateSubmissions = 0;
  const deadlineMs = new Date(PREDICTIONS_LOCK_UTC).getTime();

  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const predSnap = await db.collection("predictions").where("matchId", "in", chunk).get();

    const batch = db.batch();
    for (const predDoc of predSnap.docs) {
      const pred = predDoc.data();
      const match = matchData[pred.matchId];
      if (!match) continue;

      let pts = calcPoints(
        match.round,
        pred.predictedWinner,
        pred.predictedHomeScore,
        pred.predictedAwayScore,
        match.winner,
        match.homeScore,
        match.awayScore
      );

      const isLate = !!pred.submittedAt && new Date(pred.submittedAt).getTime() > deadlineMs;
      if (isLate) {
        pts = Math.round(pts * LATE_SUBMISSION_MULTIPLIER * 10) / 10;
        lateSubmissions++;
      }

      const prev = (pred.pointsAwarded as number) ?? 0;
      const delta = pts - prev;
      // Only write the prediction if its points actually changed.
      if (delta !== 0 || pred.pointsAwarded === undefined) {
        batch.update(predDoc.ref, { pointsAwarded: pts, ...(isLate ? { latePenalty: true } : {}) });
      }
      userDelta[pred.userId] = (userDelta[pred.userId] ?? 0) + delta;
      totalScored++;
    }

    // Mark every match in this chunk as scored at its current result (even
    // ones with no predictions) so they're skipped on future runs.
    for (const id of chunk) {
      batch.update(db.collection("matches").doc(id), { lastScoredResult: resultKey(matchData[id]) });
    }
    await batch.commit();
  }

  // Apply the accumulated deltas to userMetrics totals (read only the affected
  // users, add, round to kill float drift, write).
  const affected = Object.keys(userDelta).filter((uid) => Math.abs(userDelta[uid]) > 1e-9);
  const deltas: Record<string, number> = {};
  if (affected.length > 0) {
    const refs = affected.map((uid) => db.collection("userMetrics").doc(uid));
    const snaps = await db.getAll(...refs);
    const batch = db.batch();
    for (let i = 0; i < affected.length; i++) {
      const uid = affected[i];
      const cur = snaps[i].exists ? ((snaps[i].data()!.totalPoints as number) ?? 0) : 0;
      const next = Math.round((cur + userDelta[uid]) * 10) / 10;
      batch.set(db.collection("userMetrics").doc(uid), { userId: uid, totalPoints: next }, { merge: true });
      deltas[uid] = Math.round(userDelta[uid] * 10) / 10;
    }
    await batch.commit();
  }

  return {
    scored: totalScored,
    finalMatches: wcDocs.length,
    newlyScored: toScore.length,
    users: affected.length,
    lateSubmissions,
    deltas,
  };
}

// One-time migration into the optimized steady state. Reads matches +
// predictions ONCE and:
//   1. caches each user's resolved champion on their user doc (championPick),
//   2. fully (re)scores every final match — absolute totals, so it self-heals
//      any matches that finished during the quota outage and were never scored,
//   3. stamps lastScoredResult on every final match so subsequent scoreMatches
//      runs are incremental.
// After this runs, the leaderboard reads ~20 docs and refreshes are cheap.
export async function migrateOptimize(db: Firestore): Promise<{ users: number; champions: number; finalMatches: number; scored: number }> {
  const [usersSnap, matchSnap, predSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("matches").get(),
    db.collection("predictions").get(),
  ]);

  const matches = matchSnap.docs.map((d) => d.data() as Match).filter((m) => isWorldCup2026(m));
  const matchById: Record<string, Match> = {};
  for (const m of matches) matchById[m.matchId] = m;

  const predsByUser: Record<string, Record<string, Prediction>> = {};
  const allPreds: { ref: FirebaseFirestore.DocumentReference; pred: Prediction }[] = [];
  for (const d of predSnap.docs) {
    const p = d.data() as Prediction;
    (predsByUser[p.userId] ??= {})[p.matchId] = p;
    allPreds.push({ ref: d.ref, pred: p });
  }

  const deadlineMs = new Date(PREDICTIONS_LOCK_UTC).getTime();
  const finals = matches.filter((m) => m.status === "final" && m.homeScore != null && m.awayScore != null);
  const finalIds = new Set(finals.map((m) => m.matchId));
  const pointsByUser: Record<string, number> = {};

  // Helper to commit large batches in chunks (Firestore limit 500 writes).
  const writes: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }[] = [];

  // 1. champion cache per user
  let champions = 0;
  for (const d of usersSnap.docs) {
    const champ = resolveChampion(matches, predsByUser[d.id] ?? {});
    if (champ) champions++;
    writes.push({ ref: d.ref, data: { championPick: champ ?? null } });
  }

  // 2. full (re)score of final-match predictions
  for (const { ref, pred } of allPreds) {
    if (!finalIds.has(pred.matchId)) continue;
    const match = matchById[pred.matchId];
    let pts = calcPoints(match.round, pred.predictedWinner, pred.predictedHomeScore, pred.predictedAwayScore,
      match.winner as string, match.homeScore, match.awayScore);
    const isLate = !!pred.submittedAt && new Date(pred.submittedAt).getTime() > deadlineMs;
    if (isLate) pts = Math.round(pts * LATE_SUBMISSION_MULTIPLIER * 10) / 10;
    writes.push({ ref, data: { pointsAwarded: pts, ...(isLate ? { latePenalty: true } : {}) } });
    pointsByUser[pred.userId] = (pointsByUser[pred.userId] ?? 0) + pts;
  }

  // 3. absolute totals + match markers
  for (const m of finals) {
    writes.push({ ref: db.collection("matches").doc(m.matchId), data: { lastScoredResult: resultKey(m) } });
  }
  for (const d of usersSnap.docs) {
    const total = Math.round((pointsByUser[d.id] ?? 0) * 10) / 10;
    writes.push({ ref: db.collection("userMetrics").doc(d.id), data: { userId: d.id, totalPoints: total } });
  }

  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 450)) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();
  }

  return { users: usersSnap.size, champions, finalMatches: finals.length, scored: allPreds.filter((p) => finalIds.has(p.pred.matchId)).length };
}

// Correction: knockout predictions were saved with predictedWinner resolved
// against EMPTY group standings, so many landed as placeholders ("Group B #2")
// instead of the real team the player picked. Those can never match a real
// winner, silently scoring 0 on the winner half. This recomputes each knockout
// prediction's winner from the player's OWN bracket (their real predicted
// standings) and rewrites it to the actual team name. Group-stage predictions
// (no bracket slot) are left untouched — their teams were always real.
export async function correctKnockoutWinners(db: Firestore): Promise<{ scanned: number; fixed: number; sample: string[] }> {
  const [matchSnap, predSnap] = await Promise.all([
    db.collection("matches").get(),
    db.collection("predictions").get(),
  ]);
  const matches = matchSnap.docs.map((d) => d.data() as Match).filter((m) => isWorldCup2026(m));

  const predsByUser: Record<string, Record<string, Prediction>> = {};
  const refByKey: Record<string, FirebaseFirestore.DocumentReference> = {};
  for (const d of predSnap.docs) {
    const p = d.data() as Prediction;
    (predsByUser[p.userId] ??= {})[p.matchId] = p;
    refByKey[`${p.userId}|${p.matchId}`] = d.ref;
  }

  const writes: { ref: FirebaseFirestore.DocumentReference; winner: string }[] = [];
  let scanned = 0;
  const sample: string[] = [];

  for (const [uid, preds] of Object.entries(predsByUser)) {
    const { standings, thirdPlace } = buildStandings(matches, preds);
    for (const [matchId, p] of Object.entries(preds)) {
      const slots = BRACKET_MAP[matchId];
      if (!slots) continue; // group stage — real teams already
      scanned++;

      const home = resolveSlot(slots.home, standings, thirdPlace, preds);
      const away = resolveSlot(slots.away, standings, thirdPlace, preds);
      const hs = p.predictedHomeScore;
      const as_ = p.predictedAwayScore;

      let winner: string;
      if (hs != null && as_ != null && hs !== as_) winner = hs > as_ ? home : away;
      else winner = "draw"; // drawn/blank knockout pick — genuinely no winner

      if (winner && winner !== p.predictedWinner) {
        writes.push({ ref: refByKey[`${uid}|${matchId}`], winner });
        if (sample.length < 6) sample.push(`${p.predictedWinner} → ${winner}`);
      }
    }
  }

  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 450)) batch.update(w.ref, { predictedWinner: w.winner });
    await batch.commit();
  }

  return { scanned, fixed: writes.length, sample };
}
