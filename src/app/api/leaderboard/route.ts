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
    const [metricsSnap, usersSnap, finalMatchesSnap] = await Promise.all([
      db.collection("userMetrics").get(),
      db.collection("users").get(),
      db.collection("matches").where("round", "==", "Final").get(),
    ]);

    const metricsMap: Record<string, Record<string, unknown>> = {};
    for (const d of metricsSnap.docs) metricsMap[d.id] = d.data();

    // Derive champion pick from Final-round predictions
    const championByUser: Record<string, string> = {};
    if (!finalMatchesSnap.empty) {
      const finalIds = finalMatchesSnap.docs.map((d) => d.id);
      for (let i = 0; i < finalIds.length; i += 30) {
        const chunk = finalIds.slice(i, i + 30);
        const predsSnap = await db.collection("predictions").where("matchId", "in", chunk).get();
        for (const d of predsSnap.docs) {
          const pred = d.data();
          if (pred.predictedWinner) championByUser[pred.userId] = pred.predictedWinner as string;
        }
      }
    }

    const leaderboard = usersSnap.docs
      .map((d) => {
        const user = d.data();
        if (!user.username) return null;
        const metrics = metricsMap[d.id] ?? {};
        return {
          userId: d.id,
          displayName: user.username as string,
          photoURL: (user.photoURL as string) ?? null,
          totalPoints: (metrics.totalPoints as number) ?? 0,
          totalPredictions: (metrics.totalPredictions as number) ?? 0,
          correctPredictions: (metrics.correctPredictions as number) ?? 0,
          predictionAccuracy: (metrics.predictionAccuracy as number) ?? 0,
          rootingFor: (user.rootingFor as string) ?? null,
          hatingOn: (user.hatingOn as string) ?? null,
          championPick: championByUser[d.id] ?? null,
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
