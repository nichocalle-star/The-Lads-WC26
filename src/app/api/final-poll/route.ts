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

// Verify a Firebase ID token via Google's REST endpoint (firebase-admin/auth
// doesn't survive Vercel bundling — same approach as /api/refresh).
async function verifyIdToken(idToken: string): Promise<{ uid: string } | null> {
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const uid = data?.users?.[0]?.localId;
    return uid ? { uid } : null;
  } catch { return null; }
}

// Open poll on the mandatory-final-bet minimum. Options are fixed; multi-select
// allowed; a re-vote replaces the voter's previous selection. Results are open.
const POLL_OPTIONS = [25, 50, 75];

// GET ?uid=... → live tallies + that user's current votes.
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  const db = getAdminDb();
  const snap = await db.collection("finalBetPoll").get();

  const counts: Record<number, number> = { 25: 0, 50: 0, 75: 0 };
  let mine: number[] = [];
  for (const d of snap.docs) {
    const options = (d.data().options as number[]) ?? [];
    for (const o of options) if (o in counts) counts[o]++;
    if (uid && d.id === uid) mine = options;
  }
  return NextResponse.json({ options: POLL_OPTIONS, counts, voters: snap.size, mine });
}

// POST { options: number[] } — token-verified; stores the voter's selection.
export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Sign in to vote." }, { status: 401 });
    const verified = await verifyIdToken(idToken);
    if (!verified) return NextResponse.json({ error: "Session expired — sign in again." }, { status: 401 });

    const body = await req.json();
    const options = [...new Set((body.options as unknown[]) ?? [])]
      .map(Number)
      .filter((o) => POLL_OPTIONS.includes(o));
    if (options.length === 0) return NextResponse.json({ error: "Pick at least one option (25, 50, or 75)." }, { status: 400 });

    await getAdminDb().collection("finalBetPoll").doc(verified.uid).set({
      userId: verified.uid, options, updatedAt: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, options });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not record vote.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
