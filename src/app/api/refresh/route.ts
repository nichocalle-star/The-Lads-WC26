import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { syncMatchesCore, scoreMatchesCore } from "@/lib/syncAndScore";

export const runtime = "nodejs";
export const maxDuration = 60;

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
//
// Split into two phases (?step=sync, then ?step=score), each its own request/
// serverless invocation with a full fresh time budget. Running both in a
// single request risked exceeding the platform's execution timeout, which
// surfaces to the client as an unparseable response ("Network error").
export async function POST(req: NextRequest) {
  const step = req.nextUrl.searchParams.get("step");
  if (step !== "sync" && step !== "score") {
    return NextResponse.json({ error: "step must be 'sync' or 'score'" }, { status: 400 });
  }

  try {
    const { db, auth } = getAdmin();

    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);

    if (step === "sync") {
      const { synced } = await syncMatchesCore(db);
      return NextResponse.json({ ok: true, synced });
    }

    // step === "score"
    const [userDoc, scoreResult] = await Promise.all([
      db.collection("users").doc(decoded.uid).get(),
      scoreMatchesCore(db),
    ]);

    const lastRefreshedAt = new Date().toISOString();
    const lastRefreshedBy = (userDoc.data()?.username as string) ?? "someone";
    await db.collection("meta").doc(META_DOC).set({ lastRefreshedAt, lastRefreshedBy }, { merge: true });

    return NextResponse.json({
      ok: true,
      lastRefreshedAt,
      lastRefreshedBy,
      scored: scoreResult.scored,
      finalMatches: scoreResult.finalMatches,
      users: scoreResult.users,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`refresh (${step}) error:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
