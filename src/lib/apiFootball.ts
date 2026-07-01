// API-Football (v3.football.api-sports.io) client for betting odds.
// Free plan note: the league+season fixtures query is blocked for 2026, but the
// /fixtures?date= query and /odds work, so we map fixtures by date.
import type { Firestore } from "firebase-admin/firestore";
import { isWorldCup2026 } from "./tournament";

const AF_HOST = process.env.API_FOOTBALL_HOST || "v3.football.api-sports.io";
const AF_KEY = process.env.API_FOOTBALL_KEY || "";
const WC_LEAGUE_ID = 1; // World Cup on API-Football

// Bet type IDs (from /odds/bets): 1 = Match Winner (1X2), 10 = Exact Score.
const BET_MATCH_WINNER = 1;
const BET_EXACT_SCORE = 10;

async function afFetch(path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`https://${AF_HOST}${path}`, { headers: { "x-apisports-key": AF_KEY } });
  return (await res.json()) as Record<string, unknown>;
}

// Normalize a team name to a comparable token: strip accents/punctuation, then
// fold a few known ESPN⇄API-Football spelling differences to a shared canonical.
const TEAM_ALIAS: Record<string, string> = {
  unitedstates: "usa", usa: "usa",
  southkorea: "korearepublic", korearepublic: "korearepublic",
  czechia: "czechrepublic", czechrepublic: "czechrepublic",
  turkiye: "turkey", turkey: "turkey",
  ivorycoast: "ivorycoast", cotedivoire: "ivorycoast",
  congodr: "congodr", drcongo: "congodr",
};
function canonTeam(name: string): string {
  const n = (name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return TEAM_ALIAS[n] ?? n;
}

interface AfFixture { id: number; home: string; away: string; }
async function fetchWcFixturesByDate(date: string): Promise<AfFixture[]> {
  const data = await afFetch(`/fixtures?date=${date}`);
  const resp = (data.response as Record<string, unknown>[]) ?? [];
  return resp
    .filter((f) => ((f.league as Record<string, unknown>)?.id) === WC_LEAGUE_ID)
    .map((f) => {
      const teams = f.teams as Record<string, Record<string, unknown>>;
      return { id: ((f.fixture as Record<string, unknown>).id) as number, home: teams.home.name as string, away: teams.away.name as string };
    });
}

export interface WagerOdds {
  updatedAt: string;
  bookmaker: string | null;
  matchWinner: { home: number | null; draw: number | null; away: number | null };
  exactScore: { score: string; odd: number }[];
}

function parseOdds(oddsResp: Record<string, unknown>): WagerOdds | null {
  const resp = (oddsResp.response as Record<string, unknown>[]) ?? [];
  const first = resp[0];
  if (!first) return null;
  const bookmakers = (first.bookmakers as Record<string, unknown>[]) ?? [];

  const getBet = (bk: Record<string, unknown>, id: number) =>
    ((bk.bets as Record<string, unknown>[]) ?? []).find((b) => (b.id as number) === id);

  // Prefer a single bookmaker that has both markets; fall back per-market.
  let bookmaker: string | null = null;
  let mwBet: Record<string, unknown> | undefined;
  let esBet: Record<string, unknown> | undefined;
  for (const bk of bookmakers) {
    const mw = getBet(bk, BET_MATCH_WINNER);
    const es = getBet(bk, BET_EXACT_SCORE);
    if (mw && es) { mwBet = mw; esBet = es; bookmaker = bk.name as string; break; }
  }
  if (!mwBet) { for (const bk of bookmakers) { const b = getBet(bk, BET_MATCH_WINNER); if (b) { mwBet = b; bookmaker = bookmaker ?? (bk.name as string); break; } } }
  if (!esBet) { for (const bk of bookmakers) { const b = getBet(bk, BET_EXACT_SCORE); if (b) { esBet = b; break; } } }

  const mwVals = (mwBet?.values as Record<string, string>[]) ?? [];
  const pick = (label: string) => {
    const v = mwVals.find((x) => String(x.value).toLowerCase() === label);
    return v ? parseFloat(v.odd) : null;
  };
  const exactScore = ((esBet?.values as Record<string, string>[]) ?? [])
    .map((v) => ({ score: String(v.value), odd: parseFloat(v.odd) }))
    .filter((v) => /^\d+:\d+$/.test(v.score) && !isNaN(v.odd));

  return {
    updatedAt: new Date().toISOString(),
    bookmaker,
    matchWinner: { home: pick("home"), draw: pick("draw"), away: pick("away") },
    exactScore,
  };
}

const PLACEHOLDER = /(Winner|Loser|#|Group \w)/;
const REFRESH_MS = 3 * 60 * 60 * 1000; // odds update ~every 3h upstream

// Map our upcoming matches to API-Football fixtures (by date + both teams) and
// store Match Winner + Exact Score odds on each. Only touches upcoming matches
// with real (resolved) teams, and skips any refreshed within the last 3h.
export async function syncOddsCore(db: Firestore): Promise<{ mapped: number; oddsUpdated: number; unmatched: string[]; requests: number }> {
  if (!AF_KEY) throw new Error("API_FOOTBALL_KEY not set");

  const snap = await db.collection("matches").get();
  const now = Date.now();
  const matches = snap.docs
    .map((d) => ({ ref: d.ref, m: d.data() as Record<string, unknown> }))
    .filter(({ m }) => isWorldCup2026(m as { tournament?: string })
      && m.status !== "final"
      && new Date(m.kickoffTimeUTC as string).getTime() > now
      && !PLACEHOLDER.test(m.homeTeam as string) && !PLACEHOLDER.test(m.awayTeam as string));

  // Group by kickoff date so we hit /fixtures?date= once per matchday.
  const byDate: Record<string, typeof matches> = {};
  for (const item of matches) {
    const date = (item.m.kickoffTimeUTC as string).slice(0, 10);
    (byDate[date] ??= []).push(item);
  }

  let mapped = 0, oddsUpdated = 0, requests = 0;
  const unmatched: string[] = [];

  for (const [date, items] of Object.entries(byDate)) {
    const afFixtures = await fetchWcFixturesByDate(date);
    requests++;

    for (const { ref, m } of items) {
      const ch = canonTeam(m.homeTeam as string), ca = canonTeam(m.awayTeam as string);
      const fx = afFixtures.find((f) => {
        const fh = canonTeam(f.home), fa = canonTeam(f.away);
        return (fh === ch && fa === ca) || (fh === ca && fa === ch);
      });
      if (!fx) { unmatched.push(`${m.homeTeam} v ${m.awayTeam} (${date})`); continue; }

      const update: Record<string, unknown> = { apiFootballId: fx.id };
      mapped++;

      // Refresh odds unless we pulled them recently.
      const prev = m.wagerOdds as WagerOdds | undefined;
      const fresh = prev?.updatedAt && now - new Date(prev.updatedAt).getTime() < REFRESH_MS;
      if (!fresh) {
        const oddsResp = await afFetch(`/odds?fixture=${fx.id}`);
        requests++;
        const parsed = parseOdds(oddsResp);
        if (parsed) { update.wagerOdds = parsed; oddsUpdated++; }
      }
      await ref.set(update, { merge: true });
    }
  }

  return { mapped, oddsUpdated, unmatched, requests };
}
