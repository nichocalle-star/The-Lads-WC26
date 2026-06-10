export interface Match {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo?: string;
  awayTeamLogo?: string;
  round: "Group Stage" | "Round of 32" | "Round of 16" | "Quarterfinal" | "Semifinal" | "Final";
  group?: string;
  venue: string;
  kickoffTimeUTC: string; // ISO string
  status: "upcoming" | "live" | "final";
  homeScore: number | null;
  awayScore: number | null;
  winner: string | null;
  sofascoreId?: number;
}

export interface Prediction {
  id?: string;
  userId: string;
  matchId: string;
  predictedWinner: string;
  predictedHomeScore: number | null;
  predictedAwayScore: number | null;
  submittedAt: string;
  updatedAt: string;
  pointsAwarded: number;
  isLocked: boolean;
}

export interface GroupPrediction {
  id?: string;
  userId: string;
  group: string;
  predictedStandings: string[]; // team names in order 1st-4th
  submittedAt: string;
  updatedAt: string;
  pointsAwarded: number;
  isLocked: boolean;
}

export interface UserMetrics {
  userId: string;
  displayName: string;
  photoURL?: string;
  totalPoints: number;
  rank: number;
  totalPredictions: number;
  correctPredictions: number;
  predictionAccuracy: number;
  groupStageAccuracy: number;
  knockoutAccuracy: number;
}

export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  isAdmin: boolean;
  createdAt: string;
}
