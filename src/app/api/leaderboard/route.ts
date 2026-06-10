import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
      db.collection("userMetrics").orderBy("totalPoints", "desc").get(),
      db.collection("users").get(),
    ]);
    const usernames: Record<string, string> = {};
    for (const d of usersSnap.docs) {
      const data = d.data();
      if (data.username) usernames[d.id] = data.username;
    }
    const leaderboard = metricsSnap.docs.map((d, i) => {
      const data = d.data();
      return {
        rank: i + 1,
        ...data,
        displayName: usernames[data.userId] ?? data.displayName,
      };
    });
    return NextResponse.json({ leaderboard });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
