import type { RaceObjectiveKind } from "../types";

export type NightGameOutcome = {
  gamePk: number;
  winnerTeamId: number;
  loserTeamId: number;
};

export type NightScenario = {
  scenarioId: number;
  outcomes: NightGameOutcome[];
};

export type NightScenarioClassification = "IMPROVED" | "UNCHANGED" | "WORSENED";

export type NightScenarioResult = {
  scenarioId: number;
  raceMargin: number;
  raceMarginDelta: number;
  divisionRank: number;
  wildCardRank: number | null;
  leagueSeed: number | null;
  primaryObjectiveSatisfied: boolean;
  classification: NightScenarioClassification;
  positionKey: string;
};

export type PositionBucket = {
  key: string;
  count: number;
};

export type NightSuccessTarget = {
  objective: RaceObjectiveKind;
  baselineWildCardRank: number | null;
};

export type NightOutcomeSummary = {
  relevantGameCount: number;
  unresolvedGameCount: number;
  fixedGameCount: number;
  scenarioCount: number;
  improvedCount: number;
  unchangedCount: number;
  worsenedCount: number;
  bestDelta: number;
  worstDelta: number;
  successfulScenarioCount: number;
  target: NightSuccessTarget | null;
  positionDistribution: PositionBucket[];
  fixedOutcomes: NightGameOutcome[];
  bestScenario: NightScenario;
  worstScenario: NightScenario;
};

export type NightSlate = {
  relevantGameCount: number;
  fixedGameCount: number;
  fixedOutcomes: NightGameOutcome[];
  unresolvedGames: Array<{
    gamePk: number;
    awayTeamId: number;
    homeTeamId: number;
  }>;
};
