import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { syncMatchesCore, scoreMatchesCore } from "@/lib/syncAndScore";

export const runtime = "nodejs";
export const maxDuration = 45;

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

const META_DOC = "refresh";

// GET — read the last-refresh timestamp without doing any work. Public to any
// signed-in user, used to render "Last refreshed: ..." on page load.
export async function GET() {
  try {
    const { db } = getAdmin();
    const snap = await db.collection("meta").doc(META_DOC).get();
    return NextResponse.json(snap.exists ? snap.data() : { lastRefreshedAt: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — sync matches from ESPN, then rescore everyone. Any signed-in lad can
// trigger this (not gated by the admin secret) — verified via Firebase ID
// token like the other user-facing write routes.
export async function POST(req: NextRequest) {
  try {
    const { db, auth } = getAdmin();

    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);

    const [userDoc, syncResult] = await Promise.all([
      db.collection("users").doc(decoded.uid).get(),
      syncMatchesCore(db),
    ]);
    const scoreResult = await scoreMatchesCore(db);

    const lastRefreshedAt = new Date().toISOString();
    const lastRefreshedBy = (userDoc.data()?.username as string) ?? "someone";
    await db.collection("meta").doc(META_DOC).set({ lastRefreshedAt, lastRefreshedBy }, { merge: true });

    return NextResponse.json({
      ok: true,
      lastRefreshedAt,
      lastRefreshedBy,
      synced: syncResult.synced,
      scored: scoreResult.scored,
      finalMatches: scoreResult.finalMatches,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("refresh error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
