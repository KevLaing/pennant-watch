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
  NightOutcomeSummary,
  NightScenario,
  PositionBucket,
} from "./types";

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
    if (result.classification === "IMPROVED") improvedCount += 1;
    else if (result.classification === "WORSENED") worsenedCount += 1;
    else unchangedCount += 1;
    if (result.primaryObjectiveSatisfied) successfulScenarioCount += 1;
    positionCounts.set(
      result.positionKey,
      (positionCounts.get(result.positionKey) ?? 0) + 1,
    );

    if (
      !best ||
      result.raceMarginDelta > best.result.raceMarginDelta + 0.001 ||
      (
        Math.abs(result.raceMarginDelta - best.result.raceMarginDelta) <= 0.001 &&
        compareEvaluatedScenarios(result, best.result) > 0
      )
    ) {
      best = { scenario, result };
    }
    if (
      !worst ||
      result.raceMarginDelta < worst.result.raceMarginDelta - 0.001 ||
      (
        Math.abs(result.raceMarginDelta - worst.result.raceMarginDelta) <= 0.001 &&
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
    positionDistribution,
    fixedOutcomes: slate.fixedOutcomes,
    bestScenario: best.scenario,
    worstScenario: worst.scenario,
  };
}
