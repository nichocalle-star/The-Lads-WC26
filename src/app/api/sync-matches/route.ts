import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isWorldCup2026 } from "@/lib/tournament";
import { syncMatchesCore } from "@/lib/syncAndScore";

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

// DELETE — wipe all matches (admin only, used for migration)
export async function DELETE(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const db = getAdminDb();
  const snap = await db.collection("matches").get();
  const batches = [];
  let batch = db.batch();
  let count = 0;
  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    count++;
    if (count % 500 === 0) { batches.push(batch.commit()); batch = db.batch(); }
  }
  batches.push(batch.commit());
  await Promise.all(batches);
  return NextResponse.json({ ok: true, deleted: snap.size });
}

// GET — return all matches from Firestore (World Cup 2026 only; this feeds the
// schedule, predictions, bracket and home — none of which may see other data).
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("matches").orderBy("kickoffTimeUTC").get();
    const matches = snap.docs.map((d) => d.data()).filter((m) => isWorldCup2026(m));
    return NextResponse.json({ matches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — sync from ESPN, or manually update a single result
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const text = await req.text();
  const body = text ? JSON.parse(text) : null;

  // Manual single result update
  if (body?.matchId && body?.status) {
    const { matchId, homeScore, awayScore, status, winner } = body;
    await db.collection("matches").doc(matchId).update({
      homeScore: homeScore ?? null,
      awayScore: awayScore ?? null,
      status: status ?? "final",
      winner: winner ?? null,
      updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, updated: matchId });
  }

  // Full ESPN sync
  try {
    const { synced } = await syncMatchesCore(db);
    return NextResponse.json({ ok: true, synced });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("ESPN sync error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
