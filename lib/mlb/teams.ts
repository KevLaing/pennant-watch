import type { Division, League, Team } from "./types";

export const MLB_TEAMS: readonly Team[] = [
  { id: 110, abbreviation: "BAL", name: "Baltimore Orioles", league: "AL", division: "EAST" },
  { id: 111, abbreviation: "BOS", name: "Boston Red Sox", league: "AL", division: "EAST" },
  { id: 147, abbreviation: "NYY", name: "New York Yankees", league: "AL", division: "EAST" },
  { id: 139, abbreviation: "TB", name: "Tampa Bay Rays", league: "AL", division: "EAST" },
  { id: 141, abbreviation: "TOR", name: "Toronto Blue Jays", league: "AL", division: "EAST" },
  { id: 145, abbreviation: "CWS", name: "Chicago White Sox", league: "AL", division: "CENTRAL" },
  { id: 114, abbreviation: "CLE", name: "Cleveland Guardians", league: "AL", division: "CENTRAL" },
  { id: 116, abbreviation: "DET", name: "Detroit Tigers", league: "AL", division: "CENTRAL" },
  { id: 118, abbreviation: "KC", name: "Kansas City Royals", league: "AL", division: "CENTRAL" },
  { id: 142, abbreviation: "MIN", name: "Minnesota Twins", league: "AL", division: "CENTRAL" },
  { id: 133, abbreviation: "ATH", name: "Athletics", league: "AL", division: "WEST" },
  { id: 117, abbreviation: "HOU", name: "Houston Astros", league: "AL", division: "WEST" },
  { id: 108, abbreviation: "LAA", name: "Los Angeles Angels", league: "AL", division: "WEST" },
  { id: 136, abbreviation: "SEA", name: "Seattle Mariners", league: "AL", division: "WEST" },
  { id: 140, abbreviation: "TEX", name: "Texas Rangers", league: "AL", division: "WEST" },
  { id: 144, abbreviation: "ATL", name: "Atlanta Braves", league: "NL", division: "EAST" },
  { id: 146, abbreviation: "MIA", name: "Miami Marlins", league: "NL", division: "EAST" },
  { id: 121, abbreviation: "NYM", name: "New York Mets", league: "NL", division: "EAST" },
  { id: 143, abbreviation: "PHI", name: "Philadelphia Phillies", league: "NL", division: "EAST" },
  { id: 120, abbreviation: "WSH", name: "Washington Nationals", league: "NL", division: "EAST" },
  { id: 112, abbreviation: "CHC", name: "Chicago Cubs", league: "NL", division: "CENTRAL" },
  { id: 113, abbreviation: "CIN", name: "Cincinnati Reds", league: "NL", division: "CENTRAL" },
  { id: 158, abbreviation: "MIL", name: "Milwaukee Brewers", league: "NL", division: "CENTRAL" },
  { id: 134, abbreviation: "PIT", name: "Pittsburgh Pirates", league: "NL", division: "CENTRAL" },
  { id: 138, abbreviation: "STL", name: "St. Louis Cardinals", league: "NL", division: "CENTRAL" },
  { id: 109, abbreviation: "ARI", name: "Arizona Diamondbacks", league: "NL", division: "WEST" },
  { id: 115, abbreviation: "COL", name: "Colorado Rockies", league: "NL", division: "WEST" },
  { id: 119, abbreviation: "LAD", name: "Los Angeles Dodgers", league: "NL", division: "WEST" },
  { id: 135, abbreviation: "SD", name: "San Diego Padres", league: "NL", division: "WEST" },
  { id: 137, abbreviation: "SF", name: "San Francisco Giants", league: "NL", division: "WEST" },
] as const;

const TEAMS_BY_ID = new Map(MLB_TEAMS.map((team) => [team.id, team]));
const TEAMS_BY_ABBREVIATION = new Map(
  MLB_TEAMS.map((team) => [team.abbreviation, team]),
);

export const DIVISIONS: readonly Division[] = ["EAST", "CENTRAL", "WEST"];
export const LEAGUES: readonly League[] = ["AL", "NL"];

export function getTeamById(id: number): Team | undefined {
  return TEAMS_BY_ID.get(id);
}

export function getTeamByAbbreviation(value: string | undefined): Team | undefined {
  return value ? TEAMS_BY_ABBREVIATION.get(value.toUpperCase()) : undefined;
}
