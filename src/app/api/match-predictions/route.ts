import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Match, Prediction } from "@/lib/types";

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

// Returns every participant's prediction for one match — but ONLY once the match
// has locked, so nobody can copy picks before the deadline. The lock check is
// done with server time, which a client can't spoof.
export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  const db = getAdminDb();
  const matchSnap = await db.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const match = matchSnap.data() as Match;
  const lockTime = new Date(match.lockTimeUTC ?? match.kickoffTimeUTC);
  if (new Date() < lockTime) {
    return NextResponse.json({ locked: false });
  }

  const [usersSnap, predsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("predictions").where("matchId", "==", matchId).get(),
  ]);

  const nameByUid: Record<string, string> = {};
  for (const d of usersSnap.docs) {
    const u = d.data();
    if (u.username) nameByUid[d.id] = u.username as string;
  }

  const predByUid: Record<string, Prediction> = {};
  for (const d of predsSnap.docs) {
    const p = d.data() as Prediction;
    predByUid[p.userId] = p;
  }

  const picks: { username: string; homeScore: number | null; awayScore: number | null; winner: string }[] = [];
  const noPicks: string[] = [];
  const summary = { home: 0, draw: 0, away: 0 };

  for (const [uid, username] of Object.entries(nameByUid)) {
    const p = predByUid[uid];
    if (!p || p.predictedHomeScore == null || p.predictedAwayScore == null) {
      noPicks.push(username);
      continue;
    }
    const hs = p.predictedHomeScore;
    const as_ = p.predictedAwayScore;
    let winner: string;
    if (hs > as_) { winner = match.homeTeam; summary.home++; }
    else if (as_ > hs) { winner = match.awayTeam; summary.away++; }
    else { winner = "Draw"; summary.draw++; }
    picks.push({ username, homeScore: hs, awayScore: as_, winner });
  }

  picks.sort((a, b) => a.username.localeCompare(b.username));
  noPicks.sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    locked: true,
    matchId,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    summary,
    picks,
    noPicks,
  });
}
