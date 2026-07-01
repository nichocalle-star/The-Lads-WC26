"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

type Odds = {
  bookmaker: string | null;
  matchWinner: { home: number | null; draw: number | null; away: number | null };
  exactScore: { score: string; odd: number }[];
};
type Mtch = { matchId: string; homeTeam: string; awayTeam: string; kickoffTimeUTC: string; round: string; wagerOdds?: Odds };
type Bet = { id: string; matchLabel: string; selectionLabel: string; market: string; odds: number; stake: number; expectedPayout: number; potentialProfit: number; status: string; payout: number; placedAt: string; resultScore: string | null };
type Ctx = { predictionPoints: number; wagerBalance: number; available: number; bets: Bet[] };
type Slip = { match: Mtch; market: "matchWinner" | "correctScore"; selection: string; label: string; odds: number };

const TZ = "America/New_York";
const fmtKick = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
const r1 = (n: number) => Math.round(n * 10) / 10;

export default function BettingSection({ uid }: { uid: string }) {
  const [matches, setMatches] = useState<Mtch[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [stake, setStake] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sync-matches").then((r) => r.json()).then((j) => {
      if (cancelled) return;
      const now = Date.now();
      setMatches(((j.matches ?? []) as Mtch[])
        .filter((m) => m.wagerOdds && new Date(m.kickoffTimeUTC).getTime() > now)
        .sort((a, b) => new Date(a.kickoffTimeUTC).getTime() - new Date(b.kickoffTimeUTC).getTime()));
    }).catch(() => {});
    fetch(`/api/betting?uid=${uid}`).then((r) => r.json()).then((c) => { if (!cancelled) setCtx(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [uid]);

  function reloadCtx() { fetch(`/api/betting?uid=${uid}`).then((r) => r.json()).then(setCtx).catch(() => {}); }

  const available = ctx?.available ?? 0;
  const stakeNum = Math.max(0, r1(parseFloat(stake) || 0));
  const payout = slip ? r1(stakeNum * slip.odds) : 0;
  const profit = r1(payout - stakeNum);
  const canReview = !!slip && stakeNum > 0 && stakeNum <= available;

  function open(match: Mtch, market: "matchWinner" | "correctScore", selection: string, label: string, odds: number) {
    setSlip({ match, market, selection, label, odds });
    setStake(""); setConfirming(false); setResult(null);
  }

  async function place() {
    if (!slip || placing) return;
    setPlacing(true);
    try {
      const tok = await auth.currentUser?.getIdToken();
      const res = await fetch("/api/place-bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ matchId: slip.match.matchId, market: slip.market, selection: slip.selection, stake: stakeNum }),
      });
      const j = await res.json();
      if (res.ok) {
        setResult({ ok: true, msg: `✅ Bet placed — ${slip.label}, ${stakeNum} pts to return ${j.bet.expectedPayout}.` });
        setSlip(null); setConfirming(false); setStake(""); reloadCtx();
      } else {
        setResult({ ok: false, msg: `❌ ${j.error || "Could not place bet."}` });
        setConfirming(false);
      }
    } catch {
      setResult({ ok: false, msg: "❌ Network error — check My Bets before retrying." });
      setConfirming(false);
    } finally { setPlacing(false); }
  }

  const pending = ctx?.bets.filter((b) => b.status === "pending") ?? [];
  const settled = ctx?.bets.filter((b) => b.status !== "pending") ?? [];

  return (
    <div className="bg-[#0b1d12] border border-[#2a5c3d] rounded-2xl overflow-hidden">
      <div className="flex h-[3px]"><div className="flex-1 bg-[#0a7a3d]" /><div className="flex-1 bg-[#ffd166]" /><div className="flex-1 bg-[#c8102e]" /></div>

      <div className="px-5 pt-4 pb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] rounded-full bg-[#10301c] flex items-center justify-center text-lg">🪙</span>
          <p className="text-base font-semibold text-[#f0f7f2]">The Points Exchange</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#6fae87] uppercase tracking-wider">Balance to bet</p>
          <p className="text-lg font-bold text-[#2bd97a] tabular-nums leading-none">{available}</p>
        </div>
      </div>

      {/* How it works */}
      <div className="px-5 pb-2 space-y-1 text-[12px] text-[#9ec9ad] leading-relaxed">
        <p><span className="text-[#f0f7f2] font-medium">Stake your real points</span> on a live match. <span className="text-[#f0f7f2]">Match Winner</span> = home/draw/away; <span className="text-[#f0f7f2]">Correct Score</span> = the exact final scoreline. Bet one or both.</p>
        <p>Win and your stake returns with profit at the odds shown; lose and the stake is gone — it moves your <span className="text-[#f0f7f2]">leaderboard score</span>. You can&apos;t stake more than your balance.</p>
        <p>Bets lock at kickoff and settle automatically at full-time (a game won on penalties counts as a draw for these markets).</p>
        <p className="text-[#e0b063]">⚠️ Odds are raw bookmaker prices — the house edge is built in (~7% on winners, far more on exact scores). For fun; the book always has an edge.</p>
      </div>

      {result && (
        <div className={`mx-5 my-2 rounded-lg px-3 py-2 text-[13px] ${result.ok ? "bg-green-900/30 border border-green-800/50 text-green-300" : "bg-red-900/30 border border-red-800/50 text-red-300"}`}>{result.msg}</div>
      )}

      {/* Markets */}
      <div className="px-5 py-2 space-y-3">
        {matches.length === 0 && <p className="text-[13px] text-[#6fae87] py-3 text-center">No upcoming matches with odds right now.</p>}
        {matches.map((m) => {
          const o = m.wagerOdds!;
          const exact = [...o.exactScore].sort((a, b) => a.odd - b.odd);
          return (
            <div key={m.matchId} className="bg-[#0e2517] border border-[#16301f] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[#f0f7f2]">{m.homeTeam} <span className="text-[#6fae87]">v</span> {m.awayTeam}</p>
                <p className="text-[10px] text-[#6fae87]">{fmtKick(m.kickoffTimeUTC)}</p>
              </div>
              {/* Match Winner */}
              <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1">Match Winner</p>
              <div className="flex gap-1.5 mb-2">
                {([["home", m.homeTeam, o.matchWinner.home], ["draw", "Draw", o.matchWinner.draw], ["away", m.awayTeam, o.matchWinner.away]] as const).map(([sel, lbl, odd]) => (
                  <button key={sel} disabled={!odd}
                    onClick={() => open(m, "matchWinner", sel, `${lbl} to ${sel === "draw" ? "draw" : "win"}`, odd as number)}
                    className="flex-1 bg-[#10301c] enabled:hover:bg-[#164027] border border-[#1d3a28] disabled:opacity-40 rounded-lg py-1.5 text-center transition-colors">
                    <span className="block text-[11px] text-[#cfe6d8] truncate px-1">{sel === "draw" ? "Draw" : lbl}</span>
                    <span className="block text-sm font-semibold text-[#2bd97a] tabular-nums">{odd ?? "—"}</span>
                  </button>
                ))}
              </div>
              {/* Correct Score */}
              {exact.length > 0 && (
                <>
                  <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1">Correct Score</p>
                  <select value="" onChange={(e) => { const s = exact.find((x) => x.score === e.target.value); if (s) open(m, "correctScore", s.score, `Exact score ${s.score.replace(":", "–")}`, s.odd); }}
                    className="w-full bg-[#07140c] border border-[#1d3a28] rounded-lg px-2 py-1.5 text-[13px] text-[#cfe6d8]">
                    <option value="">Pick a scoreline… ({m.homeTeam} first)</option>
                    {exact.map((s) => <option key={s.score} value={s.score}>{s.score.replace(":", "–")} @ {s.odd}</option>)}
                  </select>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* My Bets */}
      {(pending.length > 0 || settled.length > 0) && (
        <div className="px-5 py-3 border-t border-[#16301f]">
          <p className="text-[11px] tracking-[1.5px] text-[#6fae87] mb-2">MY BETS</p>
          <div className="space-y-1.5">
            {[...pending, ...settled].map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 text-[12px] bg-[#0e2517] rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-[#f0f7f2] truncate">{b.selectionLabel} <span className="text-[#6fae87]">@{b.odds}</span></p>
                  <p className="text-[10px] text-[#6fae87] truncate">{b.matchLabel}{b.resultScore ? ` · ended ${b.resultScore.replace(":", "–")}` : ""}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="tabular-nums text-[#cfe6d8]">{b.stake} → {b.expectedPayout}</p>
                  <p className={`text-[10px] font-semibold ${b.status === "won" ? "text-[#2bd97a]" : b.status === "lost" ? "text-red-400" : "text-[#e0b063]"}`}>
                    {b.status === "pending" ? "PENDING" : b.status === "won" ? `WON +${r1(b.payout - b.stake)}` : `LOST −${b.stake}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bet slip / confirmation modal */}
      {slip && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3" onClick={() => !placing && setSlip(null)}>
          <div className="bg-[#0b1d12] border border-[#2a5c3d] rounded-2xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            {!confirming ? (
              <>
                <p className="text-[11px] text-[#6fae87] uppercase tracking-wider">Bet slip</p>
                <p className="text-base font-semibold text-[#f0f7f2] mt-1">{slip.label}</p>
                <p className="text-[12px] text-[#9ec9ad]">{slip.match.homeTeam} v {slip.match.awayTeam} · odds <span className="text-[#2bd97a] font-medium">{slip.odds}</span></p>

                <label className="block text-[11px] text-[#6fae87] mt-3 mb-1">Stake (of {available} available)</label>
                <input type="number" inputMode="decimal" min={0} max={available} value={stake} onChange={(e) => setStake(e.target.value)}
                  placeholder="0" autoFocus
                  className="w-full bg-[#07140c] border border-[#1d3a28] rounded-lg px-3 py-2 text-white text-lg tabular-nums focus:outline-none focus:border-[#2bd97a]" />
                <div className="flex gap-1.5 mt-1.5">
                  {[5, 10, 25].map((v) => <button key={v} onClick={() => setStake(String(Math.min(v, available)))} className="flex-1 text-[11px] bg-[#10301c] border border-[#1d3a28] rounded py-1 text-[#cfe6d8]">{v}</button>)}
                  <button onClick={() => setStake(String(available))} className="flex-1 text-[11px] bg-[#10301c] border border-[#1d3a28] rounded py-1 text-[#cfe6d8]">Max</button>
                </div>

                {/* Calculator */}
                <div className="mt-3 bg-[#0e2517] border border-[#16301f] rounded-lg p-3 text-[13px] space-y-1">
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Returns if it wins</span><span className="text-[#2bd97a] font-semibold tabular-nums">{payout}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Profit</span><span className="text-[#cfe6d8] tabular-nums">+{profit}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Balance after if it loses</span><span className="text-[#cfe6d8] tabular-nums">{r1(available - stakeNum)}</span></div>
                </div>
                {stakeNum > available && <p className="text-[12px] text-red-400 mt-1.5">Stake exceeds your balance.</p>}

                <div className="flex gap-2 mt-3">
                  <button onClick={() => setSlip(null)} className="flex-1 border border-[#1d3a28] text-[#9ec9ad] rounded-lg py-2 text-sm">Cancel</button>
                  <button disabled={!canReview} onClick={() => setConfirming(true)} className="flex-1 bg-[#0a7a3d] enabled:hover:bg-[#0d9449] disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">Review bet</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-[#6fae87] uppercase tracking-wider">Confirm your bet</p>
                <div className="mt-2 bg-[#0e2517] border border-[#16301f] rounded-lg p-3 text-[13px] space-y-1.5">
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Bet</span><span className="text-[#f0f7f2] font-medium text-right">{slip.label}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Match</span><span className="text-[#cfe6d8] text-right">{slip.match.homeTeam} v {slip.match.awayTeam}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Odds</span><span className="text-[#cfe6d8] tabular-nums">{slip.odds}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Stake</span><span className="text-[#cfe6d8] tabular-nums">{stakeNum} pts</span></div>
                  <div className="flex justify-between border-t border-[#16301f] pt-1.5"><span className="text-[#9ec9ad]">Returns if it wins</span><span className="text-[#2bd97a] font-semibold tabular-nums">{payout} pts (+{profit})</span></div>
                </div>
                <p className="text-[12px] text-[#e0b063] mt-2 leading-snug">📸 Screenshot this now. If anything goes wrong in the code, this is your proof of the bet you placed.</p>
                <p className="text-[11px] text-[#6fae87] mt-1.5">Your {stakeNum} points are deducted immediately and this can&apos;t be undone. Bet settles at full-time.</p>
                <div className="flex gap-2 mt-3">
                  <button disabled={placing} onClick={() => setConfirming(false)} className="flex-1 border border-[#1d3a28] text-[#9ec9ad] rounded-lg py-2 text-sm">Back</button>
                  <button disabled={placing} onClick={place} className="flex-1 bg-[#0a7a3d] hover:bg-[#0d9449] disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold">{placing ? "Placing…" : "Confirm bet"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
