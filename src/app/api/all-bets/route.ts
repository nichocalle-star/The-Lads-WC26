import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Bet } from "@/lib/bets";

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

const r1 = (n: number) => Math.round(n * 10) / 10;

// Everyone's bets (bets are public, unlike predictions before lock) plus a
// per-player tally. Voided bets are excluded everywhere — they were refunded
// under an early settlement bug and don't count — but stay in Firestore as the
// backup of record.
export async function GET() {
  const db = getAdminDb();
  const [betsSnap, usersSnap] = await Promise.all([
    db.collection("bets").get(),
    db.collection("users").get(),
  ]);

  const nameByUid: Record<string, string> = {};
  for (const d of usersSnap.docs) { const u = d.data(); if (u.username) nameByUid[d.id] = u.username as string; }

  type Row = {
    username: string; matchLabel: string; selectionLabel: string; market: string;
    odds: number; stake: number; expectedPayout: number; payout: number;
    status: string; placedAt: string; settledAt: string | null; resultScore: string | null;
  };
  const pending: Row[] = [];
  const settled: Row[] = [];
  const stats: Record<string, { bets: number; wins: number; losses: number; pending: number; net: number }> = {};

  for (const d of betsSnap.docs) {
    const b = d.data() as Bet;
    if (b.status === "void") continue; // hidden (kept in DB as backup)
    const username = nameByUid[b.userId] ?? "someone";
    const row: Row = {
      username, matchLabel: b.matchLabel, selectionLabel: b.selectionLabel, market: b.market,
      odds: b.odds, stake: b.stake, expectedPayout: b.expectedPayout, payout: b.payout ?? 0,
      status: b.status, placedAt: b.placedAt, settledAt: b.settledAt, resultScore: b.resultScore,
    };
    const s = (stats[username] ??= { bets: 0, wins: 0, losses: 0, pending: 0, net: 0 });
    s.bets++;
    if (b.status === "pending") { s.pending++; pending.push(row); }
    else {
      settled.push(row);
      if (b.status === "won") { s.wins++; s.net = r1(s.net + (b.payout - b.stake)); }
      else { s.losses++; s.net = r1(s.net - b.stake); }
    }
  }

  pending.sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime());
  settled.sort((a, b) => new Date(b.settledAt ?? b.placedAt).getTime() - new Date(a.settledAt ?? a.placedAt).getTime());

  const tally = Object.entries(stats)
    .map(([username, s]) => ({
      username, bets: s.bets, wins: s.wins, losses: s.losses, pending: s.pending,
      winPct: s.wins + s.losses > 0 ? Math.round((s.wins / (s.wins + s.losses)) * 100) : null,
      net: s.net,
    }))
    .sort((a, b) => b.net - a.net || b.wins - a.wins || a.username.localeCompare(b.username));

  return NextResponse.json({ pending, settled, tally });
}
