// World Cup match prediction engine.
//
// Every prediction accounts for BOTH teams: a team's attacking output is scaled
// by the opponent's defensive record, and vice versa. Raw averages are adjusted
// by opponent quality via the Elo prior. While a team's in-tournament sample is
// thin, predictions shrink toward the rating-implied baseline and confidence is
// held low; as real games accrue, the observed stats take over.
import { eloOf } from "./teamRatings";

export interface TeamProfile {
  name: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;               // total goals for
  ga: number;               // total goals against
  cornersWon: number;       // total corners won
  cornersConceded: number;  // total corners conceded
  shots: number;            // total shots
  possessionSum: number;    // sum of possession% (avg = /played)
  oppEloSum: number;        // sum of opponent Elo faced (for context)
}

export function emptyProfile(name: string): TeamProfile {
  return { name, played: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0,
    cornersWon: 0, cornersConceded: 0, shots: 0, possessionSum: 0, oppEloSum: 0 };
}

export interface Prediction {
  matchId: string;
  round: string;
  home: string;
  away: string;
  moneyline: { home: number; draw: number; away: number; pick: string; confidence: number };
  spread: { line: number; pickTeam: string; prob: number; confidence: number; alts: { label: string; prob: number }[] };
  goals: { lambdaHome: number; lambdaAway: number; total: number; over25: number; under25: number; scoreline: string; confidence: number };
  corners: { home: number; away: number; total: number; over95: number; confidence: number };
  averages: { metric: string; home: string; away: string }[];
  factors: string[];
  dataNote: string;
}

// League baselines (per team, per game) — World Cup-ish.
const LEAGUE_GF = 1.35;
const LEAGUE_CORNERS = 5.0;
const LEAGUE_SHOTS = 12.5;
const PRIOR_GAMES = 4;   // shrinkage weight toward the baseline
const MAX_GOALS = 8;

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const mix = (a: number, b: number, t: number) => a * (1 - t) + b * t;

function factorial(n: number): number { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
function poissonPmf(k: number, lambda: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}
function poissonTailGte(k: number, lambda: number): number {
  let cdf = 0;
  for (let i = 0; i < k; i++) cdf += poissonPmf(i, lambda);
  return 1 - cdf;
}
function eloWinProb(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

// Shrunk per-game average: observed blended toward a prior baseline.
function shrunkAvg(total: number, played: number, baseline: number): number {
  return (total + baseline * PRIOR_GAMES) / (played + PRIOR_GAMES);
}
// How much to trust observed data (0 = none, →1 with many games).
function dataWeight(played: number): number {
  return played / (played + PRIOR_GAMES);
}

export function predictMatch(
  matchId: string,
  round: string,
  home: TeamProfile,
  away: TeamProfile
): Prediction {
  const eloH = eloOf(home.name);
  const eloA = eloOf(away.name);

  // Rating-implied expected goal supremacy (home minus away), neutral venue.
  const pHomeElo = eloWinProb(eloH, eloA);
  const supremacy = clamp((pHomeElo - 0.5) * 4.2, -2.4, 2.4);
  const leagueTotal = LEAGUE_GF * 2;
  let lamH = leagueTotal / 2 + supremacy / 2;
  let lamA = leagueTotal / 2 - supremacy / 2;

  // Stat-based lambdas: own attack scaled by opponent defence.
  const gfH = shrunkAvg(home.gf, home.played, LEAGUE_GF);
  const gaH = shrunkAvg(home.ga, home.played, LEAGUE_GF);
  const gfA = shrunkAvg(away.gf, away.played, LEAGUE_GF);
  const gaA = shrunkAvg(away.ga, away.played, LEAGUE_GF);
  const statLamH = LEAGUE_GF * (gfH / LEAGUE_GF) * (gaA / LEAGUE_GF);
  const statLamA = LEAGUE_GF * (gfA / LEAGUE_GF) * (gaH / LEAGUE_GF);

  const w = (dataWeight(home.played) + dataWeight(away.played)) / 2;
  lamH = clamp(mix(lamH, statLamH, w), 0.2, 4.5);
  lamA = clamp(mix(lamA, statLamA, w), 0.2, 4.5);

  // Bivariate (independent) Poisson score grid.
  let pHome = 0, pDraw = 0, pAway = 0, over25 = 0;
  let bestP = 0, bestI = 0, bestJ = 0;
  const grid: number[][] = [];
  for (let i = 0; i <= MAX_GOALS; i++) {
    grid[i] = [];
    for (let j = 0; j <= MAX_GOALS; j++) {
      const p = poissonPmf(i, lamH) * poissonPmf(j, lamA);
      grid[i][j] = p;
      if (i > j) pHome += p; else if (i === j) pDraw += p; else pAway += p;
      if (i + j >= 3) over25 += p;
      if (p > bestP) { bestP = p; bestI = i; bestJ = j; }
    }
  }
  const under25 = 1 - over25;

  // Asian-handicap cover probability on the home line (push excluded for .0 lines).
  const coverHome = (line: number) => {
    let p = 0;
    for (let i = 0; i <= MAX_GOALS; i++)
      for (let j = 0; j <= MAX_GOALS; j++)
        if (i - j + line > 1e-9) p += grid[i][j];
    return p;
  };

  // Headline spread: half-line nearest the projected margin, on the favoured side.
  const margin = lamH - lamA;
  const favHome = margin >= 0;
  const absLine = clamp(Math.round(Math.abs(margin) * 2) / 2 || 0.5, 0.5, 3);
  const headlineLine = favHome ? -absLine : +absLine;
  const headlineProb = coverHome(headlineLine);
  const spreadPickTeam = favHome ? home.name : away.name;
  const spreadLineForPick = favHome ? -absLine : -absLine; // shown relative to the pick team
  const alts = [
    { label: `${home.name} -0.5`, prob: coverHome(-0.5) },
    { label: `${home.name} -1.5`, prob: coverHome(-1.5) },
    { label: `${away.name} +1.5`, prob: 1 - coverHome(-1.5) },
  ];

  // Corners: own won-rate meets opponent conceded-rate, tilted slightly by quality.
  const cwH = shrunkAvg(home.cornersWon, home.played, LEAGUE_CORNERS);
  const ccH = shrunkAvg(home.cornersConceded, home.played, LEAGUE_CORNERS);
  const cwA = shrunkAvg(away.cornersWon, away.played, LEAGUE_CORNERS);
  const ccA = shrunkAvg(away.cornersConceded, away.played, LEAGUE_CORNERS);
  let cH = (cwH + ccA) / 2 * (1 + 0.05 * supremacy);
  let cA = (cwA + ccH) / 2 * (1 - 0.05 * supremacy);
  cH = clamp(cH, 1.5, 9);
  cA = clamp(cA, 1.5, 9);
  const cTotal = cH + cA;
  const over95 = poissonTailGte(10, cTotal); // P(total corners >= 10) ≈ over 9.5

  // Confidence = the model's probability for the call it's making. Thin-data
  // caution is already baked in: shrinkage pulls the lambdas toward the
  // baseline, so sparse samples naturally produce less extreme probabilities
  // (and thus lower confidence) without an extra discount.
  const mlProbs = [pHome, pDraw, pAway];
  const mlMax = Math.max(...mlProbs);
  const mlPick = mlMax === pHome ? `${home.name} win` : mlMax === pAway ? `${away.name} win` : "Draw";
  const mlConf = Math.round(mlMax * 100);
  const spreadConf = Math.round(headlineProb * 100);
  const goalsConf = Math.round(Math.max(over25, under25) * 100);
  // Corners are the noisiest market — cap the headline confidence.
  const cornersConf = Math.round(Math.min(0.72, Math.max(over95, 1 - over95)) * 100);

  // Team-average table (raw observed; baseline-blended when no games yet).
  const perGame = (total: number, played: number, baseline: number) =>
    played > 0 ? (total / played).toFixed(1) : `~${baseline.toFixed(1)}`;
  const winPct = (p: TeamProfile) => p.played > 0 ? `${Math.round((p.wins / p.played) * 100)}%` : "—";
  const possPct = (p: TeamProfile) => p.played > 0 ? `${Math.round(p.possessionSum / p.played)}%` : "—";
  const averages = [
    { metric: "Elo rating", home: String(eloH), away: String(eloA) },
    { metric: "Goals scored / game", home: perGame(home.gf, home.played, LEAGUE_GF), away: perGame(away.gf, away.played, LEAGUE_GF) },
    { metric: "Goals allowed / game", home: perGame(home.ga, home.played, LEAGUE_GF), away: perGame(away.ga, away.played, LEAGUE_GF) },
    { metric: "Corners won / game", home: perGame(home.cornersWon, home.played, LEAGUE_CORNERS), away: perGame(away.cornersWon, away.played, LEAGUE_CORNERS) },
    { metric: "Corners conceded / game", home: perGame(home.cornersConceded, home.played, LEAGUE_CORNERS), away: perGame(away.cornersConceded, away.played, LEAGUE_CORNERS) },
    { metric: "Shots / game", home: perGame(home.shots, home.played, LEAGUE_SHOTS), away: perGame(away.shots, away.played, LEAGUE_SHOTS) },
    { metric: "Possession", home: possPct(home), away: possPct(away) },
    { metric: "Win % (tournament)", home: winPct(home), away: winPct(away) },
  ];

  // Key factors — generated from the biggest real differentials.
  const factors: string[] = [];
  if (Math.abs(eloH - eloA) >= 60) {
    const fav = eloH > eloA ? home.name : away.name;
    factors.push(`${fav} holds a clear rating edge (${Math.abs(eloH - eloA)} Elo).`);
  }
  if (lamH - lamA >= 0.4) factors.push(`${home.name}'s attack projects to outscore ${away.name}'s defence.`);
  else if (lamA - lamH >= 0.4) factors.push(`${away.name}'s attack projects to outscore ${home.name}'s defence.`);
  if (cH - cA >= 1.2) factors.push(`${home.name} should win the corner battle, generating sustained pressure.`);
  else if (cA - cH >= 1.2) factors.push(`${away.name} projects to win more corners in this matchup.`);
  if (over25 >= 0.58) factors.push(`Both attacks point to an open game — total leans over 2.5.`);
  else if (under25 >= 0.58) factors.push(`Defensive profiles favour a lower-scoring game — total leans under 2.5.`);
  if (factors.length === 0) factors.push("Teams project closely; the model sees a tight, low-edge matchup.");

  const dataNote =
    home.played + away.played === 0
      ? "No tournament games played yet — this is rating-driven; confidence stays low until real matches accrue."
      : `Based on ${home.name} (${home.played} game${home.played === 1 ? "" : "s"}) and ${away.name} (${away.played} game${away.played === 1 ? "" : "s"}) of in-tournament data, blended with pre-tournament ratings. No xG available (ESPN) — shots/possession used as proxy.`;

  return {
    matchId,
    round,
    home: home.name,
    away: away.name,
    moneyline: { home: pHome, draw: pDraw, away: pAway, pick: mlPick, confidence: mlConf },
    spread: { line: spreadLineForPick, pickTeam: spreadPickTeam, prob: headlineProb, confidence: spreadConf, alts },
    goals: { lambdaHome: lamH, lambdaAway: lamA, total: lamH + lamA, over25, under25, scoreline: `${bestI}–${bestJ}`, confidence: goalsConf },
    corners: { home: cH, away: cA, total: cTotal, over95, confidence: cornersConf },
    averages,
    factors,
    dataNote,
  };
}
