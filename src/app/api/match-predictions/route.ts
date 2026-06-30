import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Match, Prediction } from "@/lib/types";
import { isMatchLocked } from "@/lib/lock";
import { isWorldCup2026 } from "@/lib/tournament";
import { BRACKET_MAP, buildStandings, resolveMatchTeams } from "@/lib/bracket";

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
//
// For a knockout match the teams in a given bracket slot differ per player (each
// person's group predictions feed their own bracket), so we resolve and return
// each player's OWN matchup — e.g. one player's "Japan 2–1 Canada" vs the actual
// "South Africa vs Canada" — instead of pinning everyone's score to the real
// teams. Group games have fixed teams, so that resolution is skipped.
export async function GET(req: NextRequest) {
  const matchId = req.nextUrl.searchParams.get("matchId");
  if (!matchId) return NextResponse.json({ error: "matchId required" }, { status: 400 });

  const db = getAdminDb();
  const matchSnap = await db.collection("matches").doc(matchId).get();
  if (!matchSnap.exists) return NextResponse.json({ error: "Match not found" }, { status: 404 });

  const match = matchSnap.data() as Match;
  if (!isMatchLocked(match)) {
    return NextResponse.json({ locked: false });
  }

  const isKnockout = !!BRACKET_MAP[matchId];

  const usersSnap = await db.collection("users").get();
  const nameByUid: Record<string, string> = {};
  for (const d of usersSnap.docs) {
    const u = d.data();
    if (u.username) nameByUid[d.id] = u.username as string;
  }

  // This match's predictions, indexed by user; plus (for knockout) every user's
  // full prediction set + the match list, needed to resolve their brackets.
  const predByUid: Record<string, Prediction> = {};
  const predsByUser: Record<string, Record<string, Prediction>> = {};
  let allMatches: Match[] = [];

  if (isKnockout) {
    const [allPredsSnap, matchesSnap] = await Promise.all([
      db.collection("predictions").get(),
      db.collection("matches").get(),
    ]);
    allMatches = matchesSnap.docs.map((d) => d.data() as Match).filter((m) => isWorldCup2026(m));
    for (const d of allPredsSnap.docs) {
      const p = d.data() as Prediction;
      (predsByUser[p.userId] ??= {})[p.matchId] = p;
      if (p.matchId === matchId) predByUid[p.userId] = p;
    }
  } else {
    const predsSnap = await db.collection("predictions").where("matchId", "==", matchId).get();
    for (const d of predsSnap.docs) {
      const p = d.data() as Prediction;
      predByUid[p.userId] = p;
    }
  }

  type Pick = {
    username: string;
    homeTeam: string;
    awayTeam: string;
    homeScore: number | null;
    awayScore: number | null;
    winner: string;
  };
  const picks: Pick[] = [];
  const noPicks: string[] = [];
  const summary = { home: 0, draw: 0, away: 0 };

  for (const [uid, username] of Object.entries(nameByUid)) {
    const p = predByUid[uid];
    if (!p || p.predictedHomeScore == null || p.predictedAwayScore == null) {
      noPicks.push(username);
      continue;
    }

    // The teams as THIS player predicted them in this slot.
    let homeTeam = match.homeTeam;
    let awayTeam = match.awayTeam;
    if (isKnockout) {
      const { standings, thirdPlace } = buildStandings(allMatches, predsByUser[uid] ?? {});
      const resolved = resolveMatchTeams(match, standings, thirdPlace, predsByUser[uid] ?? {});
      homeTeam = resolved.home;
      awayTeam = resolved.away;
    }

    const hs = p.predictedHomeScore;
    const as_ = p.predictedAwayScore;
    let winner: string;
    if (hs > as_) { winner = homeTeam; summary.home++; }
    else if (as_ > hs) { winner = awayTeam; summary.away++; }
    else {
      // A tie scoreline: in knockout the player picked a side to advance.
      winner = isKnockout && p.predictedWinner && p.predictedWinner !== "draw" ? p.predictedWinner : "Draw";
      summary.draw++;
    }
    picks.push({ username, homeTeam, awayTeam, homeScore: hs, awayScore: as_, winner });
  }

  picks.sort((a, b) => a.username.localeCompare(b.username));
  noPicks.sort((a, b) => a.localeCompare(b));

  return NextResponse.json({
    locked: true,
    matchId,
    isKnockout,
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    summary,
    picks,
    noPicks,
  });
}
