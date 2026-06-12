import { redirect } from "next/navigation";

// The leaderboard now lives on the home page ("The Competitors").
export default function LeaderboardPage() {
  redirect("/");
}
