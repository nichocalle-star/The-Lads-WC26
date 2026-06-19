// Pre-tournament strength prior (Elo-style) for the 48 World Cup 2026 teams.
// These are PRIORS, not the final word: the prediction engine blends them with
// the actual in-tournament stats a team produces, leaning on the prior only
// while real data is thin. Names must match the canonical names used in the
// synced match data (see TEAM_GROUP in api/sync-matches).
export const BASE_ELO: Record<string, number> = {
  // Top tier
  Argentina: 2085, France: 2075, Spain: 2070, Brazil: 2060, England: 2050,
  Portugal: 2035, Netherlands: 2010, Germany: 2005,
  // Strong
  Belgium: 1975, Croatia: 1965, Uruguay: 1960, Colombia: 1950, Morocco: 1945,
  Switzerland: 1925, Japan: 1915, Senegal: 1905, "United States": 1900,
  Mexico: 1895, Ecuador: 1890,
  // Mid
  Austria: 1875, Sweden: 1865, Norway: 1860, Australia: 1850, "South Korea": 1845,
  Iran: 1840, Egypt: 1835, "Ivory Coast": 1830, Algeria: 1825, "Türkiye": 1860,
  Scotland: 1820, Canada: 1840, Paraguay: 1815, Czechia: 1855, Serbia: 1880,
  // Lower-mid
  Qatar: 1790, "Saudi Arabia": 1785, Tunisia: 1795, Ghana: 1800, Panama: 1775,
  Uzbekistan: 1770, Iraq: 1760, Jordan: 1745, "Cape Verde": 1740,
  "New Zealand": 1735, "Congo DR": 1790, "Bosnia-Herzegovina": 1805,
  // Lower
  Haiti: 1700, "Curaçao": 1690, "South Africa": 1755,
};

export function eloOf(team: string): number {
  return BASE_ELO[team] ?? 1800;
}
