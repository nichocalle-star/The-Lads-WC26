import { NextRequest, NextResponse } from "next/server";
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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();

  const [usersSnap, metricsSnap, finalMatchesSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("userMetrics").get(),
    db.collection("matches").where("round", "==", "Final").get(),
  ]);

  const metricsMap: Record<string, number> = {};
  for (const d of metricsSnap.docs) {
    metricsMap[d.id] = (d.data().totalPoints as number) ?? 0;
  }

  // Build champion pick map from Final-round predictions
  const championByUser: Record<string, string> = {};
  if (!finalMatchesSnap.empty) {
    const finalIds = finalMatchesSnap.docs.map((d) => d.id);
    for (let i = 0; i < finalIds.length; i += 30) {
      const chunk = finalIds.slice(i, i + 30);
      const predsSnap = await db.collection("predictions").where("matchId", "in", chunk).get();
      for (const d of predsSnap.docs) {
        const pred = d.data();
        if (pred.predictedWinner) championByUser[pred.userId] = pred.predictedWinner;
      }
    }
  }

  const users = usersSnap.docs
    .map((d) => {
      const u = d.data();
      if (!u.username) return null;
      return {
        uid: d.id,
        username: u.username as string,
        totalPoints: metricsMap[d.id] ?? 0,
        championPick: championByUser[d.id] ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.totalPoints - a!.totalPoints) || a!.username.localeCompare(b!.username));

  return NextResponse.json({ users });
}
