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

// Reads only the two small collections it needs (users + userMetrics, ~10 docs
// each). The predicted champion is stored on each user doc (predictions are
// locked, so it never changes) rather than recomputed from the entire
// predictions collection on every page load — that scan was the single biggest
// Firestore read cost in the app.
export async function GET() {
  try {
    const db = getAdminDb();
    const [metricsSnap, usersSnap] = await Promise.all([
      db.collection("userMetrics").get(),
      db.collection("users").get(),
    ]);

    const metricsMap: Record<string, Record<string, unknown>> = {};
    for (const d of metricsSnap.docs) metricsMap[d.id] = d.data();

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
          championPick: (user.championPick as string) ?? null,
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
