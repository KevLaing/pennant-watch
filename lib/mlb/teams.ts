import type { Division, League, Team } from "./types";

// The MLB sidebar button background and bottom-border values from
// teamcolorcodes.com. Texas comes from its current primary-logo palette
// because the club is absent from that sidebar.
export const MLB_TEAMS: readonly Team[] = [
  { id: 110, abbreviation: "BAL", name: "Baltimore Orioles", league: "AL", division: "EAST", primaryColor: "#FC4C02", secondaryColor: "#000000" },
  { id: 111, abbreviation: "BOS", name: "Boston Red Sox", league: "AL", division: "EAST", primaryColor: "#C8102E", secondaryColor: "#0C2340" },
  { id: 147, abbreviation: "NYY", name: "New York Yankees", league: "AL", division: "EAST", primaryColor: "#162546", secondaryColor: "#97999B" },
  { id: 139, abbreviation: "TB", name: "Tampa Bay Rays", league: "AL", division: "EAST", primaryColor: "#092C5C", secondaryColor: "#8FBCE6" },
  { id: 141, abbreviation: "TOR", name: "Toronto Blue Jays", league: "AL", division: "EAST", primaryColor: "#134A8E", secondaryColor: "#E8291C" },
  { id: 145, abbreviation: "CWS", name: "Chicago White Sox", league: "AL", division: "CENTRAL", primaryColor: "#27251F", secondaryColor: "#8A8D8F" },
  { id: 114, abbreviation: "CLE", name: "Cleveland Guardians", league: "AL", division: "CENTRAL", primaryColor: "#0F223E", secondaryColor: "#E31937" },
  { id: 116, abbreviation: "DET", name: "Detroit Tigers", league: "AL", division: "CENTRAL", primaryColor: "#0C2340", secondaryColor: "#FA4616" },
  { id: 118, abbreviation: "KC", name: "Kansas City Royals", league: "AL", division: "CENTRAL", primaryColor: "#004687", secondaryColor: "#C09A5B" },
  { id: 142, abbreviation: "MIN", name: "Minnesota Twins", league: "AL", division: "CENTRAL", primaryColor: "#0C2341", secondaryColor: "#BA0C2E" },
  { id: 133, abbreviation: "ATH", name: "Athletics", league: "AL", division: "WEST", primaryColor: "#003831", secondaryColor: "#EFB21E" },
  { id: 117, abbreviation: "HOU", name: "Houston Astros", league: "AL", division: "WEST", primaryColor: "#002D62", secondaryColor: "#EB6E1F" },
  { id: 108, abbreviation: "LAA", name: "Los Angeles Angels", league: "AL", division: "WEST", primaryColor: "#BA0021", secondaryColor: "#003263" },
  { id: 136, abbreviation: "SEA", name: "Seattle Mariners", league: "AL", division: "WEST", primaryColor: "#0C2340", secondaryColor: "#00685E" },
  { id: 140, abbreviation: "TEX", name: "Texas Rangers", league: "AL", division: "WEST", primaryColor: "#003278", secondaryColor: "#C0111F" },
  { id: 144, abbreviation: "ATL", name: "Atlanta Braves", league: "NL", division: "EAST", primaryColor: "#002855", secondaryColor: "#BA0C2F" },
  { id: 146, abbreviation: "MIA", name: "Miami Marlins", league: "NL", division: "EAST", primaryColor: "#000000", secondaryColor: "#00A3E0" },
  { id: 121, abbreviation: "NYM", name: "New York Mets", league: "NL", division: "EAST", primaryColor: "#002D72", secondaryColor: "#FC4C02" },
  { id: 143, abbreviation: "PHI", name: "Philadelphia Phillies", league: "NL", division: "EAST", primaryColor: "#BA0C2F", secondaryColor: "#003087" },
  { id: 120, abbreviation: "WSH", name: "Washington Nationals", league: "NL", division: "EAST", primaryColor: "#BA122B", secondaryColor: "#14225A" },
  { id: 112, abbreviation: "CHC", name: "Chicago Cubs", league: "NL", division: "CENTRAL", primaryColor: "#002F6C", secondaryColor: "#C8102E" },
  { id: 113, abbreviation: "CIN", name: "Cincinnati Reds", league: "NL", division: "CENTRAL", primaryColor: "#D50032", secondaryColor: "#000000" },
  { id: 158, abbreviation: "MIL", name: "Milwaukee Brewers", league: "NL", division: "CENTRAL", primaryColor: "#13294B", secondaryColor: "#85714D" },
  { id: 134, abbreviation: "PIT", name: "Pittsburgh Pirates", league: "NL", division: "CENTRAL", primaryColor: "#FFC72C", secondaryColor: "#27251F" },
  { id: 138, abbreviation: "STL", name: "St. Louis Cardinals", league: "NL", division: "CENTRAL", primaryColor: "#BA0C2F", secondaryColor: "#0C2340" },
  { id: 109, abbreviation: "ARI", name: "Arizona Diamondbacks", league: "NL", division: "WEST", primaryColor: "#A71930", secondaryColor: "#000000" },
  { id: 115, abbreviation: "COL", name: "Colorado Rockies", league: "NL", division: "WEST", primaryColor: "#333366", secondaryColor: "#C4CED4" },
  { id: 119, abbreviation: "LAD", name: "Los Angeles Dodgers", league: "NL", division: "WEST", primaryColor: "#002F6C", secondaryColor: "#EF3E42" },
  { id: 135, abbreviation: "SD", name: "San Diego Padres", league: "NL", division: "WEST", primaryColor: "#002D62", secondaryColor: "#A0AAB2" },
  { id: 137, abbreviation: "SF", name: "San Francisco Giants", league: "NL", division: "WEST", primaryColor: "#FA4616", secondaryColor: "#27251F" },
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
