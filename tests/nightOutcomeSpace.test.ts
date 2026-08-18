import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TonightOverview } from "../components/TonightOverview";
import { getTeamByAbbreviation } from "../lib/mlb/teams";
import type { Game, Standing, Team } from "../lib/mlb/types";
import {
  formatNightDelta,
  formatNightMovementDelta,
} from "../lib/postseason/night/presentation";
import {
  applyNightOutcomes,
  primaryRaceMargin,
  primaryObjectiveSatisfied,
} from "../lib/postseason/night/evaluateScenario";
import {
  createNightSlate,
  enumerateNightScenarios,
} from "../lib/postseason/night/enumerateScenarios";
import {
  buildNightOutcomeSummary,
  NIGHT_MOVEMENT_DELTAS,
  normalizeNightMovementDelta,
} from "../lib/postseason/night/summarizeNight";
import type {
  NightMovementDelta,
  NightOutcomeSummary,
} from "../lib/postseason/night/types";
import { createPennantRaceState } from "../lib/postseason/objectives";
import type { PennantRaceState } from "../lib/postseason/types";

const BASE_RECORDS: Record<string, [number, number]> = {
  BAL: [70, 50], BOS: [80, 40], NYY: [90, 30], TB: [60, 60], TOR: [79, 41],
  CWS: [55, 65], CLE: [88, 32], DET: [80, 41], KC: [65, 55], MIN: [75, 45],
  ATH: [50, 70], HOU: [86, 34], LAA: [68, 52], SEA: [84, 36], TEX: [78, 42],
};

function team(abbreviation: string): Team {
  const found = getTeamByAbbreviation(abbreviation);
  if (!found) throw new Error(`Unknown test team: ${abbreviation}`);
  return found;
}

function standings(
  overrides: Record<string, [number, number]> = {},
): Standing[] {
  return Object.entries(BASE_RECORDS).map(([abbreviation, record]) => {
    const [wins, losses] = overrides[abbreviation] ?? record;
    return {
      team: team(abbreviation),
      wins,
      losses,
      divisionRank: null,
      wildCardRank: null,
      divisionGamesBack: "—",
      wildCardGamesBack: "—",
      winningPercentage: wins / (wins + losses),
    };
  });
}

function game(
  gamePk: number,
  away: string,
  home: string,
  options: Partial<Game> = {},
): Game {
  return {
    gamePk,
    gameDate: `2026-09-15T${String(18 + (gamePk % 5)).padStart(2, "0")}:05:00Z`,
    officialDate: "2026-09-15",
    awayTeam: team(away),
    homeTeam: team(home),
    awayScore: null,
    homeScore: null,
    status: { state: "scheduled", detail: "Scheduled" },
    ...options,
  };
}

function raceState(
  values: Standing[],
  abbreviation = "TOR",
): PennantRaceState {
  const state = createPennantRaceState(values, team(abbreviation).id);
  assert.ok(state);
  return state;
}

function movementCounts(summary: NightOutcomeSummary): Map<NightMovementDelta, number> {
  assert.ok(summary.movementDistribution);
  return new Map(summary.movementDistribution.map(({ delta, count }) => [delta, count]));
}

function assertMovementInvariants(summary: NightOutcomeSummary): void {
  const counts = movementCounts(summary);
  assert.equal(
    summary.movementDistribution?.reduce((total, bucket) => total + bucket.count, 0),
    summary.scenarioCount,
  );
  assert.equal(summary.improvedCount, (counts.get(1) ?? 0) + (counts.get(0.5) ?? 0));
  assert.equal(summary.unchangedCount, counts.get(0) ?? 0);
  assert.equal(summary.worsenedCount, (counts.get(-0.5) ?? 0) + (counts.get(-1) ?? 0));
}

describe("night scenario enumeration", () => {
  for (const unresolvedCount of [0, 1, 2, 5, 11]) {
    it(`enumerates exactly 2^${unresolvedCount} scoreboards`, () => {
      const games = Array.from({ length: unresolvedCount }, (_, index) =>
        game(1_000 + index, "TOR", "LAA"),
      );
      const slate = createNightSlate(games, "AL");
      assert.equal([...enumerateNightScenarios(slate)].length, 2 ** unresolvedCount);
    });
  }

  it("fixes finals, excludes postponements, and leaves live games unresolved", () => {
    const slate = createNightSlate([
      game(1101, "TOR", "LAA", {
        awayScore: 5,
        homeScore: 2,
        status: { state: "final", detail: "Final" },
      }),
      game(1102, "DET", "CLE", {
        awayScore: 1,
        homeScore: 1,
        status: { state: "live", detail: "Top 6th" },
      }),
      game(1103, "NYY", "BOS", {
        status: { state: "postponed", detail: "Postponed" },
      }),
    ], "AL");

    assert.equal(slate.relevantGameCount, 2);
    assert.equal(slate.fixedGameCount, 1);
    assert.equal(slate.unresolvedGames.length, 1);
    assert.equal([...enumerateNightScenarios(slate)].length, 2);
    assert.deepEqual(slate.fixedOutcomes, [{
      gamePk: 1101,
      winnerTeamId: team("TOR").id,
      loserTeamId: team("LAA").id,
    }]);
  });

  it("includes the selected club's game and treats doubleheaders independently", () => {
    const slate = createNightSlate([
      game(1201, "TOR", "LAA"),
      game(1202, "TOR", "LAA"),
    ], "AL");
    const scenarios = [...enumerateNightScenarios(slate)];
    assert.equal(scenarios.length, 4);
    assert.deepEqual(
      new Set(scenarios.map((scenario) => scenario.outcomes.map((outcome) =>
        outcome.winnerTeamId === team("TOR").id ? "W" : "L",
      ).join(""))),
      new Set(["WW", "WL", "LW", "LL"]),
    );
  });

  it("excludes other-league games but keeps interleague games involving the selected league", () => {
    const slate = createNightSlate([
      game(1301, "LAD", "SD"),
      game(1302, "TOR", "LAD"),
    ], "AL");
    assert.deepEqual(slate.unresolvedGames.map(({ gamePk }) => gamePk), [1302]);
  });
});

describe("night scenario evaluation", () => {
  it("summarizes an empty unresolved slate as one unchanged scoreboard", () => {
    const summary = buildNightOutcomeSummary(team("TOR"), standings(), []);
    assert.ok(summary);
    assert.equal(summary.scenarioCount, 1);
    assert.equal(summary.unchangedCount, 1);
    assert.deepEqual(summary.bestScenario.outcomes, []);
    assert.deepEqual(summary.worstScenario.outcomes, []);
    assert.deepEqual(summary.movementDistribution, [
      { delta: 1, count: 0 },
      { delta: 0.5, count: 0 },
      { delta: 0, count: 1 },
      { delta: -0.5, count: 0 },
      { delta: -1, count: 0 },
    ]);
  });

  it("applies a final result as fixed context without doubling the outcome space", () => {
    const summary = buildNightOutcomeSummary(team("TOR"), standings(), [
      game(1351, "TOR", "LAA", {
        awayScore: 4,
        homeScore: 2,
        status: { state: "final", detail: "Final" },
      }),
    ]);
    assert.ok(summary);
    assert.equal(summary.scenarioCount, 1);
    assert.equal(summary.fixedGameCount, 1);
    assert.equal(summary.fixedOutcomes[0]?.winnerTeamId, team("TOR").id);
    assert.equal(movementCounts(summary).get(0), 1);
    assertMovementInvariants(summary);
  });

  it("applies all wins and losses without mutating the baseline standings", () => {
    const baseline = standings();
    const applied = applyNightOutcomes(baseline, [
      { gamePk: 1401, winnerTeamId: team("TOR").id, loserTeamId: team("LAA").id },
      { gamePk: 1402, winnerTeamId: team("TOR").id, loserTeamId: team("DET").id },
    ]);
    assert.equal(baseline.find((standing) => standing.team.id === team("TOR").id)?.wins, 79);
    assert.equal(applied.find((standing) => standing.team.id === team("TOR").id)?.wins, 81);
    assert.equal(applied.find((standing) => standing.team.id === team("LAA").id)?.losses, 53);
    assert.equal(applied.find((standing) => standing.team.id === team("DET").id)?.losses, 42);
  });

  it("classifies WC crossings and aggregates every scenario once", () => {
    const summary = buildNightOutcomeSummary(team("TOR"), standings(), [
      game(1501, "TOR", "LAA"),
      game(1502, "DET", "CLE"),
    ]);
    assert.ok(summary);
    assert.equal(summary.scenarioCount, 4);
    assert.equal(summary.improvedCount + summary.unchangedCount + summary.worsenedCount, 4);
    assert.equal(summary.positionDistribution.reduce((sum, bucket) => sum + bucket.count, 0), 4);
    assert.ok(summary.positionDistribution.some(({ key }) => key === "WC3"));
    assert.ok(summary.positionDistribution.some(({ key }) => key === "WC4"));
    assert.ok(summary.improvedCount > 0);
    assert.ok(summary.worsenedCount > 0);
    assert.deepEqual(
      summary.movementDistribution?.map(({ delta }) => delta),
      [...NIGHT_MOVEMENT_DELTAS],
    );
    assert.deepEqual(summary.movementDistribution, [
      { delta: 1, count: 1 },
      { delta: 0.5, count: 0 },
      { delta: 0, count: 2 },
      { delta: -0.5, count: 0 },
      { delta: -1, count: 1 },
    ]);
    assertMovementInvariants(summary);
  });

  it("counts positive and negative half-game movement from the selected-team game", () => {
    const summary = buildNightOutcomeSummary(
      team("TOR"),
      standings(),
      [game(1551, "TOR", "LAA")],
    );
    assert.ok(summary);
    const counts = movementCounts(summary);
    assert.equal(counts.get(1), 0);
    assert.equal(counts.get(0.5), 1);
    assert.equal(counts.get(0), 0);
    assert.equal(counts.get(-0.5), 1);
    assert.equal(counts.get(-1), 0);
    assertMovementInvariants(summary);
  });

  it("keeps the baseline boundary team fixed when the resulting cutoff changes", () => {
    const baseline = standings();
    const baselineState = raceState(baseline);
    assert.equal(
      baselineState.primaryObjective?.boundaryTeamIds[0],
      team("DET").id,
    );
    const hypothetical = applyNightOutcomes(baseline, [
      { gamePk: 1571, winnerTeamId: team("TOR").id, loserTeamId: team("LAA").id },
      { gamePk: 1572, winnerTeamId: team("LAA").id, loserTeamId: team("BOS").id },
      { gamePk: 1573, winnerTeamId: team("TB").id, loserTeamId: team("BOS").id },
    ]);
    const resultingState = raceState(hypothetical);
    assert.equal(
      resultingState.primaryObjective?.boundaryTeamIds[0],
      team("BOS").id,
    );
    assert.equal(
      primaryRaceMargin(hypothetical, baselineState) -
        primaryRaceMargin(baseline, baselineState),
      0.5,
    );

    const summary = buildNightOutcomeSummary(team("TOR"), baseline, [
      game(1571, "TOR", "LAA"),
      game(1572, "BOS", "LAA"),
      game(1573, "BOS", "TB"),
    ]);
    assert.ok(summary);
    const counts = movementCounts(summary);
    assert.equal(counts.get(0.5), 4);
    assert.equal(counts.get(-0.5), 4);
    assertMovementInvariants(summary);
  });

  it("detects WC3-to-WC2 improvement and WC3-to-WC4 worsening", () => {
    const summary = buildNightOutcomeSummary(
      team("TOR"),
      standings({ TOR: [81, 41] }),
      [game(1601, "TOR", "LAA")],
    );
    assert.ok(summary);
    assert.deepEqual(summary.positionDistribution.map(({ key }) => key), ["WC2", "WC4"]);
    assert.equal(summary.improvedCount, 1);
    assert.equal(summary.worsenedCount, 1);
  });

  it("keeps unrelated same-league outcomes unchanged", () => {
    const summary = buildNightOutcomeSummary(
      team("TOR"),
      standings(),
      [game(1701, "LAA", "ATH")],
    );
    assert.ok(summary);
    assert.equal(summary.unchangedCount, 2);
    assert.equal(summary.improvedCount, 0);
    assert.equal(summary.worsenedCount, 0);
    assert.equal(movementCounts(summary).get(0), 2);
    assertMovementInvariants(summary);
  });

  it("uses division position buckets for a division objective", () => {
    const summary = buildNightOutcomeSummary(
      team("TOR"),
      standings({ TOR: [85, 35], NYY: [85, 35] }),
      [game(1801, "TOR", "LAA")],
    );
    assert.ok(summary);
    assert.equal(summary.target?.objective, "DEFEND_DIVISION");
    assert.deepEqual(summary.positionDistribution.map(({ key }) => key), ["DIV1", "DIV2"]);
    assert.equal(summary.successfulScenarioCount, 1);
  });

  it("tracks a cross-division result moving a clinched division winner into a bye", () => {
    const late = Object.fromEntries(
      Object.keys(BASE_RECORDS).map((abbreviation) => [abbreviation, [80, 80] as [number, number]]),
    );
    Object.assign(late, { TOR: [100, 60], CLE: [102, 58], HOU: [100, 60] });
    const summary = buildNightOutcomeSummary(
      team("TOR"),
      standings(late),
      [game(1901, "HOU", "LAA")],
    );
    assert.ok(summary);
    assert.equal(summary.target?.objective, "EARN_BYE");
    assert.deepEqual(summary.positionDistribution.map(({ key }) => key), ["SEED2", "SEED3"]);
    assert.equal(summary.successfulScenarioCount, 1);
  });

  it("counts exact playoff-target and top-seed successes", () => {
    const makePlayoffs = buildNightOutcomeSummary(
      team("TOR"),
      standings({ DET: [81, 42] }),
      [game(1951, "TOR", "LAA")],
    );
    const defendPlayoffs = buildNightOutcomeSummary(
      team("TOR"),
      standings({ TOR: [81, 41] }),
      [game(1952, "TOR", "LAA")],
    );
    const late = Object.fromEntries(
      Object.keys(BASE_RECORDS).map((abbreviation) => [abbreviation, [80, 80] as [number, number]]),
    );
    Object.assign(late, { TOR: [100, 60], CLE: [100, 60], HOU: [95, 65] });
    const earnTopSeed = buildNightOutcomeSummary(
      team("TOR"),
      standings(late),
      [game(1953, "TOR", "LAA")],
    );

    assert.equal(makePlayoffs?.target?.objective, "MAKE_PLAYOFFS");
    assert.equal(makePlayoffs?.successfulScenarioCount, 1);
    assert.equal(defendPlayoffs?.target?.objective, "DEFEND_PLAYOFF_SPOT");
    assert.equal(defendPlayoffs?.successfulScenarioCount, 1);
    assert.equal(earnTopSeed?.target?.objective, "EARN_TOP_SEED");
    assert.equal(earnTopSeed?.successfulScenarioCount, 1);
    assert.deepEqual(earnTopSeed?.positionDistribution.map(({ key }) => key), ["SEED1", "SEED2"]);
  });

  it("reports target success for playoff, division, bye, top-seed, and WC-improvement states", () => {
    const wc4 = raceState(standings());
    const wc3 = raceState(standings({ TOR: [81, 41] }));
    const wc2 = raceState(standings({ TOR: [82, 41] }));
    const divisionLeader = raceState(standings({ TOR: [91, 29] }));
    const seedTwo = { ...divisionLeader, leagueSeed: 2, divisionRank: 1 };
    const seedOne = { ...divisionLeader, leagueSeed: 1, divisionRank: 1 };

    assert.equal(primaryObjectiveSatisfied("MAKE_PLAYOFFS", wc4, wc3), true);
    assert.equal(primaryObjectiveSatisfied("DEFEND_PLAYOFF_SPOT", wc3, wc4), false);
    assert.equal(primaryObjectiveSatisfied("WIN_DIVISION", wc3, divisionLeader), true);
    assert.equal(primaryObjectiveSatisfied("DEFEND_DIVISION", divisionLeader, wc3), false);
    assert.equal(primaryObjectiveSatisfied("EARN_BYE", divisionLeader, seedTwo), true);
    assert.equal(primaryObjectiveSatisfied("DEFEND_BYE", seedTwo, wc3), false);
    assert.equal(primaryObjectiveSatisfied("EARN_TOP_SEED", seedTwo, seedOne), true);
    assert.equal(primaryObjectiveSatisfied("DEFEND_TOP_SEED", seedOne, seedTwo), false);
    assert.equal(primaryObjectiveSatisfied("IMPROVE_WILD_CARD_SEED", wc3, wc2), true);
  });

  it("retains only the best and worst scoreboards and uses true margin extrema", () => {
    const summary = buildNightOutcomeSummary(team("TOR"), standings(), [
      game(2001, "TOR", "LAA"),
      game(2002, "DET", "CLE"),
    ]);
    assert.ok(summary);
    assert.equal(summary.bestDelta, 1);
    assert.equal(summary.worstDelta, -1);
    assert.equal(summary.bestScenario.outcomes.length, 2);
    assert.equal(summary.worstScenario.outcomes.length, 2);
    assert.deepEqual(
      summary.bestScenario.outcomes.map(({ winnerTeamId }) => winnerTeamId),
      [team("TOR").id, team("CLE").id],
    );
    assert.deepEqual(
      summary.worstScenario.outcomes.map(({ winnerTeamId }) => winnerTeamId),
      [team("LAA").id, team("DET").id],
    );
    assert.equal("scenarios" in summary, false);
  });

  it("processes 15 binary games as 32,768 streamed scenarios", () => {
    const games = Array.from({ length: 15 }, (_, index) =>
      game(2100 + index, "LAA", "ATH"),
    );
    const summary = buildNightOutcomeSummary(team("TOR"), standings(), games);
    assert.ok(summary);
    assert.equal(summary.scenarioCount, 32_768);
    assert.equal(summary.improvedCount + summary.unchangedCount + summary.worsenedCount, 32_768);
    assert.equal(summary.bestScenario.outcomes.length, 15);
    assert.equal(summary.worstScenario.outcomes.length, 15);
    assert.equal("scenarios" in summary, false);
    assert.equal(movementCounts(summary).get(0), 32_768);
    assertMovementInvariants(summary);
  });

  it("hides the five-bucket distribution when no active boundary exists", () => {
    const eliminated = Object.fromEntries(
      Object.keys(BASE_RECORDS).map((abbreviation) => [abbreviation, [70, 90] as [number, number]]),
    );
    Object.assign(eliminated, {
      NYY: [95, 65], BOS: [94, 66], CLE: [93, 67], DET: [92, 68],
      HOU: [91, 69], SEA: [90, 70],
    });
    const summary = buildNightOutcomeSummary(team("TOR"), standings(eliminated), []);
    assert.ok(summary);
    assert.equal(summary.target, null);
    assert.equal(summary.movementDistribution, null);
  });

  it("does not clamp an out-of-range doubleheader movement into the canonical buckets", () => {
    const summary = buildNightOutcomeSummary(team("TOR"), standings(), [
      game(2151, "TOR", "LAA"),
      game(2152, "TOR", "LAA"),
      game(2153, "DET", "CLE"),
    ]);
    assert.ok(summary);
    assert.equal(summary.scenarioCount, 8);
    assert.equal(summary.bestDelta, 1.5);
    assert.equal(summary.worstDelta, -1.5);
    assert.equal(summary.movementDistribution, null);
  });
});

describe("night overview presentation", () => {
  it("formats signed, singular, and zero game deltas without negative zero", () => {
    assert.equal(formatNightDelta(1.5), "+1.5 games");
    assert.equal(formatNightDelta(-1), "-1 game");
    assert.equal(formatNightDelta(-0), "0 games");
    assert.equal(formatNightMovementDelta(1), "+1");
    assert.equal(formatNightMovementDelta(0.5), "+0.5");
    assert.equal(formatNightMovementDelta(0), "0");
    assert.equal(formatNightMovementDelta(-0.5), "-0.5");
    assert.equal(formatNightMovementDelta(-1), "-1");
  });

  it("normalizes floating-point half games and negative zero without clamping", () => {
    assert.equal(normalizeNightMovementDelta(0.499999999), 0.5);
    assert.equal(normalizeNightMovementDelta(-0.500000001), -0.5);
    assert.equal(normalizeNightMovementDelta(-0), 0);
    assert.equal(normalizeNightMovementDelta(1.5), null);
  });

  it("renders the exhaustive summary and explicit non-probability disclaimer", () => {
    const summary: NightOutcomeSummary = {
      relevantGameCount: 1,
      unresolvedGameCount: 1,
      fixedGameCount: 0,
      scenarioCount: 32_768,
      improvedCount: 16_000,
      unchangedCount: 2_768,
      worsenedCount: 14_000,
      bestDelta: 0.5,
      worstDelta: -0.5,
      successfulScenarioCount: 1,
      target: { objective: "MAKE_PLAYOFFS", baselineWildCardRank: 4 },
      movementDistribution: [
        { delta: 1, count: 10_000 },
        { delta: 0.5, count: 6_000 },
        { delta: 0, count: 2_768 },
        { delta: -0.5, count: 6_000 },
        { delta: -1, count: 8_000 },
      ],
      positionDistribution: [{ key: "WC3", count: 1 }, { key: "WC4", count: 1 }],
      fixedOutcomes: [],
      bestScenario: { scenarioId: 0, outcomes: [{ gamePk: 2201, winnerTeamId: team("TOR").id, loserTeamId: team("LAA").id }] },
      worstScenario: { scenarioId: 1, outcomes: [{ gamePk: 2201, winnerTeamId: team("LAA").id, loserTeamId: team("TOR").id }] },
    };
    const html = renderToStaticMarkup(createElement(TonightOverview, {
      selectedTeam: team("TOR"),
      summary,
    }));

    assert.match(html, /Possible outcomes affecting/);
    assert.match(html, /<strong>32,768<\/strong>/);
    assert.match(html, /1 possible scoreboards put TOR in WC3 or better/);
    assert.match(html, /Improve TOR&#x27;s Wild Card position/);
    const movementLabels = ["+1", "+0.5", "0", "-0.5", "-1"];
    const movementMarkup = html.slice(
      html.indexOf("night-movement"),
      html.indexOf("night-footer-grid"),
    );
    for (let index = 1; index < movementLabels.length; index += 1) {
      assert.ok(
        movementMarkup.indexOf(`>${movementLabels[index - 1]}<`) <
        movementMarkup.indexOf(`>${movementLabels[index]}<`),
      );
    }
    assert.match(html, /Tonight&#x27;s movement/);
    assert.match(html, /10,000<\/b> scoreboards/);
    assert.doesNotMatch(html, /Best possible night|Worst possible night|night-extremes/);
    assert.match(html, /Exhaustive result combinations, not probabilities/);
  });
});
