import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Prediction } from "@/lib/types";
import { PREDICTIONS_LOCK_UTC } from "@/lib/lock";

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

// One player's full prediction set, keyed by matchId, with the points each one
// earned. Only served after the global deadline (predictions are locked), so it
// can't be used to copy picks. The client resolves these into a bracket.
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  if (Date.now() < new Date(PREDICTIONS_LOCK_UTC).getTime()) {
    return NextResponse.json({ locked: false });
  }

  const db = getAdminDb();
  const predsSnap = await db.collection("predictions").where("userId", "==", uid).get();

  const predictions: Record<string, {
    predictedHomeScore: number | null;
    predictedAwayScore: number | null;
    predictedWinner: string;
    pointsAwarded: number;
  }> = {};
  for (const d of predsSnap.docs) {
    const p = d.data() as Prediction;
    predictions[p.matchId] = {
      predictedHomeScore: p.predictedHomeScore,
      predictedAwayScore: p.predictedAwayScore,
      predictedWinner: p.predictedWinner,
      pointsAwarded: (p.pointsAwarded as number) ?? 0,
    };
  }

  return NextResponse.json({ uid, predictions });
}
