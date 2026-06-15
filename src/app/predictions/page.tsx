"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { Match, Prediction } from "@/lib/types";
import { useRouter } from "next/navigation";
import { WC2026_TEAMS, flagOf } from "@/lib/teams";
import {
  TeamRow, BRACKET_MAP, calcGroupStandings, calcThirdPlaceQualifiers,
  resolveSlot,
} from "@/lib/bracket";
import { isMatchLocked } from "@/lib/lock";

const TZ = "America/New_York";

// ── Fan pickers (rooting for / hating on) ─────────────────────────────────────

function TeamPicker({
  userId, field, label, emptyText, accent, initial,
}: {
  userId: string;
  field: "rootingFor" | "hatingOn";
  label: string;
  emptyText: string;
  accent: "green" | "red";
  initial?: string;
}) {
  const [current, setCurrent] = useState<string | null>(initial ?? null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const filtered = WC2026_TEAMS.filter((t) =>
    t.toLowerCase().includes(search.toLowerCase())
  );

  const btnClass = accent === "green"
    ? "text-green-400 hover:text-green-300 border-green-900/60 hover:border-green-700"
    : "text-red-400 hover:text-red-300 border-red-900/60 hover:border-red-700";
  const selectedClass = accent === "green"
    ? "bg-green-700/40 border border-green-600/60 text-green-300"
    : "bg-red-700/40 border border-red-600/60 text-red-300";

  async function pick(team: string) {
    setSaving(true);
    try {
      await setDoc(doc(db, "users", userId), { [field]: team }, { merge: true });
      setCurrent(team);
      setOpen(false);
      setSearch("");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex-1 min-w-0">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">{label}</p>
          {current ? (
            <div className="flex items-center gap-2">
              <span className="text-2xl leading-none">{flagOf(current)}</span>
              <span className="text-sm font-semibold text-white">{current}</span>
            </div>
          ) : (
            <p className="text-sm text-gray-500">{emptyText}</p>
          )}
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className={`text-xs border px-3 py-1.5 rounded-lg transition-colors shrink-0 ${btnClass}`}
        >
          {open ? "Cancel" : current ? "Change" : "Pick team"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <input
            autoFocus
            type="text"
            placeholder="Search country…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-600 transition-colors"
          />
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-64 overflow-y-auto pr-1">
            {filtered.map((team) => (
              <button
                key={team}
                onClick={() => pick(team)}
                disabled={saving}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                  current === team ? selectedClass : "bg-gray-800 hover:bg-gray-700 text-gray-200 border border-transparent"
                }`}
              >
                <span className="text-base leading-none">{flagOf(team)}</span>
                <span className="truncate text-xs">{team}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatKickoff(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  return `${date}, ${time} ET`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "picks" | "standings" | "bracket";

type PendingEdit = { homeScore: string; awayScore: string };

export default function PredictionsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("picks");
  const [pendingEdits, setPendingEdits] = useState<Record<string, PendingEdit>>({});

  useEffect(() => { if (!loading && !user) router.push("/"); }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    async function load() {
      try {
        const [matchRes, predSnap] = await Promise.all([
          fetch("/api/sync-matches").then((r) => r.json()),
          getDocs(query(collection(db, "predictions"), where("userId", "==", user!.uid))),
        ]);
        setMatches((matchRes.matches ?? []).sort(
          (a: Match, b: Match) => new Date(a.kickoffTimeUTC).getTime() - new Date(b.kickoffTimeUTC).getTime()
        ));
        const predMap: Record<string, Prediction> = {};
        predSnap.forEach((d) => { const p = d.data() as Prediction; predMap[p.matchId] = p; });
        setPredictions(predMap);
      } catch (e) {
        setPageError("Failed to load. Please refresh."); console.error(e);
      } finally { setLoadingData(false); }
    }
    load();
  }, [user]);

  function handleEdit(matchId: string, homeScore: string, awayScore: string) {
    setPendingEdits((prev) => {
      if (homeScore === "" && awayScore === "") {
        const next = { ...prev };
        delete next[matchId];
        return next;
      }
      return { ...prev, [matchId]: { homeScore, awayScore } };
    });
  }

  async function saveAllPredictions() {
    if (!user || saving) return;
    setSaving(true);
    setPageError(null);
    try {
      const now = new Date().toISOString();
      const writes = Object.entries(pendingEdits).map(async ([matchId, edit]) => {
        const match = matches.find((m) => m.matchId === matchId);
        if (match && isMatchLocked(match)) return;
        const hs = parseInt(edit.homeScore);
        const as_ = parseInt(edit.awayScore);
        if (isNaN(hs) || isNaN(as_)) return;

        const slots = BRACKET_MAP[matchId];
        const homeDisplay = slots ? resolveSlot(slots.home, {}, [], predictions) : match?.homeTeam ?? "";
        const awayDisplay = slots ? resolveSlot(slots.away, {}, [], predictions) : match?.awayTeam ?? "";
        const winner = hs > as_ ? homeDisplay : as_ > hs ? awayDisplay : "draw";

        const existing = predictions[matchId];
        const prediction: Prediction = {
          userId: user.uid,
          matchId,
          predictedWinner: winner,
          predictedHomeScore: hs,
          predictedAwayScore: as_,
          submittedAt: existing?.submittedAt ?? now,
          updatedAt: now,
          pointsAwarded: 0,
          isLocked: false,
        };
        await setDoc(doc(db, "predictions", `${user.uid}_${matchId}`), prediction);
        return { matchId, prediction };
      });

      const results = await Promise.all(writes);
      const saved: Record<string, Prediction> = {};
      for (const r of results) {
        if (r) saved[r.matchId] = r.prediction;
      }
      setPredictions((prev) => ({ ...prev, ...saved }));
      setPendingEdits({});
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setPageError("Failed to save – please try again");
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingData) {
    return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-8 h-8 border-2 border-green-400 border-t-transparent rounded-full animate-spin" /></div>;
  }

  const groupMatches = matches.filter((m) => m.round === "Group Stage");
  const groups = [...new Set(groupMatches.map((m) => m.group).filter(Boolean))].sort() as string[];
  const groupStandings: Record<string, TeamRow[]> = {};
  for (const g of groups) groupStandings[g] = calcGroupStandings(groupMatches.filter((m) => m.group === g), predictions);
  const thirdPlaceQualifiers = calcThirdPlaceQualifiers(groupStandings);

  const predCount = Object.keys(predictions).length;
  const totalUpcoming = matches.filter((m) => new Date(m.kickoffTimeUTC) > new Date()).length;
  const pendingCount = Object.keys(pendingEdits).length;

  const tabs: { id: Tab; label: string }[] = [
    { id: "picks", label: "My Picks" },
    { id: "standings", label: "Predicted Standings" },
    { id: "bracket", label: "Predicted Bracket" },
  ];

  return (
    <div className="space-y-6 pb-28">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">My Predictions</h1>
          <p className="text-gray-400 text-sm mt-1">{predCount} of {totalUpcoming} upcoming matches predicted</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === t.id ? "bg-green-600 text-white" : "bg-gray-800 text-gray-300 hover:bg-gray-700"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <TeamPicker userId={user!.uid} field="rootingFor" label="❤️ Rooting for"
          emptyText="Not set — pick your team" accent="green" initial={user?.rootingFor} />
        <TeamPicker userId={user!.uid} field="hatingOn" label="💀 Hating on"
          emptyText="Not set — pick your villain" accent="red" initial={user?.hatingOn} />
      </div>

      {pageError && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">{pageError}</div>}

      {activeTab === "picks" && <PicksTab matches={matches} predictions={predictions} pendingEdits={pendingEdits} onEdit={handleEdit} groupStandings={groupStandings} thirdPlaceQualifiers={thirdPlaceQualifiers} />}
      {activeTab === "standings" && <StandingsTab groups={groups} groupMatches={groupMatches} groupStandings={groupStandings} />}
      {activeTab === "bracket" && <BracketTab groupStandings={groupStandings} thirdPlaceQualifiers={thirdPlaceQualifiers} predictions={predictions} />}

      {/* Floating save bar */}
      <div className={`fixed bottom-0 left-0 right-0 z-50 transition-transform duration-200 ${pendingCount > 0 || saveSuccess ? "translate-y-0" : "translate-y-full"}`}>
        <div className="max-w-6xl mx-auto px-4 pb-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-5 py-3 flex items-center justify-between gap-4 shadow-xl">
            {saveSuccess ? (
              <p className="text-green-400 text-sm font-medium">✓ Predictions saved</p>
            ) : (
              <p className="text-gray-300 text-sm">
                <span className="text-white font-semibold">{pendingCount}</span> unsaved {pendingCount === 1 ? "prediction" : "predictions"}
              </p>
            )}
            <button
              onClick={saveAllPredictions}
              disabled={saving || pendingCount === 0}
              className="bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold px-5 py-2 rounded-lg text-sm transition-colors shrink-0"
            >
              {saving ? "Saving…" : `Save ${pendingCount > 0 ? pendingCount : ""} ${pendingCount === 1 ? "pick" : "picks"}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Colombia easter egg ───────────────────────────────────────────────────────

function TeamName({ name }: { name: string }) {
  if (name === "Colombia") {
    return (
      <span>
        Colombia
        <span style={{ fontSize: "9px", opacity: 0.25, marginLeft: "3px", fontWeight: 400, letterSpacing: 0 }}>best choice</span>
      </span>
    );
  }
  return <>{name}</>;
}

// ── Picks Tab ─────────────────────────────────────────────────────────────────

function PicksTab({ matches, predictions, pendingEdits, onEdit, groupStandings, thirdPlaceQualifiers }: {
  matches: Match[];
  predictions: Record<string, Prediction>;
  pendingEdits: Record<string, PendingEdit>;
  onEdit: (matchId: string, homeScore: string, awayScore: string) => void;
  groupStandings: Record<string, TeamRow[]>;
  thirdPlaceQualifiers: TeamRow[];
}) {
  const upcoming = matches.filter((m) => m.status !== "final");
  const finished = matches.filter((m) => m.status === "final")
    .sort((a, b) => new Date(b.kickoffTimeUTC).getTime() - new Date(a.kickoffTimeUTC).getTime());

  const byDate: Record<string, Match[]> = {};
  for (const m of upcoming) {
    const key = new Date(m.kickoffTimeUTC).toLocaleDateString("en-CA", { timeZone: TZ });
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  }

  return (
    <div className="space-y-8">
      {finished.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Results</h2>
          <div className="space-y-3">
            {finished.map((match) => (
              <CompletedCard key={match.matchId} match={match} prediction={predictions[match.matchId]} />
            ))}
          </div>
        </div>
      )}

      {upcoming.length === 0 ? (
        <p className="text-gray-400 text-center py-20">No upcoming matches.</p>
      ) : (
        Object.entries(byDate).map(([, dayMatches]) => (
          <div key={dayMatches[0].matchId}>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {new Date(dayMatches[0].kickoffTimeUTC).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ })}
            </h2>
            <div className="space-y-3">
              {dayMatches.map((match) => (
                <PredictionCard key={match.matchId} match={match} existing={predictions[match.matchId]}
                  pending={pendingEdits[match.matchId]}
                  onEdit={(h, a) => onEdit(match.matchId, h, a)}
                  groupStandings={groupStandings} thirdPlaceQualifiers={thirdPlaceQualifiers}
                  predictions={predictions} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── Completed match card ──────────────────────────────────────────────────────

function CompletedCard({ match, prediction }: { match: Match; prediction?: Prediction }) {
  const homeWon = match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
  const awayWon = match.homeScore !== null && match.awayScore !== null && match.awayScore! > match.homeScore!;
  const pts = prediction?.pointsAwarded ?? 0;
  const hasPrediction = !!prediction;

  const isExact =
    hasPrediction &&
    prediction!.predictedHomeScore === match.homeScore &&
    prediction!.predictedAwayScore === match.awayScore;
  const isCorrect = hasPrediction && prediction!.predictedWinner === match.winner;

  let ptsBadgeClass = "bg-gray-800 text-gray-500";
  let ptsLabel = "0 pts";
  if (pts > 0) {
    if (isExact) {
      ptsBadgeClass = "bg-green-900/50 text-green-400";
      ptsLabel = `+${pts} pts`;
    } else {
      ptsBadgeClass = "bg-blue-900/40 text-blue-400";
      ptsLabel = `+${pts} pt`;
    }
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex justify-between items-center mb-2 text-xs text-gray-500">
        <span>{match.group ? `Group ${match.group} · ` : ""}{match.round}</span>
        <span className="bg-gray-800 text-gray-400 text-[10px] px-2 py-0.5 rounded-full">Final</span>
      </div>

      <div className="flex items-center gap-3">
        <div className={`flex-1 text-center text-sm font-semibold py-1.5 rounded-lg ${homeWon ? "text-white" : "text-gray-500"}`}>
          <TeamName name={match.homeTeam} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className={`text-xl font-bold w-6 text-center ${homeWon ? "text-white" : "text-gray-500"}`}>{match.homeScore}</span>
          <span className="text-gray-600">–</span>
          <span className={`text-xl font-bold w-6 text-center ${awayWon ? "text-white" : "text-gray-500"}`}>{match.awayScore}</span>
        </div>
        <div className={`flex-1 text-center text-sm font-semibold py-1.5 rounded-lg ${awayWon ? "text-white" : "text-gray-500"}`}>
          <TeamName name={match.awayTeam} />
        </div>
      </div>

      <div className="border-t border-gray-800 mt-3 pt-2.5 flex items-center justify-between gap-3">
        {hasPrediction ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className={isCorrect ? "text-green-500" : "text-gray-600"}>
              {isCorrect ? "✓" : "✗"}
            </span>
            <span>Your pick:</span>
            <span className={`font-medium ${isCorrect ? "text-gray-300" : "text-gray-600"}`}>
              {prediction!.predictedHomeScore}–{prediction!.predictedAwayScore} {prediction!.predictedWinner === "draw" ? "(Draw)" : prediction!.predictedWinner}
            </span>
          </div>
        ) : (
          <span className="text-xs text-gray-700 italic">No prediction</span>
        )}
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${ptsBadgeClass}`}>{ptsLabel}</span>
      </div>
    </div>
  );
}

function formatML(ml: number | null): string {
  if (ml === null) return "–";
  return ml > 0 ? `+${ml}` : `${ml}`;
}

function PredictionCard({ match, existing, pending, onEdit, groupStandings, thirdPlaceQualifiers, predictions }: {
  match: Match; existing?: Prediction; pending?: PendingEdit;
  onEdit: (homeScore: string, awayScore: string) => void;
  groupStandings: Record<string, TeamRow[]>;
  thirdPlaceQualifiers: TeamRow[];
  predictions: Record<string, Prediction>;
}) {
  const isLocked = isMatchLocked(match);

  const homeScore = pending?.homeScore ?? existing?.predictedHomeScore?.toString() ?? "";
  const awayScore = pending?.awayScore ?? existing?.predictedAwayScore?.toString() ?? "";
  const isDirty = !!pending;

  // Resolve placeholder names for any knockout match in the bracket
  const slots = BRACKET_MAP[match.matchId];
  const homeDisplay = slots
    ? resolveSlot(slots.home, groupStandings, thirdPlaceQualifiers, predictions)
    : match.homeTeam;
  const awayDisplay = slots
    ? resolveSlot(slots.away, groupStandings, thirdPlaceQualifiers, predictions)
    : match.awayTeam;

  const hs = homeScore !== "" ? parseInt(homeScore) : null;
  const as_ = awayScore !== "" ? parseInt(awayScore) : null;
  const bothEntered = hs !== null && as_ !== null && !isNaN(hs) && !isNaN(as_);

  let homeActive = false, awayActive = false, drawActive = false;
  if (bothEntered) {
    if (hs > as_) homeActive = true;
    else if (as_ > hs) awayActive = true;
    else drawActive = true;
  }

  const odds = match.odds;
  const showOdds = !!odds && (odds.homeML !== null || odds.drawML !== null || odds.awayML !== null);

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 transition-colors ${isLocked ? "border-gray-700 opacity-60" : isDirty ? "border-green-700/60" : "border-gray-800"}`}>
      <div className="flex justify-between mb-2 text-xs text-gray-500">
        <span>{match.group ? `Group ${match.group} · ` : ""}{match.round}</span>
        <span>{formatKickoff(match.kickoffTimeUTC)}</span>
      </div>

      <div className="flex items-center gap-3 my-3">
        <div className={`flex-1 text-center py-2 rounded-lg font-semibold text-sm transition-colors ${homeActive ? "bg-green-600 text-white" : drawActive || awayActive ? "bg-gray-800 text-gray-500" : "bg-gray-800 text-gray-300"}`}>
          <TeamName name={homeDisplay} />
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <input type="number" min={0} max={20} disabled={isLocked} value={homeScore}
            onChange={(e) => onEdit(e.target.value, awayScore)}
            className="w-10 text-center bg-gray-800 border border-gray-700 rounded py-1 text-sm disabled:opacity-40 focus:border-green-500 focus:outline-none" placeholder="0" />
          <span className={`text-sm font-bold px-0.5 ${drawActive ? "text-yellow-400" : "text-gray-600"}`}>–</span>
          <input type="number" min={0} max={20} disabled={isLocked} value={awayScore}
            onChange={(e) => onEdit(homeScore, e.target.value)}
            className="w-10 text-center bg-gray-800 border border-gray-700 rounded py-1 text-sm disabled:opacity-40 focus:border-green-500 focus:outline-none" placeholder="0" />
        </div>

        <div className={`flex-1 text-center py-2 rounded-lg font-semibold text-sm transition-colors ${awayActive ? "bg-green-600 text-white" : drawActive || homeActive ? "bg-gray-800 text-gray-500" : "bg-gray-800 text-gray-300"}`}>
          <TeamName name={awayDisplay} />
        </div>
      </div>

      {drawActive && !isLocked && <p className="text-center text-xs text-yellow-400 -mt-1 mb-2">Draw</p>}

      {showOdds && (
        <div className="flex items-center border-t border-gray-800 pt-2.5 mt-1 gap-0">
          {[
            { label: homeDisplay.length > 10 ? homeDisplay.split(" ")[0] : homeDisplay, val: formatML(odds!.homeML) },
            { label: "Draw", val: formatML(odds!.drawML) },
            { label: awayDisplay.length > 10 ? awayDisplay.split(" ")[0] : awayDisplay, val: formatML(odds!.awayML) },
          ].map((o, i, arr) => (
            <div key={i} className={`flex-1 text-center ${i < arr.length - 1 ? "border-r border-gray-800" : ""}`}>
              <p className="text-[10px] text-gray-600 mb-0.5 truncate px-1">{o.label}</p>
              <p className={`text-xs font-medium ${o.val.startsWith("-") ? "text-green-500" : "text-gray-400"}`}>{o.val}</p>
            </div>
          ))}
          {odds!.overUnder !== null && (
            <div className="text-center pl-3 border-l border-gray-800 shrink-0">
              <p className="text-[10px] text-gray-600 mb-0.5">O/U</p>
              <p className="text-xs font-medium text-gray-400">{odds!.overUnder}</p>
            </div>
          )}
          <p className="text-[9px] text-gray-700 pl-2 shrink-0">DK</p>
        </div>
      )}

      {isLocked ? (
        <p className="text-center text-xs text-red-400 mt-2">🔒 Predictions locked</p>
      ) : (
        <>
          {existing && !isDirty && (
            <p className="text-center text-xs text-gray-600 mt-2">
              Saved: <span className="text-green-500">{existing.predictedWinner}</span>
              {existing.predictedHomeScore !== null ? ` · ${existing.predictedHomeScore}–${existing.predictedAwayScore}` : ""}
            </p>
          )}
          {isDirty && (
            <p className="text-center text-xs text-yellow-600 mt-2">Unsaved — hit Save picks below</p>
          )}
          {!bothEntered && !existing && !isDirty && (
            <p className="text-center text-xs text-gray-700 mt-2">Enter both scores</p>
          )}
        </>
      )}
    </div>
  );
}

// ── Standings Tab ─────────────────────────────────────────────────────────────

function StandingsTab({ groups, groupMatches, groupStandings }: {
  groups: string[]; groupMatches: Match[]; groupStandings: Record<string, TeamRow[]>;
}) {
  if (Object.keys(groupStandings).every(g => groupStandings[g].every(r => r.pts === 0 && r.w === 0))) {
    return <div className="text-center py-20 text-gray-500"><p className="text-4xl mb-3">📊</p><p>Submit picks on the <strong>My Picks</strong> tab to see projected standings.</p></div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {groups.map((g) => {
        const rows = groupStandings[g];
        return (
          <div key={g} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800 font-bold">Group {g}</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-gray-500 border-b border-gray-800">
                  <th className="text-left px-4 py-2">Team</th>
                  <th className="text-center px-2 py-2">W</th>
                  <th className="text-center px-2 py-2">D</th>
                  <th className="text-center px-2 py-2">L</th>
                  <th className="text-center px-2 py-2">GD</th>
                  <th className="text-center px-2 py-2 font-bold text-white">Pts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={row.team} className={`border-b border-gray-800/50 ${i < 2 ? "bg-green-900/10" : ""}`}>
                    <td className="px-4 py-2 flex items-center gap-2">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${i < 2 ? "bg-green-400" : "bg-gray-600"}`} />
                      <span className={i < 2 ? "font-medium" : "text-gray-400"}>{row.team}</span>
                    </td>
                    <td className="text-center px-2 py-2 text-gray-300">{row.w}</td>
                    <td className="text-center px-2 py-2 text-gray-300">{row.d}</td>
                    <td className="text-center px-2 py-2 text-gray-300">{row.l}</td>
                    <td className="text-center px-2 py-2 text-gray-300">{row.gf - row.ga > 0 ? "+" : ""}{row.gf - row.ga}</td>
                    <td className="text-center px-2 py-2 font-bold text-white">{row.pts}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ── Bracket Tab ───────────────────────────────────────────────────────────────

const R32_LABELS: Record<string, string> = {
  "espn-760486": "R32 #1", "espn-760487": "R32 #2", "espn-760489": "R32 #3",
  "espn-760488": "R32 #4", "espn-760490": "R32 #5", "espn-760492": "R32 #6",
  "espn-760491": "R32 #7", "espn-760495": "R32 #8", "espn-760493": "R32 #9",
  "espn-760494": "R32 #10", "espn-760497": "R32 #11", "espn-760496": "R32 #12",
  "espn-760498": "R32 #13", "espn-760499": "R32 #14", "espn-760500": "R32 #15",
  "espn-760501": "R32 #16",
  "espn-760502": "R16 #1", "espn-760503": "R16 #2", "espn-760504": "R16 #3",
  "espn-760505": "R16 #4", "espn-760506": "R16 #5", "espn-760507": "R16 #6",
  "espn-760509": "R16 #7", "espn-760508": "R16 #8",
  "espn-760510": "QF #1", "espn-760511": "QF #2", "espn-760512": "QF #3", "espn-760513": "QF #4",
  "espn-760514": "SF #1", "espn-760515": "SF #2",
};

function slotLabel(slot: string): string {
  if (slot.startsWith("W:")) {
    const matchId = slot.slice(2);
    return `W of ${R32_LABELS[matchId] ?? matchId}`;
  }
  if (slot.startsWith("L:")) {
    const matchId = slot.slice(2);
    return `L of ${R32_LABELS[matchId] ?? matchId}`;
  }
  if (slot.startsWith("3rd_")) {
    const rank = parseInt(slot.replace("3rd_", ""));
    return `3rd-Place #${rank}`;
  }
  const [group, posStr] = slot.split("_");
  const pos = parseInt(posStr);
  const suffix = pos === 1 ? "Winner" : "Runner-up";
  return `Group ${group} ${suffix}`;
}

const BRACKET_ROUNDS = [
  { label: "Round of 32", matchIds: ["espn-760486","espn-760487","espn-760489","espn-760488","espn-760490","espn-760492","espn-760491","espn-760495","espn-760493","espn-760494","espn-760497","espn-760496","espn-760498","espn-760499","espn-760500","espn-760501"], cols: 2 },
  { label: "Round of 16", matchIds: ["espn-760502","espn-760503","espn-760504","espn-760505","espn-760506","espn-760507","espn-760509","espn-760508"], cols: 2 },
  { label: "Quarter-Finals", matchIds: ["espn-760510","espn-760511","espn-760512","espn-760513"], cols: 2 },
  { label: "Semi-Finals", matchIds: ["espn-760514","espn-760515"], cols: 2 },
  { label: "3rd Place", matchIds: ["espn-760516"], cols: 1 },
  { label: "Final", matchIds: ["espn-760517"], cols: 1 },
];

function isResolved(name: string) {
  return !name.includes("Group ") && !name.includes("3rd-Place") && !name.includes(" / ") && name !== "?";
}

function BracketTab({ groupStandings, thirdPlaceQualifiers, predictions }: {
  groupStandings: Record<string, TeamRow[]>;
  thirdPlaceQualifiers: TeamRow[];
  predictions: Record<string, Prediction>;
}) {
  const hasAny = Object.keys(groupStandings).some(g => groupStandings[g].some(r => r.pts > 0 || r.w > 0));

  if (!hasAny) {
    return <div className="text-center py-20 text-gray-500"><p className="text-4xl mb-3">🏆</p><p>Submit group stage picks to see your predicted bracket.</p></div>;
  }

  const resolve = (slot: string) => resolveSlot(slot, groupStandings, thirdPlaceQualifiers, predictions);

  return (
    <div className="space-y-8">
      {thirdPlaceQualifiers.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-3">3rd-Place Qualifiers (ranked)</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {thirdPlaceQualifiers.map((t, i) => (
              <div key={t.team} className="bg-gray-800 rounded-lg px-3 py-2 text-sm">
                <span className="text-blue-400 font-bold mr-2">#{i + 1}</span>
                <span className="font-medium">{t.team}</span>
                <span className="text-gray-500 text-xs ml-1">{t.pts}pts {t.gf - t.ga > 0 ? "+" : ""}{t.gf - t.ga}gd</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {BRACKET_ROUNDS.map(({ label, matchIds, cols }) => (
        <div key={label}>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{label}</h3>
          <div className={`grid grid-cols-1 ${cols === 2 ? "md:grid-cols-2" : ""} gap-3`}>
            {matchIds.map((matchId) => {
              const slots = BRACKET_MAP[matchId];
              if (!slots) return null;
              const home = resolve(slots.home);
              const away = resolve(slots.away);
              return (
                <div key={matchId} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="text-xs text-gray-500 mb-2">{label} · {slotLabel(slots.home)} vs {slotLabel(slots.away)}</p>
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 text-center py-1.5 rounded-lg text-sm font-medium ${isResolved(home) ? "bg-green-900/30 text-green-300" : "bg-gray-800 text-gray-500 italic"}`}>
                      {home}
                    </span>
                    <span className="text-gray-600 text-xs">vs</span>
                    <span className={`flex-1 text-center py-1.5 rounded-lg text-sm font-medium ${isResolved(away) ? "bg-green-900/30 text-green-300" : "bg-gray-800 text-gray-500 italic"}`}>
                      {away}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
