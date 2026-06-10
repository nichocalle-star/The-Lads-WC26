"use client";

import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [adminSecret, setAdminSecret] = useState("");

  useEffect(() => {
    if (!loading && (!user || !user.isAdmin)) router.push("/");
  }, [user, loading, router]);

  async function syncMatches() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch("/api/sync-matches", {
        method: "POST",
        headers: { Authorization: `Bearer ${adminSecret}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSyncResult(`✅ Synced ${data.synced} matches successfully`);
      } else {
        setSyncResult(`❌ Error: ${data.error}`);
      }
    } catch {
      setSyncResult("❌ Network error");
    } finally {
      setSyncing(false);
    }
  }

  if (loading || !user?.isAdmin) return null;

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-2xl font-bold">Admin Panel</h1>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Sync Match Data</h2>
        <p className="text-gray-400 text-sm">
          Pulls the latest FIFA Club World Cup schedule and results from SofaScore and saves them to Firestore.
        </p>

        <input
          type="password"
          placeholder="Admin secret key"
          value={adminSecret}
          onChange={(e) => setAdminSecret(e.target.value)}
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
        />

        <button
          onClick={syncMatches}
          disabled={syncing || !adminSecret}
          className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-6 py-2 rounded-lg transition-colors"
        >
          {syncing ? "Syncing..." : "Sync Now"}
        </button>

        {syncResult && (
          <p className="text-sm mt-2">{syncResult}</p>
        )}
      </div>

      <div className="bg-gray-900 border border-yellow-700/50 rounded-xl p-6">
        <h2 className="text-lg font-semibold mb-2">Make User Admin</h2>
        <p className="text-gray-400 text-sm">
          To grant admin access, update the user&apos;s document in Firestore: set <code className="bg-gray-800 px-1 rounded">isAdmin: true</code> on their user record in the <code className="bg-gray-800 px-1 rounded">users</code> collection.
        </p>
      </div>
    </div>
  );
}
