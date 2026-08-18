import type { Game, League } from "../../mlb/types";
import type {
  NightGameOutcome,
  NightScenario,
  NightSlate,
} from "./types";

export function isNightGameRelevant(game: Game, league: League): boolean {
  return game.awayTeam.league === league || game.homeTeam.league === league;
}

function gameOrder(first: Game, second: Game): number {
  return Date.parse(first.gameDate) - Date.parse(second.gameDate) ||
    first.gamePk - second.gamePk;
}

function finalOutcome(game: Game): NightGameOutcome | null {
  if (
    game.status.state !== "final" ||
    game.awayScore === null ||
    game.homeScore === null ||
    game.awayScore === game.homeScore
  ) return null;
  const awayWon = game.awayScore > game.homeScore;
  return {
    gamePk: game.gamePk,
    winnerTeamId: awayWon ? game.awayTeam.id : game.homeTeam.id,
    loserTeamId: awayWon ? game.homeTeam.id : game.awayTeam.id,
  };
}

export function createNightSlate(
  games: readonly Game[],
  league: League,
): NightSlate {
  const byGamePk = new Map<number, Game>();
  for (const game of games) {
    if (
      isNightGameRelevant(game, league) &&
      game.status.state !== "postponed"
    ) {
      byGamePk.set(game.gamePk, game);
    }
  }
  const relevantGames = [...byGamePk.values()].sort(gameOrder);
  const fixedGames = relevantGames.filter((game) => game.status.state === "final");
  const fixedOutcomes = fixedGames.flatMap((game) => {
    const outcome = finalOutcome(game);
    return outcome ? [outcome] : [];
  });
  const unresolvedGames = relevantGames.flatMap((game) =>
    game.status.state === "scheduled" || game.status.state === "live"
      ? [{
          gamePk: game.gamePk,
          awayTeamId: game.awayTeam.id,
          homeTeamId: game.homeTeam.id,
        }]
      : [],
  );

  return {
    relevantGameCount: relevantGames.length,
    fixedGameCount: fixedGames.length,
    fixedOutcomes,
    unresolvedGames,
  };
}

export function nightScenarioCount(unresolvedGameCount: number): number {
  return 2 ** unresolvedGameCount;
}

export function* enumerateNightScenarios(
  slate: NightSlate,
): Generator<NightScenario> {
  const scenarioCount = nightScenarioCount(slate.unresolvedGames.length);
  const choices = slate.unresolvedGames.map((game) => [
    {
      gamePk: game.gamePk,
      winnerTeamId: game.awayTeamId,
      loserTeamId: game.homeTeamId,
    },
    {
      gamePk: game.gamePk,
      winnerTeamId: game.homeTeamId,
      loserTeamId: game.awayTeamId,
    },
  ] as const);

  for (let scenarioId = 0; scenarioId < scenarioCount; scenarioId += 1) {
    const outcomes = choices.map((gameChoices, index) => {
      const choice = Math.floor(scenarioId / (2 ** index)) % 2;
      return gameChoices[choice];
    });
    yield { scenarioId, outcomes };
  }
}
