import type { Division, Game, League, Standing, Team } from "../mlb/types";

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

export type PostseasonContext = {
  selectedTeamId: number;
  comparisonTeamIds: number[];
};

function recordStrength(a: Standing, b: Standing): number {
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
    const ranked = group.sort(recordStrength);
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
    const ranked = field.sort(recordStrength);
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

export function createPostseasonContext(
  standings: readonly Standing[],
  selectedTeamId: number,
): PostseasonContext {
  const selected = standings.find((standing) => standing.team.id === selectedTeamId);
  if (!selected) return { selectedTeamId, comparisonTeamIds: [] };

  const leagueStandings = standings.filter(
    (standing) => standing.team.league === selected.team.league,
  );
  const selectedDivision = leagueStandings
    .filter(
      (standing) =>
        standing.team.division === selected.team.division &&
        standing.team.id !== selectedTeamId,
    )
    .sort(recordStrength);

  const divisionLeaders = new Map<string, Standing>();
  for (const standing of [...leagueStandings].sort(recordStrength)) {
    const key = leagueDivisionKey(standing.team.league, standing.team.division);
    if (!divisionLeaders.has(key)) divisionLeaders.set(key, standing);
  }

  const selectedIsDivisionLeader = [...divisionLeaders.values()].some(
    (standing) => standing.team.id === selectedTeamId,
  );
  const wildCardField = leagueStandings
    .filter(
      (standing) =>
        ![...divisionLeaders.values()].some(
          (leader) => leader.team.id === standing.team.id,
        ),
    )
    .sort(recordStrength);

  const targets = new Set<number>();
  if (selectedDivision[0]) targets.add(selectedDivision[0].team.id);

  if (!selectedIsDivisionLeader) {
    const selectedIndex = wildCardField.findIndex(
      (standing) => standing.team.id === selectedTeamId,
    );
    const boundaryIndex = selectedIndex >= 0 && selectedIndex < 3 ? 3 : 2;
    const boundary = wildCardField[boundaryIndex];
    if (boundary && boundary.team.id !== selectedTeamId) {
      targets.add(boundary.team.id);
    }
  }

  return { selectedTeamId, comparisonTeamIds: [...targets] };
}

export function postseasonStandingScore(
  standings: readonly Standing[],
  context: PostseasonContext,
): number {
  const selected = standings.find(
    (standing) => standing.team.id === context.selectedTeamId,
  );
  if (!selected) return 0;

  const comparisons = context.comparisonTeamIds.flatMap((teamId) => {
    const opponent = standings.find((standing) => standing.team.id === teamId);
    return opponent ? [relativeGames(selected, opponent)] : [];
  });

  return comparisons.length > 0 ? Math.max(...comparisons) : 0;
}
