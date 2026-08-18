import { BASEBALL_TIME_ZONE } from "@/lib/mlb/date";
import type { Team } from "@/lib/mlb/types";
import {
  formatRootingReasons,
  formatRootingScenario,
} from "@/lib/postseason/presentation";
import {
  hasGameStarted,
  pickScoreState,
} from "@/lib/postseason/rootingGuide";
import type { RootingGuideEntry } from "@/lib/postseason/types";
import { readableTextColor } from "@/lib/theme";

type RootingGuideTableProps = {
  games: RootingGuideEntry[];
  totalGames: number;
  selectedTeam?: Team;
  teams?: readonly Team[];
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

export function RootingGuideTable({
  games,
  totalGames,
  selectedTeam,
  teams = [],
}: RootingGuideTableProps) {
  return (
    <section className="guide-section" aria-labelledby="guide-heading">
      <div className="section-heading">
        <h2 id="guide-heading">Rooting guide</h2>
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
              <tr>
                <th scope="col">Game</th>
                <th scope="col">Cheer</th>
                <th scope="col">Why</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const scoreState = pickScoreState(game);
                const hasScore =
                  hasGameStarted(game) &&
                  game.awayScore !== null &&
                  game.homeScore !== null;
                const reason = selectedTeam && game.primaryScenario
                  ? formatRootingScenario(
                      game.primaryScenario,
                      selectedTeam,
                      [game.awayTeam, game.homeTeam, ...teams],
                    )
                  : formatRootingReasons(game.reasons, selectedTeam);

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
                          <span
                            className="root-team__code"
                            style={{
                              backgroundColor: game.rootFor.primaryColor,
                              borderBottomColor: game.rootFor.secondaryColor,
                              color: readableTextColor(game.rootFor.primaryColor),
                            }}
                          >
                            {game.rootFor.abbreviation}
                          </span>
                          <span className="root-team__name">{game.rootFor.name}</span>
                        </span>
                      ) : (
                        <span className="no-preference">No preference</span>
                      )}
                    </td>
                    <td className="root-reason">
                      {reason ?? <span className="no-preference">No race impact</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
