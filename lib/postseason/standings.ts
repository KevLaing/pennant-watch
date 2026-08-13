import type { Division, League, Standing } from "../mlb/types";

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

export function relativeGames(selected: Standing, opponent: Standing): number {
  return (
    (selected.wins - opponent.wins + opponent.losses - selected.losses) / 2
  );
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
