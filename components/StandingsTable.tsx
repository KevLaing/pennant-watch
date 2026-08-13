import type { Standing, Team } from "@/lib/mlb/types";
import type { RootingGuideEntry } from "@/lib/postseason/types";

type StandingsTableProps = {
  selectedTeam: Team;
  standings: Standing[];
  games: RootingGuideEntry[];
};

function rankStandings(a: Standing, b: Standing): number {
  return (
    b.winningPercentage - a.winningPercentage ||
    b.wins - a.wins ||
    a.losses - b.losses
  );
}

function gamesBack(value: string): string {
  return value === "-" ? "—" : value;
}

function MiniStandingsTable({
  rows,
  selectedTeam,
  teamsPlayingToday,
  pickedTeams,
  gamesBackField,
  emptyMessage,
}: {
  rows: Standing[];
  selectedTeam: Team;
  teamsPlayingToday: ReadonlySet<number>;
  pickedTeams: ReadonlySet<number>;
  gamesBackField: "divisionGamesBack" | "wildCardGamesBack";
  emptyMessage: string;
}) {
  if (rows.length === 0) {
    return <p className="empty-compact">{emptyMessage}</p>;
  }

  return (
    <div className="table-scroll">
      <table className="standings-table">
        <thead>
          <tr><th>Team</th><th>W</th><th>L</th><th>GB</th></tr>
        </thead>
        <tbody>
          {rows.map((standing) => {
            const isPlayingToday = teamsPlayingToday.has(standing.team.id);
            const isPick = pickedTeams.has(standing.team.id);
            const classes = [
              standing.team.id === selectedTeam.id ? "is-selected" : "",
              isPlayingToday ? "is-playing-today" : "",
              isPick ? "is-pick" : "",
            ].filter(Boolean).join(" ");

            return (
              <tr key={standing.team.id} className={classes || undefined}>
                <th scope="row">
                  <span className="team-code">{standing.team.abbreviation}</span>
                  <span className="team-name">{standing.team.name}</span>
                  {isPick ? (
                    <span className="standings-status standings-status--pick">Pick</span>
                  ) : isPlayingToday ? (
                    <span className="standings-status standings-status--playing">Today</span>
                  ) : null}
                </th>
                <td>{standing.wins}</td>
                <td>{standing.losses}</td>
                <td>{gamesBack(standing[gamesBackField])}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsTable({ selectedTeam, standings, games }: StandingsTableProps) {
  const teamsPlayingToday = new Set(
    games.flatMap((game) => [game.awayTeam.id, game.homeTeam.id]),
  );
  const pickedTeams = new Set(
    games.flatMap((game) => game.rootFor ? [game.rootFor.id] : []),
  );
  const divisionRows = standings
    .filter((standing) => standing.team.division === selectedTeam.division)
    .sort((a, b) => (a.divisionRank ?? 99) - (b.divisionRank ?? 99));
  const wildCardRows = standings
    .filter((standing) => standing.divisionRank !== 1)
    .sort((a, b) => {
      if (a.wildCardRank !== null && b.wildCardRank !== null) {
        return a.wildCardRank - b.wildCardRank;
      }
      return rankStandings(a, b);
    });

  return (
    <section className="standings-section" aria-labelledby="standings-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Race snapshot</p>
          <h2 id="standings-heading">{selectedTeam.league} standings</h2>
        </div>
        <span className="league-pill">{selectedTeam.league}</span>
      </div>
      <div className="standings-legend" aria-label="Standings highlights">
        <span><i className="legend-swatch legend-swatch--playing" />Playing today</span>
        <span><i className="legend-swatch legend-swatch--pick" />Rooting pick</span>
        <span><i className="legend-swatch legend-swatch--selected" />Your team</span>
      </div>
      {standings.length === 0 ? (
        <div className="empty-panel">
          Current standings are not available yet. Check back once regular-season play begins.
        </div>
      ) : (
        <div className="standings-grid">
          <article className="standings-card">
            <h3>{selectedTeam.league} {selectedTeam.division.toLowerCase()}</h3>
            <MiniStandingsTable
              rows={divisionRows}
              selectedTeam={selectedTeam}
              teamsPlayingToday={teamsPlayingToday}
              pickedTeams={pickedTeams}
              gamesBackField="divisionGamesBack"
              emptyMessage="No division standings available."
            />
          </article>
          <article className="standings-card">
            <h3>Wild Card</h3>
            <MiniStandingsTable
              rows={wildCardRows}
              selectedTeam={selectedTeam}
              teamsPlayingToday={teamsPlayingToday}
              pickedTeams={pickedTeams}
              gamesBackField="wildCardGamesBack"
              emptyMessage="No Wild Card standings available."
            />
          </article>
        </div>
      )}
    </section>
  );
}
