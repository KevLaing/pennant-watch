import { BASEBALL_TIME_ZONE } from "@/lib/mlb/date";
import {
  formatImpact,
  hasGameStarted,
  pickScoreState,
} from "@/lib/postseason/rootingGuide";
import type { RootingGuideEntry } from "@/lib/postseason/types";

type RootingGuideTableProps = {
  games: RootingGuideEntry[];
  totalGames: number;
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

export function RootingGuideTable({ games, totalGames }: RootingGuideTableProps) {
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
              <tr><th>Game</th><th>Root For</th><th>Win</th><th>Lose</th></tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const scoreState = pickScoreState(game);
                const hasScore =
                  hasGameStarted(game) &&
                  game.awayScore !== null &&
                  game.homeScore !== null;

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
                        {scoreState === "winning" && <i className="score-state score-state--winning">Pick leads</i>}
                        {scoreState === "losing" && <i className="score-state score-state--losing">Pick trails</i>}
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
                    <td className={impactClass(game.winImpact)}>{formatImpact(game.winImpact)}</td>
                    <td className={impactClass(game.loseImpact)}>{formatImpact(game.loseImpact)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="guide-note">
        Impact is the change, in games, to the clearest current division or Wild Card path. Win and Lose refer to the team in “Root For.”
      </p>
    </section>
  );
}
