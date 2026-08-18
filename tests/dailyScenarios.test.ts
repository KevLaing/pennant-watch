import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RootingGuideTable } from "../components/RootingGuideTable";
import { getTeamByAbbreviation } from "../lib/mlb/teams";
import type { Game, Standing, Team } from "../lib/mlb/types";
import {
  formatRootingReasons,
  formatRootingScenario,
} from "../lib/postseason/presentation";
import { buildRootingGuide } from "../lib/postseason/rootingGuide";
import { findSelectedTeamScenarioGame } from "../lib/postseason/scenarios";
import type { RootingScenario } from "../lib/postseason/types";

const BASE_RECORDS: Record<string, [number, number]> = {
  BAL: [70, 50],
  BOS: [80, 40],
  NYY: [90, 30],
  TB: [60, 60],
  TOR: [79, 41],
  CWS: [55, 65],
  CLE: [88, 32],
  DET: [80, 41],
  KC: [65, 55],
  MIN: [75, 45],
  ATH: [50, 70],
  HOU: [86, 34],
  LAA: [68, 52],
  SEA: [84, 36],
  TEX: [78, 42],
};

function team(abbreviation: string): Team {
  const found = getTeamByAbbreviation(abbreviation);
  if (!found) throw new Error(`Unknown test team: ${abbreviation}`);
  return found;
}

function standings(
  overrides: Record<string, [number, number]> = {},
): Standing[] {
  return Object.entries(BASE_RECORDS).map(([abbreviation, defaultRecord]) => {
    const [wins, losses] = overrides[abbreviation] ?? defaultRecord;
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
    gameDate: "2026-09-15T23:05:00Z",
    officialDate: "2026-09-15",
    awayTeam: team(away),
    homeTeam: team(home),
    awayScore: null,
    homeScore: null,
    status: { state: "scheduled", detail: "Scheduled" },
    ...options,
  };
}

function why(entry: ReturnType<typeof buildRootingGuide>[number]): string | null {
  return entry.primaryScenario
      ? formatRootingScenario(
        entry.primaryScenario,
        team("TOR"),
        Object.keys(BASE_RECORDS).map(team),
      )
    : null;
}

function lateWildCardStandings(
  tor: [number, number],
  det: [number, number],
): Standing[] {
  return standings({
    NYY: [90, 70],
    TOR: tor,
    BOS: [70, 90],
    BAL: [65, 95],
    TB: [60, 100],
    CLE: [88, 72],
    DET: det,
    MIN: [72, 88],
    KC: [68, 92],
    CWS: [55, 105],
    HOU: [86, 74],
    SEA: [84, 76],
    TEX: [83, 77],
    LAA: [68, 92],
    ATH: [50, 110],
  });
}

describe("daily scenario composition", () => {
  it("explains when the selected-team win alone moves WC4 to WC3", () => {
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings({ DET: [81, 42] }),
      [game(301, "TOR", "LAA")],
    );

    assert.deepEqual(entry.primaryScenario?.requiredResults, [
      { teamId: team("TOR").id, result: "WIN" },
    ]);
    assert.deepEqual(entry.primaryScenario?.consequence, {
      type: "POSITION_GAINED",
      race: "WILD_CARD",
      fromRank: 4,
      toRank: 3,
    });
    assert.equal(why(entry), "TOR win pulls TOR even with DET.");
  });

  it("combines a selected-team win and competitor loss to enter WC3", () => {
    const entries = buildRootingGuide(team("TOR"), standings(), [
      game(302, "TOR", "LAA"),
      game(303, "DET", "CLE"),
    ]);
    const entry = entries.find((candidate) => candidate.gamePk === 303);
    assert.ok(entry);

    assert.equal(entry.rootFor?.abbreviation, "CLE");
    assert.deepEqual(entry.primaryScenario?.requiredResults, [
      { teamId: team("TOR").id, result: "WIN" },
      { teamId: team("DET").id, result: "LOSS" },
    ]);
    assert.deepEqual(entry.primaryScenario?.consequence, {
      type: "POSITION_GAINED",
      race: "WILD_CARD",
      fromRank: 4,
      toRank: 3,
    });
    assert.equal(
      why(entry),
      "TOR win + DET loss moves TOR 0.5 games ahead of DET.",
    );
  });

  const pairwiseCases: Array<{
    name: string;
    balRecord: [number, number];
    expected: string;
  }> = [
    {
      name: "cuts a 1.5-game deficit to a half-game",
      balRecord: [82, 41],
      expected: "TOR win + BAL loss cuts the gap to BAL to 0.5 games.",
    },
    {
      name: "pulls the selected team even with its competitor",
      balRecord: [81, 41],
      expected: "TOR win + BAL loss pulls TOR even with BAL.",
    },
    {
      name: "moves the selected team a half-game ahead",
      balRecord: [80, 41],
      expected: "TOR win + BAL loss moves TOR 0.5 games ahead of BAL.",
    },
    {
      name: "extends an existing lead over its competitor",
      balRecord: [79, 42],
      expected: "TOR win + BAL loss extends TOR's lead over BAL to 1.5 games.",
    },
  ];

  for (const { name, balRecord, expected } of pairwiseCases) {
    it(name, () => {
      const entry = buildRootingGuide(
        team("TOR"),
        standings({ BAL: balRecord }),
        [game(330, "TOR", "TB"), game(331, "BAL", "LAA")],
      ).find((candidate) => candidate.gamePk === 331);
      assert.ok(entry);

      assert.equal(entry.rootFor?.abbreviation, "LAA");
      assert.equal(why(entry), expected);
      assert.doesNotMatch(why(entry) ?? "", /puts TOR into WC3/);
    });
  }

  it("explains a combined result closing the division gap", () => {
    const raceStandings = standings({
      TOR: [80, 40],
      NYY: [83, 37],
      BOS: [77, 43],
      DET: [78, 42],
      SEA: [79, 41],
    });
    const entry = buildRootingGuide(team("TOR"), raceStandings, [
      game(304, "TOR", "LAA"),
      game(305, "NYY", "LAD"),
    ]).find((candidate) => candidate.gamePk === 305);
    assert.ok(entry);

    assert.deepEqual(entry.primaryScenario?.consequence, {
      type: "GAP_CLOSED",
      race: "DIVISION",
      fromGamesBack: 3,
      toGamesBack: 2,
      targetTeamId: team("NYY").id,
    });
    assert.equal(why(entry), "TOR win + NYY loss cuts the gap to NYY to 2 games.");
  });

  it("detects a tie for the division lead", () => {
    const raceStandings = standings({
      TOR: [80, 40],
      NYY: [81, 39],
      BOS: [77, 43],
      DET: [78, 42],
      SEA: [79, 41],
    });
    const entry = buildRootingGuide(team("TOR"), raceStandings, [
      game(306, "TOR", "LAA"),
      game(307, "NYY", "LAD"),
    ]).find((candidate) => candidate.gamePk === 307);
    assert.ok(entry);

    assert.equal(entry.primaryScenario?.consequence.type, "TIE_CREATED");
    assert.equal(entry.primaryScenario?.consequence.race, "DIVISION");
    assert.equal(
      why(entry),
      "TOR win + NYY loss pulls TOR even with NYY.",
    );
  });

  it("detects taking the division lead", () => {
    const raceStandings = standings({
      TOR: [80, 40],
      NYY: [81, 40],
      BOS: [77, 43],
      DET: [78, 42],
      SEA: [79, 41],
    });
    const entry = buildRootingGuide(team("TOR"), raceStandings, [
      game(308, "TOR", "LAA"),
      game(309, "NYY", "LAD"),
    ]).find((candidate) => candidate.gamePk === 309);
    assert.ok(entry);

    assert.equal(entry.primaryScenario?.consequence.type, "LEAD_TAKEN");
    assert.equal(
      why(entry),
      "TOR win + NYY loss moves TOR 0.5 games ahead of NYY.",
    );
  });

  it("detects moving from seed three into the second bye", () => {
    const raceStandings = standings({
      TOR: [85, 35],
      NYY: [84, 36],
      CLE: [90, 30],
      HOU: [86, 35],
    });
    const entry = buildRootingGuide(team("TOR"), raceStandings, [
      game(310, "TOR", "BAL"),
      game(311, "HOU", "LAA"),
    ]).find((candidate) => candidate.gamePk === 311);
    assert.ok(entry);

    assert.deepEqual(entry.primaryScenario?.consequence, {
      type: "POSITION_GAINED",
      race: "BYE",
      fromRank: 3,
      toRank: 2,
    });
    assert.equal(
      why(entry),
      "TOR win + HOU loss moves TOR 0.5 games ahead of HOU.",
    );
  });

  it("detects moving from seed two to the top seed", () => {
    const raceStandings = standings({
      TOR: [89, 31],
      NYY: [84, 36],
      CLE: [90, 31],
      HOU: [88, 32],
    });
    const entry = buildRootingGuide(team("TOR"), raceStandings, [
      game(312, "TOR", "BAL"),
      game(313, "CLE", "LAA"),
    ]).find((candidate) => candidate.gamePk === 313);
    assert.ok(entry);

    assert.equal(entry.primaryScenario?.consequence.type, "POSITION_GAINED");
    assert.equal(entry.primaryScenario?.consequence.race, "TOP_SEED");
    assert.equal(
      why(entry),
      "TOR win + CLE loss moves TOR 0.5 games ahead of CLE.",
    );
  });

  it("explains extending the WC3 cushion", () => {
    const entry = buildRootingGuide(
      team("TOR"),
      lateWildCardStandings([81, 79], [80, 80]),
      [game(314, "TOR", "LAA"), game(315, "DET", "CWS")],
    ).find((candidate) => candidate.gamePk === 315);
    assert.ok(entry);

    assert.deepEqual(entry.primaryScenario?.consequence, {
      type: "LEAD_EXTENDED",
      race: "WILD_CARD",
      fromLead: 1,
      toLead: 2,
      targetTeamId: team("DET").id,
      rank: 3,
    });
    assert.equal(
      why(entry),
      "TOR win + DET loss extends TOR's lead over DET to 2 games.",
    );
  });

  it("derives a concrete gap change with no selected-team game", () => {
    const [entry] = buildRootingGuide(
      team("TOR"),
      lateWildCardStandings([79, 81], [80, 80]),
      [game(316, "DET", "CWS")],
    );

    assert.deepEqual(entry.primaryScenario?.requiredResults, [
      { teamId: team("DET").id, result: "LOSS" },
    ]);
    assert.equal(
      why(entry),
      "DET loss cuts the gap to DET to 0.5 games.",
    );
  });

  it("uses an already-final selected-team result without applying it twice", () => {
    const selectedFinal = game(317, "TOR", "LAA", {
      awayScore: 2,
      homeScore: 4,
      status: { state: "final", detail: "Final" },
    });
    const entry = buildRootingGuide(
      team("TOR"),
      lateWildCardStandings([79, 81], [80, 80]),
      [selectedFinal, game(318, "DET", "CWS")],
    ).find((candidate) => candidate.gamePk === 318);
    assert.ok(entry);

    assert.deepEqual(entry.primaryScenario?.requiredResults, [
      { teamId: team("TOR").id, result: "LOSS" },
      { teamId: team("DET").id, result: "LOSS" },
    ]);
    assert.equal(entry.alternateScenario, null);
    assert.equal(
      why(entry),
      "TOR loss + DET loss cuts the gap to DET to 0.5 games.",
    );
  });

  it("treats a live selected-team game as a hypothetical win", () => {
    const selectedLive = game(319, "TOR", "LAA", {
      awayScore: 1,
      homeScore: 4,
      status: { state: "live", detail: "Bottom 6th" },
    });
    const entry = buildRootingGuide(team("TOR"), standings(), [
      selectedLive,
      game(320, "DET", "CLE"),
    ]).find((candidate) => candidate.gamePk === 320);
    assert.ok(entry);

    assert.equal(entry.primaryScenario?.requiredResults[0].result, "WIN");
    assert.equal(entry.alternateScenario, null);
  });

  it("leaves an irrelevant external game without a scenario", () => {
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings({ TOR: [85, 35], NYY: [84, 36], CLE: [90, 30], HOU: [88, 32] }),
      [game(321, "ATH", "LAA")],
    );
    assert.equal(entry.rootFor, null);
    assert.equal(entry.primaryScenario, null);
  });

  it("keeps lower-priority improvements as additional consequences", () => {
    const entry = buildRootingGuide(team("TOR"), standings(), [
      game(322, "TOR", "LAA"),
      game(323, "DET", "CLE"),
    ]).find((candidate) => candidate.gamePk === 323);
    assert.ok(entry);

    assert.equal(entry.primaryScenario?.consequence.type, "POSITION_GAINED");
    assert.ok(entry.primaryScenario?.additionalConsequences.some(
      (consequence) => consequence.race === "DIVISION",
    ));
  });

  it("uses clinch language only when the deterministic state changes", () => {
    const clinchStandings = standings({
      TOR: [99, 61],
      NYY: [97, 63],
      BOS: [80, 80],
      BAL: [79, 81],
      TB: [78, 82],
      CLE: [101, 59],
      DET: [80, 80],
      MIN: [79, 81],
      KC: [78, 82],
      CWS: [77, 83],
      HOU: [100, 60],
      SEA: [80, 80],
      TEX: [79, 81],
      LAA: [78, 82],
      ATH: [77, 83],
    });
    const [entry] = buildRootingGuide(
      team("TOR"),
      clinchStandings,
      [game(327, "TOR", "LAA")],
    );

    assert.deepEqual(entry.primaryScenario?.consequence, {
      type: "CLINCH",
      race: "DIVISION",
    });
    assert.equal(
      why(entry),
      "TOR win extends TOR's lead over NYY to 2.5 games.",
    );
  });

  it("selects the earliest unresolved doubleheader game deterministically", () => {
    const final = game(324, "TOR", "LAA", {
      gameDate: "2026-09-15T17:05:00Z",
      awayScore: 4,
      homeScore: 2,
      status: { state: "final", detail: "Final" },
    });
    const firstUnresolved = game(325, "TOR", "LAA", {
      gameDate: "2026-09-15T22:05:00Z",
    });
    const laterUnresolved = game(326, "TOR", "LAA", {
      gameDate: "2026-09-16T00:05:00Z",
    });

    assert.equal(
      findSelectedTeamScenarioGame(
        [laterUnresolved, final, firstUnresolved],
        team("TOR").id,
      )?.gamePk,
      325,
    );
  });
});

describe("daily scenario presentation", () => {
  it("retains objective-based fallback copy", () => {
    assert.equal(formatRootingReasons(
      [{ objective: "MAKE_PLAYOFFS", impactDirection: "positive" }],
      team("TOR"),
    ), "Helps TOR chase the final Wild Card spot");
  });

  it("formats half and whole-game values without negative zero", () => {
    for (const value of [0.5, 1, 1.5, 2, -0]) {
      const scenario: RootingScenario = {
        requiredResults: [{ teamId: team("TOR").id, result: "WIN" }],
        consequence: {
          type: "GAP_CLOSED",
          race: "DIVISION",
          fromGamesBack: 3,
          toGamesBack: value,
          targetTeamId: team("NYY").id,
        },
        additionalConsequences: [],
      };
      const copy = formatRootingScenario(
        scenario,
        team("TOR"),
        [team("NYY")],
      );
      const expected = Object.is(value, -0) ? "0" : `${value}`;
      assert.match(copy, new RegExp(`to ${expected} game${Math.abs(value) === 1 ? "" : "s"}\\.`));
      assert.doesNotMatch(copy, /-0|1\.0|2\.0/);
    }
  });

  it("prefers concrete scenario copy in the Why column", () => {
    const games = buildRootingGuide(
      team("TOR"),
      standings({ DET: [81, 42] }),
      [game(328, "TOR", "LAA")],
    );
    const markup = renderToStaticMarkup(createElement(RootingGuideTable, {
      games,
      totalGames: 1,
      selectedTeam: team("TOR"),
      teams: Object.keys(BASE_RECORDS).map(team),
    }));

    assert.match(markup, /TOR win pulls TOR even with DET\./);
    assert.doesNotMatch(markup, /puts TOR into WC3/);
    assert.doesNotMatch(markup, /Helps TOR chase/);
  });

  it("renders only Game, Cheer, and Why without the impact caption", () => {
    const games = buildRootingGuide(
      team("TOR"),
      standings(),
      [game(332, "TOR", "LAA")],
    );
    const markup = renderToStaticMarkup(createElement(RootingGuideTable, {
      games,
      totalGames: 1,
      selectedTeam: team("TOR"),
      teams: Object.keys(BASE_RECORDS).map(team),
    }));

    assert.match(
      markup,
      /<thead><tr><th scope="col">Game<\/th><th scope="col">Cheer<\/th><th scope="col">Why<\/th><\/tr><\/thead>/,
    );
    assert.doesNotMatch(markup, /<th>Win<\/th>|<th>Lose<\/th>/);
    assert.doesNotMatch(markup, /Impact is the change|Today&#x27;s leverage/);
  });

  it("keeps neutral rows explicitly neutral", () => {
    const games = buildRootingGuide(
      team("TOR"),
      standings({ TOR: [85, 35], NYY: [84, 36], CLE: [90, 30], HOU: [88, 32] }),
      [game(333, "ATH", "LAA")],
    );
    const markup = renderToStaticMarkup(createElement(RootingGuideTable, {
      games,
      totalGames: 1,
      selectedTeam: team("TOR"),
      teams: Object.keys(BASE_RECORDS).map(team),
    }));

    assert.match(markup, /No preference/);
    assert.match(markup, /No race impact/);
  });

  it("formats a whole-game pairwise lead with singular grammar", () => {
    const scenario: RootingScenario = {
      requiredResults: [{ teamId: team("TOR").id, result: "WIN" }],
      consequence: {
        type: "POSITION_GAINED",
        race: "WILD_CARD",
        fromRank: 4,
        toRank: 3,
      },
      pairwiseConsequence: {
        type: "LEAD_TAKEN",
        race: "WILD_CARD",
        targetTeamId: team("BAL").id,
        lead: 1,
      },
      additionalConsequences: [],
    };

    assert.equal(
      formatRootingScenario(scenario, team("TOR"), [team("BAL")]),
      "TOR win moves TOR 1 game ahead of BAL.",
    );
  });
});
