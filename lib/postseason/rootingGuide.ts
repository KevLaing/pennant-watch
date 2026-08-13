import type { Game, League, Standing, Team } from "../mlb/types";
import { createPostseasonContext, postseasonStandingScore } from "./standings";
import type { RootingGuideEntry } from "./types";

export function isGameRelevantToLeague(game: Game, league: League): boolean {
  return game.homeTeam.league === league || game.awayTeam.league === league;
}

function applyOutcome(
  standings: readonly Standing[],
  game: Game,
  winner: Team,
): Standing[] {
  const loserId =
    winner.id === game.homeTeam.id ? game.awayTeam.id : game.homeTeam.id;

  return standings.map((standing) => {
    if (standing.team.id === winner.id) {
      return {
        ...standing,
        wins: standing.wins + 1,
        winningPercentage:
          (standing.wins + 1) / (standing.wins + standing.losses + 1),
      };
    }
    if (standing.team.id === loserId) {
      return {
        ...standing,
        losses: standing.losses + 1,
        winningPercentage:
          standing.wins / (standing.wins + standing.losses + 1),
      };
    }
    return standing;
  });
}

function normalizeImpact(value: number): number {
  const rounded = Math.round(value * 2) / 2;
  if (Object.is(rounded, -0)) return 0;
  return Math.max(-1, Math.min(1, rounded));
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

  const context = createPostseasonContext(standings, selectedTeam.id);
  const baseline = postseasonStandingScore(standings, context);

  return [...uniqueRelevantGames.values()].map((game) => {
    const homeImpact = normalizeImpact(
      postseasonStandingScore(
        applyOutcome(standings, game, game.homeTeam),
        context,
      ) - baseline,
    );
    const awayImpact = normalizeImpact(
      postseasonStandingScore(
        applyOutcome(standings, game, game.awayTeam),
        context,
      ) - baseline,
    );

    let rootFor: Team | null = null;
    let winImpact = homeImpact;
    let loseImpact = awayImpact;

    if (game.homeTeam.id === selectedTeam.id) {
      rootFor = game.homeTeam;
    } else if (game.awayTeam.id === selectedTeam.id) {
      rootFor = game.awayTeam;
      winImpact = awayImpact;
      loseImpact = homeImpact;
    } else if (homeImpact > awayImpact) {
      rootFor = game.homeTeam;
    } else if (awayImpact > homeImpact) {
      rootFor = game.awayTeam;
      winImpact = awayImpact;
      loseImpact = homeImpact;
    }

    return {
      gamePk: game.gamePk,
      gameDate: game.gameDate,
      status: game.status,
      awayTeam: game.awayTeam,
      homeTeam: game.homeTeam,
      rootFor,
      winImpact,
      loseImpact,
    };
  });
}
