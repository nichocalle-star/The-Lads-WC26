"use client";

import { useEffect, useState } from "react";

type Row = {
  username: string; matchLabel: string; selectionLabel: string; market: string;
  odds: number; stake: number; expectedPayout: number; payout: number;
  status: string; placedAt: string; settledAt: string | null; resultScore: string | null;
};
type Tally = { username: string; bets: number; wins: number; losses: number; pending: number; winPct: number | null; net: number };

const r1 = (n: number) => Math.round(n * 10) / 10;

// Home-page "See the bets" reveal — everyone's live bets, the running tally,
// and (on demand) the full history of settled bets. Voided bets never appear.
export default function BetsBoard() {
  const [open, setOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);
  const [data, setData] = useState<{ pending: Row[]; settled: Row[]; tally: Tally[] } | null>(null);

  useEffect(() => {
    if (!open || data) return;
    let cancelled = false;
    fetch("/api/all-bets").then((r) => r.json())
      .then((j) => { if (!cancelled) setData({ pending: j.pending ?? [], settled: j.settled ?? [], tally: j.tally ?? [] }); })
      .catch(() => { if (!cancelled) setData({ pending: [], settled: [], tally: [] }); });
    return () => { cancelled = true; };
  }, [open, data]);

  return (
    <div className="bg-[#0b1d12] border border-[#1d3a28] rounded-2xl overflow-hidden">
      <button onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-[18px] py-3 hover:bg-[#0e2517] transition-colors">
        <span className="flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] rounded-full bg-[#10301c] flex items-center justify-center text-base">🪙</span>
          <span className="text-[15px] font-semibold text-[#f0f7f2]">See the bets</span>
        </span>
        <span className="text-[#2bd97a] text-sm">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-[#16301f]">
          {!data ? (
            <p className="text-sm text-[#6fae87] px-4 py-4 text-center">Loading bets…</p>
          ) : (
            <>
              {/* Live (pending) bets */}
              <div className="px-[18px] pt-3 pb-1">
                <p className="text-[11px] tracking-[1.5px] text-[#7fd4a3] mb-1.5">LIVE BETS</p>
                {data.pending.length === 0 ? (
                  <p className="text-[12px] text-[#6fae87] pb-2">No open bets right now.</p>
                ) : data.pending.map((b, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-[12px] py-1.5 border-b border-[#16301f]/60 last:border-0">
                    <span className="text-[#f0f7f2] shrink-0">{b.username}</span>
                    <span className="text-[#9ec9ad] truncate flex-1 text-center">{b.selectionLabel} <span className="text-[#6fae87]">@{b.odds}</span> · {b.matchLabel}</span>
                    <span className="text-[#cfe6d8] tabular-nums shrink-0">{b.stake} → <span className="text-[#2bd97a]">{b.expectedPayout}</span></span>
                  </div>
                ))}
              </div>

              {/* Tally */}
              <div className="px-[18px] pt-3 pb-2">
                <p className="text-[11px] tracking-[1.5px] text-[#6fae87] mb-1.5">BETTING TALLY · RANKED BY NET POINTS</p>
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-[10px] text-[#6fae87] uppercase tracking-wider">
                      <td className="py-1">Player</td>
                      <td className="py-1 text-center">Bets</td>
                      <td className="py-1 text-center">Win %</td>
                      <td className="py-1 text-right">Net</td>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tally.map((t) => (
                      <tr key={t.username} className="border-t border-[#16301f]/60">
                        <td className="py-1.5 text-[#f0f7f2]">{t.username}</td>
                        <td className="py-1.5 text-center text-[#cfe6d8] tabular-nums">{t.bets}{t.pending > 0 && <span className="text-[#6fae87]"> ({t.pending} open)</span>}</td>
                        <td className="py-1.5 text-center text-[#cfe6d8] tabular-nums">{t.winPct === null ? "—" : `${t.winPct}%`}</td>
                        <td className={`py-1.5 text-right font-semibold tabular-nums ${t.net > 0 ? "text-[#2bd97a]" : t.net < 0 ? "text-red-400" : "text-[#9ec9ad]"}`}>
                          {t.net > 0 ? `+${t.net}` : t.net}
                        </td>
                      </tr>
                    ))}
                    {data.tally.length === 0 && <tr><td colSpan={4} className="py-2 text-[#6fae87]">Nobody has bet yet.</td></tr>}
                  </tbody>
                </table>
              </div>

              {/* Past bets */}
              <button onClick={() => setShowPast((p) => !p)}
                className="w-full text-[12px] text-[#2bd97a] hover:bg-[#10301c] py-2 border-t border-[#16301f] transition-colors">
                {showPast ? "Hide past bets ▲" : `See all past bets (${data.settled.length}) ▼`}
              </button>
              {showPast && (
                <div className="px-[18px] py-2 max-h-72 overflow-y-auto">
                  {data.settled.length === 0 ? (
                    <p className="text-[12px] text-[#6fae87]">No settled bets yet.</p>
                  ) : data.settled.map((b, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 text-[12px] py-1.5 border-b border-[#16301f]/60 last:border-0">
                      <span className="text-[#f0f7f2] shrink-0">{b.username}</span>
                      <span className="text-[#9ec9ad] truncate flex-1 text-center">
                        {b.selectionLabel} <span className="text-[#6fae87]">@{b.odds}</span> · {b.matchLabel}{b.resultScore ? ` (${b.resultScore.replace(":", "–")})` : ""}
                      </span>
                      <span className={`shrink-0 font-semibold tabular-nums ${b.status === "won" ? "text-[#2bd97a]" : "text-red-400"}`}>
                        {b.status === "won" ? `WON +${r1(b.payout - b.stake)}` : `LOST −${b.stake}`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
