import type { Game, League, Standing, Team } from "../mlb/types";
import {
  applyGameOutcome,
  comparePostseasonOutcomes,
  evaluatePostseasonOutcome,
  objectiveComparisons,
} from "./outcomes";
import { createPennantRaceState } from "./objectives";
import { calculateRacePosition, relativeGames } from "./standings";
import type {
  PennantRaceState,
  RootingGuideEntry,
  RootingReason,
} from "./types";

export type PickScoreState = "winning" | "losing" | "tied";

export function hasGameStarted(game: RootingGuideEntry): boolean {
  return game.status.state === "live" || game.status.state === "final";
}

export function pickScoreState(
  game: RootingGuideEntry,
): PickScoreState | null {
  if (
    !hasGameStarted(game) ||
    !game.rootFor ||
    game.awayScore === null ||
    game.homeScore === null
  ) {
    return null;
  }

  const pickIsHome = game.rootFor.id === game.homeTeam.id;
  const pickScore = pickIsHome ? game.homeScore : game.awayScore;
  const opponentScore = pickIsHome ? game.awayScore : game.homeScore;

  if (pickScore > opponentScore) return "winning";
  if (pickScore < opponentScore) return "losing";
  return "tied";
}

export function isGameRelevantToLeague(game: Game, league: League): boolean {
  return game.homeTeam.league === league || game.awayTeam.league === league;
}

function normalizeImpact(value: number): number {
  const rounded = Math.round(value * 2) / 2;
  if (Object.is(rounded, -0)) return 0;
  return Math.max(-1, Math.min(1, rounded));
}

function activeObjectives(state: PennantRaceState) {
  return [
    ...(state.primaryObjective ? [state.primaryObjective] : []),
    ...state.secondaryObjectives,
  ];
}

function activeRaceMargin(
  standings: readonly Standing[],
  state: PennantRaceState,
): number {
  const selected = standings.find(
    (standing) => standing.team.id === state.selectedTeamId,
  );
  if (!selected) return 0;

  for (const objective of activeObjectives(state)) {
    const boundaryId = objective.boundaryTeamIds[0];
    const boundary = standings.find(
      (standing) => standing.team.id === boundaryId,
    );
    if (boundary) return relativeGames(selected, boundary);
  }

  return 0;
}

function rootingReasons(
  state: PennantRaceState,
  preferred: ReturnType<typeof evaluatePostseasonOutcome>,
  other: ReturnType<typeof evaluatePostseasonOutcome>,
  game: Game,
  rootFor: Team,
): RootingReason[] {
  const loser = rootFor.id === game.homeTeam.id ? game.awayTeam : game.homeTeam;
  const objectives = activeObjectives(state);

  return objectiveComparisons(preferred, other).map((kind) => {
    const objective = objectives.find((candidate) => candidate.kind === kind);
    const affectedTeam = rootFor.id === state.selectedTeamId
      ? rootFor
      : objective?.targetTeamIds.includes(loser.id)
        ? loser
        : objective?.targetTeamIds.includes(rootFor.id)
          ? rootFor
          : undefined;
    return {
      objective: kind,
      ...(affectedTeam ? { affectedTeamId: affectedTeam.id } : {}),
      impactDirection: "positive" as const,
    };
  });
}

export function formatImpact(impact: number): string {
  if (impact > 0) return `+${impact}`;
  return `${impact}`;
}

export function buildRootingGuide(
  selectedTeam: Team,
  standings: readonly Standing[],
  games: readonly Game[],
): RootingGuideEntry[] {
  const uniqueRelevantGames = new Map<number, Game>();
  for (const game of games) {
    if (isGameRelevantToLeague(game, selectedTeam.league)) {
      uniqueRelevantGames.set(game.gamePk, game);
    }
  }

  const raceState = createPennantRaceState(standings, selectedTeam.id);
  const currentPosition = calculateRacePosition(standings, selectedTeam.id);
  if (!raceState) {
    return [...uniqueRelevantGames.values()].map((game) => ({
      gamePk: game.gamePk,
      gameDate: game.gameDate,
      status: game.status,
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      rootFor: null,
      reasons: [],
      winImpact: 0,
      loseImpact: 0,
      currentPosition,
      winPosition: currentPosition,
      losePosition: currentPosition,
    }));
  }

  const baselineMargin = activeRaceMargin(standings, raceState);

  return [...uniqueRelevantGames.values()].map((game) => {
    const homeOutcomeStandings = applyGameOutcome(standings, game, game.homeTeam);
    const awayOutcomeStandings = applyGameOutcome(standings, game, game.awayTeam);
    const homeOutcome = evaluatePostseasonOutcome(homeOutcomeStandings, raceState);
    const awayOutcome = evaluatePostseasonOutcome(awayOutcomeStandings, raceState);
    const homeImpact = normalizeImpact(
      activeRaceMargin(homeOutcomeStandings, raceState) - baselineMargin,
    );
    const awayImpact = normalizeImpact(
      activeRaceMargin(awayOutcomeStandings, raceState) - baselineMargin,
    );
    const homePosition = calculateRacePosition(
      homeOutcomeStandings,
      selectedTeam.id,
    );
    const awayPosition = calculateRacePosition(
      awayOutcomeStandings,
      selectedTeam.id,
    );

    let rootFor: Team | null = null;
    let reasons: RootingReason[] = [];
    let winImpact = homeImpact;
    let loseImpact = awayImpact;
    let winPosition = homePosition;
    let losePosition = awayPosition;
    const comparison = comparePostseasonOutcomes(homeOutcome, awayOutcome, raceState);

    if (game.homeTeam.id === selectedTeam.id) {
      rootFor = game.homeTeam;
      reasons = rootingReasons(raceState, homeOutcome, awayOutcome, game, rootFor);
    } else if (game.awayTeam.id === selectedTeam.id) {
      rootFor = game.awayTeam;
      winImpact = awayImpact;
      loseImpact = homeImpact;
      winPosition = awayPosition;
      losePosition = homePosition;
      reasons = rootingReasons(raceState, awayOutcome, homeOutcome, game, rootFor);
    } else if (comparison > 0) {
      rootFor = game.homeTeam;
      reasons = rootingReasons(raceState, homeOutcome, awayOutcome, game, rootFor);
    } else if (comparison < 0) {
      rootFor = game.awayTeam;
      winImpact = awayImpact;
      loseImpact = homeImpact;
      winPosition = awayPosition;
      losePosition = homePosition;
      reasons = rootingReasons(raceState, awayOutcome, homeOutcome, game, rootFor);
    }

    return {
      gamePk: game.gamePk,
      gameDate: game.gameDate,
      status: game.status,
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      awayScore: game.awayScore,
      homeScore: game.homeScore,
      rootFor,
      reasons,
      winImpact,
      loseImpact,
      currentPosition,
      winPosition,
      losePosition,
    };
  });
}
