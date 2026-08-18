import type { Standing } from "../../mlb/types";
import { createPennantRaceState } from "../objectives";
import {
  compareObjectiveValues,
  evaluatePostseasonOutcome,
} from "../outcomes";
import { relativeGames } from "../standings";
import type {
  ObjectiveOutcomeValue,
  PennantRaceState,
  RaceObjectiveKind,
} from "../types";
import type {
  NightGameOutcome,
  NightScenarioClassification,
  NightScenarioResult,
} from "./types";

const EPSILON = 0.001;

function clean(value: number): number {
  return Math.abs(value) <= EPSILON || Object.is(value, -0) ? 0 : value;
}

export function applyNightOutcomes(
  standings: readonly Standing[],
  outcomes: readonly NightGameOutcome[],
): Standing[] {
  const deltas = new Map<number, { wins: number; losses: number }>();
  for (const outcome of outcomes) {
    const winner = deltas.get(outcome.winnerTeamId) ?? { wins: 0, losses: 0 };
    winner.wins += 1;
    deltas.set(outcome.winnerTeamId, winner);
    const loser = deltas.get(outcome.loserTeamId) ?? { wins: 0, losses: 0 };
    loser.losses += 1;
    deltas.set(outcome.loserTeamId, loser);
  }

  return standings.map((standing) => {
    const delta = deltas.get(standing.team.id);
    if (!delta) return standing;
    const wins = standing.wins + delta.wins;
    const losses = standing.losses + delta.losses;
    return {
      ...standing,
      wins,
      losses,
      winningPercentage: wins / (wins + losses),
    };
  });
}

export function primaryRaceMargin(
  standings: readonly Standing[],
  baselineState: PennantRaceState,
): number {
  const selected = standings.find(
    (standing) => standing.team.id === baselineState.selectedTeamId,
  );
  const boundaryId = baselineState.primaryObjective?.boundaryTeamIds[0];
  const boundary = standings.find((standing) => standing.team.id === boundaryId);
  return selected && boundary ? clean(relativeGames(selected, boundary)) : 0;
}

export function primaryObjectiveSatisfied(
  objective: RaceObjectiveKind | null,
  baselineState: PennantRaceState,
  state: PennantRaceState,
): boolean {
  switch (objective) {
    case "MAKE_PLAYOFFS":
    case "DEFEND_PLAYOFF_SPOT": return state.inPlayoffPosition;
    case "WIN_DIVISION":
    case "DEFEND_DIVISION": return state.divisionRank === 1;
    case "EARN_BYE":
    case "DEFEND_BYE": return state.divisionRank === 1 &&
      state.leagueSeed !== null && state.leagueSeed <= 2;
    case "EARN_TOP_SEED":
    case "DEFEND_TOP_SEED": return state.leagueSeed === 1;
    case "IMPROVE_WILD_CARD_SEED":
      return state.divisionRank === 1 || (
        state.wildCardRank !== null &&
        baselineState.wildCardRank !== null &&
        state.wildCardRank < baselineState.wildCardRank
      );
    case null: return false;
  }
}

export function nightPositionKey(
  objective: RaceObjectiveKind | null,
  state: PennantRaceState,
): string {
  switch (objective) {
    case "MAKE_PLAYOFFS":
    case "DEFEND_PLAYOFF_SPOT":
    case "IMPROVE_WILD_CARD_SEED":
      return state.divisionRank === 1
        ? "DIVISION_LEADER"
        : `WC${state.wildCardRank ?? "OUT"}`;
    case "WIN_DIVISION":
    case "DEFEND_DIVISION": return `DIV${state.divisionRank}`;
    case "EARN_BYE":
    case "DEFEND_BYE":
    case "EARN_TOP_SEED":
    case "DEFEND_TOP_SEED": return `SEED${state.leagueSeed ?? "OUT"}`;
    case null:
      return state.divisionRank === 1
        ? `SEED${state.leagueSeed ?? "OUT"}`
        : `WC${state.wildCardRank ?? "OUT"}`;
  }
}

export type EvaluatedNightScenario = NightScenarioResult & {
  primaryValue: ObjectiveOutcomeValue | null;
};

function comparePrimaryState(
  first: ObjectiveOutcomeValue,
  second: ObjectiveOutcomeValue,
): number {
  return compareObjectiveValues(
    { ...first, margins: [] },
    { ...second, margins: [] },
  );
}

export function compareEvaluatedScenarios(
  first: EvaluatedNightScenario,
  second: EvaluatedNightScenario,
): number {
  if (first.primaryValue && second.primaryValue) {
    const structured = comparePrimaryState(first.primaryValue, second.primaryValue);
    if (structured !== 0) return structured;
  }
  const delta = first.raceMarginDelta - second.raceMarginDelta;
  if (Math.abs(delta) <= EPSILON) return 0;
  return delta > 0 ? 1 : -1;
}

export function evaluateNightScenario(
  standings: readonly Standing[],
  baselineState: PennantRaceState,
  baselineMargin: number,
  baselinePrimaryValue: ObjectiveOutcomeValue | null,
  scenarioId: number,
): EvaluatedNightScenario {
  const state = createPennantRaceState(standings, baselineState.selectedTeamId);
  if (!state) throw new Error("Selected team is missing from nightly standings.");
  const outcome = evaluatePostseasonOutcome(standings, baselineState);
  const primaryValue = outcome.objectives[0] ?? null;
  const structuredComparison = primaryValue && baselinePrimaryValue
    ? comparePrimaryState(primaryValue, baselinePrimaryValue)
    : 0;
  const raceMargin = primaryRaceMargin(standings, baselineState);
  const raceMarginDelta = clean(raceMargin - baselineMargin);
  const classification: NightScenarioClassification = structuredComparison > 0
    ? "IMPROVED"
    : structuredComparison < 0
      ? "WORSENED"
      : raceMarginDelta > EPSILON
        ? "IMPROVED"
        : raceMarginDelta < -EPSILON
          ? "WORSENED"
          : "UNCHANGED";

  return {
    scenarioId,
    raceMargin,
    raceMarginDelta,
    divisionRank: state.divisionRank,
    wildCardRank: state.wildCardRank,
    leagueSeed: state.leagueSeed,
    primaryObjectiveSatisfied: primaryObjectiveSatisfied(
      baselineState.primaryObjective?.kind ?? null,
      baselineState,
      state,
    ),
    classification,
    positionKey: nightPositionKey(
      baselineState.primaryObjective?.kind ?? null,
      state,
    ),
    primaryValue,
  };
}

export function baselinePrimaryValue(
  standings: readonly Standing[],
  state: PennantRaceState,
): ObjectiveOutcomeValue | null {
  return evaluatePostseasonOutcome(standings, state).objectives[0] ?? null;
}
