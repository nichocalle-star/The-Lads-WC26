"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import BettingSection from "@/components/BettingSection";

export default function GamblersCornerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  if (loading || !user) return null;

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-bold">🎲 Gambler&apos;s Corner</h1>
        <p className="text-gray-400 text-sm mt-1">Stake your points on live matches at real odds.</p>
      </div>

      {/* Disclaimer */}
      <div className="bg-[#1d0b0b] border border-[#5c2a2a] rounded-xl px-5 py-4">
        <p className="text-[#e3a3a3] text-sm font-medium">⚠️ Gambling is never advised.</p>
        <p className="text-[#a87f7f] text-[13px] mt-1 leading-relaxed">
          The smart move is not to bet at all. This is a game played with points, for fun only — the
          house always has the edge, and you should never wager more than you can afford to lose.
        </p>
      </div>

      <BettingSection uid={user.uid} />
    </div>
  );
}
