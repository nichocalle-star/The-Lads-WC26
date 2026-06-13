import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Match, Prediction } from "@/lib/types";
import { resolveChampion } from "@/lib/bracket";

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

  const [usersSnap, metricsSnap, matchesSnap, predsSnap] = await Promise.all([
    db.collection("users").get(),
    db.collection("userMetrics").get(),
    db.collection("matches").get(),
    db.collection("predictions").get(),
  ]);

  const metricsMap: Record<string, number> = {};
  for (const d of metricsSnap.docs) metricsMap[d.id] = (d.data().totalPoints as number) ?? 0;

  const matches = matchesSnap.docs.map((d) => d.data() as Match);

  const predsByUser: Record<string, Record<string, Prediction>> = {};
  const countByUser: Record<string, number> = {};
  for (const d of predsSnap.docs) {
    const p = d.data() as Prediction;
    (predsByUser[p.userId] ??= {})[p.matchId] = p;
    countByUser[p.userId] = (countByUser[p.userId] ?? 0) + 1;
  }

  const users = usersSnap.docs
    .map((d) => {
      const u = d.data();
      if (!u.username) return null;
      return {
        uid: d.id,
        username: u.username as string,
        totalPoints: metricsMap[d.id] ?? 0,
        predictionCount: countByUser[d.id] ?? 0,
        championPick: resolveChampion(matches, predsByUser[d.id] ?? {}),
        rootingFor: (u.rootingFor as string) ?? null,
        hatingOn: (u.hatingOn as string) ?? null,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.totalPoints - a!.totalPoints) || a!.username.localeCompare(b!.username));

  return NextResponse.json({ users });
}
