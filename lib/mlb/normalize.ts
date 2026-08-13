import { getTeamById } from "./teams";
import type {
  Game,
  GameState,
  MlbScheduleResponse,
  MlbStandingsResponse,
  Standing,
} from "./types";

function parseRank(value: string | undefined): number | null {
  if (!value) return null;
  const rank = Number.parseInt(value, 10);
  return Number.isFinite(rank) ? rank : null;
}

function normalizeState(abstractState?: string, detailedState?: string): GameState {
  if (detailedState?.toLowerCase().includes("postponed")) return "postponed";
  if (abstractState === "Final") return "final";
  if (abstractState === "Live") return "live";
  return "scheduled";
}

export function normalizeSchedule(payload: MlbScheduleResponse): Game[] {
  return (payload.dates ?? []).flatMap((date) =>
    (date.games ?? []).flatMap((game) => {
      const awayTeam = getTeamById(game.teams?.away?.team?.id ?? -1);
      const homeTeam = getTeamById(game.teams?.home?.team?.id ?? -1);

      if (
        game.gamePk === undefined ||
        !game.gameDate ||
        !game.officialDate ||
        !awayTeam ||
        !homeTeam
      ) {
        return [];
      }

      return [{
        gamePk: game.gamePk,
        gameDate: game.gameDate,
        officialDate: game.officialDate,
        awayTeam,
        homeTeam,
        status: {
          state: normalizeState(
            game.status?.abstractGameState,
            game.status?.detailedState,
          ),
          detail: game.status?.detailedState ?? "Scheduled",
        },
      } satisfies Game];
    }),
  );
}

export function normalizeStandings(payload: MlbStandingsResponse): Standing[] {
  const byTeam = new Map<number, Standing>();

  for (const record of payload.records ?? []) {
    for (const teamRecord of record.teamRecords ?? []) {
      const team = getTeamById(teamRecord.team?.id ?? -1);
      if (!team || teamRecord.wins === undefined || teamRecord.losses === undefined) {
        continue;
      }

      byTeam.set(team.id, {
        team,
        wins: teamRecord.wins,
        losses: teamRecord.losses,
        divisionRank: parseRank(teamRecord.divisionRank),
        wildCardRank: parseRank(teamRecord.wildCardRank),
        divisionGamesBack: teamRecord.divisionGamesBack ?? "—",
        wildCardGamesBack: teamRecord.wildCardGamesBack ?? "—",
        winningPercentage: Number.parseFloat(teamRecord.winningPercentage ?? "0") || 0,
      });
    }
  }

  return [...byTeam.values()];
}
