// Shared core logic for pulling match data from ESPN and scoring predictions.
// Used by both the admin-only routes (sync-matches, score-matches) and the
// combined /api/refresh route any signed-in user can trigger.
import type { Firestore } from "firebase-admin/firestore";
import { WC2026_TOURNAMENT, isWorldCup2026 } from "./tournament";
import { PREDICTIONS_LOCK_UTC } from "./lock";
import { resolveChampion, buildStandings, resolveSlot, resolveMatchTeams, BRACKET_MAP } from "./bracket";
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
  const s = espnStatus ?? "";
  // Finished: STATUS_FULL_TIME, STATUS_FINAL, and knockout finishes like
  // STATUS_FINAL_PEN (penalties) and STATUS_FINAL_AET (after extra time).
  if (s.includes("FULL_TIME") || s.includes("FINAL")) return "final";
  // In play, including extra time and the shootout itself.
  if (s.includes("IN_PROGRESS") || s.includes("HALFTIME") || s.includes("EXTRA") || s.includes("SHOOTOUT") || s.includes("OVERTIME")) return "live";
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
    const espnStatus = event.status?.type?.name ?? "";
    const status = mapStatus(espnStatus);

    // How a final game was decided — used to settle 90-minute betting markets:
    // a game that reaches extra time or penalties was, by definition, level at
    // 90 minutes, so its Match Winner settles as a Draw.
    let decidedIn: "regulation" | "extra_time" | "penalties" | null = null;
    if (status === "final") {
      const s = (espnStatus + " " + (event.status?.type?.detail ?? event.status?.type?.description ?? "")).toUpperCase();
      decidedIn = /PEN|SHOOTOUT/.test(s) ? "penalties" : /AET|EXTRA|OVERTIME/.test(s) ? "extra_time" : "regulation";
    }

    const homeScore = status !== "upcoming" ? parseInt(home.score ?? "0") : null;
    const awayScore = status !== "upcoming" ? parseInt(away.score ?? "0") : null;

    let winner: string | null = null;
    if (status === "final" && homeScore !== null && awayScore !== null) {
      // ESPN's `winner` flag is penalty-aware: on a shootout the on-field score
      // is level (e.g. 1-1) but the flag is set on the team that advanced. Trust
      // it first; fall back to the score only if no flag is present.
      if (home.winner === true) winner = homeTeam;
      else if (away.winner === true) winner = awayTeam;
      else if (homeScore > awayScore) winner = homeTeam;
      else if (awayScore > homeScore) winner = awayTeam;
      else winner = "draw";
    }

    const group = TEAM_GROUP[homeTeam] ?? TEAM_GROUP[awayTeam] ?? null;
    // ESPN's slug doesn't distinguish the 3rd-place playoff from the group
    // stage, so it lands as "Group Stage" by default. Pin it by event id.
    const round = event.id === "760516" ? "Third Place" : mapRound(event.season?.slug ?? "group-stage");

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
      decidedIn,
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
  // 3rd-place playoff sits between the semis (40) and the final (50).
  "Third Place":  { advance: 45, exact: 45 },
  "Final":        { advance: 50, exact: 50 },
};

const KNOCKOUT_ROUNDS = new Set([
  "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Third Place", "Final",
]);

// A predicted winner only scores if it's a real, resolved team — not "draw",
// not an ambiguous "Team A / Team B" left by an upstream tie, not a "Group A #1"
// style placeholder.
function isResolvedTeam(w: unknown): w is string {
  return typeof w === "string" && w.length > 0 && w !== "draw"
    && !w.includes(" / ") && !w.includes("#") && !/(Group |Place|Winner |Loser )/.test(w);
}

// Actual knockout results indexed by round → team → that team's result. Used by
// the winner+round scoring model: a knockout pick is matched to the actual game
// its predicted winner played in that round, regardless of bracket slot.
type KnockoutActuals = Record<string, Record<string, { won: boolean; winnerGoals: number; loserGoals: number }>>;
function buildKnockoutActuals(finals: FirebaseFirestore.DocumentData[]): KnockoutActuals {
  const ko: KnockoutActuals = {};
  for (const m of finals) {
    if (!KNOCKOUT_ROUNDS.has(m.round)) continue;
    if (m.homeScore == null || m.awayScore == null || !m.winner || m.winner === "draw") continue;
    const homeWon = m.winner === m.homeTeam;
    const winnerGoals = homeWon ? m.homeScore : m.awayScore;
    const loserGoals = homeWon ? m.awayScore : m.homeScore;
    (ko[m.round] ??= {});
    ko[m.round][m.homeTeam] = { won: homeWon, winnerGoals, loserGoals };
    ko[m.round][m.awayTeam] = { won: !homeWon, winnerGoals, loserGoals };
  }
  return ko;
}

// Predictions submitted after the global deadline shouldn't have existed at
// all. Rather than deleting them retroactively, they score at a steep
// penalty instead of zero. See src/lib/lock.ts for the deadline itself.
const LATE_SUBMISSION_MULTIPLIER = 0.1;

function calcPoints(
  match: FirebaseFirestore.DocumentData,
  pred: FirebaseFirestore.DocumentData,
  koActual: KnockoutActuals
): number {
  const pts = ROUND_PTS[match.round];
  if (!pts) return 0;

  // Group stage: scored against this exact fixture (real, fixed teams).
  if (match.round === "Group Stage") {
    const correctOutcome = pred.predictedWinner === match.winner;
    const exactScore =
      match.homeScore !== null && match.awayScore !== null &&
      pred.predictedHomeScore === match.homeScore &&
      pred.predictedAwayScore === match.awayScore;
    if (exactScore) return 2;
    if (correctOutcome) return 1;
    return 0;
  }

  // Knockout: match by predicted winner + round, NOT by bracket slot. Find the
  // actual game the picked team played in this round. (Option A: the exact-score
  // bonus only lands when your team actually won with that scoreline.)
  const team = pred.predictedWinner;
  if (!isResolvedTeam(team)) return 0;
  const actual = koActual[match.round]?.[team];
  if (!actual || !actual.won) return 0; // team didn't win (or didn't reach) this round

  let total = pts.advance;
  // Normalize the predicted scoreline to winner-perspective so home/away
  // orientation (which came from the user's own bracket) doesn't matter.
  const predWinnerGoals = Math.max(pred.predictedHomeScore ?? 0, pred.predictedAwayScore ?? 0);
  const predLoserGoals = Math.min(pred.predictedHomeScore ?? 0, pred.predictedAwayScore ?? 0);
  if (actual.winnerGoals === predWinnerGoals && actual.loserGoals === predLoserGoals) {
    total += pts.exact;
  }
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

// Full recompute, gated by a result signature. The knockout winner+round model
// means one finished game can change many users' points (anyone who backed
// either team), so per-match incremental scoring no longer works. Instead we
// hash every final result; if it's unchanged since the last run we skip
// entirely (a few match reads, no prediction reads), and only when a result
// changes do we re-score every prediction from scratch (absolute totals, which
// also self-heals any drift).
export async function scoreMatchesCore(db: Firestore): Promise<ScoreResult> {
  // World Cup 2026 only — scoring must never read any other tournament's data.
  // We read ALL matches (not just finals): a knockout prediction's round comes
  // from its slot even when that slot's own game hasn't been played, and the
  // winner+round model scores it off the predicted team's actual game elsewhere.
  const matchSnap = await db.collection("matches").get();
  const allMatches = matchSnap.docs.map((d) => d.data()).filter((m) => isWorldCup2026(m));
  const finals = allMatches.filter((m) => m.status === "final" && m.homeScore != null && m.awayScore != null);

  const signature = finals.map((m) => `${m.matchId}:${resultKey(m)}`).sort().join("|");
  const stateRef = db.collection("metadata").doc("scoringState");
  const stateSnap = await stateRef.get();
  if (stateSnap.exists && stateSnap.data()?.signature === signature) {
    return { scored: 0, finalMatches: finals.length, newlyScored: 0, users: 0, lateSubmissions: 0, deltas: {} };
  }

  const koActual = buildKnockoutActuals(finals);
  const matchById: Record<string, FirebaseFirestore.DocumentData> = {};
  for (const m of allMatches) matchById[m.matchId] = m;

  const [predSnap, metricsSnap] = await Promise.all([
    db.collection("predictions").get(),
    db.collection("userMetrics").get(),
  ]);

  const deadlineMs = new Date(PREDICTIONS_LOCK_UTC).getTime();
  const pointsByUser: Record<string, number> = {};
  let totalScored = 0;
  let lateSubmissions = 0;
  const writes: { ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }[] = [];

  for (const predDoc of predSnap.docs) {
    const pred = predDoc.data();
    const match = matchById[pred.matchId];
    let pts = 0;
    let isLate = false;
    if (match) {
      pts = calcPoints(match, pred, koActual);
      isLate = !!pred.submittedAt && new Date(pred.submittedAt).getTime() > deadlineMs;
      if (isLate && pts > 0) {
        pts = Math.round(pts * LATE_SUBMISSION_MULTIPLIER * 10) / 10;
        lateSubmissions++;
      }
    }
    if (((pred.pointsAwarded as number) ?? 0) !== pts) {
      writes.push({ ref: predDoc.ref, data: { pointsAwarded: pts, ...(isLate ? { latePenalty: true } : {}) } });
    }
    if (pts > 0) {
      pointsByUser[pred.userId] = (pointsByUser[pred.userId] ?? 0) + pts;
      totalScored++;
    }
  }

  // Absolute user totals. Update every metrics doc (zeroing anyone who now has
  // no points) plus create any missing ones.
  const deltas: Record<string, number> = {};
  const seen = new Set<string>();
  for (const m of metricsSnap.docs) {
    seen.add(m.id);
    const next = Math.round((pointsByUser[m.id] ?? 0) * 10) / 10;
    const prev = (m.data().totalPoints as number) ?? 0;
    if (prev !== next) {
      writes.push({ ref: m.ref, data: { userId: m.id, totalPoints: next } });
      deltas[m.id] = Math.round((next - prev) * 10) / 10;
    }
  }
  for (const uid of Object.keys(pointsByUser)) {
    if (seen.has(uid)) continue;
    const next = Math.round(pointsByUser[uid] * 10) / 10;
    writes.push({ ref: db.collection("userMetrics").doc(uid), data: { userId: uid, totalPoints: next } });
    deltas[uid] = next;
  }

  writes.push({ ref: stateRef, data: { signature, scoredAt: new Date().toISOString() } });

  for (let i = 0; i < writes.length; i += 450) {
    const batch = db.batch();
    for (const w of writes.slice(i, i + 450)) batch.set(w.ref, w.data, { merge: true });
    await batch.commit();
  }

  return {
    scored: totalScored,
    finalMatches: finals.length,
    newlyScored: writes.length,
    users: Object.keys(deltas).length,
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

  // 2. full (re)score of every prediction. A knockout pick scores off its
  // predicted team's actual game, so we can't skip predictions whose own slot
  // hasn't been played yet — calcPoints returns 0 for those that don't apply.
  const koActual = buildKnockoutActuals(finals);
  for (const { ref, pred } of allPreds) {
    const match = matchById[pred.matchId];
    if (!match) continue;
    let pts = calcPoints(match, pred, koActual);
    const isLate = !!pred.submittedAt && new Date(pred.submittedAt).getTime() > deadlineMs;
    if (isLate && pts > 0) pts = Math.round(pts * LATE_SUBMISSION_MULTIPLIER * 10) / 10;
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

  return { users: usersSnap.size, champions, finalMatches: finals.length, scored: allPreds.length };
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

// ── Audit: a per-prediction scoring ledger for one user ──────────────────────
// Computed with the exact same calcPoints / buildKnockoutActuals the leaderboard
// uses, so the running total reconciles to userMetrics. Every row shows what the
// user predicted, what actually happened (for knockout, the real game their
// picked team played), the points, and a plain-English reason.
export interface AuditRow {
  matchId: string;
  round: string;
  kickoffTimeUTC: string;
  isKnockout: boolean;
  predHomeTeam: string;
  predAwayTeam: string;
  predHomeScore: number | null;
  predAwayScore: number | null;
  predWinner: string;
  actualHomeTeam: string | null;
  actualAwayTeam: string | null;
  actualHomeScore: number | null;
  actualAwayScore: number | null;
  actualWinner: string | null;
  played: boolean;
  points: number;
  detail: string;
  late: boolean;
}

export async function auditUser(
  db: Firestore,
  uid: string
): Promise<{ rows: AuditRow[]; total: number; metricsTotal: number | null }> {
  const [matchSnap, predSnap, metricsSnap] = await Promise.all([
    db.collection("matches").get(),
    db.collection("predictions").where("userId", "==", uid).get(),
    db.collection("userMetrics").doc(uid).get(),
  ]);

  const allMatches = matchSnap.docs.map((d) => d.data() as Match).filter((m) => isWorldCup2026(m));
  const matchById: Record<string, Match> = {};
  for (const m of allMatches) matchById[m.matchId] = m;
  const finals = allMatches.filter((m) => m.status === "final" && m.homeScore != null && m.awayScore != null);
  const koActual = buildKnockoutActuals(finals);

  const preds: Record<string, Prediction> = {};
  for (const d of predSnap.docs) { const p = d.data() as Prediction; preds[p.matchId] = p; }
  const { standings, thirdPlace } = buildStandings(allMatches, preds);
  const deadlineMs = new Date(PREDICTIONS_LOCK_UTC).getTime();

  const rows: AuditRow[] = [];
  let total = 0;

  for (const p of Object.values(preds)) {
    const match = matchById[p.matchId];
    if (!match) continue;
    const isKnockout = !!BRACKET_MAP[p.matchId];

    // What they predicted (their own bracket teams for knockout).
    let predHomeTeam = match.homeTeam;
    let predAwayTeam = match.awayTeam;
    if (isKnockout) {
      const r = resolveMatchTeams(match, standings, thirdPlace, preds);
      predHomeTeam = r.home;
      predAwayTeam = r.away;
    }

    // The actual game that decides this pick's points.
    let actualHomeTeam: string | null = null, actualAwayTeam: string | null = null;
    let actualHomeScore: number | null = null, actualAwayScore: number | null = null;
    let actualWinner: string | null = null, played = false;
    if (isKnockout) {
      const g = finals.find((m) => m.round === match.round && (m.homeTeam === p.predictedWinner || m.awayTeam === p.predictedWinner));
      if (g) { actualHomeTeam = g.homeTeam; actualAwayTeam = g.awayTeam; actualHomeScore = g.homeScore; actualAwayScore = g.awayScore; actualWinner = g.winner ?? null; played = true; }
    } else if (match.status === "final" && match.homeScore != null) {
      actualHomeTeam = match.homeTeam; actualAwayTeam = match.awayTeam; actualHomeScore = match.homeScore; actualAwayScore = match.awayScore; actualWinner = match.winner ?? null; played = true;
    }

    const raw = calcPoints(match, p, koActual);
    const late = !!p.submittedAt && new Date(p.submittedAt).getTime() > deadlineMs;
    const points = late && raw > 0 ? Math.round(raw * LATE_SUBMISSION_MULTIPLIER * 10) / 10 : raw;

    const pts = ROUND_PTS[match.round];
    let detail: string;
    if (!pts) {
      detail = "—";
    } else if (!isKnockout) {
      if (!played) detail = "Not played yet";
      else if (raw >= 2) detail = "Exact score";
      else if (raw >= 1) detail = "Correct result";
      else detail = "Missed";
    } else if (!isResolvedTeam(p.predictedWinner)) {
      detail = p.predictedWinner === "draw" ? "Predicted a draw — no advance" : "Ambiguous pick — no credit";
    } else if (!played) {
      detail = finals.some((m) => m.round === match.round) ? `${p.predictedWinner} didn't reach ${match.round}` : "Round not played yet";
    } else if (actualWinner !== p.predictedWinner) {
      detail = `${p.predictedWinner} lost`;
    } else {
      detail = raw >= pts.advance + pts.exact ? "Advanced + exact score" : "Advanced (score off)";
    }
    if (late && raw > 0) detail += " · late −90%";

    rows.push({
      matchId: p.matchId, round: match.round, kickoffTimeUTC: match.kickoffTimeUTC, isKnockout,
      predHomeTeam, predAwayTeam, predHomeScore: p.predictedHomeScore, predAwayScore: p.predictedAwayScore, predWinner: p.predictedWinner,
      actualHomeTeam, actualAwayTeam, actualHomeScore, actualAwayScore, actualWinner, played,
      points, detail, late,
    });
    total += points;
  }

  rows.sort((a, b) => new Date(a.kickoffTimeUTC).getTime() - new Date(b.kickoffTimeUTC).getTime());
  const metricsTotal = metricsSnap.exists ? ((metricsSnap.data()!.totalPoints as number) ?? 0) : null;
  return { rows, total: Math.round(total * 10) / 10, metricsTotal };
}
