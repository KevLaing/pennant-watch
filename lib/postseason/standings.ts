import type { Division, Game, League, Standing, Team } from "../mlb/types";
import type { RacePosition } from "./types";

type ProjectableGame = {
  status: Game["status"];
  awayTeam: Team;
  homeTeam: Team;
  awayScore: number | null;
  homeScore: number | null;
};

export type LiveStandingState = "winning" | "losing" | "tied";

export type StandingsProjection = {
  standings: Standing[];
  liveStates: Map<number, LiveStandingState>;
};

export type { RacePosition } from "./types";

export function rankStandings(a: Standing, b: Standing): number {
  return (
    b.winningPercentage - a.winningPercentage ||
    b.wins - a.wins ||
    a.losses - b.losses ||
    a.team.id - b.team.id
  );
}

function leagueDivisionKey(league: League, division: Division): string {
  return `${league}-${division}`;
}

function formatGamesBack(value: number): string {
  if (Math.abs(value) < 0.001) return "-";
  return Number.isInteger(value) ? value.toFixed(1) : value.toString();
}

export function relativeGames(selected: Standing, opponent: Standing): number {
  return (
    (selected.wins - opponent.wins + opponent.losses - selected.losses) / 2
  );
}

export function calculateRacePosition(
  standings: readonly Standing[],
  teamId: number,
): RacePosition {
  const selected = standings.find((standing) => standing.team.id === teamId);
  if (!selected) {
    return { divisionRank: null, wildCardRank: null, leagueSeed: null };
  }

  const leagueStandings = standings.filter(
    (standing) => standing.team.league === selected.team.league,
  );
  const division = leagueStandings
    .filter((standing) => standing.team.division === selected.team.division)
    .sort(rankStandings);
  const divisionRank = division.findIndex(
    (standing) => standing.team.id === teamId,
  ) + 1;

  const divisionLeaders = new Set<number>();
  for (const divisionName of ["EAST", "CENTRAL", "WEST"] as const) {
    const leader = leagueStandings
      .filter((standing) => standing.team.division === divisionName)
      .sort(rankStandings)[0];
    if (leader) divisionLeaders.add(leader.team.id);
  }

  if (divisionLeaders.has(teamId)) {
    const divisionWinners = leagueStandings
      .filter((standing) => divisionLeaders.has(standing.team.id))
      .sort(rankStandings);
    return {
      divisionRank,
      wildCardRank: null,
      leagueSeed:
        divisionWinners.findIndex((standing) => standing.team.id === teamId) + 1,
    };
  }

  const wildCardField = leagueStandings
    .filter((standing) => !divisionLeaders.has(standing.team.id))
    .sort(rankStandings);
  const wildCardIndex = wildCardField.findIndex(
    (standing) => standing.team.id === teamId,
  );

  return {
    divisionRank,
    wildCardRank: wildCardIndex >= 0 ? wildCardIndex + 1 : null,
    leagueSeed: wildCardIndex >= 0 && wildCardIndex < 3
      ? wildCardIndex + 4
      : null,
  };
}

export function projectLiveStandings(
  standings: readonly Standing[],
  games: readonly ProjectableGame[],
): StandingsProjection {
  const projectedByTeam = new Map(
    standings.map((standing) => [standing.team.id, { ...standing }]),
  );
  const liveStates = new Map<number, LiveStandingState>();

  for (const game of games) {
    if (
      game.status.state !== "live" ||
      game.awayScore === null ||
      game.homeScore === null
    ) {
      continue;
    }

    if (game.awayScore === game.homeScore) {
      liveStates.set(game.awayTeam.id, "tied");
      liveStates.set(game.homeTeam.id, "tied");
      continue;
    }

    const winner = game.awayScore > game.homeScore
      ? game.awayTeam
      : game.homeTeam;
    const loser = winner.id === game.awayTeam.id
      ? game.homeTeam
      : game.awayTeam;

    liveStates.set(winner.id, "winning");
    liveStates.set(loser.id, "losing");

    for (const [team, result] of [[winner, "win"], [loser, "loss"]] as const) {
      const standing = projectedByTeam.get(team.id);
      if (!standing) continue;

      const wins = standing.wins + (result === "win" ? 1 : 0);
      const losses = standing.losses + (result === "loss" ? 1 : 0);
      projectedByTeam.set(team.id, {
        ...standing,
        wins,
        losses,
        winningPercentage: wins / (wins + losses),
      });
    }
  }

  const divisionLeaders = new Set<number>();
  const divisionGroups = new Map<string, Standing[]>();
  for (const standing of projectedByTeam.values()) {
    const key = leagueDivisionKey(standing.team.league, standing.team.division);
    const group = divisionGroups.get(key) ?? [];
    group.push(standing);
    divisionGroups.set(key, group);
  }

  for (const group of divisionGroups.values()) {
    const ranked = group.sort(rankStandings);
    const leader = ranked[0];
    if (!leader) continue;
    divisionLeaders.add(leader.team.id);

    ranked.forEach((standing, index) => {
      projectedByTeam.set(standing.team.id, {
        ...standing,
        divisionRank: index + 1,
        divisionGamesBack: formatGamesBack(relativeGames(leader, standing)),
      });
    });
  }

  const leagueWildCards = new Map<League, Standing[]>();
  for (const standing of projectedByTeam.values()) {
    projectedByTeam.set(standing.team.id, {
      ...standing,
      wildCardRank: null,
      wildCardGamesBack: "—",
    });

    if (!divisionLeaders.has(standing.team.id)) {
      const field = leagueWildCards.get(standing.team.league) ?? [];
      field.push(standing);
      leagueWildCards.set(standing.team.league, field);
    }
  }

  for (const field of leagueWildCards.values()) {
    const ranked = field.sort(rankStandings);
    const cutoff = ranked[Math.min(2, ranked.length - 1)];
    if (!cutoff) continue;

    ranked.forEach((standing, index) => {
      const current = projectedByTeam.get(standing.team.id) ?? standing;
      projectedByTeam.set(standing.team.id, {
        ...current,
        wildCardRank: index + 1,
        wildCardGamesBack: index < 3
          ? "-"
          : formatGamesBack(relativeGames(cutoff, standing)),
      });
    });
  }

  return {
    standings: standings.flatMap((standing) => {
      const projected = projectedByTeam.get(standing.team.id);
      return projected ? [projected] : [];
    }),
    liveStates,
  };
}
