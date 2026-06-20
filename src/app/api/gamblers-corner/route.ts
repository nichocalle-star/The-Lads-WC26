import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Match } from "@/lib/types";
import { TeamProfile, emptyProfile, predictMatch } from "@/lib/prediction";
import { isWorldCup2026 } from "@/lib/tournament";

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

export async function GET() {
  try {
    const db = getAdminDb();
    const [matchSnap, profSnap] = await Promise.all([
      db.collection("matches").get(),
      db.collection("teamProfiles").get(),
    ]);

    const profiles: Record<string, TeamProfile> = {};
    for (const d of profSnap.docs) profiles[d.id] = d.data() as TeamProfile;
    const profileOf = (name: string) => profiles[name] ?? emptyProfile(name);

    const now = Date.now();
    const upcoming = matchSnap.docs
      .map((d) => d.data() as Match)
      .filter((m) => isWorldCup2026(m) && m.status !== "final" && m.homeTeam !== "TBD" && m.awayTeam !== "TBD"
        && !m.homeTeam.includes("Winner") && !m.awayTeam.includes("Winner")
        && !/#|Place/.test(m.homeTeam) && !/#|Place/.test(m.awayTeam))
      .sort((a, b) => new Date(a.kickoffTimeUTC).getTime() - new Date(b.kickoffTimeUTC).getTime());

    const predictions = upcoming.map((m) =>
      predictMatch(m.matchId, m.round, profileOf(m.homeTeam), profileOf(m.awayTeam))
    );

    const profilesBuilt = profSnap.size > 0;
    return NextResponse.json({ predictions, profilesBuilt, generatedAt: now });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
