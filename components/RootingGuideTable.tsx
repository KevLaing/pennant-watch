import { BASEBALL_TIME_ZONE } from "@/lib/mlb/date";
import type { Team } from "@/lib/mlb/types";
import { formatRootingReasons } from "@/lib/postseason/presentation";
import {
  formatImpact,
  hasGameStarted,
  pickScoreState,
} from "@/lib/postseason/rootingGuide";
import type { RootingGuideEntry } from "@/lib/postseason/types";
import type { RacePosition } from "@/lib/postseason/standings";

type RootingGuideTableProps = {
  games: RootingGuideEntry[];
  totalGames: number;
  selectedTeam?: Team;
};

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: BASEBALL_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

function gameStatus(game: RootingGuideEntry): string {
  if (game.status.state === "scheduled") return timeFormatter.format(new Date(game.gameDate));
  return game.status.detail;
}

function impactClass(value: number): string {
  if (value > 0) return "impact impact--good";
  if (value < 0) return "impact impact--bad";
  return "impact impact--neutral";
}

function PositionImpact({
  current,
  outcome,
}: {
  current: RacePosition;
  outcome: RacePosition;
}) {
  if (
    current.wildCardRank === null &&
    outcome.wildCardRank === null &&
    current.leagueSeed !== null &&
    outcome.leagueSeed !== null &&
    current.leagueSeed !== outcome.leagueSeed
  ) {
    const change = current.leagueSeed - outcome.leagueSeed;
    return (
      <small className={`position-impact position-impact--${change > 0 ? "good" : "bad"}`}>
        Seed {change > 0 ? "↑" : "↓"}{Math.abs(change)}
      </small>
    );
  }

  if (current.wildCardRank !== null && outcome.wildCardRank === null) {
    return <small className="position-impact position-impact--good">Division lead</small>;
  }

  if (current.wildCardRank !== null && outcome.wildCardRank !== null) {
    const change = current.wildCardRank - outcome.wildCardRank;
    if (change !== 0) {
      return (
        <small className={`position-impact position-impact--${change > 0 ? "good" : "bad"}`}>
          WC {change > 0 ? "↑" : "↓"}{Math.abs(change)}
        </small>
      );
    }
  }

  if (current.divisionRank !== null && outcome.divisionRank !== null) {
    const change = current.divisionRank - outcome.divisionRank;
    if (change !== 0) {
      return (
        <small className={`position-impact position-impact--${change > 0 ? "good" : "bad"}`}>
          DIV {change > 0 ? "↑" : "↓"}{Math.abs(change)}
        </small>
      );
    }
  }

  return null;
}

export function RootingGuideTable({
  games,
  totalGames,
  selectedTeam,
}: RootingGuideTableProps) {
  return (
    <section className="guide-section" aria-labelledby="guide-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Today&apos;s leverage</p>
          <h2 id="guide-heading">Rooting guide</h2>
        </div>
        <span className="game-count">{games.length} {games.length === 1 ? "game" : "games"}</span>
      </div>

      {totalGames === 0 ? (
        <div className="empty-panel">
          There are no MLB games scheduled today.
        </div>
      ) : games.length === 0 ? (
        <div className="empty-panel">
          Today&apos;s schedule has no games that affect this league.
        </div>
      ) : (
        <div className="guide-table-wrap">
          <table className="guide-table">
            <thead>
              <tr><th>Game</th><th>Cheer</th><th>Why</th><th>Win</th><th>Lose</th></tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const scoreState = pickScoreState(game);
                const hasScore =
                  hasGameStarted(game) &&
                  game.awayScore !== null &&
                  game.homeScore !== null;
                const reason = formatRootingReasons(game.reasons, selectedTeam);

                return (
                  <tr
                    key={game.gamePk}
                    className={scoreState ? `pick-${scoreState}` : undefined}
                  >
                    <th scope="row">
                      <span className="matchup">
                        <span className="matchup-team">
                          <span>{game.awayTeam.abbreviation}</span>
                          {hasScore && <strong>{game.awayScore}</strong>}
                        </span>
                        <span className="matchup-at">at</span>
                        <span className="matchup-team">
                          <span>{game.homeTeam.abbreviation}</span>
                          {hasScore && <strong>{game.homeScore}</strong>}
                        </span>
                      </span>
                      <span className="game-status">
                        {gameStatus(game)}
                        {scoreState === "winning" && <i className="score-state score-state--winning">Cheer leads</i>}
                        {scoreState === "losing" && <i className="score-state score-state--losing">Cheer trails</i>}
                        {scoreState === "tied" && <i className="score-state score-state--tied">Tied</i>}
                      </span>
                    </th>
                    <td>
                      {game.rootFor ? (
                        <span className="root-team">
                          <span className="root-team__code">{game.rootFor.abbreviation}</span>
                          <span className="root-team__name">{game.rootFor.name}</span>
                        </span>
                      ) : (
                        <span className="no-preference">No preference</span>
                      )}
                    </td>
                    <td className="root-reason">
                      {reason ?? <span className="no-preference">No race impact</span>}
                    </td>
                    <td className={impactClass(game.winImpact)}>
                      {formatImpact(game.winImpact)}
                      <PositionImpact current={game.currentPosition} outcome={game.winPosition} />
                    </td>
                    <td className={impactClass(game.loseImpact)}>
                      {formatImpact(game.loseImpact)}
                      <PositionImpact current={game.currentPosition} outcome={game.losePosition} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="guide-note">
        Impact is the change, in games, at the primary active race boundary. Win and Lose refer to the team in “Cheer.”
      </p>
    </section>
  );
}
