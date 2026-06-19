import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { Match } from "@/lib/types";
import { TeamProfile, emptyProfile } from "@/lib/prediction";
import { eloOf } from "@/lib/teamRatings";

export const runtime = "nodejs";
export const maxDuration = 60;

const ESPN_WC = "https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world";

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

// Pull corners / shots / possession for one team in one match from ESPN.
async function fetchBoxscore(espnId: string): Promise<Record<string, { corners: number; shots: number; possession: number }>> {
  const out: Record<string, { corners: number; shots: number; possession: number }> = {};
  try {
    const res = await fetch(`${ESPN_WC}/summary?event=${espnId}`, { next: { revalidate: 0 } });
    const data = await res.json();
    const teams = data?.boxscore?.teams ?? [];
    for (const t of teams) {
      const name = t?.team?.displayName;
      if (!name) continue;
      const stats: Record<string, string> = {};
      for (const s of t.statistics ?? []) stats[s.name] = s.displayValue ?? s.value;
      out[name] = {
        corners: parseFloat(stats.wonCorners ?? "0") || 0,
        shots: parseFloat(stats.totalShots ?? "0") || 0,
        possession: parseFloat(stats.possessionPct ?? "0") || 0,
      };
    }
  } catch {
    // leave empty — match still counts goals/result below
  }
  return out;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();
  const matchSnap = await db.collection("matches").where("status", "==", "final").get();
  const finals = matchSnap.docs
    .map((d) => d.data() as Match & { espnId?: string })
    .filter((m) => m.homeScore != null && m.awayScore != null);

  const profiles: Record<string, TeamProfile> = {};
  const ensure = (name: string) => (profiles[name] ??= emptyProfile(name));

  // Fetch boxscores in small parallel batches to stay within the time budget.
  const BATCH = 6;
  const boxByMatch: Record<string, Record<string, { corners: number; shots: number; possession: number }>> = {};
  for (let i = 0; i < finals.length; i += BATCH) {
    const slice = finals.slice(i, i + BATCH);
    const results = await Promise.all(
      slice.map(async (m) => {
        const espnId = m.espnId ?? m.matchId.replace("espn-", "");
        return [m.matchId, await fetchBoxscore(espnId)] as const;
      })
    );
    for (const [id, box] of results) boxByMatch[id] = box;
  }

  for (const m of finals) {
    const home = ensure(m.homeTeam);
    const away = ensure(m.awayTeam);
    const hs = m.homeScore as number;
    const as_ = m.awayScore as number;

    home.played++; away.played++;
    home.gf += hs; home.ga += as_;
    away.gf += as_; away.ga += hs;
    home.oppEloSum += eloOf(m.awayTeam);
    away.oppEloSum += eloOf(m.homeTeam);
    if (hs > as_) { home.wins++; away.losses++; }
    else if (as_ > hs) { away.wins++; home.losses++; }
    else { home.draws++; away.draws++; }

    const box = boxByMatch[m.matchId] ?? {};
    const hb = box[m.homeTeam];
    const ab = box[m.awayTeam];
    if (hb) { home.cornersWon += hb.corners; home.shots += hb.shots; home.possessionSum += hb.possession; }
    if (ab) { away.cornersWon += ab.corners; away.shots += ab.shots; away.possessionSum += ab.possession; }
    if (hb && ab) { home.cornersConceded += ab.corners; away.cornersConceded += hb.corners; }
  }

  const batch = db.batch();
  for (const p of Object.values(profiles)) {
    batch.set(db.collection("teamProfiles").doc(p.name), { ...p, updatedAt: new Date().toISOString() });
  }
  await batch.commit();

  return NextResponse.json({
    ok: true,
    teams: Object.keys(profiles).length,
    matchesProcessed: finals.length,
  });
}
