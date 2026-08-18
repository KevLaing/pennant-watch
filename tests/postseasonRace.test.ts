import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTeamByAbbreviation } from "../lib/mlb/teams";
import type { Game, Standing, Team } from "../lib/mlb/types";
import { createPennantRaceState } from "../lib/postseason/objectives";
import { buildRootingGuide } from "../lib/postseason/rootingGuide";

const BASE_WINS: Record<string, number> = {
  BAL: 70,
  BOS: 80,
  NYY: 90,
  TB: 60,
  TOR: 85,
  CWS: 55,
  CLE: 88,
  DET: 83,
  KC: 65,
  MIN: 75,
  ATH: 50,
  HOU: 86,
  LAA: 68,
  SEA: 84,
  TEX: 78,
};

function team(abbreviation: string): Team {
  const found = getTeamByAbbreviation(abbreviation);
  if (!found) throw new Error(`Unknown test team: ${abbreviation}`);
  return found;
}

function fullLeague(
  overrides: Record<string, number | [number, number]> = {},
): Standing[] {
  return Object.entries(BASE_WINS).map(([abbreviation, defaultWins]) => {
    const override = overrides[abbreviation];
    const [wins, losses] = Array.isArray(override)
      ? override
      : [override ?? defaultWins, 120 - (override ?? defaultWins)];
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

function game(gamePk: number, away: string, home: string): Game {
  return {
    gamePk,
    gameDate: "2026-09-15T23:05:00Z",
    officialDate: "2026-09-15",
    awayTeam: team(away),
    homeTeam: team(home),
    awayScore: null,
    homeScore: null,
    status: { state: "scheduled", detail: "Scheduled" },
  };
}

function state(overrides: Record<string, number | [number, number]> = {}) {
  const standings = fullLeague(overrides);
  const raceState = createPennantRaceState(standings, team("TOR").id);
  assert.ok(raceState);
  return { standings, raceState };
}

function objectiveKinds(overrides: Record<string, number | [number, number]>) {
  const { raceState } = state(overrides);
  return [
    raceState.primaryObjective?.kind,
    ...raceState.secondaryObjectives.map((objective) => objective.kind),
  ];
}

describe("pennant race classification", () => {
  it("classifies a team outside WC3 as chasing a playoff berth", () => {
    const { raceState } = state({ TOR: 79 });
    assert.equal(raceState.wildCardRank, 4);
    assert.equal(raceState.leagueSeed, null);
    assert.equal(raceState.primaryObjective?.kind, "MAKE_PLAYOFFS");
  });

  it("classifies WC3 as defending the final berth", () => {
    const { raceState } = state({ TOR: 81 });
    assert.equal(raceState.wildCardRank, 3);
    assert.equal(raceState.leagueSeed, 6);
    assert.equal(raceState.primaryObjective?.kind, "DEFEND_PLAYOFF_SPOT");
  });

  it("keeps a reachable division active for the WC1 team", () => {
    const { raceState } = state({ TOR: 89 });
    assert.equal(raceState.wildCardRank, 1);
    assert.deepEqual(objectiveKinds({ TOR: 89 }), [
      "DEFEND_PLAYOFF_SPOT",
      "WIN_DIVISION",
    ]);
  });

  it("tracks a division chase alongside the Wild Card race", () => {
    assert.ok(objectiveKinds({ TOR: 81 }).includes("WIN_DIVISION"));
  });

  it("gives a seed-three division leader a bye objective", () => {
    const { raceState } = state({ TOR: 85, NYY: 84, CLE: 90, HOU: 88 });
    assert.equal(raceState.leagueSeed, 3);
    assert.deepEqual(objectiveKinds({ TOR: 85, NYY: 84, CLE: 90, HOU: 88 }), [
      "DEFEND_DIVISION",
      "EARN_BYE",
    ]);
  });

  it("gives seed two both bye-defense and top-seed objectives", () => {
    const overrides = { TOR: 89, NYY: 84, CLE: 90, HOU: 88 };
    const { raceState } = state(overrides);
    assert.equal(raceState.leagueSeed, 2);
    assert.deepEqual(objectiveKinds(overrides), [
      "DEFEND_DIVISION",
      "DEFEND_BYE",
      "EARN_TOP_SEED",
    ]);
  });

  it("gives seed one a top-seed defense objective", () => {
    const overrides = { TOR: 91, NYY: 84, CLE: 90, HOU: 88 };
    const { raceState } = state(overrides);
    assert.equal(raceState.leagueSeed, 1);
    assert.ok(objectiveKinds(overrides).includes("DEFEND_TOP_SEED"));
  });

  it("removes a deterministically clinched playoff objective", () => {
    const overrides: Record<string, [number, number]> = {
      TOR: [100, 60],
      NYY: [99, 61],
    };
    for (const abbreviation of Object.keys(BASE_WINS)) {
      if (!overrides[abbreviation]) overrides[abbreviation] = [80, 80];
    }
    const { raceState } = state(overrides);
    assert.equal(raceState.playoffClinched, true);
    assert.equal(raceState.divisionClinched, false);
    assert.equal(raceState.primaryObjective?.kind, "DEFEND_DIVISION");
  });

  it("removes a deterministically clinched division objective", () => {
    const overrides: Record<string, [number, number]> = {};
    for (const abbreviation of Object.keys(BASE_WINS)) {
      overrides[abbreviation] = [80, 80];
    }
    Object.assign(overrides, {
      TOR: [100, 60],
      NYY: [97, 63],
      CLE: [102, 58],
      HOU: [101, 59],
    });
    const { raceState } = state(overrides);
    assert.equal(raceState.divisionClinched, true);
    assert.equal(raceState.leagueSeed, 3);
    assert.equal(raceState.primaryObjective?.kind, "EARN_BYE");
  });

  it("proves elimination only when six clubs are already unreachable", () => {
    const overrides: Record<string, [number, number]> = {};
    for (const abbreviation of Object.keys(BASE_WINS)) {
      overrides[abbreviation] = [70, 90];
    }
    Object.assign(overrides, {
      TOR: [70, 90],
      NYY: [95, 65],
      BOS: [94, 66],
      CLE: [93, 67],
      DET: [92, 68],
      HOU: [91, 69],
      SEA: [90, 70],
    });
    const { raceState } = state(overrides);
    assert.equal(raceState.playoffEliminated, true);
    assert.equal(raceState.divisionEliminated, true);
    assert.equal(raceState.primaryObjective, null);
  });
});

describe("scenario-aware outcome selection", () => {
  it("uses a game between other division leaders in the bye race", () => {
    const standings = fullLeague({ TOR: 85, NYY: 84, CLE: 90, HOU: 88 });
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings,
      [game(201, "CLE", "HOU")],
    );
    assert.equal(entry.rootFor?.abbreviation, "CLE");
    assert.deepEqual(entry.reasons.map((reason) => reason.objective), ["EARN_BYE"]);
  });

  it("leaves a same-league game neutral when it affects no objective", () => {
    const standings = fullLeague({ TOR: 85, NYY: 84, CLE: 90, HOU: 88 });
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings,
      [game(202, "LAA", "ATH")],
    );
    assert.equal(entry.rootFor, null);
    assert.deepEqual(entry.reasons, []);
  });

  it("records every active objective helped by one result", () => {
    const standings = fullLeague({ TOR: 81 });
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings,
      [game(203, "TOR", "NYY")],
    );
    assert.equal(entry.rootFor?.abbreviation, "TOR");
    assert.deepEqual(entry.reasons.map((reason) => reason.objective), [
      "DEFEND_PLAYOFF_SPOT",
      "WIN_DIVISION",
      "IMPROVE_WILD_CARD_SEED",
    ]);
  });

  it("returns no preference when hypothetical outcomes tie", () => {
    const standings = fullLeague({ TOR: 85, NYY: 84, CLE: 90, HOU: 88 });
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings,
      [game(204, "LAA", "ATH")],
    );
    assert.equal(entry.rootFor, null);
    assert.equal(entry.winImpact, 0);
    assert.equal(entry.loseImpact, 0);
  });

  it("always favors the selected club in its own game", () => {
    const standings = fullLeague({ TOR: 79 });
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings,
      [game(205, "TOR", "LAA")],
    );
    assert.equal(entry.rootFor?.abbreviation, "TOR");
  });

  it("deduplicates games while retaining structured reasons", () => {
    const standings = fullLeague({ TOR: 81 });
    const duplicate = game(206, "TOR", "NYY");
    const entries = buildRootingGuide(
      team("TOR"),
      standings,
      [duplicate, duplicate],
    );
    assert.equal(entries.length, 1);
    assert.ok(entries[0].reasons.length > 1);
  });

  it("keeps AL and NL slate isolation", () => {
    const standings = fullLeague({ TOR: 81 });
    const entries = buildRootingGuide(team("TOR"), standings, [
      game(207, "LAD", "SF"),
      game(208, "TOR", "LAD"),
    ]);
    assert.deepEqual(entries.map((entry) => entry.gamePk), [208]);
  });
});
