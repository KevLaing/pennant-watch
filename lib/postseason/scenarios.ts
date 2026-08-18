import type { Game, Standing, Team } from "../mlb/types";
import {
  derivePairwiseRaceConsequence,
  deriveRaceConsequences,
} from "./consequences";
import { createPennantRaceState } from "./objectives";
import { applyGameOutcome } from "./outcomes";
import type {
  PennantRaceState,
  RequiredResult,
  RootingScenario,
} from "./types";

function includesTeam(game: Game, teamId: number): boolean {
  return game.awayTeam.id === teamId || game.homeTeam.id === teamId;
}

function opponent(game: Game, teamId: number): Team {
  return game.awayTeam.id === teamId ? game.homeTeam : game.awayTeam;
}

function chronologicalGames(first: Game, second: Game): number {
  return Date.parse(first.gameDate) - Date.parse(second.gameDate) ||
    first.gamePk - second.gamePk;
}

export function findSelectedTeamScenarioGame(
  games: readonly Game[],
  selectedTeamId: number,
): Game | null {
  const selectedGames = games
    .filter((game) => includesTeam(game, selectedTeamId))
    .sort(chronologicalGames);
  const unresolved = selectedGames.find(
    (game) => game.status.state === "scheduled" || game.status.state === "live",
  );
  if (unresolved) return unresolved;

  return selectedGames.filter((game) => game.status.state === "final").at(-1) ?? null;
}

function actualSelectedResult(
  game: Game,
  selectedTeam: Team,
): RequiredResult | null {
  if (
    game.status.state !== "final" ||
    game.awayScore === null ||
    game.homeScore === null ||
    game.awayScore === game.homeScore
  ) return null;
  const selectedScore = game.awayTeam.id === selectedTeam.id
    ? game.awayScore
    : game.homeScore;
  const opponentScore = game.awayTeam.id === selectedTeam.id
    ? game.homeScore
    : game.awayScore;
  return {
    teamId: selectedTeam.id,
    result: selectedScore > opponentScore ? "WIN" : "LOSS",
  };
}

function createScenario(
  baselineStandings: readonly Standing[],
  hypotheticalStandings: readonly Standing[],
  baselineState: PennantRaceState,
  requiredResults: RequiredResult[],
  competitorTeamId: number | null,
): RootingScenario | null {
  const hypotheticalState = createPennantRaceState(
    hypotheticalStandings,
    baselineState.selectedTeamId,
  );
  if (!hypotheticalState) return null;
  const consequences = deriveRaceConsequences(
    baselineStandings,
    hypotheticalStandings,
    baselineState,
    hypotheticalState,
  );
  const [consequence, ...additionalConsequences] = consequences;
  const pairwiseConsequence = competitorTeamId === null
    ? null
    : derivePairwiseRaceConsequence(
        baselineStandings,
        hypotheticalStandings,
        baselineState,
        competitorTeamId,
      );
  return consequence
    ? {
        requiredResults,
        consequence,
        additionalConsequences,
        ...(pairwiseConsequence ? { pairwiseConsequence } : {}),
      }
    : null;
}

function applySelectedResult(
  standings: readonly Standing[],
  selectedGame: Game,
  selectedTeam: Team,
  result: "WIN" | "LOSS",
): Standing[] {
  const winner = result === "WIN"
    ? selectedTeam
    : opponent(selectedGame, selectedTeam.id);
  return applyGameOutcome(standings, selectedGame, winner);
}

export type GameScenarios = {
  primaryScenario: RootingScenario | null;
  alternateScenario: RootingScenario | null;
};

export function buildGameScenarios({
  standings,
  raceState,
  selectedTeam,
  selectedGame,
  guideGame,
  rootFor,
  competitorTeamId,
}: {
  standings: readonly Standing[];
  raceState: PennantRaceState;
  selectedTeam: Team;
  selectedGame: Game | null;
  guideGame: Game;
  rootFor: Team | null;
  competitorTeamId: number | null;
}): GameScenarios {
  if (!rootFor) return { primaryScenario: null, alternateScenario: null };

  if (includesTeam(guideGame, selectedTeam.id)) {
    if (guideGame.status.state === "final") {
      return { primaryScenario: null, alternateScenario: null };
    }
    const hypothetical = applyGameOutcome(standings, guideGame, selectedTeam);
    return {
      primaryScenario: createScenario(
        standings,
        hypothetical,
        raceState,
        [{ teamId: selectedTeam.id, result: "WIN" }],
        competitorTeamId,
      ),
      alternateScenario: null,
    };
  }

  const preferredLoser = opponent(guideGame, rootFor.id);
  const preferredResult: RequiredResult = competitorTeamId === rootFor.id
    ? { teamId: rootFor.id, result: "WIN" }
    : { teamId: preferredLoser.id, result: "LOSS" };
  let primaryStandings = standings;
  const primaryRequired: RequiredResult[] = [];
  let alternateStandings: readonly Standing[] | null = null;
  let alternateRequired: RequiredResult[] = [];

  if (selectedGame?.status.state === "final") {
    const actualResult = actualSelectedResult(selectedGame, selectedTeam);
    if (actualResult) primaryRequired.push(actualResult);
  } else if (selectedGame) {
    primaryStandings = applySelectedResult(
      standings,
      selectedGame,
      selectedTeam,
      "WIN",
    );
    primaryRequired.push({ teamId: selectedTeam.id, result: "WIN" });
    alternateStandings = applySelectedResult(
      standings,
      selectedGame,
      selectedTeam,
      "LOSS",
    );
    alternateRequired = [{ teamId: selectedTeam.id, result: "LOSS" }];
  }

  primaryStandings = applyGameOutcome(primaryStandings, guideGame, rootFor);
  primaryRequired.push(preferredResult);
  const primaryScenario = createScenario(
    standings,
    primaryStandings,
    raceState,
    primaryRequired,
    competitorTeamId,
  );

  const alternateScenario = alternateStandings
    ? createScenario(
        standings,
        applyGameOutcome(alternateStandings, guideGame, rootFor),
        raceState,
        [...alternateRequired, preferredResult],
        competitorTeamId,
      )
    : null;

  return { primaryScenario, alternateScenario };
}
