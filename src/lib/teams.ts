// Shared team list + flag emoji for the 2026 World Cup.

export const WC2026_TEAMS = [
  "Algeria", "Argentina", "Australia", "Austria", "Belgium", "Bolivia",
  "Bosnia-Herzegovina", "Brazil", "Canada", "Cape Verde", "Colombia",
  "Congo DR", "Croatia", "Curaçao", "Czechia", "Ecuador", "Egypt",
  "England", "France", "Germany", "Ghana", "Haiti", "Iran", "Iraq",
  "Ivory Coast", "Jamaica", "Japan", "Jordan", "Mexico", "Morocco",
  "Netherlands", "New Zealand", "Norway", "Panama", "Paraguay", "Peru",
  "Portugal", "Qatar", "Saudi Arabia", "Scotland", "Senegal", "South Africa",
  "South Korea", "Spain", "Sweden", "Switzerland", "Tunisia", "Türkiye",
  "United States", "Uruguay", "Uzbekistan", "Venezuela",
].sort();

export const FLAG: Record<string, string> = {
  Algeria: "🇩🇿", Argentina: "🇦🇷", Australia: "🇦🇺", Austria: "🇦🇹",
  Belgium: "🇧🇪", Bolivia: "🇧🇴", "Bosnia-Herzegovina": "🇧🇦", Brazil: "🇧🇷",
  Canada: "🇨🇦", "Cape Verde": "🇨🇻", Chile: "🇨🇱", Colombia: "🇨🇴",
  "Congo DR": "🇨🇩", "Costa Rica": "🇨🇷", Croatia: "🇭🇷", Curaçao: "🇨🇼",
  Czechia: "🇨🇿", "Czech Republic": "🇨🇿", Denmark: "🇩🇰", Ecuador: "🇪🇨",
  Egypt: "🇪🇬", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿", France: "🇫🇷", Germany: "🇩🇪",
  Ghana: "🇬🇭", Haiti: "🇭🇹", Honduras: "🇭🇳", Iran: "🇮🇷", Iraq: "🇮🇶",
  "Ivory Coast": "🇨🇮", Jamaica: "🇯🇲", Japan: "🇯🇵", Jordan: "🇯🇴",
  Mexico: "🇲🇽", Morocco: "🇲🇦", Netherlands: "🇳🇱", "New Zealand": "🇳🇿",
  Nigeria: "🇳🇬", Norway: "🇳🇴", Panama: "🇵🇦", Paraguay: "🇵🇾",
  Peru: "🇵🇪", Poland: "🇵🇱", Portugal: "🇵🇹", Qatar: "🇶🇦",
  "Saudi Arabia": "🇸🇦", Scotland: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", Senegal: "🇸🇳", Serbia: "🇷🇸",
  "South Africa": "🇿🇦", "South Korea": "🇰🇷", Spain: "🇪🇸", Sweden: "🇸🇪",
  Switzerland: "🇨🇭", Tunisia: "🇹🇳", "Türkiye": "🇹🇷", Turkey: "🇹🇷",
  Ukraine: "🇺🇦", "United States": "🇺🇸", USA: "🇺🇸", Uruguay: "🇺🇾",
  Uzbekistan: "🇺🇿", Venezuela: "🇻🇪",
};

export function flagOf(team: string | null | undefined): string {
  if (!team) return "";
  return FLAG[team] ?? "🏳️";
}
