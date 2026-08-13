import { selectTeam } from "@/app/actions";
import { DIVISIONS, LEAGUES, MLB_TEAMS } from "@/lib/mlb/teams";
import type { Team } from "@/lib/mlb/types";

type TeamPickerProps = {
  selectedTeam?: Team;
  prominent?: boolean;
};

const divisionNames = {
  EAST: "East",
  CENTRAL: "Central",
  WEST: "West",
};

export function TeamPicker({ selectedTeam, prominent = false }: TeamPickerProps) {
  return (
    <form action={selectTeam} className={prominent ? "team-picker team-picker--prominent" : "team-picker"}>
      <label htmlFor="team">
        {selectedTeam ? "Your team" : "Choose your team"}
      </label>
      <div className="team-picker__controls">
        <select id="team" name="team" defaultValue={selectedTeam?.abbreviation ?? ""} required>
          <option value="" disabled>Select an MLB team</option>
          {LEAGUES.flatMap((league) =>
            DIVISIONS.map((division) => (
              <optgroup key={`${league}-${division}`} label={`${league} ${divisionNames[division]}`}>
                {MLB_TEAMS.filter(
                  (team) => team.league === league && team.division === division,
                ).map((team) => (
                  <option key={team.id} value={team.abbreviation}>
                    {team.name}
                  </option>
                ))}
              </optgroup>
            )),
          )}
        </select>
        <button type="submit">{selectedTeam ? "Update" : "Show my guide"}</button>
      </div>
    </form>
  );
}
