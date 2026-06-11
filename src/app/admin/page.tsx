"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const FLAG: Record<string, string> = {
  Argentina: "🇦🇷", Australia: "🇦🇺", Belgium: "🇧🇪", Bolivia: "🇧🇴",
  Brazil: "🇧🇷", Cameroon: "🇨🇲", Canada: "🇨🇦", Chile: "🇨🇱",
  China: "🇨🇳", Colombia: "🇨🇴", "Costa Rica": "🇨🇷", Croatia: "🇭🇷",
  "Czech Republic": "🇨🇿", Denmark: "🇩🇰", Ecuador: "🇪🇨", Egypt: "🇪🇬",
  England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", France: "🇫🇷", Germany: "🇩🇪", Ghana: "🇬🇭",
  Honduras: "🇭🇳", Hungary: "🇭🇺", Indonesia: "🇮🇩", Iran: "🇮🇷",
  Iraq: "🇮🇶", "Ivory Coast": "🇨🇮", Jamaica: "🇯🇲", Japan: "🇯🇵",
  Jordan: "🇯🇴", Mexico: "🇲🇽", Morocco: "🇲🇦", Netherlands: "🇳🇱",
  "New Zealand": "🇳🇿", Nigeria: "🇳🇬", Norway: "🇳🇴", Panama: "🇵🇦",
  Paraguay: "🇵🇾", Peru: "🇵🇪", Poland: "🇵🇱", Portugal: "🇵🇹",
  Romania: "🇷🇴", "Saudi Arabia": "🇸🇦", Senegal: "🇸🇳", Serbia: "🇷🇸",
  "South Africa": "🇿🇦", "South Korea": "🇰🇷", Spain: "🇪🇸", Sweden: "🇸🇪",
  Switzerland: "🇨🇭", "Trinidad and Tobago": "🇹🇹", Tunisia: "🇹🇳",
  Turkey: "🇹🇷", Ukraine: "🇺🇦", "United States": "🇺🇸", USA: "🇺🇸",
  Uruguay: "🇺🇾", Uzbekistan: "🇺🇿", Venezuela: "🇻🇪",
};

interface PlayerRow {
  uid: string;
  username: string;
  totalPoints: number;
  championPick: string | null;
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [adminSecret, setAdminSecret] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreResult, setScoreResult] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerRow[] | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.push("/");
  }, [user, loading, router]);

  const authHeader = { Authorization: `Bearer ${adminSecret}` };

  async function unlock() {
    setPlayersLoading(true);
    try {
      const res = await fetch("/api/admin/users", { headers: authHeader });
      if (res.ok) {
        const data = await res.json();
        setPlayers(data.users);
        setAuthenticated(true);
      } else {
        setSyncResult("❌ Wrong secret");
      }
    } catch {
      setSyncResult("❌ Network error");
    } finally {
      setPlayersLoading(false);
    }
  }

  async function syncMatches() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync-matches", { method: "POST", headers: authHeader });
      const data = await res.json();
      setSyncResult(res.ok ? `✅ Synced ${data.synced} matches` : `❌ ${data.error}`);
    } catch {
      setSyncResult("❌ Network error");
    } finally {
      setSyncing(false);
    }
  }

  async function scoreMatches() {
    setScoring(true);
    setScoreResult(null);
    try {
      const res = await fetch("/api/score-matches", { method: "POST", headers: authHeader });
      const data = await res.json();
      if (res.ok) {
        setScoreResult(`✅ Scored ${data.scored} predictions across ${data.users} players`);
        // Refresh player list
        const r2 = await fetch("/api/admin/users", { headers: authHeader });
        if (r2.ok) setPlayers((await r2.json()).users);
      } else {
        setScoreResult(`❌ ${data.error}`);
      }
    } catch {
      setScoreResult("❌ Network error");
    } finally {
      setScoring(false);
    }
  }

  if (loading || !user) return null;

  if (!authenticated) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm space-y-4">
          <h1 className="text-xl font-bold text-center">🔧 Admin</h1>
          <input
            type="password"
            placeholder="Admin secret"
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && adminSecret && unlock()}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600"
          />
          {syncResult && <p className="text-sm text-red-400">{syncResult}</p>}
          <button
            onClick={unlock}
            disabled={!adminSecret || playersLoading}
            className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors"
          >
            {playersLoading ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold">🔧 Admin Panel</h1>

      {/* Players overview */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold">Players</h2>
          <p className="text-gray-500 text-xs mt-0.5">{players?.length ?? 0} signed up</p>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="px-6 py-2 text-left text-[11px] text-gray-500 uppercase tracking-wider font-medium w-8">#</th>
              <th className="px-6 py-2 text-left text-[11px] text-gray-500 uppercase tracking-wider font-medium">Player</th>
              <th className="px-6 py-2 text-right text-[11px] text-gray-500 uppercase tracking-wider font-medium">Points</th>
              <th className="px-6 py-2 text-left text-[11px] text-gray-500 uppercase tracking-wider font-medium pl-4">Predicted Champion</th>
            </tr>
          </thead>
          <tbody>
            {players?.map((p, i) => (
              <tr key={p.uid} className="border-b border-gray-800/60 last:border-0 hover:bg-gray-800/30 transition-colors">
                <td className="px-6 py-3 text-sm text-gray-500">{i + 1}</td>
                <td className="px-6 py-3">
                  <span className="text-sm font-medium text-white">{p.username}</span>
                </td>
                <td className="px-6 py-3 text-right">
                  <span className={`text-sm font-semibold tabular-nums ${p.totalPoints > 0 ? "text-green-400" : "text-gray-500"}`}>
                    {p.totalPoints}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {p.championPick ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span className="text-xl leading-none">{FLAG[p.championPick] ?? "🏳️"}</span>
                      <span className="text-gray-300">{p.championPick}</span>
                    </span>
                  ) : (
                    <span className="text-gray-600 text-sm">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={syncMatches}
            disabled={syncing}
            className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {syncing ? "Syncing…" : "Sync Matches"}
          </button>
          <button
            onClick={scoreMatches}
            disabled={scoring}
            className="bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors"
          >
            {scoring ? "Scoring…" : "Score Matches"}
          </button>
        </div>
        {syncResult && <p className="text-sm">{syncResult}</p>}
        {scoreResult && <p className="text-sm">{scoreResult}</p>}
      </div>

      <div className="bg-gray-900 border border-yellow-700/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2">Make User Admin</h2>
        <p className="text-gray-400 text-sm">
          Set <code className="bg-gray-800 px-1 rounded">isAdmin: true</code> on the user&apos;s document in the <code className="bg-gray-800 px-1 rounded">users</code> Firestore collection.
        </p>
      </div>
    </div>
  );
}
