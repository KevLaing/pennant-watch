import type { Standing, Team } from "@/lib/mlb/types";
import { pickScoreState } from "@/lib/postseason/rootingGuide";
import type { RootingGuideEntry } from "@/lib/postseason/types";

type PickHighlight = "neutral" | "winning" | "losing";

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
  pickHighlights,
  gamesBackField,
  emptyMessage,
}: {
  rows: Standing[];
  selectedTeam: Team;
  teamsPlayingToday: ReadonlySet<number>;
  pickHighlights: ReadonlyMap<number, PickHighlight>;
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
            const pickHighlight = pickHighlights.get(standing.team.id);
            const isPick = pickHighlight !== undefined;
            const classes = [
              standing.team.id === selectedTeam.id ? "is-selected" : "",
              pickHighlight ? `is-pick-${pickHighlight}` : "",
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
  const pickHighlights = new Map<number, PickHighlight>();
  for (const game of games) {
    if (!game.rootFor) continue;

    const scoreState = pickScoreState(game);
    pickHighlights.set(
      game.rootFor.id,
      scoreState === "winning" || scoreState === "losing"
        ? scoreState
        : "neutral",
    );
  }
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
        <span><span className="standings-status standings-status--playing">Today</span>Game today</span>
        <span>
          <i className="legend-swatch legend-swatch--pick-neutral" />
          <i className="legend-swatch legend-swatch--pick-winning" />
          <i className="legend-swatch legend-swatch--pick-losing" />
          Rooting pick
        </span>
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
              pickHighlights={pickHighlights}
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
              pickHighlights={pickHighlights}
              gamesBackField="wildCardGamesBack"
              emptyMessage="No Wild Card standings available."
            />
          </article>
        </div>
      )}
    </section>
  );
}
