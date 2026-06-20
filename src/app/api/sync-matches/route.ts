import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { WC2026_TOURNAMENT, isWorldCup2026 } from "@/lib/tournament";

export const runtime = "nodejs";
export const maxDuration = 30;

function getAdminDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return getFirestore();
}

const ESPN_WC = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

// 2026 FIFA World Cup group assignments (sourced from ESPN standings)
const TEAM_GROUP: Record<string, string> = {
  // Group A
  "Mexico": "A", "Czechia": "A", "South Korea": "A", "South Africa": "A",
  // Group B
  "Canada": "B", "Bosnia-Herzegovina": "B", "Switzerland": "B", "Qatar": "B",
  // Group C
  "Brazil": "C", "Scotland": "C", "Haiti": "C", "Morocco": "C",
  // Group D
  "Paraguay": "D", "Türkiye": "D", "Australia": "D", "United States": "D",
  // Group E
  "Ecuador": "E", "Germany": "E", "Ivory Coast": "E", "Curaçao": "E",
  // Group F
  "Netherlands": "F", "Sweden": "F", "Japan": "F", "Tunisia": "F",
  // Group G
  "Belgium": "G", "Iran": "G", "Egypt": "G", "New Zealand": "G",
  // Group H
  "Spain": "H", "Uruguay": "H", "Saudi Arabia": "H", "Cape Verde": "H",
  // Group I
  "Norway": "I", "France": "I", "Senegal": "I", "Iraq": "I",
  // Group J
  "Argentina": "J", "Austria": "J", "Algeria": "J", "Jordan": "J",
  // Group K
  "Colombia": "K", "Portugal": "K", "Uzbekistan": "K", "Congo DR": "K",
  // Group L
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

async function fetchAllMatches() {
  const ranges = ["20260611-20260626", "20260628-20260719"];
  const all = [];
  for (const range of ranges) {
    const res = await fetch(`${ESPN_WC}/scoreboard?dates=${range}&limit=200`, { next: { revalidate: 0 } });
    const data = await res.json();
    all.push(...(data.events ?? []));
  }
  return all;
}

// DELETE — wipe all matches (admin only, used for migration)
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getAdminDb();
  const snap = await db.collection("matches").get();
  const batches = [];
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 500 === 0) { batches.push(batch.commit()); batch = db.batch(); }
  }
  batches.push(batch.commit());
  await Promise.all(batches);
  return NextResponse.json({ ok: true, deleted: snap.size });
}

// GET — return all matches from Firestore (World Cup 2026 only; this feeds the
// schedule, predictions, bracket and home — none of which may see other data).
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("matches").orderBy("kickoffTimeUTC").get();
    const matches = snap.docs.map((d) => d.data()).filter((m) => isWorldCup2026(m));
    return NextResponse.json({ matches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — sync from ESPN, or manually update a single result
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const text = await req.text();
  const body = text ? JSON.parse(text) : null;

  // Manual single result update
  if (body?.matchId && body?.status) {
    const { matchId, homeScore, awayScore, status, winner } = body;
    await db.collection("matches").doc(matchId).update({
      homeScore: homeScore ?? null,
      awayScore: awayScore ?? null,
      status: status ?? "final",
      winner: winner ?? null,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, updated: matchId });
  }

  // Full ESPN sync
  try {
    const events = await fetchAllMatches();
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

      const ref = db.collection("matches").doc(`espn-${event.id}`);
      batch.set(ref, matchData, { merge: true });
      synced++;
    }

    await batch.commit();
    return NextResponse.json({ ok: true, synced });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("ESPN sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
