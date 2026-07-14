"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

const OPTIONS = [25, 50, 75];

// Rule announcement: everyone must bet on the World Cup Final. The minimum
// stake is decided by an open multi-select poll (25 / 50 / 75 — most votes
// wins); anyone holding less than the minimum goes all in.
export default function FinalBetAnnouncement({ uid }: { uid: string }) {
  const [counts, setCounts] = useState<Record<number, number>>({ 25: 0, 50: 0, 75: 0 });
  const [voters, setVoters] = useState(0);
  const [picked, setPicked] = useState<number[]>([]);
  const [saved, setSaved] = useState<number[] | null>(null); // last submitted vote
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  function load() {
    fetch(`/api/final-poll?uid=${uid}`).then((r) => r.json()).then((j) => {
      setCounts(j.counts ?? { 25: 0, 50: 0, 75: 0 });
      setVoters(j.voters ?? 0);
      if ((j.mine ?? []).length > 0) { setSaved(j.mine); setPicked(j.mine); }
    }).catch(() => {});
  }
  useEffect(load, [uid]);

  function toggle(o: number) {
    setPicked((p) => (p.includes(o) ? p.filter((x) => x !== o) : [...p, o]));
  }

  async function vote() {
    if (saving || picked.length === 0) return;
    setSaving(true); setErr("");
    try {
      const tok = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/final-poll", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ options: picked }),
      });
      const j = await res.json();
      if (res.ok) { setSaved(picked); load(); }
      else setErr(j.error || "Could not record vote.");
    } catch { setErr("Network error — try again."); }
    finally { setSaving(false); }
  }

  const changed = saved === null || [...picked].sort().join() !== [...saved].sort().join();
  const leader = Math.max(...OPTIONS.map((o) => counts[o] ?? 0));

  return (
    <div className="bg-[#0b1d12] border border-[#2a5c3d] rounded-2xl overflow-hidden">
      <div className="flex h-[3px]"><div className="flex-1 bg-[#0a7a3d]" /><div className="flex-1 bg-[#ffd166]" /><div className="flex-1 bg-[#c8102e]" /></div>

      <div className="px-[18px] pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] rounded-full bg-[#10301c] flex items-center justify-center shrink-0">📣</span>
          <div>
            <p className="text-[15px] font-semibold text-[#f0f7f2]">New rule: everyone bets the Final</p>
            <p className="text-xs text-[#6fae87] mt-0.5">A mandatory wager on the World Cup Final — vote on the minimum below.</p>
          </div>
        </div>
        <span className="text-[10px] tracking-wider text-[#06230f] bg-[#ffd166] rounded px-2 py-[3px] shrink-0 font-semibold">RULE CHANGE</span>
      </div>

      <div className="px-[18px] pt-2 pb-1 space-y-1 text-[12px] text-[#9ec9ad] leading-relaxed">
        <p>Every player <span className="text-[#f0f7f2]">must place a bet on the Final</span>. The minimum stake will be whichever option gets the most votes in this open poll.</p>
        <p>If you have <span className="text-[#f0f7f2]">fewer points than the minimum</span>, you go <span className="text-[#f0f7f2]">all in</span> with everything you have.</p>
      </div>

      {/* Poll */}
      <div className="px-[18px] pt-2 pb-3">
        <p className="text-[11px] tracking-[1.5px] text-[#7fd4a3] mb-1.5">VOTE — MINIMUM BET (PICK ONE OR MORE)</p>
        <div className="flex gap-2">
          {OPTIONS.map((o) => {
            const on = picked.includes(o);
            const c = counts[o] ?? 0;
            return (
              <button key={o} onClick={() => toggle(o)}
                className={`flex-1 rounded-lg py-2 border transition-colors ${on ? "bg-[#0a7a3d] border-[#2bd97a] text-white" : "bg-[#10301c] border-[#1d3a28] text-[#cfe6d8] hover:border-[#2a5c3d]"}`}>
                <span className="block text-lg font-semibold tabular-nums">{o}</span>
                <span className={`block text-[10px] ${on ? "text-[#c9f4da]" : "text-[#6fae87]"}`}>
                  {c} vote{c === 1 ? "" : "s"}{c > 0 && c === leader ? " · leading" : ""}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 mt-2.5 flex-wrap">
          <button onClick={vote} disabled={saving || picked.length === 0 || !changed}
            className="bg-[#0a7a3d] hover:bg-[#0d9449] disabled:opacity-50 text-white font-medium text-[13px] px-4 py-1.5 rounded-lg transition-colors">
            {saving ? "Saving…" : saved && !changed ? "✓ Vote recorded" : saved ? "Update vote" : "Submit vote"}
          </button>
          <span className="text-[11px] text-[#6fae87]">{voters} of the lads have voted · you can change your vote anytime</span>
        </div>
        {err && <p className="text-[12px] text-red-400 mt-1.5">{err}</p>}
      </div>
    </div>
  );
}
