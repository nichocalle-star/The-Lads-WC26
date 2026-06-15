// Global prediction deadline. Every pick across the whole tournament locks at
// this moment at the latest, no matter when the match itself kicks off.
// June 15, 2026 · 1:00 AM ET (EDT = UTC-4) → 05:00 UTC.
export const PREDICTIONS_LOCK_UTC = "2026-06-15T05:00:00Z";

type LockableMatch = { lockTimeUTC?: string; kickoffTimeUTC: string };

// A match locks at the earlier of its own kickoff/lock time or the global
// deadline — so games already underway stay locked, and everything is sealed
// once the global deadline passes.
export function effectiveLockMs(match: LockableMatch): number {
  const perMatch = new Date(match.lockTimeUTC ?? match.kickoffTimeUTC).getTime();
  const global = new Date(PREDICTIONS_LOCK_UTC).getTime();
  return Math.min(perMatch, global);
}

export function isMatchLocked(match: LockableMatch, now: number = Date.now()): boolean {
  return now >= effectiveLockMs(match);
}
