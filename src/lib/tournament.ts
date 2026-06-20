// Isolation invariant for the core game.
//
// The `matches` collection holds ONLY the men's 2026 FIFA World Cup. The
// scoring engine and the bracket read exclusively from it, so the leaderboard
// and bracket can never be affected by other data.
//
// Any historical / international data we pull for the prediction engine
// (qualifiers, friendlies, past tournaments) MUST be written to a SEPARATE
// collection (e.g. `intlMatches`) and used only to build team stat profiles —
// never into `matches`, and never read by scoring or the bracket.
export const WC2026_TOURNAMENT = "fifa.world.2026";

// True for a World Cup 2026 match. Untagged docs are treated as WC 2026 so
// legacy data synced before tagging still scores; anything explicitly tagged
// as another tournament is excluded.
export function isWorldCup2026(match: { tournament?: string }): boolean {
  return match.tournament === undefined || match.tournament === WC2026_TOURNAMENT;
}
