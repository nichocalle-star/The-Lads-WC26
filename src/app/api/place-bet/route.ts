import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { placeBet, type BetMarket } from "@/lib/bets";

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

export async function POST(req: NextRequest) {
  try {
    const idToken = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!idToken) return NextResponse.json({ error: "Please sign in to place a bet." }, { status: 401 });
    const verified = await verifyIdToken(idToken);
    if (!verified) return NextResponse.json({ error: "Session expired — sign in again." }, { status: 401 });

    const body = await req.json();
    const bet = await placeBet(getAdminDb(), verified.uid, {
      matchId: String(body.matchId),
      market: body.market as BetMarket,
      selection: String(body.selection),
      stake: Number(body.stake),
    });
    return NextResponse.json({ ok: true, bet });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Could not place bet.";
    // Validation failures are the user's fault (400); everything else is 500.
    const status = /stake|points|closed|odds|not found|market|max|bets per game|open/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
