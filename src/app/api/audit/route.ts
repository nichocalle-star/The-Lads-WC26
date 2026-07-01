import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { auditUser } from "@/lib/syncAndScore";
import { PREDICTIONS_LOCK_UTC } from "@/lib/lock";

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

// A full scoring ledger for one user: every prediction, the actual result, the
// points, and a running total that reconciles to their leaderboard score.
// Locked-only, so it can't be used to peek at picks before the deadline.
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get("uid");
  if (!uid) return NextResponse.json({ error: "uid required" }, { status: 400 });

  if (Date.now() < new Date(PREDICTIONS_LOCK_UTC).getTime()) {
    return NextResponse.json({ locked: false });
  }

  const result = await auditUser(getAdminDb(), uid);
  return NextResponse.json(result);
}
