import { fetchSchedule, fetchStandings } from "./mlb/client";
import { normalizeSchedule, normalizeStandings } from "./mlb/normalize";
import type { Team } from "./mlb/types";
import { buildRootingGuide } from "./postseason/rootingGuide";
import { createPennantRaceState } from "./postseason/objectives";
import type { PennantWatchData } from "./postseason/types";

export async function getPennantWatchData(
  team: Team,
  date: string,
): Promise<PennantWatchData> {
  const [schedulePayload, standingsPayload] = await Promise.all([
    fetchSchedule(date),
    fetchStandings(date.slice(0, 4)),
  ]);
  const standings = normalizeStandings(standingsPayload);
  const schedule = normalizeSchedule(schedulePayload);
  const leagueStandings = standings.filter(
    (standing) => standing.team.league === team.league,
  );

  return {
    team,
    date,
    scheduleGameCount: schedule.length,
    standings: leagueStandings,
    raceState: createPennantRaceState(leagueStandings, team.id),
    games: buildRootingGuide(team, standings, schedule),
  };
}
