import { fetchSchedule, fetchStandings } from "./mlb/client";
import { normalizeSchedule, normalizeStandings } from "./mlb/normalize";
import type { Team } from "./mlb/types";
import { buildRootingGuide } from "./postseason/rootingGuide";
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

  return {
    team,
    date,
    scheduleGameCount: schedule.length,
    standings: standings.filter((standing) => standing.team.league === team.league),
    games: buildRootingGuide(team, standings, schedule),
  };
}
