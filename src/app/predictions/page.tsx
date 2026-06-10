"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Match, Prediction } from "@/lib/types";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

export default function PredictionsPage() {
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;

    async function load() {
      const [matchRes, predSnap] = await Promise.all([
        fetch("/api/sync-matches").then((r) => r.json()),
        getDocs(query(collection(db, "predictions"), where("userId", "==", user!.uid))),
      ]);

      setMatches(matchRes.matches ?? []);

      const predMap: Record<string, Prediction> = {};
      predSnap.forEach((d) => {
        const p = d.data() as Prediction;
        predMap[p.matchId] = p;
      });
      setPredictions(predMap);
      setLoadingData(false);
    }

    load();
  }, [user]);

  async function submitPrediction(matchId: string, winner: string, homeScore: number | null, awayScore: number | null) {
    if (!firebaseUser) return;
    setSubmitting(matchId);
    setError(null);

    try {
      const token = await firebaseUser.getIdToken();
      const res = await fetch("/api/submit-prediction", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ matchId, predictedWinner: winner, predictedHomeScore: homeScore, predictedAwayScore: awayScore }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to submit prediction");
      } else {
        setPredictions((prev) => ({
          ...prev,
          [matchId]: {
            userId: user!.uid,
            matchId,
            predictedWinner: winner,
            predictedHomeScore: homeScore,
            predictedAwayScore: awayScore,
            submittedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            pointsAwarded: 0,
            isLocked: false,
          },
        }));
      }
    } catch {
      setError("Network error – please try again");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const upcoming = matches.filter((m) => {
    const kickoff = new Date(m.kickoffTimeUTC);
    return kickoff > new Date();
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Predictions</h1>

      {error && (
        <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {upcoming.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No upcoming matches to predict yet.</p>
      ) : (
        <div className="space-y-4">
          {upcoming.map((match) => (
            <PredictionCard
              key={match.matchId}
              match={match}
              existing={predictions[match.matchId]}
              submitting={submitting === match.matchId}
              onSubmit={(winner, home, away) => submitPrediction(match.matchId, winner, home, away)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PredictionCard({
  match,
  existing,
  submitting,
  onSubmit,
}: {
  match: Match;
  existing?: Prediction;
  submitting: boolean;
  onSubmit: (winner: string, homeScore: number | null, awayScore: number | null) => void;
}) {
  const kickoff = new Date(match.kickoffTimeUTC);
  const isLocked = new Date() >= kickoff;
  const [selected, setSelected] = useState<string>(existing?.predictedWinner ?? "");
  const [homeScore, setHomeScore] = useState<string>(existing?.predictedHomeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState<string>(existing?.predictedAwayScore?.toString() ?? "");

  return (
    <div className={`bg-gray-900 border rounded-xl p-5 ${isLocked ? "border-gray-700 opacity-60" : "border-gray-800"}`}>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-gray-500">
          {match.group ? `Group ${match.group} · ` : ""}{match.round}
        </span>
        <span className="text-xs text-gray-500">{format(kickoff, "MMM d, h:mm a")}</span>
      </div>

      <div className="flex items-center gap-4 my-3">
        <button
          disabled={isLocked}
          onClick={() => !isLocked && setSelected(match.homeTeam)}
          className={`flex-1 text-center py-2 rounded-lg font-semibold transition-colors ${
            selected === match.homeTeam
              ? "bg-green-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          } disabled:cursor-not-allowed`}
        >
          {match.homeTeam}
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <input
            type="number"
            min={0}
            max={20}
            disabled={isLocked}
            value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
            className="w-12 text-center bg-gray-800 border border-gray-700 rounded-lg py-1 text-sm disabled:opacity-50"
            placeholder="–"
          />
          <span className="text-gray-500">:</span>
          <input
            type="number"
            min={0}
            max={20}
            disabled={isLocked}
            value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
            className="w-12 text-center bg-gray-800 border border-gray-700 rounded-lg py-1 text-sm disabled:opacity-50"
            placeholder="–"
          />
        </div>

        <button
          disabled={isLocked}
          onClick={() => !isLocked && setSelected(match.awayTeam)}
          className={`flex-1 text-center py-2 rounded-lg font-semibold transition-colors ${
            selected === match.awayTeam
              ? "bg-green-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          } disabled:cursor-not-allowed`}
        >
          {match.awayTeam}
        </button>
      </div>

      {isLocked ? (
        <p className="text-center text-xs text-red-400 mt-2">🔒 Predictions locked</p>
      ) : (
        <button
          disabled={!selected || submitting}
          onClick={() =>
            onSubmit(
              selected,
              homeScore !== "" ? parseInt(homeScore) : null,
              awayScore !== "" ? parseInt(awayScore) : null
            )
          }
          className="w-full mt-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 rounded-lg transition-colors text-sm"
        >
          {submitting ? "Saving..." : existing ? "Update Prediction" : "Submit Prediction"}
        </button>
      )}

      {existing && !isLocked && (
        <p className="text-center text-xs text-gray-500 mt-2">
          Current pick: <span className="text-green-400">{existing.predictedWinner}</span>
          {existing.predictedHomeScore !== null && ` (${existing.predictedHomeScore}–${existing.predictedAwayScore})`}
        </p>
      )}
    </div>
  );
}
