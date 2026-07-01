import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

// Maps upcoming WC matches to API-Football fixtures and pulls Match Winner +
// Exact Score odds onto them. Admin-triggered; rate-friendly (skips odds
// refreshed within 3h). POST with Authorization: Bearer <ADMIN_SECRET>.
export async function POST(req: NextRequest) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncOddsCore(getAdminDb());
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("sync-odds error:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
