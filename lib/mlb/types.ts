export type League = "AL" | "NL";

export type Division = "EAST" | "CENTRAL" | "WEST";

export type Team = {
  id: number;
  abbreviation: string;
  name: string;
  league: League;
  division: Division;
};

export type GameState = "scheduled" | "live" | "final" | "postponed";

export type Game = {
  gamePk: number;
  gameDate: string;
  officialDate: string;
  awayTeam: Team;
  homeTeam: Team;
  status: {
    state: GameState;
    detail: string;
  };
};

export type Standing = {
  team: Team;
  wins: number;
  losses: number;
  divisionRank: number | null;
  wildCardRank: number | null;
  divisionGamesBack: string;
  wildCardGamesBack: string;
  winningPercentage: number;
};

export type MlbScheduleResponse = {
  dates?: Array<{
    games?: Array<{
      gamePk?: number;
      gameDate?: string;
      officialDate?: string;
      status?: {
        abstractGameState?: string;
        detailedState?: string;
      };
      teams?: {
        away?: { team?: { id?: number } };
        home?: { team?: { id?: number } };
      };
    }>;
  }>;
};

export type MlbStandingsResponse = {
  records?: Array<{
    teamRecords?: Array<{
      team?: { id?: number };
      wins?: number;
      losses?: number;
      divisionRank?: string;
      wildCardRank?: string;
      divisionGamesBack?: string;
      wildCardGamesBack?: string;
      winningPercentage?: string;
    }>;
  }>;
};
