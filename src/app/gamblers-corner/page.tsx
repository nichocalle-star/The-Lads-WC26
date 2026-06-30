"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { flagOf } from "@/lib/teams";
import { Prediction } from "@/lib/prediction";

const TZ = "America/New_York";
const pct = (x: number) => `${Math.round(x * 100)}%`;

function ConfidenceBar({ label, value }: { label: string; value: number }) {
  const color = value >= 65 ? "#2bd97a" : value >= 50 ? "#ffd166" : "#e08a5a";
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-[#9ec9ad]">{label}</span>
        <span className="text-white font-medium tabular-nums">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#10301c] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${value}%`, background: color }} />
      </div>
    </div>
  );
}

function PredictionCard({ p }: { p: Prediction }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-[#0b1d12] border border-[#1d3a28] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#16301f]">
        <span className="font-semibold text-[15px]">
          {flagOf(p.home)} {p.home} <span className="text-[#6fae87] font-normal">vs</span> {p.away} {flagOf(p.away)}
        </span>
        <span className="text-[10px] text-[#6fae87] uppercase tracking-wider">{p.round}</span>
      </div>

      {/* Headline predictions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-[#16301f]">
        <div className="bg-[#0b1d12] px-4 py-3">
          <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1">Moneyline</p>
          <p className="text-sm font-semibold text-white">{p.moneyline.pick}</p>
          <p className="text-[11px] text-[#2bd97a] mt-0.5">{p.moneyline.confidence}% confidence</p>
        </div>
        <div className="bg-[#0b1d12] px-4 py-3">
          <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1">Spread</p>
          <p className="text-sm font-semibold text-white">{p.spread.pickTeam} {p.spread.line > 0 ? "+" : ""}{p.spread.line}</p>
          <p className="text-[11px] text-[#2bd97a] mt-0.5">{p.spread.confidence}% confidence</p>
        </div>
        <div className="bg-[#0b1d12] px-4 py-3">
          <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1">Projected score</p>
          <p className="text-sm font-semibold text-white tabular-nums">{p.goals.lambdaHome.toFixed(1)} – {p.goals.lambdaAway.toFixed(1)}</p>
          <p className="text-[11px] text-[#6fae87] mt-0.5">{p.goals.total.toFixed(1)} total · O2.5 {pct(p.goals.over25)}</p>
        </div>
        <div className="bg-[#0b1d12] px-4 py-3">
          <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1">Corners</p>
          <p className="text-sm font-semibold text-white tabular-nums">{p.corners.total.toFixed(1)} total</p>
          <p className="text-[11px] text-[#6fae87] mt-0.5">{p.home.slice(0, 3)} {p.corners.home.toFixed(1)} · {p.away.slice(0, 3)} {p.corners.away.toFixed(1)}</p>
        </div>
      </div>

      {/* Moneyline split + confidence */}
      <div className="px-5 py-3.5 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-[#16301f]">
        <div className="space-y-1.5">
          <p className="text-[10px] text-[#6fae87] uppercase tracking-wider">Win probability</p>
          <div className="flex h-6 rounded-md overflow-hidden text-[10px] font-medium">
            <div className="bg-[#0a7a3d] flex items-center justify-center text-white" style={{ width: `${Math.max(8, p.moneyline.home * 100)}%` }} title={`${p.home} ${pct(p.moneyline.home)}`}>{pct(p.moneyline.home)}</div>
            <div className="bg-[#1d3a28] flex items-center justify-center text-[#9ec9ad]" style={{ width: `${Math.max(8, p.moneyline.draw * 100)}%` }} title={`Draw ${pct(p.moneyline.draw)}`}>{pct(p.moneyline.draw)}</div>
            <div className="bg-[#5c2a2a] flex items-center justify-center text-white" style={{ width: `${Math.max(8, p.moneyline.away * 100)}%` }} title={`${p.away} ${pct(p.moneyline.away)}`}>{pct(p.moneyline.away)}</div>
          </div>
          <div className="flex justify-between text-[10px] text-[#6fae87]">
            <span>{p.home}</span><span>Draw</span><span>{p.away}</span>
          </div>
        </div>
        <div className="space-y-2">
          <ConfidenceBar label="Moneyline" value={p.moneyline.confidence} />
          <ConfidenceBar label="Spread" value={p.spread.confidence} />
          <ConfidenceBar label="Goals" value={p.goals.confidence} />
          <ConfidenceBar label="Corners" value={p.corners.confidence} />
        </div>
      </div>

      <button onClick={() => setOpen((o) => !o)}
        className="w-full text-[12px] text-[#2bd97a] hover:bg-[#10301c] py-2 border-t border-[#16301f] transition-colors">
        {open ? "Hide" : "Why this prediction?"} {open ? "▲" : "▼"}
      </button>

      {open && (
        <div className="px-5 py-4 border-t border-[#16301f] space-y-4">
          <div>
            <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-2">Team averages</p>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[#6fae87] text-[11px]">
                  <td className="py-1">Metric</td>
                  <td className="py-1 text-right">{flagOf(p.home)} {p.home}</td>
                  <td className="py-1 text-right">{flagOf(p.away)} {p.away}</td>
                </tr>
              </thead>
              <tbody>
                {p.averages.map((row) => (
                  <tr key={row.metric} className="border-t border-[#16301f]/60">
                    <td className="py-1.5 text-[#9ec9ad]">{row.metric}</td>
                    <td className="py-1.5 text-right text-white tabular-nums">{row.home}</td>
                    <td className="py-1.5 text-right text-white tabular-nums">{row.away}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-2">Key factors</p>
            <ul className="space-y-1">
              {p.factors.map((f, i) => (
                <li key={i} className="text-[13px] text-[#cfe6d8] flex gap-2">
                  <span className="text-[#2bd97a]">›</span>{f}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1.5">Spread ladder</p>
            <div className="flex flex-wrap gap-2">
              {p.spread.alts.map((a) => (
                <span key={a.label} className="text-[11px] bg-[#10301c] border border-[#1d3a28] rounded-md px-2.5 py-1 text-[#cfe6d8]">
                  {a.label}: <span className="text-white font-medium">{pct(a.prob)}</span>
                </span>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-[#5a8a6c] italic">{p.dataNote}</p>
        </div>
      )}
    </div>
  );
}

// Preview of the upcoming points-wagering side game. NOT WIRED UP — this is an
// explainer card only; no bets can be placed yet.
function PointsExchangePreview() {
  return (
    <div className="relative bg-[#0b1d12] border border-[#2a5c3d] rounded-2xl overflow-hidden">
      <div className="flex h-[3px]">
        <div className="flex-1 bg-[#0a7a3d]" /><div className="flex-1 bg-[#ffd166]" /><div className="flex-1 bg-[#c8102e]" />
      </div>

      <div className="px-5 pt-4 pb-1 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="w-[30px] h-[30px] rounded-full bg-[#10301c] flex items-center justify-center shrink-0 text-lg">🪙</span>
          <div>
            <p className="text-base font-semibold text-[#f0f7f2]">The Points Exchange</p>
            <p className="text-xs text-[#6fae87] mt-0.5">Put the points you&apos;ve earned on the line — at real betting odds.</p>
          </div>
        </div>
        <span className="text-[10px] tracking-wider text-[#3a2c06] bg-[#ffd166] rounded px-2 py-[3px] shrink-0 font-semibold">COMING SOON</span>
      </div>

      <div className="px-5 pt-2">
        <span className="inline-block text-[11px] text-[#e3a3a3] bg-[#1d0b0b] border border-[#5c2a2a] rounded px-2 py-1">
          🔒 Not active yet — a preview of how it&apos;ll work. You can&apos;t place wagers.
        </span>
      </div>

      {/* How it works */}
      <div className="px-5 pt-4 pb-1">
        <p className="text-[11px] tracking-[1.5px] text-[#7fd4a3] mb-2">HOW IT&apos;LL WORK</p>
        <ol className="space-y-2">
          {[
            ["Back a real match", "Pick an upcoming game — say Norway vs Ivory Coast — and a side to back (or the draw)."],
            ["Stake your points", "Wager any of the points you've already earned. You can't bet more than you have, and there's no betting on credit."],
            ["Odds from the live market", "Payouts use the real moneyline (DraftKings) — the same odds shown on the model cards below."],
            ["Win big or lose it", "Win and your stake returns with profit at those odds; lose and the stake is gone. It moves your real total — and your leaderboard rank."],
            ["Auto-settled at full time", "Wagers lock at kickoff and settle automatically once the match goes final."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="w-5 h-5 rounded-full bg-[#10301c] text-[#2bd97a] text-[11px] flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
              <p className="text-[13px] text-[#cfe6d8] leading-snug"><span className="text-[#f0f7f2] font-medium">{t}.</span> {d}</p>
            </li>
          ))}
        </ol>
      </div>

      {/* Worked example */}
      <div className="px-5 pt-4 pb-5">
        <p className="text-[11px] tracking-[1.5px] text-[#6fae87] mb-2">EXAMPLE — STAKE 10 PTS ON NORWAY vs IVORY COAST</p>
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            { team: "Norway", odds: "−165", win: "+6", note: "favorite", hot: false },
            { team: "Draw", odds: "+290", win: "+29", note: "", hot: false },
            { team: "Ivory Coast", odds: "+420", win: "+42", note: "upset", hot: true },
          ].map((o) => (
            <div key={o.team} className="rounded-lg py-2 px-1" style={{ background: o.hot ? "#1a2c12" : "#10301c", border: `0.5px solid ${o.hot ? "#2a5c3d" : "#1d3a28"}` }}>
              <p className="text-[12px] text-[#cfe6d8] truncate">{o.team}</p>
              <p className="text-[12px] text-[#9ec9ad] tabular-nums">{o.odds}</p>
              <p className="text-[15px] font-semibold mt-0.5" style={{ color: o.hot ? "#2bd97a" : "#7fd4a3" }}>{o.win}</p>
              {o.note && <p className="text-[9px] text-[#6fae87] uppercase tracking-wider">{o.note}</p>}
            </div>
          ))}
        </div>
        <p className="text-[11px] text-[#6fae87] mt-2 leading-relaxed">
          Win on Ivory Coast and 10 pts becomes 52; back a side that loses and you&apos;re down 10. High risk, high reward — and yes, a bad night can drop you on the table.
        </p>
        <p className="text-[11px] text-[#3d6b4f] mt-3 border-t border-[#16301f] pt-2">
          Rules are a draft — nothing&apos;s wired up yet. Tell us what to tweak: stake caps, a separate play-money bankroll instead of your live points, or extra markets (over/under, correct score).
        </p>
      </div>
    </div>
  );
}

export default function GamblersCornerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<{ predictions: Prediction[]; profilesBuilt: boolean } | null>(null);
  const [loadingData, setLoadingData] = useState(true);

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  useEffect(() => {
    fetch("/api/gamblers-corner")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ predictions: [], profilesBuilt: false }))
      .finally(() => setLoadingData(false));
  }, []);

  if (loading || !user) return null;

  return (
    <div className="space-y-5 pb-12">
      <div>
        <h1 className="text-2xl font-bold">🎲 Gambler&apos;s Corner</h1>
        <p className="text-gray-400 text-sm mt-1">Opponent-adjusted model predictions for upcoming matches.</p>
      </div>

      {/* Disclaimer */}
      <div className="bg-[#1d0b0b] border border-[#5c2a2a] rounded-xl px-5 py-4">
        <p className="text-[#e3a3a3] text-sm font-medium">⚠️ Gambling is never advised.</p>
        <p className="text-[#a87f7f] text-[13px] mt-1 leading-relaxed">
          The smart move is not to bet at all. But if you&apos;re going to anyway, at least do it
          informed — these are model estimates, not certainties. The house always has the edge,
          odds can be wrong, and you should never wager more than you can afford to lose. For
          entertainment only.
        </p>
      </div>

      <PointsExchangePreview />

      {loadingData ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-[#2bd97a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data || data.predictions.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-3xl mb-2">🎲</p>
          <p>No upcoming matches to predict right now.</p>
          {data && !data.profilesBuilt && (
            <p className="text-sm mt-1 text-gray-600">Tip: run “Build Prediction Profiles” in the admin panel to seed team stats.</p>
          )}
        </div>
      ) : (
        <>
          {!data.profilesBuilt && (
            <p className="text-[12px] text-yellow-600/80 bg-yellow-900/10 border border-yellow-800/40 rounded-lg px-4 py-2">
              Team stat profiles haven&apos;t been built yet — predictions are currently rating-only. An admin can build them from the admin panel.
            </p>
          )}
          <div className="space-y-4">
            {data.predictions.map((p) => <PredictionCard key={p.matchId} p={p} />)}
          </div>
          <p className="text-[11px] text-gray-600 text-center">
            Model blends a pre-tournament rating prior with in-tournament stats (ESPN). Times in {TZ.split("/")[1].replace("_", " ")} time. No xG available — shots/possession used as proxy.
          </p>
        </>
      )}
    </div>
  );
}
