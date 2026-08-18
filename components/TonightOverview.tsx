import type { Team } from "@/lib/mlb/types";
import {
  formatNightBoundaryLabel,
  formatNightDelta,
  formatNightMovementDelta,
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
  const boundaryLabel = formatNightBoundaryLabel(summary, selectedTeam);

  return (
    <section className="night-section" aria-labelledby="night-heading">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Tonight&apos;s scoreboard</p>
          <h2 id="night-heading">Possibile Outcomes</h2>
        </div>
        <span className="game-count">
          {summary.unresolvedGameCount} unresolved
        </span>
      </div>

      <div className="night-hero">
        <div>
          <strong>{summary.scenarioCount.toLocaleString("en-CA")}</strong>
          <span>Possible scoreboards affecting the {selectedTeam.name} based on {summary.relevantGameCount} relevant games for today.</span>
        </div>
        <p>
          {summary.unresolvedGameCount === 0
            ? "Tonight's relevant results are fixed, leaving one scoreboard."
            : <>1 scoreboard for every home-or-away winner combination across tonight&apos;s {summary.unresolvedGameCount} unresolved relevant {summary.unresolvedGameCount === 1 ? "game" : "games"}.</>}
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

      {summary.movementDistribution && (
        <section className="night-movement" aria-labelledby="night-movement-heading">
          <div className="night-movement__heading">
            <h3 id="night-movement-heading">Tonight&apos;s movement</h3>
            <span>Change at {boundaryLabel}</span>
          </div>
          <ul className="night-movement__buckets">
            {summary.movementDistribution.map((bucket) => {
              const label = formatNightMovementDelta(bucket.delta);
              const direction = bucket.delta > 0
                ? "good"
                : bucket.delta < 0
                  ? "bad"
                  : "neutral";
              return (
                <li
                  className={`night-movement__bucket night-movement__bucket--${direction}`}
                  key={bucket.delta}
                  aria-label={`${bucket.count.toLocaleString("en-US")} possible scoreboards produce ${formatNightDelta(bucket.delta)} of movement at ${boundaryLabel}`}
                >
                  <strong>{label}</strong>
                  <span>
                    <b>{bucket.count.toLocaleString("en-US")}</b> scoreboards
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

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
