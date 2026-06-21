import { NextRequest, NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { isWorldCup2026 } from "@/lib/tournament";
import { PREDICTIONS_LOCK_UTC } from "@/lib/lock";

// Predictions submitted after the global deadline shouldn't have existed at
// all (the deadline was meant to seal every pick at once). A bug in an
// earlier version let some through anyway. Rather than retroactively delete
// someone's picks, late ones are scored at a steep penalty instead of zero.
const LATE_SUBMISSION_MULTIPLIER = 0.1;

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

const ROUND_PTS: Record<string, { advance: number; exact: number }> = {
  "Group Stage":   { advance: 1,  exact: 2  },
  "Round of 32":  { advance: 5,  exact: 5  },
  "Round of 16":  { advance: 10, exact: 10 },
  "Quarterfinal": { advance: 20, exact: 20 },
  "Semifinal":    { advance: 40, exact: 40 },
  "Final":        { advance: 50, exact: 50 },
};

function calcPoints(
  round: string,
  predictedWinner: string,
  predictedHome: number | null,
  predictedAway: number | null,
  actualWinner: string,
  actualHome: number | null,
  actualAway: number | null
): number {
  const pts = ROUND_PTS[round];
  if (!pts) return 0;

  const correctOutcome = predictedWinner === actualWinner;
  const exactScore =
    actualHome !== null &&
    actualAway !== null &&
    predictedHome === actualHome &&
    predictedAway === actualAway;

  if (round === "Group Stage") {
    // Mutually exclusive: exact score = +2, correct outcome only = +1
    if (exactScore) return 2;
    if (correctOutcome) return 1;
    return 0;
  }

  // Knockout: advance + exact are cumulative
  let total = 0;
  if (correctOutcome) total += pts.advance;
  if (exactScore) total += pts.exact;
  return total;
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getAdminDb();

  // Zero out all user points first (full recalculation every run)
  const allUsersSnap = await db.collection("userMetrics").get();
  if (!allUsersSnap.empty) {
    const zeroBatch = db.batch();
    for (const d of allUsersSnap.docs) zeroBatch.update(d.ref, { totalPoints: 0 });
    await zeroBatch.commit();
  }

  // Get all final matches — World Cup 2026 only. Scoring must never read any
  // other tournament's data (see src/lib/tournament.ts).
  const matchSnap = await db.collection("matches").where("status", "==", "final").get();
  const wcDocs = matchSnap.docs.filter((d) => isWorldCup2026(d.data()));
  if (wcDocs.length === 0) {
    return NextResponse.json({ ok: true, scored: 0, message: "No final matches found" });
  }

  const finalMatchIds = wcDocs.map((d) => d.id);
  const matchData: Record<string, FirebaseFirestore.DocumentData> = {};
  for (const d of wcDocs) matchData[d.id] = d.data();

  // Score predictions in batches of 30 (Firestore IN query limit)
  const CHUNK = 30;
  const pointsByUser: Record<string, number> = {};
  let totalScored = 0;
  let lateSubmissions = 0;
  const deadlineMs = new Date(PREDICTIONS_LOCK_UTC).getTime();

  for (let i = 0; i < finalMatchIds.length; i += CHUNK) {
    const chunk = finalMatchIds.slice(i, i + CHUNK);
    const predSnap = await db.collection("predictions").where("matchId", "in", chunk).get();

    const batch = db.batch();
    for (const predDoc of predSnap.docs) {
      const pred = predDoc.data();
      const match = matchData[pred.matchId];
      if (!match) continue;

      let pts = calcPoints(
        match.round,
        pred.predictedWinner,
        pred.predictedHomeScore,
        pred.predictedAwayScore,
        match.winner,
        match.homeScore,
        match.awayScore
      );

      const isLate = !!pred.submittedAt && new Date(pred.submittedAt).getTime() > deadlineMs;
      if (isLate) {
        pts = Math.round(pts * LATE_SUBMISSION_MULTIPLIER * 10) / 10;
        lateSubmissions++;
      }

      batch.update(predDoc.ref, { pointsAwarded: pts, ...(isLate ? { latePenalty: true } : {}) });
      pointsByUser[pred.userId] = (pointsByUser[pred.userId] ?? 0) + pts;
      totalScored++;
    }
    await batch.commit();
  }

  // Update totalPoints on userMetrics (what the leaderboard reads).
  // Round off float drift from summing many 0.1-increment penalties.
  const userBatch = db.batch();
  for (const uid of Object.keys(pointsByUser)) {
    pointsByUser[uid] = Math.round(pointsByUser[uid] * 10) / 10;
    userBatch.set(db.collection("userMetrics").doc(uid), { totalPoints: pointsByUser[uid] }, { merge: true });
  }
  await userBatch.commit();

  return NextResponse.json({
    ok: true,
    scored: totalScored,
    finalMatches: finalMatchIds.length,
    users: Object.keys(pointsByUser).length,
    lateSubmissions,
    breakdown: pointsByUser,
  });
}
