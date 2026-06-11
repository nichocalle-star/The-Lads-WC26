"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useEffect, useRef, useState } from "react";

const KICKOFF = new Date("2026-06-11T19:00:00Z");
const SHAME_NAMES = ["Daniel Munzer", "Lucas Almeida", "Andres Siboni"];

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

function WallOfShame({ signedUp }: { signedUp: string[] }) {
  const [time, setTime] = useState({ h: "00", m: "00" });
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    function tick() {
      const diff = KICKOFF.getTime() - Date.now();
      if (diff <= 0) { setLocked(true); setTime({ h: "00", m: "00" }); return; }
      setLocked(false);
      setTime({
        h: String(Math.floor(diff / 3600000)).padStart(2, "0"),
        m: String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0"),
      });
    }
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-gray-950 border border-red-900/40 rounded-2xl p-6 w-full max-w-xs">
      <p className="text-center text-red-400 font-semibold text-lg mb-1">🔥 Wall of Shame</p>
      <p className="text-center text-red-900 text-xs mb-4 leading-relaxed">
        These lads haven&apos;t signed up.<br />Time is running out.
      </p>

      {!locked ? (
        <div className="flex gap-2 justify-center mb-5">
          {[{ v: time.h, l: "Hours" }, { v: time.m, l: "Mins" }].map(({ v, l }) => (
            <div key={l} className="bg-red-950/60 border border-red-900/50 rounded-lg px-4 py-2 text-center min-w-[64px]">
              <span className="block text-2xl font-semibold text-red-400 tabular-nums">{v}</span>
              <span className="text-[9px] text-red-900 uppercase tracking-widest">{l}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-center text-xs text-red-700 mb-4 font-semibold">🔒 Bracket locked — they missed it</p>
      )}

      <p className="text-[10px] text-red-900/70 uppercase tracking-widest mb-2">Missing in action</p>
      <div className="space-y-1.5 mb-4">
        {SHAME_NAMES.map((name) => (
          <div key={name} className="flex items-center gap-2 bg-red-950/30 border border-red-900/30 rounded-lg px-3 py-2">
            <span className="text-sm">💀</span>
            <span className="flex-1 text-sm text-red-400 font-medium line-through decoration-red-800">{name}</span>
            <span className="text-[9px] bg-red-950 text-red-500 rounded px-1.5 py-0.5">MIA</span>
          </div>
        ))}
      </div>

      {signedUp.length > 0 && (
        <>
          <div className="border-t border-gray-800 my-3" />
          <p className="text-[10px] text-gray-600 uppercase tracking-widest mb-2">Signed up</p>
          <div className="space-y-1.5">
            {signedUp.map((u) => (
              <div key={u} className="flex items-center gap-2 bg-green-950/30 border border-green-900/30 rounded-lg px-3 py-2">
                <span className="text-sm">✅</span>
                <span className="flex-1 text-sm text-green-400 font-medium">{u}</span>
                <span className="text-[9px] bg-green-950 text-green-500 rounded px-1.5 py-0.5">IN</span>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="text-[10px] text-red-950 text-center mt-4 leading-relaxed">
        Sign up before kickoff or be remembered<br />as someone who didn&apos;t show up.
      </p>
    </div>
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
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-7 w-full max-w-sm">
      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold">⚽ The Lads</h1>
        <p className="text-green-400 text-sm mt-1">FIFA World Cup 2026</p>
      </div>

      <div className="flex bg-gray-800 rounded-lg p-0.5 mb-5">
        {(["create", "signin"] as const).map((t) => (
          <button key={t} onClick={() => reset(t)}
            className={`flex-1 py-1.5 rounded-md text-sm transition-colors ${tab === t ? "bg-gray-700 text-white font-medium" : "text-gray-500 hover:text-gray-300"}`}>
            {t === "create" ? "Create account" : "Sign in"}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Username</label>
          <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
            placeholder={tab === "create" ? "e.g. goatinho99" : "your username"}
            maxLength={20} required autoFocus
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-600 transition-colors" />
          {tab === "create" && <p className="text-[11px] text-gray-600 mt-1">3–20 chars · letters, numbers, underscores only</p>}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••" required minLength={6}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-600 transition-colors" />
          {tab === "create" && <p className="text-[11px] text-orange-900 mt-1">Don&apos;t use a password that you commonly reuse</p>}
        </div>
        {tab === "create" && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Confirm password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••" required
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-green-600 transition-colors" />
          </div>
        )}

        {error && <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/50 rounded-lg px-3 py-2">{error}</p>}

        <button type="submit" disabled={loading}
          className="w-full bg-green-700 hover:bg-green-600 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors">
          {loading ? "Please wait…" : tab === "create" ? "Create account" : "Sign in"}
        </button>
      </form>

      <div className="flex items-center gap-2 my-4">
        <div className="flex-1 h-px bg-gray-800" />
        <span className="text-xs text-gray-600">or</span>
        <div className="flex-1 h-px bg-gray-800" />
      </div>

      <button onClick={signInWithGoogle}
        className="w-full flex items-center justify-center gap-2 border border-gray-700 rounded-lg py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors">
        <GoogleIcon />
        Continue with Google
      </button>
    </div>
  );
}

export default function Home() {
  const { user, loading } = useAuth();
  const [signedUp, setSignedUp] = useState<string[]>([]);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetch("/api/usernames").then((r) => r.json()).then((d) => setSignedUp(d.usernames ?? [])).catch(() => {});
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col lg:flex-row items-center lg:items-start justify-center gap-6 py-8 min-h-[70vh]">
        <SignInPanel />
        <WallOfShame signedUp={signedUp} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {user.username ?? user.displayName.split(" ")[0]} 👋</h1>
        <p className="text-gray-400 mt-1">FIFA World Cup 2026 – Tournament has started!</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/schedule" className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-500 transition-colors group">
          <div className="text-3xl mb-3">📅</div>
          <h2 className="text-lg font-semibold group-hover:text-green-400 transition-colors">Match Schedule</h2>
          <p className="text-gray-400 text-sm mt-1">View all fixtures and results</p>
        </Link>
        <Link href="/predictions" className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-500 transition-colors group">
          <div className="text-3xl mb-3">🎯</div>
          <h2 className="text-lg font-semibold group-hover:text-green-400 transition-colors">My Predictions</h2>
          <p className="text-gray-400 text-sm mt-1">Submit and manage your picks</p>
        </Link>
        <Link href="/leaderboard" className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-500 transition-colors group">
          <div className="text-3xl mb-3">🏆</div>
          <h2 className="text-lg font-semibold group-hover:text-green-400 transition-colors">Leaderboard</h2>
          <p className="text-gray-400 text-sm mt-1">See who&apos;s winning the group</p>
        </Link>
        <Link href="/rules" className="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-green-500 transition-colors group col-span-1 sm:col-span-3 md:col-span-1">
          <div className="text-3xl mb-3">📋</div>
          <h2 className="text-lg font-semibold group-hover:text-green-400 transition-colors">Rules & Scoring</h2>
          <p className="text-gray-400 text-sm mt-1">How points are awarded</p>
        </Link>
      </div>
    </div>
  );
}
