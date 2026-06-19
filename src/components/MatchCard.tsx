"use client";

import { useState } from "react";
import Image from "next/image";
import { Match } from "@/lib/types";
import { FLAG } from "@/lib/teams";
import { isMatchLocked } from "@/lib/lock";

const TZ = "America/New_York";

const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  upcoming: { badge: "bg-blue-900 text-blue-300", label: "Upcoming" },
  live:     { badge: "bg-red-600 text-white",     label: "LIVE" },
  final:    { badge: "bg-gray-700 text-gray-300", label: "FT" },
};

function formatKickoff(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
}

function formatML(ml: number | null): string {
  if (ml === null || ml === undefined || isNaN(ml)) return "—";
  return ml > 0 ? `+${ml}` : `${ml}`;
}

// Short label for the odds row — first word for long names so the row fits.
function shortName(name: string): string {
  return name.length > 10 ? name.split(" ")[0] : name;
}

interface MatchPicks {
  homeTeam: string;
  awayTeam: string;
  summary: { home: number; draw: number; away: number };
  picks: { username: string; homeScore: number | null; awayScore: number | null; winner: string }[];
  noPicks: string[];
}

export function MatchCard({ match }: { match: Match }) {
  const style = STATUS_STYLE[match.status] ?? STATUS_STYLE.upcoming;
  const locked = isMatchLocked(match);
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<MatchPicks | null>(null);
  const [loadingPicks, setLoadingPicks] = useState(false);

  async function toggle() {
    if (open) { setOpen(false); return; }
    setOpen(true);
    if (!data) {
      setLoadingPicks(true);
      try {
        const res = await fetch(`/api/match-predictions?matchId=${match.matchId}`);
        const d = await res.json();
        if (d.locked) setData(d);
      } finally {
        setLoadingPicks(false);
      }
    }
  }

  const total = data ? data.picks.length : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      {match.group && (
        <p className="text-xs text-gray-500 mb-2">Group {match.group} · {match.round}</p>
      )}
      <div className="flex items-center gap-3">
        {/* Home team */}
        <div className="flex-1 flex items-center justify-end gap-2">
          <span className="font-semibold text-sm sm:text-base text-right">{match.homeTeam}</span>
          {match.homeTeamLogo && (
            <Image src={match.homeTeamLogo} alt={match.homeTeam} width={28} height={28} className="rounded-full bg-white p-0.5" />
          )}
        </div>

        {/* Score / time */}
        <div className="flex flex-col items-center min-w-[80px]">
          {match.status === "final" || match.status === "live" ? (
            <span className={`text-2xl font-bold ${match.status === "live" ? "text-red-400" : ""}`}>
              {match.homeScore} – {match.awayScore}
            </span>
          ) : (
            <span className="text-gray-300 text-sm font-medium">{formatKickoff(match.kickoffTimeUTC)}</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 ${style.badge} ${match.status === "live" ? "animate-pulse" : ""}`}>
            {style.label}
          </span>
        </div>

        {/* Away team */}
        <div className="flex-1 flex items-center gap-2">
          {match.awayTeamLogo && (
            <Image src={match.awayTeamLogo} alt={match.awayTeam} width={28} height={28} className="rounded-full bg-white p-0.5" />
          )}
          <span className="font-semibold text-sm sm:text-base">{match.awayTeam}</span>
        </div>
      </div>
      <p className="text-center text-xs text-gray-600 mt-2">{match.venue}</p>

      {match.status !== "final" && match.odds?.homeML != null && (
        <div className="flex items-center border-t border-gray-800 pt-2.5 mt-2.5 gap-0">
          {[
            { label: shortName(match.homeTeam), val: formatML(match.odds.homeML) },
            { label: "Draw", val: formatML(match.odds.drawML) },
            { label: shortName(match.awayTeam), val: formatML(match.odds.awayML) },
          ].map((o, i, arr) => (
            <div key={i} className={`flex-1 text-center ${i < arr.length - 1 ? "border-r border-gray-800" : ""}`}>
              <p className="text-[10px] text-gray-600 mb-0.5 truncate px-1">{o.label}</p>
              <p className={`text-xs font-medium ${o.val.startsWith("-") ? "text-green-500" : "text-gray-400"}`}>{o.val}</p>
            </div>
          ))}
          {match.odds.overUnder !== null && (
            <div className="text-center pl-3 border-l border-gray-800 shrink-0">
              <p className="text-[10px] text-gray-600 mb-0.5">O/U</p>
              <p className="text-xs font-medium text-gray-400">{match.odds.overUnder}</p>
            </div>
          )}
          <p className="text-[9px] text-gray-700 pl-2 shrink-0">DK</p>
        </div>
      )}

      {locked && (
        <div className="mt-3 -mx-4 -mb-4">
          <button
            onClick={toggle}
            className="w-full flex items-center justify-center gap-2 bg-[#10301c] hover:bg-[#143b24] border-t border-[#1d3a28] text-[#2bd97a] text-sm font-medium py-2.5 rounded-b-xl transition-colors"
          >
            <i className="ti ti-eye" aria-hidden="true" />
            See the lads&apos; picks{data ? ` (${total})` : ""}
            <span className="text-xs">{open ? "▲" : "▼"}</span>
          </button>

          {open && (
            <div className="bg-[#0b1d12] border-t border-[#16301f] rounded-b-xl overflow-hidden">
              {loadingPicks ? (
                <p className="text-sm text-[#6fae87] px-4 py-4 text-center">Loading picks…</p>
              ) : !data ? (
                <p className="text-sm text-[#6fae87] px-4 py-4 text-center">Picks unlock at kickoff.</p>
              ) : (
                <MatchPicksPanel data={data} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MatchPicksPanel({ data }: { data: MatchPicks }) {
  return (
    <>
      {/* Consensus summary */}
      <div className="flex justify-around px-4 py-3 border-b border-[#16301f] bg-[#0e2517]">
        <div className="text-center">
          <p className="text-xl font-semibold text-white">{data.summary.home}</p>
          <p className="text-[11px] text-[#9ec9ad] mt-0.5">{FLAG[data.homeTeam] ?? ""} {data.homeTeam}</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold text-[#6fae87]">{data.summary.draw}</p>
          <p className="text-[11px] text-[#6fae87] mt-0.5">Draw</p>
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold text-[#2bd97a]">{data.summary.away}</p>
          <p className="text-[11px] text-[#9ec9ad] mt-0.5">{FLAG[data.awayTeam] ?? ""} {data.awayTeam}</p>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] text-[#6fae87] tracking-wider">
            <td className="px-4 pt-2 pb-1">PLAYER</td>
            <td className="text-center">SCORE</td>
            <td className="text-right px-4">WINNER</td>
          </tr>
        </thead>
        <tbody>
          {data.picks.map((p, i) => (
            <tr key={p.username} className={`border-t border-[#16301f] ${i % 2 ? "bg-[#0e2517]" : ""}`}>
              <td className="px-4 py-2 text-[#f0f7f2]">{p.username}</td>
              <td className="text-center text-[#f0f7f2] font-medium tabular-nums">{p.homeScore} – {p.awayScore}</td>
              <td className="text-right px-4 text-[#9ec9ad]">
                {p.winner === "Draw" ? <span className="text-[#6fae87]">Draw</span> : <span>{FLAG[p.winner] ?? ""} {p.winner}</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
