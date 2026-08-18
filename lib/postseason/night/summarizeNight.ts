import type { Game, Standing, Team } from "../../mlb/types";
import { createPennantRaceState } from "../objectives";
import {
  applyNightOutcomes,
  baselinePrimaryValue,
  compareEvaluatedScenarios,
  evaluateNightScenario,
  primaryRaceMargin,
  type EvaluatedNightScenario,
} from "./evaluateScenario";
import {
  createNightSlate,
  enumerateNightScenarios,
  nightScenarioCount,
} from "./enumerateScenarios";
import type {
  NightMovementBucket,
  NightMovementDelta,
  NightOutcomeSummary,
  NightScenario,
  PositionBucket,
} from "./types";

export const NIGHT_MOVEMENT_DELTAS = [1, 0.5, 0, -0.5, -1] as const;
const MOVEMENT_EPSILON = 0.001;

export function normalizeNightMovementDelta(
  value: number,
): NightMovementDelta | null {
  if (
    !Number.isFinite(value) ||
    value > 1 + MOVEMENT_EPSILON ||
    value < -1 - MOVEMENT_EPSILON
  ) return null;
  const normalized = Math.round(value * 2) / 2;
  const cleaned = Object.is(normalized, -0) ? 0 : normalized;
  return NIGHT_MOVEMENT_DELTAS.includes(cleaned as NightMovementDelta)
    ? cleaned as NightMovementDelta
    : null;
}

function positionOrder(key: string): number {
  if (key === "DIVISION_LEADER") return 0;
  const rank = Number.parseInt(key.replace(/\D/g, ""), 10);
  return Number.isFinite(rank) ? rank : 99;
}

export function buildNightOutcomeSummary(
  selectedTeam: Team,
  standings: readonly Standing[],
  games: readonly Game[],
): NightOutcomeSummary | null {
  const slate = createNightSlate(games, selectedTeam.league);
  const fixedStandings = applyNightOutcomes(standings, slate.fixedOutcomes);
  const baselineState = createPennantRaceState(fixedStandings, selectedTeam.id);
  if (!baselineState) return null;
  const baselineMargin = primaryRaceMargin(fixedStandings, baselineState);
  const baselineValue = baselinePrimaryValue(fixedStandings, baselineState);
  const boundaryTeamId = baselineState.primaryObjective?.boundaryTeamIds[0];
  const hasMovementBoundary = boundaryTeamId !== undefined &&
    fixedStandings.some((standing) => standing.team.id === boundaryTeamId);
  let movementCounts: Map<NightMovementDelta, number> | null = hasMovementBoundary
    ? new Map(NIGHT_MOVEMENT_DELTAS.map((delta) => [delta, 0]))
    : null;
  const positionCounts = new Map<string, number>();
  let improvedCount = 0;
  let unchangedCount = 0;
  let worsenedCount = 0;
  let successfulScenarioCount = 0;
  let best: { scenario: NightScenario; result: EvaluatedNightScenario } | null = null;
  let worst: { scenario: NightScenario; result: EvaluatedNightScenario } | null = null;

  for (const scenario of enumerateNightScenarios(slate)) {
    const scenarioStandings = applyNightOutcomes(fixedStandings, scenario.outcomes);
    const result = evaluateNightScenario(
      scenarioStandings,
      baselineState,
      baselineMargin,
      baselineValue,
      scenario.scenarioId,
    );
    // raceMarginDelta always uses baselineState, so every bucket compares the
    // selected club with the same baseline primary boundary team.
    const movementDelta = normalizeNightMovementDelta(result.raceMarginDelta);
    if (movementCounts && movementDelta === null) {
      movementCounts = null;
    } else if (movementCounts && movementDelta !== null) {
      movementCounts.set(movementDelta, (movementCounts.get(movementDelta) ?? 0) + 1);
    }
    const classificationDelta = movementDelta ?? result.raceMarginDelta;
    if (classificationDelta > MOVEMENT_EPSILON) improvedCount += 1;
    else if (classificationDelta < -MOVEMENT_EPSILON) worsenedCount += 1;
    else unchangedCount += 1;
    if (result.primaryObjectiveSatisfied) successfulScenarioCount += 1;
    positionCounts.set(
      result.positionKey,
      (positionCounts.get(result.positionKey) ?? 0) + 1,
    );

    if (
      !best ||
      result.raceMarginDelta > best.result.raceMarginDelta + MOVEMENT_EPSILON ||
      (
        Math.abs(result.raceMarginDelta - best.result.raceMarginDelta) <= MOVEMENT_EPSILON &&
        compareEvaluatedScenarios(result, best.result) > 0
      )
    ) {
      best = { scenario, result };
    }
    if (
      !worst ||
      result.raceMarginDelta < worst.result.raceMarginDelta - MOVEMENT_EPSILON ||
      (
        Math.abs(result.raceMarginDelta - worst.result.raceMarginDelta) <= MOVEMENT_EPSILON &&
        compareEvaluatedScenarios(result, worst.result) < 0
      )
    ) {
      worst = { scenario, result };
    }
  }

  if (!best || !worst) {
    throw new Error("Nightly enumeration did not produce its baseline scenario.");
  }
  const positionDistribution: PositionBucket[] = [...positionCounts]
    .map(([key, count]) => ({ key, count }))
    .sort((first, second) => positionOrder(first.key) - positionOrder(second.key));
  const finalMovementCounts = movementCounts;
  const movementDistribution: NightMovementBucket[] | null = finalMovementCounts
    ? NIGHT_MOVEMENT_DELTAS.map((delta) => ({
        delta,
        count: finalMovementCounts.get(delta) ?? 0,
      }))
    : null;

  return {
    relevantGameCount: slate.relevantGameCount,
    unresolvedGameCount: slate.unresolvedGames.length,
    fixedGameCount: slate.fixedGameCount,
    scenarioCount: nightScenarioCount(slate.unresolvedGames.length),
    improvedCount,
    unchangedCount,
    worsenedCount,
    bestDelta: best.result.raceMarginDelta,
    worstDelta: worst.result.raceMarginDelta,
    successfulScenarioCount,
    target: baselineState.primaryObjective
      ? {
          objective: baselineState.primaryObjective.kind,
          baselineWildCardRank: baselineState.wildCardRank,
        }
      : null,
    movementDistribution,
    positionDistribution,
    fixedOutcomes: slate.fixedOutcomes,
    bestScenario: best.scenario,
    worstScenario: worst.scenario,
  };
}
