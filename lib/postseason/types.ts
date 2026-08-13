import type { Game, Standing, Team } from "../mlb/types";

export type RootingGuideEntry = {
  gamePk: number;
  gameDate: string;
  status: Game["status"];
  awayTeam: Team;
  homeTeam: Team;
  awayScore: number | null;
  homeScore: number | null;
  rootFor: Team | null;
  winImpact: number;
  loseImpact: number;
};

export type PennantWatchData = {
  team: Team;
  date: string;
  scheduleGameCount: number;
  standings: Standing[];
  games: RootingGuideEntry[];
};
