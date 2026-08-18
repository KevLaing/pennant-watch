import type { Team } from "@/lib/mlb/types";
import {
  formatNightDelta,
  formatNightPosition,
  formatNightRaceLabel,
  formatNightSuccess,
} from "@/lib/postseason/night/presentation";
import type { NightOutcomeSummary } from "@/lib/postseason/night/types";

type TonightOverviewProps = {
  selectedTeam: Team;
  summary: NightOutcomeSummary;
};

export function TonightOverview({
  selectedTeam,
  summary,
}: TonightOverviewProps) {
  const success = formatNightSuccess(summary, selectedTeam);
  const raceLabel = formatNightRaceLabel(summary, selectedTeam);

  return (
    <section className="night-section" aria-labelledby="night-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Tonight&apos;s scoreboard</p>
          <h2 id="night-heading">Outcome space</h2>
        </div>
        <span className="game-count">
          {summary.unresolvedGameCount} unresolved
        </span>
      </div>

      <div className="night-hero">
        <div>
          
          <strong>{summary.scenarioCount.toLocaleString("en-CA")}</strong>
          <span>Possible outcomes affecting the {selectedTeam.name} based on {summary.relevantGameCount} relevant games for today.</span>
        </div>
        <p>
          {summary.unresolvedGameCount === 0
            ? "Tonight's relevant results are fixed, leaving one scoreboard."
            : <>Every home-or-away winner combination across tonight&apos;s {summary.unresolvedGameCount} unresolved relevant {summary.unresolvedGameCount === 1 ? "game" : "games"}.</>}
        </p>
      </div>

      <div className="night-classifications" aria-label="Scenario classifications">
        <div className="night-count night-count--good">
          <strong>{summary.improvedCount.toLocaleString("en-US")}</strong>
          <span>Improve {raceLabel}</span>
        </div>
        <div className="night-count">
          <strong>{summary.unchangedCount.toLocaleString("en-US")}</strong>
          <span>Leave it unchanged</span>
        </div>
        <div className="night-count night-count--bad">
          <strong>{summary.worsenedCount.toLocaleString("en-US")}</strong>
          <span>Worsen {raceLabel}</span>
        </div>
      </div>

      <div className="night-extremes">
        <article>
          <p className="eyebrow">Best possible night</p>
          <strong className="night-delta night-delta--good">
            {formatNightDelta(summary.bestDelta)}
          </strong>
        </article>
        <article>
          <p className="eyebrow">Worst possible night</p>
          <strong className="night-delta night-delta--bad">
            {formatNightDelta(summary.worstDelta)}
          </strong>
        </article>
      </div>

      <div className="night-footer-grid">
        <div>
          <p className="night-label">Where {selectedTeam.abbreviation} finishes</p>
          <ul className="night-distribution">
            {summary.positionDistribution.map((position) => (
              <li key={position.key}>
                <span>{formatNightPosition(position.key)}</span>
                <strong>{position.count.toLocaleString("en-US")}</strong>
              </li>
            ))}
          </ul>
        </div>
        {success && (
          <div className="night-target">
            <p className="night-label">Primary target</p>
            <strong>{success}</strong>
          </div>
        )}
      </div>

      <p className="guide-note">
        Exhaustive result combinations, not probabilities. Final games are fixed at their actual result; postponed games are excluded.
      </p>
    </section>
  );
}
