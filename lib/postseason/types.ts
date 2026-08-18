import type { Division, Game, League, Standing, Team } from "../mlb/types";

export type RaceObjectiveKind =
  | "MAKE_PLAYOFFS"
  | "DEFEND_PLAYOFF_SPOT"
  | "IMPROVE_WILD_CARD_SEED"
  | "WIN_DIVISION"
  | "DEFEND_DIVISION"
  | "EARN_BYE"
  | "DEFEND_BYE"
  | "EARN_TOP_SEED"
  | "DEFEND_TOP_SEED";

export const OBJECTIVE_PRIORITY = {
  MAKE_PLAYOFFS: 1,
  DEFEND_PLAYOFF_SPOT: 1,
  WIN_DIVISION: 2,
  DEFEND_DIVISION: 2,
  EARN_BYE: 3,
  DEFEND_BYE: 3,
  EARN_TOP_SEED: 4,
  DEFEND_TOP_SEED: 4,
  IMPROVE_WILD_CARD_SEED: 5,
} as const satisfies Record<RaceObjectiveKind, number>;

export type RaceObjective = {
  kind: RaceObjectiveKind;
  priority: (typeof OBJECTIVE_PRIORITY)[RaceObjectiveKind];
  targetTeamIds: number[];
  boundaryTeamIds: number[];
  gamesBack?: number;
};

export type ClinchEliminationState = {
  playoffClinched: boolean;
  divisionClinched: boolean;
  byeClinched: boolean;
  topSeedClinched: boolean;
  playoffEliminated: boolean;
  divisionEliminated: boolean;
  byeEliminated: boolean;
  topSeedEliminated: boolean;
};

export type RaceSnapshot = ClinchEliminationState & {
  selectedTeamId: number;
  league: League;
  division: Division;
  divisionRank: number;
  wildCardRank: number | null;
  leagueSeed: number | null;
  inPlayoffPosition: boolean;
  divisionLeaderId: number;
  divisionCompetitorIds: number[];
  divisionWinnerIds: number[];
  wildCardTeamIds: number[];
  wildCardPositionIds: number[];
  wildCardCutoffId: number | null;
};

export type PennantRaceState = RaceSnapshot & {
  primaryObjective: RaceObjective | null;
  secondaryObjectives: RaceObjective[];
};

export type ObjectiveOutcomeValue = {
  objective: RaceObjectiveKind;
  position: number;
  rank: number;
  margins: number[];
};

export type PostseasonOutcomeValue = {
  state: PennantRaceState;
  objectives: ObjectiveOutcomeValue[];
};

export type RootingReason = {
  objective: RaceObjectiveKind;
  affectedTeamId?: number;
  impactDirection: "positive" | "negative";
};

export type RacePosition = {
  divisionRank: number | null;
  wildCardRank: number | null;
  leagueSeed: number | null;
};

export type RootingGuideEntry = {
  gamePk: number;
  gameDate: string;
  status: Game["status"];
  awayTeam: Team;
  homeTeam: Team;
  awayScore: number | null;
  homeScore: number | null;
  rootFor: Team | null;
  reasons: RootingReason[];
  winImpact: number;
  loseImpact: number;
  currentPosition: RacePosition;
  winPosition: RacePosition;
  losePosition: RacePosition;
};

export type PennantWatchData = {
  team: Team;
  date: string;
  scheduleGameCount: number;
  standings: Standing[];
  raceState: PennantRaceState | null;
  games: RootingGuideEntry[];
};
