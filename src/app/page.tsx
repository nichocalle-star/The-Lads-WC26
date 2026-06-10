"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading, authError, signInWithGoogle } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-8">
        <div>
          <h1 className="text-5xl font-bold mb-3">⚽ The Lads</h1>
          <p className="text-2xl text-green-400 font-semibold">FIFA World Cup 2026</p>
          <p className="text-gray-400 mt-3 text-lg">Predict. Compete. Brag.</p>
        </div>
        {authError && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm max-w-sm">
            {authError}
          </div>
        )}

        <button
          onClick={signInWithGoogle}
          className="flex items-center gap-3 bg-white text-gray-900 px-6 py-3 rounded-xl text-base font-semibold hover:bg-gray-100 transition-colors shadow-lg"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Sign in with Google to join
        </button>
        <p className="text-gray-600 text-sm">Invite-only – make sure you&apos;re one of the lads 🍺</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {user.displayName.split(" ")[0]} 👋</h1>
        <p className="text-gray-400 mt-1">FIFA World Cup 2026 – Tournament starts June 11!</p>
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
