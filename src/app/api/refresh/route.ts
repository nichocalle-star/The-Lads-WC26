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

// POST — sync matches from ESPN and rescore everyone. Any signed-in lad can
// trigger this (verified via Firebase ID token, like the other user-facing
// write routes — not the admin secret).
//
// Backward-compatible by design:
//   • ?step=sync  → just sync (used by the current two-phase client)
//   • ?step=score → just score + stamp the timestamp
//   • no step     → do BOTH in one request (what the old cached client calls)
// The original reason for splitting was that the old full-recalc scoring was
// slow enough to risk a timeout; scoring is incremental now, so sync+score
// together runs in a few seconds and the single-call path is safe again. This
// means a stale browser tab still on the old client keeps working instead of
// erroring with "network error".
async function stampRefresh(db: FirebaseFirestore.Firestore, username: string) {
  const lastRefreshedAt = new Date().toISOString();
  await db.collection("meta").doc(META_DOC).set({ lastRefreshedAt, lastRefreshedBy: username }, { merge: true });
  return lastRefreshedAt;
}

export async function POST(req: NextRequest) {
  const step = req.nextUrl.searchParams.get("step");
  try {
    const { db, auth } = getAdmin();

    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const decoded = await auth.verifyIdToken(idToken);

    if (step === "sync") {
      const { synced } = await syncMatchesCore(db);
      return NextResponse.json({ ok: true, synced });
    }

    // step === "score" OR legacy no-step (do everything needed).
    const username = ((await db.collection("users").doc(decoded.uid).get()).data()?.username as string) ?? "someone";

    if (step !== "score") {
      // Legacy single-call path: sync first, then score.
      await syncMatchesCore(db);
    }
    const scoreResult = await scoreMatchesCore(db);
    const lastRefreshedAt = await stampRefresh(db, username);

    return NextResponse.json({
      ok: true,
      lastRefreshedAt,
      lastRefreshedBy: username,
      scored: scoreResult.scored,
      finalMatches: scoreResult.finalMatches,
      users: scoreResult.users,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`refresh (${step ?? "all"}) error:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
