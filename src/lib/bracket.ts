// Shared bracket resolution: turns a user's group-stage + knockout predictions
// into resolved team names for any slot in the tournament. Used both client-side
// (predictions page) and server-side (leaderboard / admin APIs) so the predicted
// champion etc. are computed identically everywhere.

import { Match, Prediction } from "./types";

export interface TeamRow { team: string; w: number; d: number; l: number; gf: number; ga: number; pts: number }

export function calcGroupStandings(groupMatches: Match[], predictions: Record<string, Prediction>): TeamRow[] {
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

// "W:espn-XXXXXX" = winner of that match. Slots chain through the whole bracket.
export const BRACKET_MAP: Record<string, { home: string; away: string }> = {
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
  "espn-760502": { home: "W:espn-760486", away: "W:espn-760489" },
  "espn-760503": { home: "W:espn-760487", away: "W:espn-760490" },
  "espn-760504": { home: "W:espn-760488", away: "W:espn-760492" },
  "espn-760505": { home: "W:espn-760491", away: "W:espn-760495" },
  "espn-760506": { home: "W:espn-760497", away: "W:espn-760496" },
  "espn-760507": { home: "W:espn-760493", away: "W:espn-760494" },
  "espn-760509": { home: "W:espn-760499", away: "W:espn-760501" },
  "espn-760508": { home: "W:espn-760498", away: "W:espn-760500" },
  // Quarter-finals — winners of specific R16 matches
  "espn-760510": { home: "W:espn-760502", away: "W:espn-760503" },
  "espn-760511": { home: "W:espn-760506", away: "W:espn-760507" },
  "espn-760512": { home: "W:espn-760504", away: "W:espn-760505" },
  "espn-760513": { home: "W:espn-760509", away: "W:espn-760508" },
  // Semi-finals
  "espn-760514": { home: "W:espn-760510", away: "W:espn-760511" },
  "espn-760515": { home: "W:espn-760512", away: "W:espn-760513" },
  // 3rd Place
  "espn-760516": { home: "L:espn-760514", away: "L:espn-760515" },
  // Final
  "espn-760517": { home: "W:espn-760514", away: "W:espn-760515" },
};

export const FINAL_MATCH_ID = "espn-760517";

export function calcThirdPlaceQualifiers(groupStandings: Record<string, TeamRow[]>): TeamRow[] {
  const thirds: TeamRow[] = [];
  for (const rows of Object.values(groupStandings)) {
    if (rows[2]) thirds.push(rows[2]);
  }
  return thirds
    .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf)
    .slice(0, 8);
}

export function resolveSlot(
  slot: string,
  standings: Record<string, TeamRow[]>,
  thirdPlace: TeamRow[],
  predictions: Record<string, Prediction>
): string {
  if (slot.startsWith("W:")) return resolveMatchWinner(slot.slice(2), standings, thirdPlace, predictions);
  if (slot.startsWith("L:")) return resolveMatchLoser(slot.slice(2), standings, thirdPlace, predictions);
  if (slot.startsWith("3rd_")) {
    const rank = parseInt(slot.replace("3rd_", "")) - 1;
    return thirdPlace[rank]?.team ?? `3rd-Place #${rank + 1}`;
  }
  const [group, posStr] = slot.split("_");
  const pos = parseInt(posStr) - 1;
  return standings[group]?.[pos]?.team ?? `Group ${group} #${pos + 1}`;
}

export function resolveMatchWinner(
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

export function resolveMatchLoser(
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

// Build per-group standings from a flat match list + a user's predictions.
export function buildStandings(
  matches: Match[],
  predictions: Record<string, Prediction>
): { standings: Record<string, TeamRow[]>; thirdPlace: TeamRow[] } {
  const groupMatches = matches.filter((m) => m.round === "Group Stage");
  const groups = [...new Set(groupMatches.map((m) => m.group).filter(Boolean))] as string[];
  const standings: Record<string, TeamRow[]> = {};
  for (const g of groups) {
    standings[g] = calcGroupStandings(groupMatches.filter((m) => m.group === g), predictions);
  }
  return { standings, thirdPlace: calcThirdPlaceQualifiers(standings) };
}

// Resolve a single match's two sides to display names from a user's predictions.
// Group-stage matches use the real teams on the match doc; knockout matches
// resolve their bracket slots through the user's predicted standings.
export function resolveMatchTeams(
  match: Match,
  standings: Record<string, TeamRow[]>,
  thirdPlace: TeamRow[],
  predictions: Record<string, Prediction>
): { home: string; away: string } {
  const slots = BRACKET_MAP[match.matchId];
  if (!slots) return { home: match.homeTeam, away: match.awayTeam };
  return {
    home: resolveSlot(slots.home, standings, thirdPlace, predictions),
    away: resolveSlot(slots.away, standings, thirdPlace, predictions),
  };
}

// A user's predicted champion = resolved winner of the Final, derived from their
// own group-stage + knockout predictions. Returns null if not resolvable to a
// single real team yet (e.g. they haven't predicted enough of the bracket).
export function resolveChampion(
  matches: Match[],
  predictions: Record<string, Prediction>
): string | null {
  if (!predictions[FINAL_MATCH_ID]) return null;
  const { standings, thirdPlace } = buildStandings(matches, predictions);
  const champ = resolveMatchWinner(FINAL_MATCH_ID, standings, thirdPlace, predictions);
  // Unresolved slots look like "Group C #1", "3rd-Place #2", "X / Y", or "?".
  if (!champ || champ === "?" || champ.includes("/") || champ.includes("#")) return null;
  return champ;
}
