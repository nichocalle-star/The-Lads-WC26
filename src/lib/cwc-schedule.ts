import { Match } from "./types";

// FIFA Club World Cup 2025 – Full Group Stage Schedule
// Tournament runs June 14 – July 13, 2026 in the United States.
// All kickoff times are UTC. Dates are approximate for early seeding;
// exact times can be corrected via the Admin panel.
export const CWC_MATCHES: Omit<Match, "status" | "homeScore" | "awayScore" | "winner">[] = [

  // ── GROUP A: Al Ahly · Inter Miami · Palmeiras · Porto ──
  { matchId: "cwc-a1", homeTeam: "Inter Miami", awayTeam: "Al Ahly",   round: "Group Stage", group: "A", venue: "Hard Rock Stadium, Miami",          kickoffTimeUTC: "2026-06-14T23:00:00Z" },
  { matchId: "cwc-a2", homeTeam: "Palmeiras",   awayTeam: "Porto",     round: "Group Stage", group: "A", venue: "MetLife Stadium, New Jersey",        kickoffTimeUTC: "2026-06-15T02:00:00Z" },
  { matchId: "cwc-a3", homeTeam: "Inter Miami", awayTeam: "Palmeiras", round: "Group Stage", group: "A", venue: "Hard Rock Stadium, Miami",          kickoffTimeUTC: "2026-06-19T02:00:00Z" },
  { matchId: "cwc-a4", homeTeam: "Porto",       awayTeam: "Al Ahly",   round: "Group Stage", group: "A", venue: "MetLife Stadium, New Jersey",        kickoffTimeUTC: "2026-06-19T02:00:00Z" },
  { matchId: "cwc-a5", homeTeam: "Porto",       awayTeam: "Inter Miami",round: "Group Stage", group: "A", venue: "MetLife Stadium, New Jersey",        kickoffTimeUTC: "2026-06-23T01:00:00Z" },
  { matchId: "cwc-a6", homeTeam: "Al Ahly",     awayTeam: "Palmeiras", round: "Group Stage", group: "A", venue: "Hard Rock Stadium, Miami",          kickoffTimeUTC: "2026-06-23T01:00:00Z" },

  // ── GROUP B: PSG · Atlético de Madrid · Botafogo · Seattle Sounders ──
  { matchId: "cwc-b1", homeTeam: "PSG",                awayTeam: "Atlético de Madrid", round: "Group Stage", group: "B", venue: "Rose Bowl, Los Angeles",    kickoffTimeUTC: "2026-06-15T19:00:00Z" },
  { matchId: "cwc-b2", homeTeam: "Botafogo",           awayTeam: "Seattle Sounders",   round: "Group Stage", group: "B", venue: "Lumen Field, Seattle",       kickoffTimeUTC: "2026-06-16T02:00:00Z" },
  { matchId: "cwc-b3", homeTeam: "PSG",                awayTeam: "Seattle Sounders",   round: "Group Stage", group: "B", venue: "Rose Bowl, Los Angeles",    kickoffTimeUTC: "2026-06-19T23:00:00Z" },
  { matchId: "cwc-b4", homeTeam: "Atlético de Madrid", awayTeam: "Botafogo",           round: "Group Stage", group: "B", venue: "Lumen Field, Seattle",       kickoffTimeUTC: "2026-06-20T02:00:00Z" },
  { matchId: "cwc-b5", homeTeam: "Atlético de Madrid", awayTeam: "Seattle Sounders",   round: "Group Stage", group: "B", venue: "Lumen Field, Seattle",       kickoffTimeUTC: "2026-06-23T22:00:00Z" },
  { matchId: "cwc-b6", homeTeam: "Botafogo",           awayTeam: "PSG",                round: "Group Stage", group: "B", venue: "Rose Bowl, Los Angeles",    kickoffTimeUTC: "2026-06-24T01:00:00Z" },

  // ── GROUP C: Bayern Munich · Auckland City · Boca Juniors · Benfica ──
  { matchId: "cwc-c1", homeTeam: "Bayern Munich", awayTeam: "Auckland City", round: "Group Stage", group: "C", venue: "Bank of America Stadium, Charlotte", kickoffTimeUTC: "2026-06-15T23:00:00Z" },
  { matchId: "cwc-c2", homeTeam: "Boca Juniors",  awayTeam: "Benfica",      round: "Group Stage", group: "C", venue: "Hard Rock Stadium, Miami",          kickoffTimeUTC: "2026-06-16T00:00:00Z" },
  { matchId: "cwc-c3", homeTeam: "Bayern Munich", awayTeam: "Boca Juniors", round: "Group Stage", group: "C", venue: "Bank of America Stadium, Charlotte", kickoffTimeUTC: "2026-06-20T02:00:00Z" },
  { matchId: "cwc-c4", homeTeam: "Benfica",       awayTeam: "Auckland City",round: "Group Stage", group: "C", venue: "Hard Rock Stadium, Miami",          kickoffTimeUTC: "2026-06-20T00:00:00Z" },
  { matchId: "cwc-c5", homeTeam: "Benfica",       awayTeam: "Bayern Munich",round: "Group Stage", group: "C", venue: "Hard Rock Stadium, Miami",          kickoffTimeUTC: "2026-06-24T00:00:00Z" },
  { matchId: "cwc-c6", homeTeam: "Auckland City", awayTeam: "Boca Juniors", round: "Group Stage", group: "C", venue: "Bank of America Stadium, Charlotte", kickoffTimeUTC: "2026-06-24T00:00:00Z" },

  // ── GROUP D: Chelsea · Flamengo · ES Tunis · Club León ──
  { matchId: "cwc-d1", homeTeam: "Chelsea",   awayTeam: "Club León",  round: "Group Stage", group: "D", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-16T19:00:00Z" },
  { matchId: "cwc-d2", homeTeam: "Flamengo",  awayTeam: "ES Tunis",   round: "Group Stage", group: "D", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-16T23:00:00Z" },
  { matchId: "cwc-d3", homeTeam: "Chelsea",   awayTeam: "Flamengo",   round: "Group Stage", group: "D", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-21T00:00:00Z" },
  { matchId: "cwc-d4", homeTeam: "ES Tunis",  awayTeam: "Club León",  round: "Group Stage", group: "D", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-21T00:00:00Z" },
  { matchId: "cwc-d5", homeTeam: "ES Tunis",  awayTeam: "Chelsea",    round: "Group Stage", group: "D", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-25T00:00:00Z" },
  { matchId: "cwc-d6", homeTeam: "Club León", awayTeam: "Flamengo",   round: "Group Stage", group: "D", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-25T00:00:00Z" },

  // ── GROUP E: River Plate · Urawa Red Diamonds · Monterrey · Inter Milan ──
  { matchId: "cwc-e1", homeTeam: "River Plate",          awayTeam: "Urawa Red Diamonds", round: "Group Stage", group: "E", venue: "Lumen Field, Seattle",   kickoffTimeUTC: "2026-06-17T00:00:00Z" },
  { matchId: "cwc-e2", homeTeam: "Inter Milan",          awayTeam: "Monterrey",          round: "Group Stage", group: "E", venue: "Rose Bowl, Los Angeles", kickoffTimeUTC: "2026-06-17T02:00:00Z" },
  { matchId: "cwc-e3", homeTeam: "River Plate",          awayTeam: "Inter Milan",        round: "Group Stage", group: "E", venue: "Lumen Field, Seattle",   kickoffTimeUTC: "2026-06-21T23:00:00Z" },
  { matchId: "cwc-e4", homeTeam: "Monterrey",            awayTeam: "Urawa Red Diamonds", round: "Group Stage", group: "E", venue: "Rose Bowl, Los Angeles", kickoffTimeUTC: "2026-06-22T02:00:00Z" },
  { matchId: "cwc-e5", homeTeam: "Monterrey",            awayTeam: "River Plate",        round: "Group Stage", group: "E", venue: "Rose Bowl, Los Angeles", kickoffTimeUTC: "2026-06-26T00:00:00Z" },
  { matchId: "cwc-e6", homeTeam: "Urawa Red Diamonds",   awayTeam: "Inter Milan",        round: "Group Stage", group: "E", venue: "Lumen Field, Seattle",   kickoffTimeUTC: "2026-06-26T00:00:00Z" },

  // ── GROUP F: Fluminense · Borussia Dortmund · Ulsan HD · Mamelodi Sundowns ──
  { matchId: "cwc-f1", homeTeam: "Borussia Dortmund",    awayTeam: "Fluminense",         round: "Group Stage", group: "F", venue: "Nashville Stadium",      kickoffTimeUTC: "2026-06-17T23:00:00Z" },
  { matchId: "cwc-f2", homeTeam: "Ulsan HD",             awayTeam: "Mamelodi Sundowns",  round: "Group Stage", group: "F", venue: "Nashville Stadium",      kickoffTimeUTC: "2026-06-18T02:00:00Z" },
  { matchId: "cwc-f3", homeTeam: "Borussia Dortmund",    awayTeam: "Ulsan HD",           round: "Group Stage", group: "F", venue: "Nashville Stadium",      kickoffTimeUTC: "2026-06-22T00:00:00Z" },
  { matchId: "cwc-f4", homeTeam: "Fluminense",           awayTeam: "Mamelodi Sundowns",  round: "Group Stage", group: "F", venue: "Nashville Stadium",      kickoffTimeUTC: "2026-06-22T00:00:00Z" },
  { matchId: "cwc-f5", homeTeam: "Mamelodi Sundowns",    awayTeam: "Borussia Dortmund",  round: "Group Stage", group: "F", venue: "Nashville Stadium",      kickoffTimeUTC: "2026-06-26T22:00:00Z" },
  { matchId: "cwc-f6", homeTeam: "Fluminense",           awayTeam: "Ulsan HD",           round: "Group Stage", group: "F", venue: "Nashville Stadium",      kickoffTimeUTC: "2026-06-26T22:00:00Z" },

  // ── GROUP G: Manchester City · Wydad AC · Al-Ain · Juventus ──
  { matchId: "cwc-g1", homeTeam: "Manchester City", awayTeam: "Wydad AC",        round: "Group Stage", group: "G", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-18T00:00:00Z" },
  { matchId: "cwc-g2", homeTeam: "Juventus",        awayTeam: "Al-Ain",          round: "Group Stage", group: "G", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-18T23:00:00Z" },
  { matchId: "cwc-g3", homeTeam: "Manchester City", awayTeam: "Juventus",        round: "Group Stage", group: "G", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-23T00:00:00Z" },
  { matchId: "cwc-g4", homeTeam: "Al-Ain",          awayTeam: "Wydad AC",        round: "Group Stage", group: "G", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-23T00:00:00Z" },
  { matchId: "cwc-g5", homeTeam: "Al-Ain",          awayTeam: "Manchester City", round: "Group Stage", group: "G", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-27T00:00:00Z" },
  { matchId: "cwc-g6", homeTeam: "Wydad AC",        awayTeam: "Juventus",        round: "Group Stage", group: "G", venue: "Lincoln Financial Field, Philadelphia", kickoffTimeUTC: "2026-06-27T00:00:00Z" },

  // ── GROUP H: Real Madrid · Al-Hilal · Pachuca · Red Bull Salzburg ──
  { matchId: "cwc-h1", homeTeam: "Real Madrid", awayTeam: "Al-Hilal",  round: "Group Stage", group: "H", venue: "Hard Rock Stadium, Miami",   kickoffTimeUTC: "2026-06-18T23:00:00Z" },
  { matchId: "cwc-h2", homeTeam: "Pachuca",     awayTeam: "Salzburg",  round: "Group Stage", group: "H", venue: "MetLife Stadium, New Jersey", kickoffTimeUTC: "2026-06-18T02:00:00Z" },
  { matchId: "cwc-h3", homeTeam: "Real Madrid", awayTeam: "Pachuca",   round: "Group Stage", group: "H", venue: "Hard Rock Stadium, Miami",   kickoffTimeUTC: "2026-06-23T00:00:00Z" },
  { matchId: "cwc-h4", homeTeam: "Salzburg",    awayTeam: "Al-Hilal",  round: "Group Stage", group: "H", venue: "MetLife Stadium, New Jersey", kickoffTimeUTC: "2026-06-23T00:00:00Z" },
  { matchId: "cwc-h5", homeTeam: "Salzburg",    awayTeam: "Real Madrid",round: "Group Stage", group: "H", venue: "MetLife Stadium, New Jersey", kickoffTimeUTC: "2026-06-27T00:00:00Z" },
  { matchId: "cwc-h6", homeTeam: "Al-Hilal",    awayTeam: "Pachuca",   round: "Group Stage", group: "H", venue: "Hard Rock Stadium, Miami",   kickoffTimeUTC: "2026-06-27T00:00:00Z" },
];
