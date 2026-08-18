import type { Standing } from "../mlb/types";
import { detectRaceSnapshot } from "./raceState";
import { relativeGames } from "./standings";
import {
  OBJECTIVE_PRIORITY,
  type PennantRaceState,
  type RaceObjective,
  type RaceObjectiveKind,
  type RaceSnapshot,
} from "./types";

function objective(
  kind: RaceObjectiveKind,
  targetTeamIds: number[],
  boundaryTeamIds: number[],
  gamesBack?: number,
): RaceObjective {
  return {
    kind,
    priority: OBJECTIVE_PRIORITY[kind],
    targetTeamIds: [...new Set(targetTeamIds)],
    boundaryTeamIds: [...new Set(boundaryTeamIds)],
    ...(gamesBack === undefined ? {} : { gamesBack }),
  };
}

function signedGamesBack(
  standings: readonly Standing[],
  selectedTeamId: number,
  boundaryTeamId: number | undefined,
): number | undefined {
  const selected = standings.find((standing) => standing.team.id === selectedTeamId);
  const boundary = standings.find((standing) => standing.team.id === boundaryTeamId);
  return selected && boundary ? -relativeGames(selected, boundary) : undefined;
}

function wildCardTargets(
  snapshot: RaceSnapshot,
  boundaryIndex: number,
): number[] {
  return snapshot.wildCardTeamIds
    .map((teamId, index) => ({ teamId, index }))
    .filter(({ teamId }) => teamId !== snapshot.selectedTeamId)
    .sort((a, b) =>
      Math.abs(a.index - boundaryIndex) - Math.abs(b.index - boundaryIndex) ||
      a.index - b.index,
    )
    .map(({ teamId }) => teamId);
}

export function generateRaceObjectives(
  snapshot: RaceSnapshot,
  standings: readonly Standing[],
): RaceObjective[] {
  const objectives: RaceObjective[] = [];
  const selectedIsDivisionLeader = snapshot.divisionRank === 1;

  if (
    !selectedIsDivisionLeader &&
    !snapshot.playoffClinched &&
    !snapshot.playoffEliminated
  ) {
    if (snapshot.inPlayoffPosition) {
      const firstOutId = snapshot.wildCardTeamIds[3];
      objectives.push(objective(
        "DEFEND_PLAYOFF_SPOT",
        snapshot.wildCardTeamIds.slice(3),
        firstOutId ? [firstOutId] : [],
        signedGamesBack(standings, snapshot.selectedTeamId, firstOutId),
      ));
    } else {
      const cutoffId = snapshot.wildCardCutoffId ?? undefined;
      objectives.push(objective(
        "MAKE_PLAYOFFS",
        wildCardTargets(snapshot, 2),
        cutoffId ? [cutoffId] : [],
        signedGamesBack(standings, snapshot.selectedTeamId, cutoffId),
      ));
    }
  }

  if (!snapshot.divisionClinched && !snapshot.divisionEliminated) {
    const kind = selectedIsDivisionLeader ? "DEFEND_DIVISION" : "WIN_DIVISION";
    const boundaryId = selectedIsDivisionLeader
      ? snapshot.divisionCompetitorIds[0]
      : snapshot.divisionLeaderId;
    const divisionTargets = selectedIsDivisionLeader
      ? snapshot.divisionCompetitorIds
      : [snapshot.divisionLeaderId];
    objectives.push(objective(
      kind,
      divisionTargets,
      boundaryId ? [boundaryId] : [],
      signedGamesBack(standings, snapshot.selectedTeamId, boundaryId),
    ));
  }

  if (selectedIsDivisionLeader) {
    if (snapshot.leagueSeed === 3 && !snapshot.byeEliminated) {
      const seedTwoId = snapshot.divisionWinnerIds[1];
      objectives.push(objective(
        "EARN_BYE",
        [
          ...(seedTwoId ? [seedTwoId] : []),
          ...snapshot.divisionWinnerIds.slice(0, 1),
        ],
        seedTwoId ? [seedTwoId] : [],
        signedGamesBack(standings, snapshot.selectedTeamId, seedTwoId),
      ));
    } else if (snapshot.leagueSeed !== null && snapshot.leagueSeed <= 2) {
      if (!snapshot.byeClinched) {
        const seedThreeId = snapshot.divisionWinnerIds[2];
        objectives.push(objective(
          "DEFEND_BYE",
          seedThreeId ? [seedThreeId] : [],
          seedThreeId ? [seedThreeId] : [],
          signedGamesBack(standings, snapshot.selectedTeamId, seedThreeId),
        ));
      }

      if (snapshot.leagueSeed === 2 && !snapshot.topSeedEliminated) {
        const topSeedId = snapshot.divisionWinnerIds[0];
        objectives.push(objective(
          "EARN_TOP_SEED",
          topSeedId ? [topSeedId] : [],
          topSeedId ? [topSeedId] : [],
          signedGamesBack(standings, snapshot.selectedTeamId, topSeedId),
        ));
      } else if (snapshot.leagueSeed === 1 && !snapshot.topSeedClinched) {
        const seedTwoId = snapshot.divisionWinnerIds[1];
        objectives.push(objective(
          "DEFEND_TOP_SEED",
          snapshot.divisionWinnerIds.slice(1),
          seedTwoId ? [seedTwoId] : [],
          signedGamesBack(standings, snapshot.selectedTeamId, seedTwoId),
        ));
      }
    }
  } else if (
    snapshot.wildCardRank !== null &&
    snapshot.wildCardRank > 1 &&
    snapshot.wildCardRank <= 3 &&
    !snapshot.playoffEliminated
  ) {
    const teamsAhead = snapshot.wildCardTeamIds.slice(0, snapshot.wildCardRank - 1).reverse();
    const nextSeedId = teamsAhead[0];
    objectives.push(objective(
      "IMPROVE_WILD_CARD_SEED",
      teamsAhead,
      nextSeedId ? [nextSeedId] : [],
      signedGamesBack(standings, snapshot.selectedTeamId, nextSeedId),
    ));
  }

  return objectives.sort((a, b) => a.priority - b.priority);
}

export function createPennantRaceState(
  standings: readonly Standing[],
  selectedTeamId: number,
): PennantRaceState | null {
  const snapshot = detectRaceSnapshot(standings, selectedTeamId);
  if (!snapshot) return null;

  const objectives = generateRaceObjectives(snapshot, standings);
  return {
    ...snapshot,
    primaryObjective: objectives[0] ?? null,
    secondaryObjectives: objectives.slice(1),
  };
}
