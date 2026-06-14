"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Match, Prediction } from "@/lib/types";
import { flagOf } from "@/lib/teams";
import { MatchCard } from "@/components/MatchCard";

const TZ = "America/New_York";

interface LeaderboardEntry {
  userId: string;
  displayName: string;
  totalPoints: number;
  rootingFor: string | null;
  hatingOn: string | null;
  championPick: string | null;
  rank: number;
}

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function SignInPanel() {
  const { signInWithGoogle, signUpWithPassword, signInWithPassword } = useAuth();
  const [tab, setTab] = useState<"create" | "signin">("create");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = (t: "create" | "signin") => {
    setTab(t); setError(""); setUsername(""); setPassword(""); setConfirm("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (tab === "create" && password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const result = tab === "create"
        ? await signUpWithPassword(username, password)
        : await signInWithPassword(username, password);
      if (result.error) setError(result.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-[#0b1d12] border border-[#1d3a28] rounded-2xl p-7 w-full max-w-sm">
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold tracking-wide">⚽ THE LADS</h1>
        <p className="text-[#2bd97a] text-sm mt-1 uppercase tracking-[0.2em] text-[11px]">FIFA World Cup 2026</p>
      </div>

      <div className="flex bg-[#10301c] rounded-lg p-0.5 mb-5">
        {(["create", "signin"] as const).map((t) => (
          <button key={t} onClick={() => reset(t)}
            className={`flex-1 py-1.5 rounded-md text-sm transition-colors ${tab === t ? "bg-[#1d3a28] text-white font-medium" : "text-[#6fae87] hover:text-[#9ec9ad]"}`}>
            {t === "create" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-[#6fae87] mb-1">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder={tab === "create" ? "e.g. goatinho99" : "your username"}
            maxLength={20} required autoFocus
            className="w-full bg-[#07140c] border border-[#1d3a28] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3d6b4f] focus:outline-none focus:border-[#2bd97a] transition-colors" />
          {tab === "create" && <p className="text-[11px] text-[#3d6b4f] mt-1">3–20 chars · letters, numbers, underscores only</p>}
        </div>
        <div>
          <label className="block text-xs text-[#6fae87] mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" required minLength={6}
            className="w-full bg-[#07140c] border border-[#1d3a28] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3d6b4f] focus:outline-none focus:border-[#2bd97a] transition-colors" />
          {tab === "create" && <p className="text-[11px] text-orange-900 mt-1">Don&apos;t use a password that you commonly reuse</p>}
        </div>
        {tab === "create" && (
          <div>
            <label className="block text-xs text-[#6fae87] mb-1">Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••" required
              className="w-full bg-[#07140c] border border-[#1d3a28] rounded-lg px-3 py-2 text-sm text-white placeholder-[#3d6b4f] focus:outline-none focus:border-[#2bd97a] transition-colors" />
          </div>
        )}

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-[#0a7a3d] hover:bg-[#0d9449] disabled:bg-[#10301c] disabled:text-[#3d6b4f] text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
          {loading ? "Please wait…" : tab === "create" ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-2 my-4">
        <div className="flex-1 h-px bg-[#16301f]" />
        <span className="text-xs text-[#3d6b4f]">or</span>
        <div className="flex-1 h-px bg-[#16301f]" />
      </div>

      <button onClick={signInWithGoogle}
        className="w-full flex items-center justify-center gap-2 border border-[#1d3a28] rounded-lg py-2.5 text-sm text-[#9ec9ad] hover:bg-[#10301c] transition-colors">
        <GoogleIcon />
        Continue with Google
      </button>
    </div>
  );
}

function CompetitorsCard({ entries, highlightUid }: { entries: LeaderboardEntry[] | null; highlightUid?: string }) {
  return (
    <div className="bg-[#0b1d12] border border-[#1d3a28] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#16301f]">
        <p className="font-semibold text-[15px]">🏆 The Competitors</p>
        <p className="text-[#6fae87] text-xs">{entries ? `${entries.length} lads · live standings` : "Loading…"}</p>
      </div>

      {!entries ? (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-[#2bd97a] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-[#6fae87] text-sm px-5 py-6 text-center">No players yet</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-[#16301f]">
              <th className="px-4 py-2 text-left text-[10px] text-[#6fae87] uppercase tracking-wider font-medium w-6">#</th>
              <th className="px-4 py-2 text-left text-[10px] text-[#6fae87] uppercase tracking-wider font-medium">Player</th>
              <th className="px-2 py-2 text-center text-[10px] text-[#6fae87] uppercase tracking-wider font-medium" title="Predicted champion">🏆</th>
              <th className="px-2 py-2 text-center text-[10px] text-[#6fae87] uppercase tracking-wider font-medium" title="Rooting for">❤️</th>
              <th className="px-2 py-2 text-center text-[10px] text-[#6fae87] uppercase tracking-wider font-medium" title="Hating on">💀</th>
              <th className="px-4 py-2 text-right text-[10px] text-[#6fae87] uppercase tracking-wider font-medium">Pts</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => {
              const isLeader = i === 0 && e.totalPoints > 0;
              const isMe = e.userId === highlightUid;
              return (
                <tr key={e.userId}
                  className={`border-b border-[#16301f]/60 last:border-0 ${isLeader ? "bg-[#10301c]" : isMe ? "bg-[#0e2517]" : ""}`}>
                  <td className={`px-4 py-2.5 text-xs ${isLeader ? "text-yellow-400 font-semibold" : "text-[#6fae87]"}`}>{i + 1}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-sm ${isMe ? "text-[#2bd97a] font-semibold" : "text-white font-medium"}`}>{e.displayName}</span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {e.championPick ? <span title={e.championPick} className="text-lg leading-none">{flagOf(e.championPick)}</span> : <span className="text-[#3d6b4f] text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {e.rootingFor ? <span title={e.rootingFor} className="text-lg leading-none">{flagOf(e.rootingFor)}</span> : <span className="text-[#3d6b4f] text-xs">—</span>}
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    {e.hatingOn ? <span title={e.hatingOn} className="text-lg leading-none">{flagOf(e.hatingOn)}</span> : <span className="text-[#3d6b4f] text-xs">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className={`text-sm font-semibold tabular-nums ${e.totalPoints > 0 ? "text-[#2bd97a]" : "text-[#3d6b4f]"}`}>{e.totalPoints}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div className="px-4 py-2 border-t border-[#16301f] text-[10px] text-[#3d6b4f]">
        🏆 predicted champion · ❤️ rooting for · 💀 hating on
      </div>
    </div>
  );
}

function NavRow({ href, icon, accent, title, sub }: { href: string; icon: string; accent: string; title: string; sub: string }) {
  return (
    <Link href={href}
      className="flex items-center gap-3 bg-[#0b1d12] border border-[#1d3a28] rounded-xl px-4 py-3.5 hover:border-[#2bd97a]/50 transition-colors group"
      style={{ borderLeftWidth: 3, borderLeftColor: accent, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}>
      <span className="text-xl">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-white group-hover:text-[#2bd97a] transition-colors">{title}</span>
        <span className="block text-[11px] text-[#6fae87] mt-0.5">{sub}</span>
      </span>
      <span className="text-[#3d6b4f] text-sm">›</span>
    </Link>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [myPreds, setMyPreds] = useState<Record<string, Prediction>>({});

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((r) => r.json())
      .then((d) => setEntries(d.leaderboard ?? []))
      .catch(() => setEntries([]));
    fetch("/api/sync-matches")
      .then((r) => r.json())
      .then((d) => setMatches(d.matches ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    getDocs(query(collection(db, "predictions"), where("userId", "==", user.uid)))
      .then((snap) => {
        const map: Record<string, Prediction> = {};
        snap.forEach((d) => { const p = d.data() as Prediction; map[p.matchId] = p; });
        setMyPreds(map);
      })
      .catch(() => {});
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-[#2bd97a] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col lg:flex-row items-start justify-center gap-6 py-8 min-h-[70vh]">
        <SignInPanel />
        <div className="w-full max-w-sm lg:max-w-md">
          <CompetitorsCard entries={entries} />
        </div>
      </div>
    );
  }

  const now = new Date();
  const upcoming = matches
    .filter((m) => m.status === "upcoming" && new Date(m.lockTimeUTC ?? m.kickoffTimeUTC) > now)
    .sort((a, b) => new Date(a.lockTimeUTC ?? a.kickoffTimeUTC).getTime() - new Date(b.lockTimeUTC ?? b.kickoffTimeUTC).getTime());
  const nextLock = upcoming[0] ?? null;

  // The next game to be played (live or soonest upcoming) — shown with its
  // picks reveal, which only unlocks once the match has locked.
  const nextGame = matches
    .filter((m) => m.status !== "final")
    .sort((a, b) => new Date(a.kickoffTimeUTC).getTime() - new Date(b.kickoffTimeUTC).getTime())[0] ?? null;

  const todayKey = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const todayCount = matches.filter((m) => new Date(m.kickoffTimeUTC).toLocaleDateString("en-CA", { timeZone: TZ }) === todayKey).length;

  const finals = matches
    .filter((m) => m.status === "final")
    .sort((a, b) => new Date(b.kickoffTimeUTC).getTime() - new Date(a.kickoffTimeUTC).getTime());
  const latest = finals[0] ?? null;
  const latestPred = latest ? myPreds[latest.matchId] : undefined;

  const predCount = Object.keys(myPreds).length;
  const upcomingCount = matches.filter((m) => new Date(m.kickoffTimeUTC) > now).length;

  let latestPts: number | null = null;
  if (latest && latestPred && latest.round === "Group Stage") {
    const exact = latestPred.predictedHomeScore === latest.homeScore && latestPred.predictedAwayScore === latest.awayScore;
    latestPts = exact ? 2 : latestPred.predictedWinner === latest.winner ? 1 : 0;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[11px] text-[#6fae87] uppercase tracking-[0.2em]">Group stage · {todayCount > 0 ? `${todayCount} games today` : "matchday"}</p>
          <h1 className="text-2xl font-bold mt-1">
            Welcome back, {user.username ?? user.displayName.split(" ")[0]}{" "}
            {user.rootingFor && <span title={`Rooting for ${user.rootingFor}`}>{flagOf(user.rootingFor)}</span>}
          </h1>
        </div>
        {nextLock && (
          <div className="text-right">
            <p className="text-[11px] text-[#6fae87] uppercase tracking-wider">Next lock</p>
            <p className="text-sm text-yellow-400 font-medium mt-0.5">
              🔒 {nextLock.homeTeam} vs {nextLock.awayTeam} ·{" "}
              {new Date(nextLock.lockTimeUTC ?? nextLock.kickoffTimeUTC).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ })} ET
            </p>
          </div>
        )}
      </div>

      {nextGame && (
        <div>
          <p className="text-[11px] text-[#6fae87] uppercase tracking-[0.2em] mb-2">
            {nextGame.status === "live" ? "Live now" : "Next up"}
          </p>
          <MatchCard match={nextGame} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-4 items-start">
        <CompetitorsCard entries={entries} highlightUid={user.uid} />

        <div className="space-y-3">
          <NavRow href="/predictions" icon="🎯" accent="#2bd97a" title="My predictions"
            sub={`${predCount} of ${upcomingCount} upcoming matches picked`} />
          <NavRow href="/schedule" icon="📅" accent="#4ea8de" title="Match schedule"
            sub={todayCount > 0 ? `${todayCount} games today · bracket view` : "Fixtures, results & bracket"} />
          <NavRow href="/rules" icon="📋" accent="#ffd166" title="Rules & scoring"
            sub="Group +1/+2 · knockout points stack" />

          {latest && (
            <div className="bg-[#10301c] border border-[#2a5c3d] rounded-xl px-4 py-3.5">
              <p className="text-[10px] text-[#7fd4a3] uppercase tracking-[0.15em]">Latest result · {latest.venue}</p>
              <p className="text-sm text-white font-semibold mt-1.5">
                {flagOf(latest.homeTeam)} {latest.homeTeam} {latest.homeScore}–{latest.awayScore} {latest.awayTeam} {flagOf(latest.awayTeam)}
              </p>
              {latestPred ? (
                <p className={`text-[11px] mt-1 ${latestPts ? "text-[#2bd97a]" : "text-[#6fae87]"}`}>
                  FT · your pick {latestPred.predictedHomeScore}–{latestPred.predictedAwayScore}
                  {latestPts === 2 && " ✓ exact score +2"}
                  {latestPts === 1 && " ✓ winner +1"}
                  {latestPts === 0 && " ✗ no points"}
                </p>
              ) : (
                <p className="text-[11px] text-[#6fae87] mt-1">FT · you didn&apos;t predict this one</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
