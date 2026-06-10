import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Initialize Firebase Admin (server-side only)
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

// FIFA Club World Cup 2026 - Tournament ID on SofaScore
const CWC_TOURNAMENT_ID = 24; // FIFA Club World Cup
const CWC_SEASON_ID = 61644;  // 2025 season (the 2026 CWC)

async function fetchFromSofaScore(path: string) {
  const res = await fetch(`https://sofascore.p.rapidapi.com${path}`, {
    headers: {
      "x-rapidapi-key": process.env.RAPIDAPI_KEY!,
      "x-rapidapi-host": "sofascore.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`SofaScore API error: ${res.status} ${await res.text()}`);
  return res.json();
}

function mapStatus(sofascoreStatus: string): "upcoming" | "live" | "final" {
  if (["finished", "ended", "aet", "ap"].includes(sofascoreStatus?.toLowerCase())) return "final";
  if (["inprogress", "live", "halftime"].includes(sofascoreStatus?.toLowerCase())) return "live";
  return "upcoming";
}

function mapRound(roundName: string): string {
  const lower = roundName?.toLowerCase() ?? "";
  if (lower.includes("group")) return "Group Stage";
  if (lower.includes("round of 32")) return "Round of 32";
  if (lower.includes("round of 16")) return "Round of 16";
  if (lower.includes("quarter")) return "Quarterfinal";
  if (lower.includes("semi")) return "Semifinal";
  if (lower.includes("final")) return "Final";
  return roundName ?? "Group Stage";
}

export async function POST(req: NextRequest) {
  // Require admin secret to trigger a sync
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminDb();

    // Fetch all events for the tournament season
    const data = await fetchFromSofaScore(
      `/tournaments/get-season-events?tournamentId=${CWC_TOURNAMENT_ID}&seasonId=${CWC_SEASON_ID}&page=0`
    );

    const events = data?.events ?? [];
    const batch = db.batch();
    let synced = 0;

    for (const event of events) {
      const homeTeam = event.homeTeam?.name ?? "TBD";
      const awayTeam = event.awayTeam?.name ?? "TBD";
      const kickoffUTC = new Date(event.startTimestamp * 1000).toISOString();
      const status = mapStatus(event.status?.type);
      const round = mapRound(event.roundInfo?.name ?? event.tournament?.name ?? "");
      const group = event.roundInfo?.name?.match(/Group ([A-Z])/)?.[1];

      const homeScore = event.homeScore?.current ?? null;
      const awayScore = event.awayScore?.current ?? null;
      let winner: string | null = null;
      if (status === "final") {
        if (homeScore !== null && awayScore !== null) {
          if (homeScore > awayScore) winner = homeTeam;
          else if (awayScore > homeScore) winner = awayTeam;
          else winner = "draw";
        }
      }

      const matchData = {
        matchId: `sofascore-${event.id}`,
        sofascoreId: event.id,
        homeTeam,
        awayTeam,
        homeTeamLogo: `https://api.sofascore.app/api/v1/team/${event.homeTeam?.id}/image`,
        awayTeamLogo: `https://api.sofascore.app/api/v1/team/${event.awayTeam?.id}/image`,
        round,
        group: group ?? null,
        venue: event.venue?.name ?? event.venue?.stadium?.name ?? "TBD",
        kickoffTimeUTC: kickoffUTC,
        status,
        homeScore,
        awayScore,
        winner,
        updatedAt: new Date().toISOString(),
      };

      const ref = db.collection("matches").doc(`sofascore-${event.id}`);
      batch.set(ref, matchData, { merge: true });
      synced++;
    }

    await batch.commit();
    return NextResponse.json({ ok: true, synced });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-matches error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: fetch current matches from Firestore (no admin needed)
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("matches").orderBy("kickoffTimeUTC").get();
    const matches = snap.docs.map((d) => d.data());
    return NextResponse.json({ matches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
