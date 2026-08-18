import type { Division, Standing } from "../mlb/types";
import { rankStandings } from "./standings";
import type { ClinchEliminationState, RaceSnapshot } from "./types";

const REGULAR_SEASON_GAMES = 162;
const DIVISIONS: readonly Division[] = ["EAST", "CENTRAL", "WEST"];

function maximumWins(standing: Standing): number {
  return standing.wins + Math.max(
    0,
    REGULAR_SEASON_GAMES - standing.wins - standing.losses,
  );
}

function unknownStatuses(): ClinchEliminationState {
  return {
    playoffClinched: false,
    divisionClinched: false,
    byeClinched: false,
    topSeedClinched: false,
    playoffEliminated: false,
    divisionEliminated: false,
    byeEliminated: false,
    topSeedEliminated: false,
  };
}

function hasCompleteLeague(standings: readonly Standing[]): boolean {
  return standings.length === 15 && DIVISIONS.every(
    (division) => standings.filter(
      (standing) => standing.team.division === division,
    ).length === 5,
  );
}

function calculateDeterministicStatuses(
  selected: Standing,
  leagueStandings: readonly Standing[],
  divisionStandings: readonly Standing[],
): ClinchEliminationState {
  if (!hasCompleteLeague(leagueStandings)) return unknownStatuses();

  const selectedMaximum = maximumWins(selected);
  const divisionRivals = divisionStandings.filter(
    (standing) => standing.team.id !== selected.team.id,
  );
  const divisionClinched = divisionRivals.every(
    (standing) => maximumWins(standing) < selected.wins,
  );
  const divisionEliminated = divisionRivals.some(
    (standing) => standing.wins > selectedMaximum,
  );

  const leagueRivals = leagueStandings.filter(
    (standing) => standing.team.id !== selected.team.id,
  );
  const playoffClinched = divisionClinched || leagueRivals.filter(
    (standing) => maximumWins(standing) >= selected.wins,
  ).length <= 2;
  const playoffEliminated = divisionEliminated && leagueRivals.filter(
    (standing) => standing.wins > selectedMaximum,
  ).length >= 6;

  const otherDivisionCeilings = DIVISIONS
    .filter((division) => division !== selected.team.division)
    .map((division) => Math.max(
      ...leagueStandings
        .filter((standing) => standing.team.division === division)
        .map(maximumWins),
    ));
  const otherDivisionFloors = DIVISIONS
    .filter((division) => division !== selected.team.division)
    .map((division) => Math.max(
      ...leagueStandings
        .filter((standing) => standing.team.division === division)
        .map((standing) => standing.wins),
    ));

  const byeClinched = divisionClinched && otherDivisionCeilings.filter(
    (wins) => wins >= selected.wins,
  ).length <= 1;
  const topSeedClinched = divisionClinched && otherDivisionCeilings.every(
    (wins) => wins < selected.wins,
  );
  const byeEliminated = divisionEliminated || otherDivisionFloors.filter(
    (wins) => wins > selectedMaximum,
  ).length >= 2;
  const topSeedEliminated = divisionEliminated || otherDivisionFloors.some(
    (wins) => wins > selectedMaximum,
  );

  return {
    playoffClinched,
    divisionClinched,
    byeClinched,
    topSeedClinched,
    playoffEliminated,
    divisionEliminated,
    byeEliminated,
    topSeedEliminated,
  };
}

export function detectRaceSnapshot(
  standings: readonly Standing[],
  selectedTeamId: number,
): RaceSnapshot | null {
  const selected = standings.find(
    (standing) => standing.team.id === selectedTeamId,
  );
  if (!selected) return null;

  const leagueStandings = standings.filter(
    (standing) => standing.team.league === selected.team.league,
  );
  const divisionStandings = leagueStandings
    .filter((standing) => standing.team.division === selected.team.division)
    .sort(rankStandings);
  const divisionGroups = DIVISIONS.flatMap((division) => {
    const ranked = leagueStandings
      .filter((standing) => standing.team.division === division)
      .sort(rankStandings);
    return ranked[0] ? [ranked] : [];
  });
  const divisionWinners = divisionGroups
    .map((division) => division[0])
    .sort(rankStandings);
  const divisionWinnerIds = divisionWinners.map(
    (standing) => standing.team.id,
  );
  const divisionWinnerSet = new Set(divisionWinnerIds);
  const wildCardField = leagueStandings
    .filter((standing) => !divisionWinnerSet.has(standing.team.id))
    .sort(rankStandings);
  const divisionRank = divisionStandings.findIndex(
    (standing) => standing.team.id === selectedTeamId,
  ) + 1;
  const wildCardIndex = wildCardField.findIndex(
    (standing) => standing.team.id === selectedTeamId,
  );
  const divisionSeedIndex = divisionWinners.findIndex(
    (standing) => standing.team.id === selectedTeamId,
  );
  const wildCardRank = wildCardIndex >= 0 ? wildCardIndex + 1 : null;
  const leagueSeed = divisionSeedIndex >= 0
    ? divisionSeedIndex + 1
    : wildCardIndex >= 0 && wildCardIndex < 3
      ? wildCardIndex + 4
      : null;

  return {
    selectedTeamId,
    league: selected.team.league,
    division: selected.team.division,
    divisionRank,
    wildCardRank,
    leagueSeed,
    inPlayoffPosition: leagueSeed !== null,
    divisionLeaderId: divisionStandings[0].team.id,
    divisionCompetitorIds: divisionStandings
      .filter((standing) => standing.team.id !== selectedTeamId)
      .map((standing) => standing.team.id),
    divisionWinnerIds,
    wildCardTeamIds: wildCardField.map((standing) => standing.team.id),
    wildCardPositionIds: wildCardField.slice(0, 3).map(
      (standing) => standing.team.id,
    ),
    wildCardCutoffId: wildCardField[2]?.team.id ?? null,
    ...calculateDeterministicStatuses(
      selected,
      leagueStandings,
      divisionStandings,
    ),
  };
}
