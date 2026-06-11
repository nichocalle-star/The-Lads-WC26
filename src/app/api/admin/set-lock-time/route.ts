import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export const runtime = "nodejs";

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

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { teamName, lockTimeUTC } = await req.json();
  if (!teamName || !lockTimeUTC) {
    return NextResponse.json({ error: "teamName and lockTimeUTC required" }, { status: 400 });
  }

  const db = getAdminDb();

  // Firestore doesn't support OR across fields — run two queries and merge
  const [homeSnap, awaySnap] = await Promise.all([
    db.collection("matches").where("homeTeam", "==", teamName).get(),
    db.collection("matches").where("awayTeam", "==", teamName).get(),
  ]);

  const docs = [...homeSnap.docs, ...awaySnap.docs];
  if (docs.length === 0) {
    return NextResponse.json({ error: `No matches found for: ${teamName}` }, { status: 404 });
  }

  const batch = db.batch();
  for (const d of docs) batch.update(d.ref, { lockTimeUTC });
  await batch.commit();

  return NextResponse.json({
    ok: true,
    updated: docs.length,
    lockTimeUTC,
    matches: docs.map((d) => ({ id: d.id, home: d.data().homeTeam, away: d.data().awayTeam })),
  });
}
