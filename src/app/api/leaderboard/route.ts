import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

export async function GET() {
  try {
    const db = getAdminDb();
    const [metricsSnap, usersSnap] = await Promise.all([
      db.collection("userMetrics").get(),
      db.collection("users").get(),
    ]);

    // Build metrics map keyed by userId
    const metricsMap: Record<string, Record<string, unknown>> = {};
    for (const d of metricsSnap.docs) {
      metricsMap[d.id] = d.data();
    }

    // Build leaderboard from all users who have a username
    const leaderboard = usersSnap.docs
      .map((d) => {
        const user = d.data();
        if (!user.username) return null;
        const metrics = metricsMap[d.id] ?? {};
        return {
          userId: d.id,
          displayName: user.username,
          photoURL: user.photoURL ?? null,
          totalPoints: (metrics.totalPoints as number) ?? 0,
          totalPredictions: (metrics.totalPredictions as number) ?? 0,
          correctPredictions: (metrics.correctPredictions as number) ?? 0,
          predictionAccuracy: (metrics.predictionAccuracy as number) ?? 0,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.totalPoints - a!.totalPoints) || a!.displayName.localeCompare(b!.displayName))
      .map((entry, i) => ({ ...entry, rank: i + 1 }));

    return NextResponse.json({ leaderboard });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
