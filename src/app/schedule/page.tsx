"use client";

import { useEffect, useState } from "react";
import { Match } from "@/lib/types";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, string> = {
  upcoming: "bg-blue-900 text-blue-300",
  live: "bg-red-600 text-white animate-pulse",
  final: "bg-gray-700 text-gray-300",
};

const ROUND_ORDER = ["Group Stage", "Round of 32", "Round of 16", "Quarterfinal", "Semifinal", "Final"];

export default function SchedulePage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("All");

  useEffect(() => {
    fetch("/api/sync-matches")
      .then((r) => r.json())
      .then((d) => {
        setMatches(d.matches ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const rounds = ["All", ...ROUND_ORDER.filter((r) => matches.some((m) => m.round === r))];
  const filtered = filter === "All" ? matches : matches.filter((m) => m.round === filter);

  // Group by date
  const byDate: Record<string, Match[]> = {};
  for (const m of filtered) {
    const day = m.kickoffTimeUTC.slice(0, 10);
    if (!byDate[day]) byDate[day] = [];
    byDate[day].push(m);
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
                filter === r
                  ? "bg-green-500 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : matches.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-3">📅</p>
          <p>No matches loaded yet. An admin needs to sync the schedule.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {Object.entries(byDate).map(([date, dayMatches]) => (
            <div key={date}>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                {format(new Date(date + "T12:00:00"), "EEEE, MMMM d")}
              </h2>
              <div className="space-y-3">
                {dayMatches.map((match) => (
                  <MatchCard key={match.matchId} match={match} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: Match }) {
  const kickoff = new Date(match.kickoffTimeUTC);
  const timeStr = format(kickoff, "h:mm a");

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1 text-right">
          <p className="font-semibold">{match.homeTeam}</p>
        </div>

        <div className="flex flex-col items-center min-w-[90px]">
          {match.status === "final" ? (
            <span className="text-2xl font-bold">
              {match.homeScore} – {match.awayScore}
            </span>
          ) : match.status === "live" ? (
            <span className="text-lg font-bold text-red-400">LIVE</span>
          ) : (
            <span className="text-gray-400 text-sm">{timeStr}</span>
          )}
          <span className={`text-xs px-2 py-0.5 rounded-full mt-1 ${STATUS_BADGE[match.status]}`}>
            {match.status === "final" ? "FT" : match.status === "live" ? "Live" : match.round}
          </span>
        </div>

        <div className="flex-1 text-left">
          <p className="font-semibold">{match.awayTeam}</p>
        </div>
      </div>
      <p className="text-center text-xs text-gray-600 mt-2">{match.venue}</p>
    </div>
  );
}
