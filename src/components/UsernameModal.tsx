"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";

export default function UsernameModal() {
  const { needsUsername, saveUsername, user } = useAuth();
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  if (!needsUsername || !user) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    const result = await saveUsername(value);
    if (result.error) {
      setError(result.error);
      setSaving(false);
    }
  };

  const preview = value.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">⚽</div>
          <h2 className="text-xl font-bold">Pick your username</h2>
          <p className="text-gray-400 text-sm mt-1">
            This is how you&apos;ll appear on the leaderboard.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <input
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError("");
              }}
              placeholder="e.g. goatinho99"
              maxLength={20}
              autoFocus
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
            />
            {preview && preview !== value.trim() && (
              <p className="text-xs text-gray-500 mt-1">Will be saved as: <span className="text-gray-300">{preview}</span></p>
            )}
            <p className="text-xs text-gray-600 mt-1">3–20 chars · letters, numbers, underscores</p>
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || value.trim().length < 3}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-3 rounded-xl transition-colors"
          >
            {saving ? "Saving…" : "Set username"}
          </button>
        </form>
      </div>
    </div>
  );
}
