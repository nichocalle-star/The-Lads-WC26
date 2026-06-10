"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, doc, setDoc, getDocs, query, where } from "firebase/firestore";
import { Match, Prediction } from "@/lib/types";
import { useRouter } from "next/navigation";

const TZ = "America/New_York";

function formatKickoff(iso: string) {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: TZ });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: TZ });
  return `${date}, ${time} ET`;
}

// ── Group standings ───────────────────────────────────────────────────────────

interface TeamRow { team: string; w: number; d: number; l: number; gf: number; ga: number; pts: number }

function calcGroupStandings(groupMatches: Match[], predictions: Record<string, Prediction>): TeamRow[] {
  const rows: Record<string, TeamRow> = {};
  const ensure = (t: string) => { if (!rows[t]) rows[t] = { team: t, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }; };

  for (const m of groupMatches) {
    ensure(m.homeTeam); ensure(m.awayTeam);
    const pred = predictions[m.matchId];
    if (!pred) continue;
    const hs = pred.predictedHomeScore ?? null;
    const as_ = pred.predictedAwayScore ?? null;
    if (hs === null || as_ === null) continue;

    rows[m.homeTeam].gf += hs; rows[m.homeTeam].ga += as_;
    rows[m.awayTeam].gf += as_; rows[m.awayTeam].ga += hs;

    if (hs > as_) { rows[m.homeTeam].w++; rows[m.homeTeam].pts += 3; rows[m.awayTeam].l++; }
    else if (as_ > hs) { rows[m.awayTeam].w++; rows[m.awayTeam].pts += 3; rows[m.homeTeam].l++; }
    else { rows[m.homeTeam].d++; rows[m.homeTeam].pts++; rows[m.awayTeam].d++; rows[m.awayTeam].pts++; }
  }

  return Object.values(rows).sort((a, b) =>
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
  );
}

// ── Full bracket map (ESPN match IDs sourced from API, bracket order verified) ─

// "W:espn-XXXXXX" = winner of that match. Slots chain through the whole bracket.
const BRACKET_MAP: Record<string, { home: string; away: string }> = {
  // Round of 32 — fixed group/3rd-place slots
  "espn-760486": { home: "A_2",   away: "B_2"   },
  "espn-760487": { home: "C_1",   away: "F_2"   },
  "espn-760489": { home: "E_1",   away: "3rd_4" },
  "espn-760488": { home: "F_1",   away: "C_2"   },
  "espn-760490": { home: "E_2",   away: "I_2"   },
  "espn-760492": { home: "I_1",   away: "3rd_6" },
  "espn-760491": { home: "A_1",   away: "3rd_1" },
  "espn-760495": { home: "L_1",   away: "3rd_8" },
  "espn-760493": { home: "G_1",   away: "3rd_5" },
  "espn-760494": { home: "D_1",   away: "3rd_3" },
  "espn-760497": { home: "H_1",   away: "J_2"   },
  "espn-760496": { home: "K_2",   away: "L_2"   },
  "espn-760498": { home: "B_1",   away: "3rd_2" },
  "espn-760499": { home: "D_2",   away: "G_2"   },
  "espn-760500": { home: "J_1",   away: "H_2"   },
  "espn-760501": { home: "K_1",   away: "3rd_7" },
  // Round of 16 — winners of specific R32 matches (ESPN bracket order #1-16)
  "espn-760502": { home: "W:espn-760486", away: "W:espn-760489" }, // R32 #1 vs #3
  "espn-760503": { home: "W:espn-760487", away: "W:espn-760490" }, // R32 #2 vs #5
  "espn-760504": { home: "W:espn-760488", away: "W:espn-760492" }, // R32 #4 vs #6
  "espn-760505": { home: "W:espn-760491", away: "W:espn-760495" }, // R32 #7 vs #8
  "espn-760506": { home: "W:espn-760497", away: "W:espn-760496" }, // R32 #11 vs #12
  "espn-760507": { home: "W:espn-760493", away: "W:espn-760494" }, // R32 #9 vs #10
  "espn-760509": { home: "W:espn-760499", away: "W:espn-760501" }, // R32 #14 vs #16
  "espn-760508": { home: "W:espn-760498", away: "W:espn-760500" }, // R32 #13 vs #15
  // Quarter-finals — winners of specific R16 matches
  "espn-760510": { home: "W:espn-760502", away: "W:espn-760503" }, // R16 #1 vs #2
  "espn-760511": { home: "W:espn-760506", away: "W:espn-760507" }, // R16 #5 vs #6
  "espn-760512": { home: "W:espn-760504", away: "W:espn-760505" }, // R16 #3 vs #4
  "espn-760513": { home: "W:espn-760509", away: "W:espn-760508" }, // R16 #7 vs #8
  // Semi-finals
  "espn-760514": { home: "W:espn-760510", away: "W:espn-760511" }, // QF #1 vs #2
  "espn-760515": { home: "W:espn-760512", away: "W:espn-760513" }, // QF #3 vs #4
  // 3rd Place
  "espn-760516": { home: "L:espn-760514", away: "L:espn-760515" },
  // Final
  "espn-760517": { home: "W:espn-760514", away: "W:espn-760515" },
};

// R32 slots list (for bracket tab display)
const R32_SLOTS = Object.entries(BRACKET_MAP)
  .filter(([, v]) => !v.home.startsWith("W:"))
  .map(([matchId, v]) => ({ matchId, ...v }));

// ── 3rd-place qualification ───────────────────────────────────────────────────

function calcThirdPlaceQualifiers(groupStandings: Record<string, TeamRow[]>): TeamRow[] {
  const thirds: TeamRow[] = [];
  for (const rows of Object.values(groupStandings)) {
    if (rows[2]) thirds.push(rows[2]);
  }
  return thirds
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
    .slice(0, 8);
}

// ── Slot/winner resolution ────────────────────────────────────────────────────

function resolveSlot(
  slot: string,
  standings: Record<string, TeamRow[]>,
  thirdPlace: TeamRow[],
  predictions: Record<string, Prediction>
): string {
  if (slot.startsWith("W:")) {
    return resolveMatchWinner(slot.slice(2), standings, thirdPlace, predictions);
  }
  if (slot.startsWith("L:")) {
    return resolveMatchLoser(slot.slice(2), standings, thirdPlace, predictions);
  }
  if (slot.startsWith("3rd_")) {
    const rank = parseInt(slot.replace("3rd_", "")) - 1;
    return thirdPlace[rank]?.team ?? `3rd-Place #${rank + 1}`;
  }
  const [group, posStr] = slot.split("_");
  const pos = parseInt(posStr) - 1;
  return standings[group]?.[pos]?.team ?? `Group ${group} #${pos + 1}`;
}

function resolveMatchWinner(
  matchId: string,
  standings: Record<string, TeamRow[]>,
  thirdPlace: TeamRow[],
  predictions: Record<string, Prediction>
): string {
  const slots = BRACKET_MAP[matchId];
  if (!slots) return "?";
  const pred = predictions[matchId];
  const hs = pred?.predictedHomeScore ?? null;
  const as_ = pred?.predictedAwayScore ?? null;
  if (hs !== null && as_ !== null) {
    if (hs > as_) return resolveSlot(slots.home, standings, thirdPlace, predictions);
    if (as_ > hs) return resolveSlot(slots.away, standings, thirdPlace, predictions);
    if (pred?.predictedWinner && pred.predictedWinner !== "draw") return pred.predictedWinner;
  }
  const h = resolveSlot(slots.home, standings, thirdPlace, predictions);
  const a = resolveSlot(slots.away, standings, thirdPlace, predictions);
  if (h === a) return h;
  return `${h} / ${a}`;
}

function resolveMatchLoser(
  matchId: string,
  standings: Record<string, TeamRow[]>,
  thirdPlace: TeamRow[],
  predictions: Record<string, Prediction>
): string {
  const slots = BRACKET_MAP[matchId];
  if (!slots) return "?";
  const pred = predictions[matchId];
  const hs = pred?.predictedHomeScore ?? null;
  const as_ = pred?.predictedAwayScore ?? null;
  if (hs !== null && as_ !== null) {
    if (hs > as_) return resolveSlot(slots.away, standings, thirdPlace, predictions);
    if (as_ > hs) return resolveSlot(slots.home, standings, thirdPlace, predictions);
    if (pred?.predictedWinner && pred.predictedWinner !== "draw") {
      const winner = pred.predictedWinner;
      const h = resolveSlot(slots.home, standings, thirdPlace, predictions);
      const a = resolveSlot(slots.away, standings, thirdPlace, predictions);
      return winner === h ? a : h;
    }
  }
  const h = resolveSlot(slots.home, standings, thirdPlace, predictions);
  const a = resolveSlot(slots.away, standings, thirdPlace, predictions);
  if (h === a) return h;
  return `${h} / ${a}`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

type Tab = "picks" | "standings" | "bracket";

export default function PredictionsPage() {
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [predictions, setPredictions] = useState<Record<string, Prediction>>({});
  const [loadingData, setLoadingData] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("picks");

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

  async function submitPrediction(matchId: string, winner: string, homeScore: number | null, awayScore: number | null) {
    if (!user) return;
    // Client-side kickoff lock check
    const match = matches.find((m) => m.matchId === matchId);
    if (match && new Date() >= new Date(match.kickoffTimeUTC)) {
      setPageError("This match has already kicked off – prediction locked.");
      return;
    }
    setSubmitting(matchId);
    try {
      const predictionId = `${user.uid}_${matchId}`;
      const now = new Date().toISOString();
      const existing = predictions[matchId];
      const prediction: Prediction = {
        userId: user.uid,
        matchId,
        predictedWinner: winner,
        predictedHomeScore: homeScore,
        predictedAwayScore: awayScore,
        submittedAt: existing?.submittedAt ?? now,
        updatedAt: now,
        pointsAwarded: 0,
        isLocked: false,
      };
      await setDoc(doc(db, "predictions", predictionId), prediction);
      setPageError(null);
      setPredictions((prev) => ({ ...prev, [matchId]: prediction }));
    } catch (e) {
      setPageError("Failed to save – please try again");
      console.error(e);
    } finally {
      setSubmitting(null);
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

  const tabs: { id: Tab; label: string }[] = [
    { id: "picks", label: "My Picks" },
    { id: "standings", label: "Predicted Standings" },
    { id: "bracket", label: "Predicted Bracket" },
  ];

  return (
    <div className="space-y-6">
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

      {pageError && <div className="bg-red-900/50 border border-red-700 text-red-300 px-4 py-3 rounded-lg text-sm">{pageError}</div>}

      {activeTab === "picks" && <PicksTab matches={matches} predictions={predictions} submitting={submitting} onSubmit={submitPrediction} groupStandings={groupStandings} thirdPlaceQualifiers={thirdPlaceQualifiers} />}
      {activeTab === "standings" && <StandingsTab groups={groups} groupMatches={groupMatches} groupStandings={groupStandings} />}
      {activeTab === "bracket" && <BracketTab groupStandings={groupStandings} thirdPlaceQualifiers={thirdPlaceQualifiers} predictions={predictions} />}
    </div>
  );
}

// ── Picks Tab ─────────────────────────────────────────────────────────────────

function PicksTab({ matches, predictions, submitting, onSubmit, groupStandings, thirdPlaceQualifiers }: {
  matches: Match[];
  predictions: Record<string, Prediction>;
  submitting: string | null;
  onSubmit: (matchId: string, winner: string, home: number | null, away: number | null) => void;
  groupStandings: Record<string, TeamRow[]>;
  thirdPlaceQualifiers: TeamRow[];
}) {
  const upcoming = matches.filter((m) => new Date(m.kickoffTimeUTC) > new Date());
  if (upcoming.length === 0) return <p className="text-gray-400 text-center py-20">No upcoming matches.</p>;

  const byDate: Record<string, Match[]> = {};
  for (const m of upcoming) {
    const key = new Date(m.kickoffTimeUTC).toLocaleDateString("en-CA", { timeZone: TZ });
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(m);
  }

  return (
    <div className="space-y-8">
      {Object.entries(byDate).map(([, dayMatches]) => (
        <div key={dayMatches[0].matchId}>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {new Date(dayMatches[0].kickoffTimeUTC).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: TZ })}
          </h2>
          <div className="space-y-3">
            {dayMatches.map((match) => (
              <PredictionCard key={match.matchId} match={match} existing={predictions[match.matchId]}
                submitting={submitting === match.matchId}
                onSubmit={(w, h, a) => onSubmit(match.matchId, w, h, a)}
                groupStandings={groupStandings} thirdPlaceQualifiers={thirdPlaceQualifiers}
                predictions={predictions} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PredictionCard({ match, existing, submitting, onSubmit, groupStandings, thirdPlaceQualifiers, predictions }: {
  match: Match; existing?: Prediction; submitting: boolean;
  onSubmit: (winner: string, home: number | null, away: number | null) => void;
  groupStandings: Record<string, TeamRow[]>;
  thirdPlaceQualifiers: TeamRow[];
  predictions: Record<string, Prediction>;
}) {
  const isLocked = new Date() >= new Date(match.kickoffTimeUTC);
  const [homeScore, setHomeScore] = useState(existing?.predictedHomeScore?.toString() ?? "");
  const [awayScore, setAwayScore] = useState(existing?.predictedAwayScore?.toString() ?? "");

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

  let winner = "";
  let homeActive = false, awayActive = false, drawActive = false;
  if (bothEntered) {
    if (hs > as_) { winner = homeDisplay; homeActive = true; }
    else if (as_ > hs) { winner = awayDisplay; awayActive = true; }
    else { winner = "draw"; drawActive = true; }
  }

  return (
    <div className={`bg-gray-900 border rounded-xl p-4 ${isLocked ? "border-gray-700 opacity-60" : "border-gray-800"}`}>
      <div className="flex justify-between mb-2 text-xs text-gray-500">
        <span>{match.group ? `Group ${match.group} · ` : ""}{match.round}</span>
        <span>{formatKickoff(match.kickoffTimeUTC)}</span>
      </div>

      <div className="flex items-center gap-3 my-3">
        <div className={`flex-1 text-center py-2 rounded-lg font-semibold text-sm transition-colors ${homeActive ? "bg-green-600 text-white" : drawActive || awayActive ? "bg-gray-800 text-gray-500" : "bg-gray-800 text-gray-300"}`}>
          {homeDisplay}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <input type="number" min={0} max={20} disabled={isLocked} value={homeScore}
            onChange={(e) => setHomeScore(e.target.value)}
            className="w-10 text-center bg-gray-800 border border-gray-700 rounded py-1 text-sm disabled:opacity-40 focus:border-green-500 focus:outline-none" placeholder="0" />
          <span className={`text-sm font-bold px-0.5 ${drawActive ? "text-yellow-400" : "text-gray-600"}`}>–</span>
          <input type="number" min={0} max={20} disabled={isLocked} value={awayScore}
            onChange={(e) => setAwayScore(e.target.value)}
            className="w-10 text-center bg-gray-800 border border-gray-700 rounded py-1 text-sm disabled:opacity-40 focus:border-green-500 focus:outline-none" placeholder="0" />
        </div>

        <div className={`flex-1 text-center py-2 rounded-lg font-semibold text-sm transition-colors ${awayActive ? "bg-green-600 text-white" : drawActive || homeActive ? "bg-gray-800 text-gray-500" : "bg-gray-800 text-gray-300"}`}>
          {awayDisplay}
        </div>
      </div>

      {drawActive && !isLocked && <p className="text-center text-xs text-yellow-400 -mt-1 mb-2">Draw</p>}

      {isLocked ? (
        <p className="text-center text-xs text-red-400">🔒 Predictions locked</p>
      ) : (
        <>
          {!bothEntered && <p className="text-center text-xs text-gray-600 mb-1">Enter both scores to submit</p>}
          <button disabled={!bothEntered || submitting} onClick={() => onSubmit(winner, hs, as_)}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold py-2 rounded-lg text-sm transition-colors">
            {submitting ? "Saving..." : existing ? "Update Prediction" : "Submit Prediction"}
          </button>
        </>
      )}

      {existing && !isLocked && (
        <p className="text-center text-xs text-gray-500 mt-1">
          Saved: <span className="text-green-400">{existing.predictedWinner}</span>
          {existing.predictedHomeScore !== null ? ` · ${existing.predictedHomeScore}–${existing.predictedAwayScore}` : ""}
        </p>
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
