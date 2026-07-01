import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { syncMatchesCore, scoreMatchesCore } from "@/lib/syncAndScore";
import { settleBetsCore } from "@/lib/bets";
import { syncOddsCore } from "@/lib/apiFootball";

export const runtime = "nodejs";
export const maxDuration = 60;

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

// Verify a Firebase ID token WITHOUT firebase-admin/auth. That submodule fails
// to load on Vercel (its dynamic crypto/JWT requires don't survive bundling /
// file-tracing), which 500'd this route. Google's REST endpoint does the same
// verification over plain fetch — returns the account if the token is valid.
async function verifyIdToken(idToken: string): Promise<{ uid: string } | null> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const uid = data?.users?.[0]?.localId;
    return uid ? { uid } : null;
  } catch {
    return null;
  }
}

const META_DOC = "refresh";

// GET — read the last-refresh timestamp without doing any work.
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("meta").doc(META_DOC).get();
    return NextResponse.json(snap.exists ? snap.data() : { lastRefreshedAt: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST — sync matches from ESPN and rescore everyone. Any signed-in lad can
// trigger this. Backward-compatible with the old single-call client:
//   ?step=sync → just sync · ?step=score → just score · no step → both.
export async function POST(req: NextRequest) {
  const step = req.nextUrl.searchParams.get("step");
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const verified = await verifyIdToken(idToken);
    if (!verified) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = getAdminDb();

    if (step === "sync") {
      const { synced } = await syncMatchesCore(db);
      return NextResponse.json({ ok: true, synced });
    }

    // step === "score" OR legacy no-step (do everything needed).
    const username = ((await db.collection("users").doc(verified.uid).get()).data()?.username as string) ?? "someone";
    if (step !== "score") await syncMatchesCore(db);
    const scoreResult = await scoreMatchesCore(db);
    // Settle any bets on matches that just went final (idempotent).
    const betResult = await settleBetsCore(db);
    // Refresh betting odds too — globally throttled to ~every 3h so it rides on
    // the score refresh without burning the API-Football budget. Never fatal.
    let oddsSynced = 0;
    try {
      const o = await syncOddsCore(db);
      oddsSynced = o.oddsUpdated;
    } catch (e) {
      console.error("odds sync (non-fatal):", e);
    }

    const lastRefreshedAt = new Date().toISOString();
    await db.collection("meta").doc(META_DOC).set({ lastRefreshedAt, lastRefreshedBy: username }, { merge: true });

    return NextResponse.json({
      ok: true,
      lastRefreshedAt,
      lastRefreshedBy: username,
      scored: scoreResult.scored,
      finalMatches: scoreResult.finalMatches,
      users: scoreResult.users,
      betsSettled: betResult.settled,
      oddsSynced,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`refresh (${step ?? "all"}) error:`, err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
