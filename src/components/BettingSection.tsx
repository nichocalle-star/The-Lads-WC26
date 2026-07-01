"use client";

import { useEffect, useState } from "react";
import { auth } from "@/lib/firebase";

type Odds = { homeML: number | null; drawML: number | null; awayML: number | null; overUnder: number | null };
type Mtch = { matchId: string; homeTeam: string; awayTeam: string; kickoffTimeUTC: string; round: string; odds?: Odds; bettingDisabled?: boolean };
const EXACT_SCORE_ODDS = 2.0; // correct score pays a flat 2x
const MAX_STAKE = 10;
const MAX_BETS_PER_MATCH = 2;
type Bet = { id: string; matchId: string; matchLabel: string; selectionLabel: string; market: string; odds: number; stake: number; expectedPayout: number; potentialProfit: number; status: string; payout: number; placedAt: string; resultScore: string | null };
type Ctx = { predictionPoints: number; wagerBalance: number; available: number; bets: Bet[] };
type Slip = { match: Mtch; market: "matchWinner" | "correctScore"; selection: string; label: string; odds: number };
type BookBet = { username: string; selectionLabel: string; market: string; odds: number; stake: number; expectedPayout: number; status: string };

const TZ = "America/New_York";
const fmtKick = (iso: string) => new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
const r1 = (n: number) => Math.round(n * 10) / 10;
// American moneyline (DraftKings, via ESPN) → decimal payout multiplier.
const amToDec = (a: number | null | undefined): number | null =>
  a == null || a === 0 ? null : Math.round((a < 0 ? 1 + 100 / -a : 1 + a / 100) * 100) / 100;

// Who's betting on a given match — fetched lazily when expanded.
function MatchBook({ matchId, reloadKey }: { matchId: string; reloadKey: number }) {
  const [book, setBook] = useState<{ bets: BookBet[]; totalStaked: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/match-bets?matchId=${matchId}`).then((r) => r.json())
      .then((j) => { if (!cancelled) setBook({ bets: j.bets ?? [], totalStaked: j.totalStaked ?? 0 }); })
      .catch(() => { if (!cancelled) setBook({ bets: [], totalStaked: 0 }); });
    return () => { cancelled = true; };
  }, [matchId, reloadKey]);

  if (!book) return <p className="text-[11px] text-[#6fae87] py-2">Loading bets…</p>;
  if (book.bets.length === 0) return <p className="text-[11px] text-[#6fae87] py-2">No bets on this game yet — be the first.</p>;
  return (
    <div className="space-y-1 py-1">
      {book.bets.map((b, i) => (
        <div key={i} className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-[#f0f7f2] truncate">{b.username}</span>
          <span className="text-[#9ec9ad] truncate flex-1 text-center">{b.selectionLabel} <span className="text-[#6fae87]">@{b.odds}</span></span>
          <span className="text-[#cfe6d8] tabular-nums shrink-0">{b.stake} → <span className="text-[#2bd97a]">{b.expectedPayout}</span></span>
        </div>
      ))}
      <p className="text-[10px] text-[#6fae87] pt-1 border-t border-[#16301f]">{book.bets.length} bet{book.bets.length > 1 ? "s" : ""} · {book.totalStaked} pts staked</p>
    </div>
  );
}

function Stepper({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[9px] text-[#6fae87] mb-0.5 max-w-[70px] truncate">{label}</span>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(Math.max(0, value - 1))} className="w-6 h-6 rounded bg-[#10301c] border border-[#1d3a28] text-[#cfe6d8] text-sm leading-none">−</button>
        <span className="w-6 text-center text-white font-semibold tabular-nums">{value}</span>
        <button onClick={() => onChange(Math.min(9, value + 1))} className="w-6 h-6 rounded bg-[#10301c] border border-[#1d3a28] text-[#cfe6d8] text-sm leading-none">+</button>
      </div>
    </div>
  );
}

export default function BettingSection({ uid }: { uid: string }) {
  const [matches, setMatches] = useState<Mtch[]>([]);
  const [ctx, setCtx] = useState<Ctx | null>(null);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [stake, setStake] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [csScores, setCsScores] = useState<Record<string, { h: number; a: number }>>({});
  const [openBook, setOpenBook] = useState<string | null>(null);
  const [bookKey, setBookKey] = useState(0); // bump to refetch books after a bet

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sync-matches").then((r) => r.json()).then((j) => {
      if (cancelled) return;
      const now = Date.now();
      const upcoming = ((j.matches ?? []) as Mtch[])
        .filter((m) => m.odds && m.odds.homeML != null && !m.bettingDisabled && new Date(m.kickoffTimeUTC).getTime() > now)
        .sort((a, b) => new Date(a.kickoffTimeUTC).getTime() - new Date(b.kickoffTimeUTC).getTime());
      setMatches(upcoming);
      setOpenBook(upcoming[0]?.matchId ?? null); // show the next game's book by default
    }).catch(() => {});
    fetch(`/api/betting?uid=${uid}`).then((r) => r.json()).then((c) => { if (!cancelled) setCtx(c); }).catch(() => {});
    return () => { cancelled = true; };
  }, [uid]);

  function reloadCtx() { fetch(`/api/betting?uid=${uid}`).then((r) => r.json()).then(setCtx).catch(() => {}); }

  const available = ctx?.available ?? 0;
  const cap = Math.min(MAX_STAKE, available); // max stake for this bet
  const stakeNum = Math.max(0, r1(parseFloat(stake) || 0));
  const payout = slip ? r1(stakeNum * slip.odds) : 0;
  const profit = r1(payout - stakeNum);
  const canReview = !!slip && stakeNum > 0 && stakeNum <= cap;
  const betsOn = (matchId: string) => (ctx?.bets.filter((b) => b.matchId === matchId).length ?? 0);

  function open(match: Mtch, market: "matchWinner" | "correctScore", selection: string, label: string, odds: number) {
    setSlip({ match, market, selection, label, odds });
    setStake(""); setConfirming(false); setResult(null);
  }
  const cs = (id: string) => csScores[id] ?? { h: 0, a: 0 };
  function setCs(id: string, h: number, a: number) { setCsScores((s) => ({ ...s, [id]: { h, a } })); }

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
        setSlip(null); setConfirming(false); setStake(""); reloadCtx(); setBookKey((k) => k + 1);
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
        <p><span className="text-[#f0f7f2] font-medium">Match Winner</span> — back home, draw, or away at live <span className="text-[#f0f7f2]">DraftKings</span> odds. Settles on the <span className="text-[#f0f7f2]">final score including extra time</span>; a game decided on penalties counts as a <span className="text-[#f0f7f2]">Draw</span>.</p>
        <p><span className="text-[#f0f7f2] font-medium">Correct Score</span> — pick the exact final scoreline (home team first, extra time included). Nail it and you win a flat <span className="text-[#f0f7f2]">2× your stake</span>, whatever the score.</p>
        <p>Limits: <span className="text-[#f0f7f2]">max {MAX_STAKE} points per bet</span> and <span className="text-[#f0f7f2]">up to {MAX_BETS_PER_MATCH} bets per game</span> (e.g. the winner and a scoreline) — each is separate and settles on its own.</p>
        <p>Win and your stake returns with profit; lose and it&apos;s gone — it moves your <span className="text-[#f0f7f2]">leaderboard score</span>. You can&apos;t stake more than your balance. Bets lock at kickoff and settle automatically at full-time.</p>
      </div>

      {result && (
        <div className={`mx-5 my-2 rounded-lg px-3 py-2 text-[13px] ${result.ok ? "bg-green-900/30 border border-green-800/50 text-green-300" : "bg-red-900/30 border border-red-800/50 text-red-300"}`}>{result.msg}</div>
      )}

      {/* Markets */}
      <div className="px-5 py-2 space-y-3">
        {matches.length === 0 && <p className="text-[13px] text-[#6fae87] py-3 text-center">No upcoming matches with odds right now.</p>}
        {matches.map((m) => {
          const dh = amToDec(m.odds?.homeML), dd = amToDec(m.odds?.drawML), da = amToDec(m.odds?.awayML);
          const { h, a } = cs(m.matchId);
          const placed = betsOn(m.matchId);
          const full = placed >= MAX_BETS_PER_MATCH;
          return (
            <div key={m.matchId} className="bg-[#0e2517] border border-[#16301f] rounded-xl p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-[#f0f7f2]">{m.homeTeam} <span className="text-[#6fae87]">v</span> {m.awayTeam}</p>
                <div className="text-right">
                  <p className="text-[10px] text-[#6fae87]">{fmtKick(m.kickoffTimeUTC)}</p>
                  <p className={`text-[10px] ${full ? "text-[#e0b063]" : "text-[#3d6b4f]"}`}>{placed}/{MAX_BETS_PER_MATCH} bets</p>
                </div>
              </div>

              {full && <p className="text-[11px] text-[#e0b063] bg-[#2a230c] rounded px-2 py-1 mb-2">You&apos;ve used both bets on this game.</p>}

              {/* Match Winner */}
              <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1">Match Winner <span className="text-[#3d6b4f]">· DraftKings · incl. extra time, pens = draw</span></p>
              <div className="flex gap-1.5 mb-3">
                {([["home", m.homeTeam, dh], ["draw", "Draw", dd], ["away", m.awayTeam, da]] as const).map(([sel, lbl, odd]) => (
                  <button key={sel} disabled={!odd || full}
                    onClick={() => open(m, "matchWinner", sel, sel === "draw" ? "Draw" : `${lbl} to win`, odd as number)}
                    className="flex-1 bg-[#10301c] enabled:hover:bg-[#164027] border border-[#1d3a28] disabled:opacity-40 rounded-lg py-1.5 text-center transition-colors">
                    <span className="block text-[11px] text-[#cfe6d8] truncate px-1">{sel === "draw" ? "Draw" : lbl}</span>
                    <span className="block text-sm font-semibold text-[#2bd97a] tabular-nums">{odd ?? "—"}</span>
                  </button>
                ))}
              </div>

              {/* Correct Score — stepper entry like the bracket, flat 2x */}
              <p className="text-[10px] text-[#6fae87] uppercase tracking-wider mb-1.5">Correct Score <span className="text-[#3d6b4f]">· pays 2× if you nail it</span></p>
              <div className="flex items-center justify-center gap-3 bg-[#07140c] border border-[#16301f] rounded-lg py-2">
                <Stepper label={m.homeTeam} value={h} onChange={(v) => setCs(m.matchId, v, a)} />
                <span className="text-[#6fae87] text-lg font-bold mt-3">–</span>
                <Stepper label={m.awayTeam} value={a} onChange={(v) => setCs(m.matchId, h, v)} />
                <div className="ml-2 mt-3 text-center min-w-[92px]">
                  <button disabled={full} onClick={() => open(m, "correctScore", `${h}:${a}`, `Exact score ${h}–${a}`, EXACT_SCORE_ODDS)}
                    className="bg-[#0a7a3d] enabled:hover:bg-[#0d9449] disabled:opacity-40 text-white rounded-lg px-3 py-1.5 text-[12px] font-medium">
                    Bet {h}–{a} @ 2×
                  </button>
                </div>
              </div>

              {/* Who's betting on this game */}
              <button onClick={() => setOpenBook(openBook === m.matchId ? null : m.matchId)}
                className="w-full mt-2 text-[11px] text-[#2bd97a] hover:bg-[#10301c] py-1.5 rounded transition-colors">
                {openBook === m.matchId ? "Hide who's betting ▲" : "Who's betting on this game? ▼"}
              </button>
              {openBook === m.matchId && <MatchBook matchId={m.matchId} reloadKey={bookKey} />}
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
                  <p className={`text-[10px] font-semibold ${b.status === "won" ? "text-[#2bd97a]" : b.status === "lost" ? "text-red-400" : b.status === "void" ? "text-[#6fae87]" : "text-[#e0b063]"}`}>
                    {b.status === "pending" ? "PENDING" : b.status === "won" ? `WON +${r1(b.payout - b.stake)}` : b.status === "void" ? "VOID · refunded" : `LOST −${b.stake}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bet slip → confirmation */}
      {slip && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-3" onClick={() => !placing && setSlip(null)}>
          <div className="bg-[#0b1d12] border border-[#2a5c3d] rounded-2xl w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            {!confirming ? (
              <>
                <p className="text-[11px] text-[#6fae87] uppercase tracking-wider">Bet slip</p>
                <p className="text-base font-semibold text-[#f0f7f2] mt-1">{slip.label}</p>
                <p className="text-[12px] text-[#9ec9ad]">{slip.match.homeTeam} v {slip.match.awayTeam} · odds <span className="text-[#2bd97a] font-medium">{slip.odds}</span></p>

                <label className="block text-[11px] text-[#6fae87] mt-3 mb-1">Stake (max {cap} — {MAX_STAKE} cap, {available} available)</label>
                <input type="number" inputMode="decimal" min={0} max={cap} value={stake} onChange={(e) => setStake(e.target.value)}
                  placeholder="0" autoFocus
                  className="w-full bg-[#07140c] border border-[#1d3a28] rounded-lg px-3 py-2 text-white text-lg tabular-nums focus:outline-none focus:border-[#2bd97a]" />
                <div className="flex gap-1.5 mt-1.5">
                  {[1, 5, 10].map((v) => <button key={v} disabled={v > cap} onClick={() => setStake(String(v))} className="flex-1 text-[11px] bg-[#10301c] border border-[#1d3a28] disabled:opacity-40 rounded py-1 text-[#cfe6d8]">{v}</button>)}
                  <button onClick={() => setStake(String(cap))} className="flex-1 text-[11px] bg-[#10301c] border border-[#1d3a28] rounded py-1 text-[#cfe6d8]">Max</button>
                </div>

                <div className="mt-3 bg-[#0e2517] border border-[#16301f] rounded-lg p-3 text-[13px] space-y-1">
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Returns if it wins</span><span className="text-[#2bd97a] font-semibold tabular-nums">{payout}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Profit</span><span className="text-[#cfe6d8] tabular-nums">+{profit}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Balance if it loses</span><span className="text-[#cfe6d8] tabular-nums">{r1(available - stakeNum)}</span></div>
                </div>
                {stakeNum > cap && <p className="text-[12px] text-red-400 mt-1.5">{stakeNum > available ? "Stake exceeds your balance." : `Max ${MAX_STAKE} points per bet.`}</p>}

                <div className="flex gap-2 mt-3">
                  <button onClick={() => setSlip(null)} className="flex-1 border border-[#1d3a28] text-[#9ec9ad] rounded-lg py-2 text-sm">Cancel</button>
                  <button disabled={!canReview} onClick={() => setConfirming(true)} className="flex-1 bg-[#0a7a3d] enabled:hover:bg-[#0d9449] disabled:opacity-50 text-white rounded-lg py-2 text-sm font-medium">Review bet</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[11px] text-[#6fae87] uppercase tracking-wider">Confirm &amp; submit</p>
                <div className="mt-2 bg-[#0e2517] border border-[#16301f] rounded-lg p-3 text-[13px] space-y-1.5">
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Bet</span><span className="text-[#f0f7f2] font-medium text-right">{slip.label}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Match</span><span className="text-[#cfe6d8] text-right">{slip.match.homeTeam} v {slip.match.awayTeam}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Odds</span><span className="text-[#cfe6d8] tabular-nums">{slip.odds}</span></div>
                  <div className="flex justify-between"><span className="text-[#9ec9ad]">Stake</span><span className="text-[#cfe6d8] tabular-nums">{stakeNum} pts</span></div>
                  <div className="flex justify-between border-t border-[#16301f] pt-1.5"><span className="text-[#9ec9ad]">Returns if it wins</span><span className="text-[#2bd97a] font-semibold tabular-nums">{payout} pts (+{profit})</span></div>
                </div>
                <p className="text-[12px] text-[#e0b063] mt-2 leading-snug">📸 Screenshot this now. If anything goes wrong in the code, this is your proof of the bet you placed.</p>
                <p className="text-[11px] text-[#6fae87] mt-1.5">Your {stakeNum} points are deducted immediately and this can&apos;t be undone. Settles at full-time.</p>
                <div className="flex gap-2 mt-3">
                  <button disabled={placing} onClick={() => setConfirming(false)} className="flex-1 border border-[#1d3a28] text-[#9ec9ad] rounded-lg py-2 text-sm">Back</button>
                  <button disabled={placing} onClick={place} className="flex-1 bg-[#0a7a3d] hover:bg-[#0d9449] disabled:opacity-60 text-white rounded-lg py-2 text-sm font-semibold">{placing ? "Submitting…" : "Submit bet"}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
