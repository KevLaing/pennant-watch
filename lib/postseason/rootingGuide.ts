import type { Game, League, Standing, Team } from "../mlb/types";
import {
  calculateRacePosition,
  createPostseasonContext,
  postseasonStandingScore,
} from "./standings";
import type { RootingGuideEntry } from "./types";

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

function recordStrength(a: Standing, b: Standing): number {
  return (
    b.winningPercentage - a.winningPercentage ||
    b.wins - a.wins ||
    a.losses - b.losses ||
    a.team.id - b.team.id
  );
}

function standingsRacePick(
  selectedTeam: Team,
  standings: readonly Standing[],
  game: Game,
): Team | null {
  const selectedStanding = standings.find(
    (standing) => standing.team.id === selectedTeam.id,
  );
  if (!selectedStanding) return null;

  const divisionLeaders = new Set<number>();
  for (const division of ["EAST", "CENTRAL", "WEST"] as const) {
    const leader = standings
      .filter(
        (standing) =>
          standing.team.league === selectedTeam.league &&
          standing.team.division === division,
      )
      .sort(recordStrength)[0];
    if (leader) divisionLeaders.add(leader.team.id);
  }

  const selectedIsDivisionLeader = divisionLeaders.has(selectedTeam.id);
  const threatScore = (team: Team): number | null => {
    if (team.league !== selectedTeam.league) return null;

    const standing = standings.find((row) => row.team.id === team.id);
    if (!standing) return null;

    const gamesAhead =
      (standing.wins - selectedStanding.wins +
        selectedStanding.losses - standing.losses) / 2;
    const isDivisionRival = team.division === selectedTeam.division;
    let rankGap: number | null = null;

    if (
      isDivisionRival &&
      selectedStanding.divisionRank !== null &&
      standing.divisionRank !== null
    ) {
      rankGap = selectedStanding.divisionRank - standing.divisionRank;
    } else if (
      !selectedIsDivisionLeader &&
      !divisionLeaders.has(team.id) &&
      selectedStanding.wildCardRank !== null &&
      standing.wildCardRank !== null
    ) {
      rankGap = selectedStanding.wildCardRank - standing.wildCardRank;
    } else if (
      !isDivisionRival &&
      (selectedIsDivisionLeader || divisionLeaders.has(team.id))
    ) {
      return null;
    }

    if (rankGap !== null) {
      return rankGap > 0 ? Math.max(gamesAhead, 0) + rankGap / 100 : null;
    }

    return gamesAhead > 0 ? gamesAhead : null;
  };

  const awayThreat = threatScore(game.awayTeam);
  const homeThreat = threatScore(game.homeTeam);

  if (awayThreat !== null && homeThreat === null) return game.homeTeam;
  if (homeThreat !== null && awayThreat === null) return game.awayTeam;
  if (awayThreat === null || homeThreat === null || awayThreat === homeThreat) {
    return null;
  }

  return awayThreat > homeThreat ? game.awayTeam : game.homeTeam;
}

function compareRacePositions(
  first: ReturnType<typeof calculateRacePosition>,
  second: ReturnType<typeof calculateRacePosition>,
): number {
  const firstDivisionLead = first.divisionRank === 1;
  const secondDivisionLead = second.divisionRank === 1;
  if (firstDivisionLead !== secondDivisionLead) {
    return firstDivisionLead ? 1 : -1;
  }

  const firstWildCardRank = first.wildCardRank ?? Number.POSITIVE_INFINITY;
  const secondWildCardRank = second.wildCardRank ?? Number.POSITIVE_INFINITY;
  if (firstWildCardRank !== secondWildCardRank) {
    return firstWildCardRank < secondWildCardRank ? 1 : -1;
  }

  const firstDivisionRank = first.divisionRank ?? Number.POSITIVE_INFINITY;
  const secondDivisionRank = second.divisionRank ?? Number.POSITIVE_INFINITY;
  if (firstDivisionRank !== secondDivisionRank) {
    return firstDivisionRank < secondDivisionRank ? 1 : -1;
  }

  return 0;
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
  const currentPosition = calculateRacePosition(standings, selectedTeam.id);

  return [...uniqueRelevantGames.values()].map((game) => {
    const homeOutcomeStandings = applyOutcome(standings, game, game.homeTeam);
    const awayOutcomeStandings = applyOutcome(standings, game, game.awayTeam);
    const homeImpact = normalizeImpact(
      postseasonStandingScore(
        homeOutcomeStandings,
        context,
      ) - baseline,
    );
    const awayImpact = normalizeImpact(
      postseasonStandingScore(
        awayOutcomeStandings,
        context,
      ) - baseline,
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
    let winImpact = homeImpact;
    let loseImpact = awayImpact;
    let winPosition = homePosition;
    let losePosition = awayPosition;
    const positionComparison = compareRacePositions(homePosition, awayPosition);
    const positionPick = positionComparison > 0
      ? game.homeTeam
      : positionComparison < 0
        ? game.awayTeam
        : null;
    const racePick = positionPick ?? standingsRacePick(selectedTeam, standings, game);

    if (game.homeTeam.id === selectedTeam.id) {
      rootFor = game.homeTeam;
    } else if (game.awayTeam.id === selectedTeam.id) {
      rootFor = game.awayTeam;
      winImpact = awayImpact;
      loseImpact = homeImpact;
      winPosition = awayPosition;
      losePosition = homePosition;
    } else if (racePick) {
      rootFor = racePick;
      if (rootFor.id === game.awayTeam.id) {
        winImpact = awayImpact;
        loseImpact = homeImpact;
        winPosition = awayPosition;
        losePosition = homePosition;
      }
    } else if (homeImpact > awayImpact) {
      rootFor = game.homeTeam;
    } else if (awayImpact > homeImpact) {
      rootFor = game.awayTeam;
      winImpact = awayImpact;
      loseImpact = homeImpact;
      winPosition = awayPosition;
      losePosition = homePosition;
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
      winImpact,
      loseImpact,
      currentPosition,
      winPosition,
      losePosition,
    };
  });
}
