"use client";

import { useEffect, useState } from "react";
import { Match } from "@/lib/types";
import { FLAG } from "@/lib/teams";
import { MatchCard } from "@/components/MatchCard";

const KO_ROUNDS = ["Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

const TZ = "America/New_York";

function formatMatchDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });
}

function formatKickoff(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
}

function formatShortDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
}

// Group by the ET calendar date, not UTC
function getDateKey(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-CA", { timeZone: TZ });
}

function fmtML(ml: number | null): string {
  if (ml === null || ml === undefined || isNaN(ml)) return "—";
  return ml > 0 ? `+${ml}` : `${ml}`;
}

export default function SchedulePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [showPast, setShowPast] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/sync-matches")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setMatches(d.matches ?? []);
      })
      .catch(() => setError("Failed to load matches"))
      .finally(() => setLoading(false));
  }, []);

  const filters = ["All", "Group Stage", "Bracket"];

  const listMatches = filter === "Group Stage" ? matches.filter((m) => m.round === "Group Stage") : matches;

  // Finished games are "past" — hidden by default behind a toggle.
  const pastMatches = listMatches.filter((m) => m.status === "final");
  const activeMatches = listMatches.filter((m) => m.status !== "final");
  const shownMatches = showPast ? listMatches : activeMatches;

  const byDate: Record<string, Match[]> = {};
  for (const m of shownMatches) {
    const key = getDateKey(m.kickoffTimeUTC);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Match Schedule</h1>
        <div className="flex gap-2 flex-wrap">
          {filters.map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                filter === r ? "bg-[#0a7a3d] text-white font-medium" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {r === "Bracket" ? "🏆 Bracket" : r}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error} — try syncing from the Admin panel.
        </div>
      )}

      {!loading && !error && matches.length === 0 && (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-3">📅</p>
          <p>No matches loaded yet. An admin needs to sync the schedule.</p>
        </div>
      )}

      {!loading && filter === "Bracket" && <BracketView matches={matches} />}

      {!loading && filter !== "Bracket" && (
        <>
          {pastMatches.length > 0 && (
            <button
              onClick={() => setShowPast((v) => !v)}
              className="w-full flex items-center justify-center gap-2 bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-400 hover:text-gray-200 text-sm font-medium py-2.5 rounded-xl transition-colors"
            >
              {showPast ? "Hide" : "Show"} past games ({pastMatches.length})
              <span className="text-xs">{showPast ? "▲" : "▼"}</span>
            </button>
          )}

          {shownMatches.length === 0 && matches.length > 0 && (
            <div className="text-center py-16 text-gray-500">
              <p className="text-3xl mb-2">✅</p>
              <p>No games in progress or upcoming.</p>
              {pastMatches.length > 0 && <p className="text-sm mt-1 text-gray-600">Tap “Show past games” to see finished matches.</p>}
            </div>
          )}

          {Object.entries(byDate).map(([date, dayMatches]) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {formatMatchDate(dayMatches[0].kickoffTimeUTC)}
              </h2>
              <div className="space-y-3">
                {dayMatches.map((match) => (
                  <MatchCard key={match.matchId} match={match} />
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── Tournament bracket view ───────────────────────────────────────────────────

function BracketView({ matches }: { matches: Match[] }) {
  const rounds = KO_ROUNDS.map((round) => ({
    round,
    games: matches
      .filter((m) => m.round === round)
      .sort((a, b) => new Date(a.kickoffTimeUTC).getTime() - new Date(b.kickoffTimeUTC).getTime()),
  })).filter((r) => r.games.length > 0);

  if (rounds.length === 0) {
    return (
      <div className="text-center py-20 text-gray-500">
        <p className="text-4xl mb-3">🏆</p>
        <p>The knockout bracket appears once the Round of 32 is set.</p>
        <p className="text-sm mt-1 text-gray-600">Group stage runs Jun 11–27 — check back after.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto pb-4 -mx-4 px-4">
      <div className="flex gap-4 min-w-max items-start">
        {rounds.map(({ round, games }, i) => (
          <div key={round}
            className={`flex flex-col gap-3 w-64 ${i > 0 ? "border-l border-dashed border-[#2a5c3d] pl-4" : ""}`}
            style={i > 0 ? { justifyContent: "space-around", alignSelf: "stretch" } : undefined}>
            <p className="text-[10px] text-[#6fae87] uppercase tracking-[0.2em] sticky top-0">
              {round} · {formatShortDate(games[0].kickoffTimeUTC)}
            </p>
            {games.map((m) => <BracketCard key={m.matchId} match={m} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function isTbd(name: string): boolean {
  return name === "TBD" || name.includes("Winner") || name.includes("Place") || name.startsWith("Group ");
}

function BracketTeamRow({ name, right, isWinner, dimRight }: { name: string; right: string; isWinner: boolean; dimRight: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5">
      <span className={`text-[13px] truncate ${isWinner ? "text-white font-semibold" : isTbd(name) ? "text-gray-600 italic" : "text-gray-300"}`}>
        {FLAG[name] && <span className="mr-1.5">{FLAG[name]}</span>}{name}
      </span>
      <span className={`tabular-nums ${isWinner ? "text-sm text-white font-bold" : dimRight ? "text-[11px] text-[#6fae87]" : "text-sm text-gray-500"}`}>{right}</span>
    </div>
  );
}

function BracketCard({ match }: { match: Match }) {
  const isFinal = match.status === "final";
  const isLive = match.status === "live";
  const showScore = isFinal || isLive;

  const rightOf = (name: string, score: number | null) => {
    if (showScore) return score !== null ? String(score) : "";
    if (!match.odds) return "";
    return fmtML(name === match.homeTeam ? match.odds.homeML : match.odds.awayML);
  };

  return (
    <div className={`bg-[#0b1d12] border rounded-lg px-3 py-2.5 ${isLive ? "border-red-700/60" : "border-[#1d3a28]"} ${isTbd(match.homeTeam) && isTbd(match.awayTeam) ? "opacity-60" : ""}`}>
      <BracketTeamRow name={match.homeTeam} right={rightOf(match.homeTeam, match.homeScore)}
        isWinner={isFinal && match.winner === match.homeTeam} dimRight={!showScore} />
      <BracketTeamRow name={match.awayTeam} right={rightOf(match.awayTeam, match.awayScore)}
        isWinner={isFinal && match.winner === match.awayTeam} dimRight={!showScore} />
      <p className="text-[10px] text-[#3d6b4f] border-t border-[#16301f] mt-1.5 pt-1.5 flex justify-between">
        <span>{isLive ? "🔴 LIVE" : isFinal ? "FT" : `${formatShortDate(match.kickoffTimeUTC)} · ${formatKickoff(match.kickoffTimeUTC)}`}</span>
        {!showScore && match.odds?.homeML != null && <span title="DraftKings moneyline">DK</span>}
      </p>
    </div>
  );
}
