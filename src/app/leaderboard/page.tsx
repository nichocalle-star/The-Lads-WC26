"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { UserMetrics } from "@/lib/types";

export default function LeaderboardPage() {
  const [leaderboard, setLeaderboard] = useState<(UserMetrics & { rank: number })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => {
        setLeaderboard(d.leaderboard ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const medals = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Leaderboard</h1>

      {loading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-800 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="text-center py-20 text-gray-500">
          <p className="text-4xl mb-3">🏆</p>
          <p>No scores yet. Predictions will be scored as matches complete.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {leaderboard.map((entry) => (
            <div
              key={entry.userId}
              className={`flex items-center gap-4 bg-gray-900 border rounded-xl px-5 py-4 ${
                entry.rank === 1
                  ? "border-yellow-500/50 bg-yellow-900/10"
                  : "border-gray-800"
              }`}
            >
              <span className="text-2xl w-8 text-center">
                {medals[entry.rank - 1] ?? `#${entry.rank}`}
              </span>

              {entry.photoURL ? (
                <Image
                  src={entry.photoURL}
                  alt={entry.displayName}
                  width={40}
                  height={40}
                  className="rounded-full"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-lg">
                  {entry.displayName?.[0] ?? "?"}
                </div>
              )}

              <div className="flex-1">
                <p className="font-semibold">{entry.displayName}</p>
                <p className="text-xs text-gray-500">
                  {entry.correctPredictions ?? 0}/{entry.totalPredictions ?? 0} correct
                  {entry.predictionAccuracy
                    ? ` · ${Math.round(entry.predictionAccuracy * 100)}% accuracy`
                    : ""}
                </p>
              </div>

              <div className="text-right">
                <p className="text-xl font-bold text-green-400">{entry.totalPoints ?? 0}</p>
                <p className="text-xs text-gray-500">pts</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
