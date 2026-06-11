import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

function getAdmin() {
  if (!getApps().length) {
    initializeApp({
      credential: cert({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
  }
  return { db: getFirestore(), auth: getAuth() };
}

export async function POST(req: NextRequest) {
  try {
    const { db, auth } = getAdmin();

    // Verify Firebase ID token
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const decoded = await auth.verifyIdToken(idToken);
    const userId = decoded.uid;

    const body = await req.json();
    const { matchId, predictedWinner, predictedHomeScore, predictedAwayScore } = body;

    if (!matchId || !predictedWinner) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch match to check kickoff time (server-side lock check)
    const matchRef = db.collection("matches").doc(matchId);
    const matchSnap = await matchRef.get();
    if (!matchSnap.exists) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }

    const match = matchSnap.data()!;
    const lockTime = new Date(match.lockTimeUTC ?? match.kickoffTimeUTC);
    const now = new Date(); // server time — cannot be spoofed by user

    if (now >= lockTime) {
      return NextResponse.json(
        { error: "Predictions for this match are now locked." },
        { status: 403 }
      );
    }

    const predictionId = `${userId}_${matchId}`;
    const predictionRef = db.collection("predictions").doc(predictionId);
    const existing = await predictionRef.get();

    const now_iso = new Date().toISOString();
    const prediction = {
      userId,
      matchId,
      predictedWinner,
      predictedHomeScore: predictedHomeScore ?? null,
      predictedAwayScore: predictedAwayScore ?? null,
      updatedAt: now_iso,
      pointsAwarded: 0,
      isLocked: false,
    };

    if (existing.exists) {
      await predictionRef.update({ ...prediction });
    } else {
      await predictionRef.set({ ...prediction, submittedAt: now_iso });
    }

    // Update user prediction count
    await db.collection("userMetrics").doc(userId).set(
      { userId, totalPredictions: FieldValue.increment(1) },
      { merge: true }
    );

    return NextResponse.json({ ok: true, predictionId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("submit-prediction error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
