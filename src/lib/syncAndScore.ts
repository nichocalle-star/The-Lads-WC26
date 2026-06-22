// Shared core logic for pulling match data from ESPN and scoring predictions.
// Used by both the admin-only routes (sync-matches, score-matches) and the
// combined /api/refresh route any signed-in user can trigger.
import type { Firestore } from "firebase-admin/firestore";
import { WC2026_TOURNAMENT, isWorldCup2026 } from "./tournament";
import { PREDICTIONS_LOCK_UTC } from "./lock";

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
  const ranges = ["20260611-20260626", "20260628-20260719"];
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
  scored: number;
  finalMatches: number;
  users: number;
  lateSubmissions: number;
  breakdown: Record<string, number>;
}

export async function scoreMatchesCore(db: Firestore): Promise<ScoreResult> {
  // Zero out all user points first (full recalculation every run)
  const allUsersSnap = await db.collection("userMetrics").get();
  if (!allUsersSnap.empty) {
    const zeroBatch = db.batch();
    for (const d of allUsersSnap.docs) zeroBatch.update(d.ref, { totalPoints: 0 });
    await zeroBatch.commit();
  }

  // World Cup 2026 only — scoring must never read any other tournament's data.
  const matchSnap = await db.collection("matches").where("status", "==", "final").get();
  const wcDocs = matchSnap.docs.filter((d) => isWorldCup2026(d.data()));
  if (wcDocs.length === 0) {
    return { scored: 0, finalMatches: 0, users: 0, lateSubmissions: 0, breakdown: {} };
  }

  const finalMatchIds = wcDocs.map((d) => d.id);
  const matchData: Record<string, FirebaseFirestore.DocumentData> = {};
  for (const d of wcDocs) matchData[d.id] = d.data();

  const CHUNK = 30;
  const pointsByUser: Record<string, number> = {};
  let totalScored = 0;
  let lateSubmissions = 0;
  const deadlineMs = new Date(PREDICTIONS_LOCK_UTC).getTime();

  for (let i = 0; i < finalMatchIds.length; i += CHUNK) {
    const chunk = finalMatchIds.slice(i, i + CHUNK);
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

      batch.update(predDoc.ref, { pointsAwarded: pts, ...(isLate ? { latePenalty: true } : {}) });
      pointsByUser[pred.userId] = (pointsByUser[pred.userId] ?? 0) + pts;
      totalScored++;
    }
    await batch.commit();
  }

  const userBatch = db.batch();
  for (const uid of Object.keys(pointsByUser)) {
    pointsByUser[uid] = Math.round(pointsByUser[uid] * 10) / 10;
    userBatch.set(db.collection("userMetrics").doc(uid), { totalPoints: pointsByUser[uid] }, { merge: true });
  }
  await userBatch.commit();

  return {
    scored: totalScored,
    finalMatches: finalMatchIds.length,
    users: Object.keys(pointsByUser).length,
    lateSubmissions,
    breakdown: pointsByUser,
  };
}
