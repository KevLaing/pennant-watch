import type { Standing, Team } from "@/lib/mlb/types";
import { pickScoreState } from "@/lib/postseason/rootingGuide";
import {
  projectLiveStandings,
  type LiveStandingState,
} from "@/lib/postseason/standings";
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

function ordinal(rank: number): string {
  const mod100 = rank % 100;
  const suffix = mod100 >= 11 && mod100 <= 13
    ? "th"
    : rank % 10 === 1
      ? "st"
      : rank % 10 === 2
        ? "nd"
        : rank % 10 === 3
          ? "rd"
          : "th";
  return `${rank}${suffix}`;
}

function gamesBackLabel(
  value: string,
  gamesBackField: "divisionGamesBack" | "wildCardGamesBack",
): string {
  if (value !== "-" && value !== "—") return `${value} GB`;
  return gamesBackField === "wildCardGamesBack" ? "In position" : "Leader";
}

function ProjectionChange({
  current,
  projected,
  liveState,
  rankField,
  gamesBackField,
}: {
  current: Standing;
  projected: Standing | undefined;
  liveState: LiveStandingState | undefined;
  rankField: "divisionRank" | "wildCardRank";
  gamesBackField: "divisionGamesBack" | "wildCardGamesBack";
}) {
  if (!liveState) return <span className="projection-empty">—</span>;
  if (liveState === "tied" || !projected) {
    return <span className="projection-pending">Awaiting lead</span>;
  }

  const currentRank = current[rankField];
  const projectedRank = projected[rankField];
  const currentGamesBack = current[gamesBackField];
  const projectedGamesBack = projected[gamesBackField];
  let change = "No place change";

  if (projectedRank === null) {
    change = "Division lead";
  } else if (currentRank === null) {
    change = `Enters at ${ordinal(projectedRank)}`;
  } else if (projectedRank < currentRank) {
    change = `↑ to ${ordinal(projectedRank)}`;
  } else if (projectedRank > currentRank) {
    change = `↓ to ${ordinal(projectedRank)}`;
  } else if (gamesBack(currentGamesBack) !== gamesBack(projectedGamesBack)) {
    change = `${gamesBackLabel(currentGamesBack, gamesBackField)} → ${gamesBackLabel(projectedGamesBack, gamesBackField)}`;
  }

  const projectedPosition = projectedRank === null
    ? "Division leader"
    : `${ordinal(projectedRank)}, ${gamesBackLabel(projectedGamesBack, gamesBackField)}`;

  return (
    <span className="projection-change">
      <strong>{change}</strong>
      <small>{projected.wins}–{projected.losses} · {projectedPosition}</small>
    </span>
  );
}

function MiniStandingsTable({
  rows,
  selectedTeam,
  teamsPlayingToday,
  pickHighlights,
  rootAgainstTeams,
  liveStates,
  projectedByTeam,
  rankField,
  gamesBackField,
  emptyMessage,
}: {
  rows: Standing[];
  selectedTeam: Team;
  teamsPlayingToday: ReadonlySet<number>;
  pickHighlights: ReadonlyMap<number, PickHighlight>;
  rootAgainstTeams: ReadonlySet<number>;
  liveStates: ReadonlyMap<number, LiveStandingState>;
  projectedByTeam: ReadonlyMap<number, Standing>;
  rankField: "divisionRank" | "wildCardRank";
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
          <tr><th>Team</th><th>W</th><th>L</th><th>GB</th><th><abbr title="Projection if current live scores become final">Proj.</abbr></th></tr>
        </thead>
        <tbody>
          {rows.map((standing) => {
            const isPlayingToday = teamsPlayingToday.has(standing.team.id);
            const pickHighlight = pickHighlights.get(standing.team.id);
            const isPick = pickHighlight !== undefined;
            const isRootAgainst = rootAgainstTeams.has(standing.team.id);
            const liveState = liveStates.get(standing.team.id);
            const highlight = liveState ?? pickHighlight;
            const classes = [
              standing.team.id === selectedTeam.id ? "is-selected" : "",
              highlight ? `is-score-${highlight}` : "",
            ].filter(Boolean).join(" ");

            return (
              <tr key={standing.team.id} className={classes || undefined}>
                <th scope="row">
                  <span className="team-code">{standing.team.abbreviation}</span>
                  <span className="team-name">{standing.team.name}</span>
                  {isPlayingToday && (
                    <span className="standings-status standings-status--playing">Today</span>
                  )}
                  {isPick && (
                    <span className="standings-status standings-status--pick">Cheer</span>
                  )}
                  {isRootAgainst && (
                    <span className="standings-status standings-status--against">Boo</span>
                  )}
                </th>
                <td>{standing.wins}</td>
                <td>{standing.losses}</td>
                <td>{gamesBack(standing[gamesBackField])}</td>
                <td>
                  <ProjectionChange
                    current={standing}
                    projected={projectedByTeam.get(standing.team.id)}
                    liveState={liveState}
                    rankField={rankField}
                    gamesBackField={gamesBackField}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function StandingsTable({ selectedTeam, standings, games }: StandingsTableProps) {
  const projection = projectLiveStandings(standings, games);
  const projectedByTeam = new Map(
    projection.standings.map((standing) => [standing.team.id, standing]),
  );
  const teamsPlayingToday = new Set(
    games.flatMap((game) => [game.awayTeam.id, game.homeTeam.id]),
  );
  const pickHighlights = new Map<number, PickHighlight>();
  const rootAgainstTeams = new Set<number>();
  for (const game of games) {
    if (!game.rootFor) continue;

    const scoreState = pickScoreState(game);
    pickHighlights.set(
      game.rootFor.id,
      scoreState === "winning" || scoreState === "losing"
        ? scoreState
        : "neutral",
    );
    rootAgainstTeams.add(
      game.rootFor.id === game.awayTeam.id
        ? game.homeTeam.id
        : game.awayTeam.id,
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
        <span><span className="standings-status standings-status--against">Boo</span>Preferred loss</span>
        <span><i className="legend-swatch legend-swatch--pick-neutral" />Tied / scheduled cheer</span>
        <span><i className="legend-swatch legend-swatch--pick-winning" />Leading</span>
        <span><i className="legend-swatch legend-swatch--pick-losing" />Trailing</span>
        <span><i className="legend-swatch legend-swatch--selected" />Your team</span>
      </div>
      {standings.length === 0 ? (
        <div className="empty-panel">
          Current standings are not available yet. Check back once regular-season play begins.
        </div>
      ) : (
        <>
          <div className="standings-grid">
            <article className="standings-card">
              <h3>{selectedTeam.league} {selectedTeam.division.toLowerCase()}</h3>
              <MiniStandingsTable
                rows={divisionRows}
                selectedTeam={selectedTeam}
                teamsPlayingToday={teamsPlayingToday}
                pickHighlights={pickHighlights}
                rootAgainstTeams={rootAgainstTeams}
                liveStates={projection.liveStates}
                projectedByTeam={projectedByTeam}
                rankField="divisionRank"
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
                rootAgainstTeams={rootAgainstTeams}
                liveStates={projection.liveStates}
                projectedByTeam={projectedByTeam}
                rankField="wildCardRank"
                gamesBackField="wildCardGamesBack"
                emptyMessage="No Wild Card standings available."
              />
            </article>
          </div>
          <p className="standings-note">
            Live projections treat current leaders as winners. Tied games are not applied, and official MLB tiebreakers may produce a different order.
          </p>
        </>
      )}
    </section>
  );
}
