import type { Standing, Team } from "@/lib/mlb/types";

type StandingsTableProps = {
  selectedTeam: Team;
  standings: Standing[];
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
  gamesBackField,
  emptyMessage,
}: {
  rows: Standing[];
  selectedTeam: Team;
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
          {rows.map((standing) => (
            <tr key={standing.team.id} className={standing.team.id === selectedTeam.id ? "is-selected" : undefined}>
              <th scope="row">
                <span className="team-code">{standing.team.abbreviation}</span>
                <span className="team-name">{standing.team.name}</span>
              </th>
              <td>{standing.wins}</td>
              <td>{standing.losses}</td>
              <td>{gamesBack(standing[gamesBackField])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsTable({ selectedTeam, standings }: StandingsTableProps) {
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
              gamesBackField="divisionGamesBack"
              emptyMessage="No division standings available."
            />
          </article>
          <article className="standings-card">
            <h3>Wild Card</h3>
            <MiniStandingsTable
              rows={wildCardRows}
              selectedTeam={selectedTeam}
              gamesBackField="wildCardGamesBack"
              emptyMessage="No Wild Card standings available."
            />
          </article>
        </div>
      )}
    </section>
  );
}
