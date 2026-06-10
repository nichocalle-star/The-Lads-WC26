import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { CWC_MATCHES } from "@/lib/cwc-schedule";

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

// GET: return all matches from Firestore
export async function GET() {
  try {
    const db = getAdminDb();
    const snap = await db.collection("matches").orderBy("kickoffTimeUTC").get();
    const matches = snap.docs.map((d) => d.data());
    return NextResponse.json({ matches });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST: seed/update matches
// - Without body: seeds the hardcoded CWC schedule
// - With body { matchId, homeScore, awayScore, status, winner }: updates a single result
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const text = await req.text();
  const body = text ? JSON.parse(text) : null;

  // Single result update
  if (body?.matchId) {
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

  // Seed full schedule
  const batch = db.batch();
  for (const match of CWC_MATCHES) {
    const ref = db.collection("matches").doc(match.matchId);
    const snap = await ref.get();
    // Only overwrite schedule fields; preserve results if match already has scores
    if (!snap.exists) {
      batch.set(ref, {
        ...match,
        status: "upcoming",
        homeScore: null,
        awayScore: null,
        winner: null,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Update schedule metadata only — don't clobber existing scores
      batch.update(ref, {
        homeTeam: match.homeTeam,
        awayTeam: match.awayTeam,
        round: match.round,
        group: match.group ?? null,
        venue: match.venue,
        kickoffTimeUTC: match.kickoffTimeUTC,
        updatedAt: new Date().toISOString(),
      });
    }
  }
  await batch.commit();
  return NextResponse.json({ ok: true, seeded: CWC_MATCHES.length });
}
