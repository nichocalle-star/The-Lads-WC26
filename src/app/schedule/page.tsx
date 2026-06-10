"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Match } from "@/lib/types";

const ROUND_ORDER = ["Group Stage", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

const STATUS_STYLE: Record<string, { badge: string; label: string }> = {
  upcoming: { badge: "bg-blue-900 text-blue-300", label: "Upcoming" },
  live:     { badge: "bg-red-600 text-white",     label: "LIVE" },
  final:    { badge: "bg-gray-700 text-gray-300", label: "FT" },
};

const TZ = "America/New_York";

function formatMatchDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ });
}

function formatKickoff(isoString: string): string {
  return new Date(isoString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ }) + " ET";
}

// Group by the ET calendar date, not UTC
function getDateKey(isoString: string): string {
  return new Date(isoString).toLocaleDateString("en-CA", { timeZone: TZ }); // YYYY-MM-DD in ET
}

export default function SchedulePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
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

  const rounds = ["All", ...ROUND_ORDER.filter((r) => matches.some((m) => m.round === r))];
  const filtered = filter === "All" ? matches : matches.filter((m) => m.round === filter);

  const byDate: Record<string, Match[]> = {};
  for (const m of filtered) {
    const key = getDateKey(m.kickoffTimeUTC);
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Match Schedule</h1>
        <div className="flex gap-2 flex-wrap">
          {rounds.map((r) => (
            <button
              key={r}
              onClick={() => setFilter(r)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                filter === r ? "bg-green-500 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {r}
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

      {!loading && Object.entries(byDate).map(([date, dayMatches]) => (
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
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const style = STATUS_STYLE[match.status] ?? STATUS_STYLE.upcoming;

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
    </div>
  );
}
