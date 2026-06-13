import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Match, Prediction } from "@/lib/types";
import { buildStandings, resolveMatchTeams } from "@/lib/bracket";

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

const ROUND_ORDER = ["Group Stage", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  const db = getAdminDb();
  const [matchesSnap, predsSnap, userSnap] = await Promise.all([
    db.collection("matches").get(),
    db.collection("predictions").where("userId", "==", uid).get(),
    db.collection("users").doc(uid).get(),
  ]);

  const matches = matchesSnap.docs.map((d) => d.data() as Match);
  const matchById: Record<string, Match> = {};
  for (const m of matches) matchById[m.matchId] = m;

  const predMap: Record<string, Prediction> = {};
  for (const d of predsSnap.docs) {
    const p = d.data() as Prediction;
    predMap[p.matchId] = p;
  }

  const { standings, thirdPlace } = buildStandings(matches, predMap);

  const rows = predsSnap.docs
    .map((d) => {
      const p = d.data() as Prediction;
      const match = matchById[p.matchId];
      if (!match) return null;
      const { home, away } = resolveMatchTeams(match, standings, thirdPlace, predMap);
      const winner =
        p.predictedHomeScore != null && p.predictedAwayScore != null
          ? p.predictedHomeScore > p.predictedAwayScore ? home
          : p.predictedAwayScore > p.predictedHomeScore ? away
          : "Draw"
          : null;
      return {
        matchId: p.matchId,
        round: match.round,
        kickoffTimeUTC: match.kickoffTimeUTC,
        home,
        away,
        homeScore: p.predictedHomeScore,
        awayScore: p.predictedAwayScore,
        winner,
        pointsAwarded: p.pointsAwarded ?? 0,
        actualStatus: match.status,
        actualHome: match.homeScore,
        actualAway: match.awayScore,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const r = ROUND_ORDER.indexOf(a!.round) - ROUND_ORDER.indexOf(b!.round);
      if (r !== 0) return r;
      return new Date(a!.kickoffTimeUTC).getTime() - new Date(b!.kickoffTimeUTC).getTime();
    });

  const u = userSnap.data() ?? {};
  return NextResponse.json({
    username: u.username ?? uid,
    count: rows.length,
    predictions: rows,
  });
}
