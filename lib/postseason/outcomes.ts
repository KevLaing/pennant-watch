import type { Game, Standing, Team } from "../mlb/types";
import { createPennantRaceState } from "./objectives";
import { relativeGames } from "./standings";
import type {
  ObjectiveOutcomeValue,
  PennantRaceState,
  PostseasonOutcomeValue,
  RaceObjective,
  RaceObjectiveKind,
} from "./types";

export function applyGameOutcome(
  standings: readonly Standing[],
  game: Game,
  winner: Team,
): Standing[] {
  const loserId = winner.id === game.homeTeam.id
    ? game.awayTeam.id
    : game.homeTeam.id;

  return standings.map((standing) => {
    if (standing.team.id === winner.id) {
      const wins = standing.wins + 1;
      return {
        ...standing,
        wins,
        winningPercentage: wins / (wins + standing.losses),
      };
    }
    if (standing.team.id === loserId) {
      const losses = standing.losses + 1;
      return {
        ...standing,
        losses,
        winningPercentage: standing.wins / (standing.wins + losses),
      };
    }
    return standing;
  });
}

function objectivePosition(
  kind: RaceObjectiveKind,
  state: PennantRaceState,
): { position: number; rank: number } {
  switch (kind) {
    case "MAKE_PLAYOFFS":
    case "DEFEND_PLAYOFF_SPOT":
      return {
        position: state.inPlayoffPosition ? 1 : 0,
        rank: state.leagueSeed !== null
          ? 7 - state.leagueSeed
          : -(state.wildCardRank ?? 99),
      };
    case "WIN_DIVISION":
    case "DEFEND_DIVISION":
      return {
        position: state.divisionRank === 1 ? 1 : 0,
        rank: -state.divisionRank,
      };
    case "EARN_BYE":
    case "DEFEND_BYE":
      return {
        position: state.leagueSeed !== null && state.leagueSeed <= 2 ? 1 : 0,
        rank: -(state.leagueSeed ?? 99),
      };
    case "EARN_TOP_SEED":
    case "DEFEND_TOP_SEED":
      return {
        position: state.leagueSeed === 1 ? 1 : 0,
        rank: -(state.leagueSeed ?? 99),
      };
    case "IMPROVE_WILD_CARD_SEED":
      return state.divisionRank === 1
        ? { position: 2, rank: 0 }
        : {
            position: state.wildCardRank !== null && state.wildCardRank <= 3 ? 1 : 0,
            rank: -(state.wildCardRank ?? 99),
          };
  }
}

function evaluateObjective(
  standings: readonly Standing[],
  state: PennantRaceState,
  objective: RaceObjective,
): ObjectiveOutcomeValue {
  const selected = standings.find(
    (standing) => standing.team.id === state.selectedTeamId,
  );
  const { position, rank } = objectivePosition(objective.kind, state);
  const margins = selected
    ? objective.targetTeamIds.flatMap((teamId) => {
        const target = standings.find((standing) => standing.team.id === teamId);
        return target ? [relativeGames(selected, target)] : [];
      })
    : [];

  return { objective: objective.kind, position, rank, margins };
}

export function evaluatePostseasonOutcome(
  standings: readonly Standing[],
  baselineState: PennantRaceState,
): PostseasonOutcomeValue {
  const state = createPennantRaceState(standings, baselineState.selectedTeamId);
  if (!state) {
    throw new Error("Selected team is missing from hypothetical standings.");
  }

  const objectives = [
    ...(baselineState.primaryObjective ? [baselineState.primaryObjective] : []),
    ...baselineState.secondaryObjectives,
  ].map((objective) => evaluateObjective(standings, state, objective));

  return { state, objectives };
}

function compareNumbers(first: number, second: number): number {
  if (first === second) return 0;
  return first > second ? 1 : -1;
}

export function compareObjectiveValues(
  first: ObjectiveOutcomeValue,
  second: ObjectiveOutcomeValue,
): number {
  const position = compareNumbers(first.position, second.position);
  if (position !== 0) return position;

  const rank = compareNumbers(first.rank, second.rank);
  if (rank !== 0) return rank;

  const length = Math.max(first.margins.length, second.margins.length);
  for (let index = 0; index < length; index += 1) {
    const margin = compareNumbers(
      first.margins[index] ?? 0,
      second.margins[index] ?? 0,
    );
    if (margin !== 0) return margin;
  }

  return 0;
}

export function comparePostseasonOutcomes(
  first: PostseasonOutcomeValue,
  second: PostseasonOutcomeValue,
  raceState: PennantRaceState,
): number {
  const expectedObjectives = (raceState.primaryObjective ? 1 : 0) +
    raceState.secondaryObjectives.length;
  if (
    first.objectives.length !== expectedObjectives ||
    second.objectives.length !== expectedObjectives
  ) {
    throw new Error("Outcome values do not match the active race objectives.");
  }

  for (let index = 0; index < expectedObjectives; index += 1) {
    const comparison = compareObjectiveValues(
      first.objectives[index],
      second.objectives[index],
    );
    if (comparison !== 0) return comparison;
  }

  return 0;
}

export function objectiveComparisons(
  preferred: PostseasonOutcomeValue,
  other: PostseasonOutcomeValue,
): RaceObjectiveKind[] {
  return preferred.objectives.flatMap((value, index) =>
    compareObjectiveValues(value, other.objectives[index]) > 0
      ? [value.objective]
      : [],
  );
}
