import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NextRequest } from "next/server";
import { GET as getRootingGuide } from "../app/api/rooting-guide/route";
import { fetchSchedule, MlbApiError } from "../lib/mlb/client";
import { getTeamByAbbreviation, MLB_TEAMS } from "../lib/mlb/teams";
import type { Game, Standing, Team } from "../lib/mlb/types";
import {
  buildRootingGuide,
  isGameRelevantToLeague,
} from "../lib/postseason/rootingGuide";
import { relativeGames } from "../lib/postseason/standings";
import { readableTextColor } from "../lib/theme";

function team(abbreviation: string): Team {
  const found = getTeamByAbbreviation(abbreviation);
  if (!found) throw new Error(`Unknown test team: ${abbreviation}`);
  return found;
}

function standing(abbreviation: string, wins: number, losses: number): Standing {
  const value = team(abbreviation);
  return {
    team: value,
    wins,
    losses,
    divisionRank: null,
    wildCardRank: null,
    divisionGamesBack: "—",
    wildCardGamesBack: "—",
    winningPercentage: wins / (wins + losses),
  };
}

function game(gamePk: number, away: string, home: string): Game {
  return {
    gamePk,
    awayTeam: team(away),
    homeTeam: team(home),
    awayScore: null,
    homeScore: null,
    gameDate: "2026-08-13T23:05:00Z",
    officialDate: "2026-08-13",
    status: { state: "scheduled", detail: "Scheduled" },
  };
}

const alStandings = [
  standing("TOR", 50, 40),
  standing("NYY", 52, 38),
  standing("BOS", 48, 42),
  standing("BAL", 45, 45),
];

describe("team themes", () => {
  it("provides valid primary and secondary colors for all 30 clubs", () => {
    assert.equal(MLB_TEAMS.length, 30);
    for (const mlbTeam of MLB_TEAMS) {
      assert.match(mlbTeam.primaryColor, /^#[0-9A-F]{6}$/);
      assert.match(mlbTeam.secondaryColor, /^#[0-9A-F]{6}$/);
    }
  });

  it("chooses readable text for both dark and bright primary colors", () => {
    assert.equal(readableTextColor(team("TOR").primaryColor), "#FFFFFF");
    assert.equal(readableTextColor(team("PIT").primaryColor), "#14212A");
  });
});

describe("MLB upstream failures", () => {
  it("normalizes an upstream HTTP failure", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 503 })) as typeof fetch;

    try {
      await assert.rejects(fetchSchedule("2026-08-13"), (error) => {
        assert.ok(error instanceof MlbApiError);
        assert.equal(error.resource, "schedule");
        assert.equal(error.status, 503);
        return true;
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("keeps the API route's 502 response for an unavailable MLB feed", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("network unavailable");
    }) as typeof fetch;

    try {
      const response = await getRootingGuide(
        new NextRequest("http://localhost/api/rooting-guide?team=TOR"),
      );
      const body = await response.json() as { error: string; resource: string };

      assert.equal(response.status, 502);
      assert.match(body.error, /^MLB (schedule|standings) data is temporarily unavailable\.$/);
      assert.match(body.resource, /^(schedule|standings)$/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("league relevance", () => {
  it("includes any game with an AL participant for an AL selection", () => {
    assert.equal(isGameRelevantToLeague(game(1, "NYY", "BOS"), "AL"), true);
    assert.equal(isGameRelevantToLeague(game(2, "NYY", "LAD"), "AL"), true);
    assert.equal(isGameRelevantToLeague(game(3, "LAD", "NYY"), "AL"), true);
    assert.equal(isGameRelevantToLeague(game(4, "LAD", "SF"), "AL"), false);
  });

  it("applies the inverse rule for an NL selection", () => {
    assert.equal(isGameRelevantToLeague(game(1, "LAD", "SF"), "NL"), true);
    assert.equal(isGameRelevantToLeague(game(2, "NYY", "LAD"), "NL"), true);
    assert.equal(isGameRelevantToLeague(game(3, "LAD", "NYY"), "NL"), true);
    assert.equal(isGameRelevantToLeague(game(4, "NYY", "BOS"), "NL"), false);
  });
});

describe("games-back arithmetic", () => {
  it("calculates half-game and full-game changes", () => {
    const selected = standing("TOR", 50, 40);
    const opponent = standing("NYY", 52, 38);
    assert.equal(relativeGames(selected, opponent), -2);
    assert.equal(relativeGames({ ...selected, wins: 51 }, opponent), -1.5);
    assert.equal(
      relativeGames(
        { ...selected, wins: 51 },
        { ...opponent, losses: 39 },
      ),
      -1,
    );
  });

  it("reports a half-game swing when a comparison club plays another team", () => {
    const [entry] = buildRootingGuide(
      team("TOR"),
      [...alStandings, standing("LAD", 54, 36)],
      [game(20, "NYY", "LAD")],
    );
    assert.equal(entry.rootFor?.abbreviation, "LAD");
    assert.equal(entry.winImpact, 0.5);
    assert.equal(entry.loseImpact, -0.5);
  });
});

describe("rooting guide", () => {
  it("emits only one entry per gamePk even when both teams are relevant", () => {
    const duplicate = game(99, "NYY", "BOS");
    const result = buildRootingGuide(team("TOR"), alStandings, [duplicate, duplicate]);
    assert.equal(result.length, 1);
    assert.equal(result[0].gamePk, 99);
  });

  it("always recommends the selected team in its own game", () => {
    const [entry] = buildRootingGuide(
      team("TOR"),
      alStandings,
      [game(101, "TOR", "NYY")],
    );
    assert.equal(entry.rootFor?.abbreviation, "TOR");
    assert.equal(entry.winImpact, 1);
    assert.equal(entry.loseImpact, -1);
  });

  it("represents a mathematically neutral relevant game without a preference", () => {
    const [entry] = buildRootingGuide(
      team("TOR"),
      alStandings,
      [game(102, "BOS", "BAL")],
    );
    assert.equal(entry.rootFor, null);
    assert.equal(entry.winImpact, 0);
    assert.equal(entry.loseImpact, 0);
  });

  it("preserves the current score for presentation", () => {
    const scoredGame = {
      ...game(103, "TOR", "NYY"),
      awayScore: 4,
      homeScore: 2,
      status: { state: "live" as const, detail: "Top 7th" },
    };
    const [entry] = buildRootingGuide(team("TOR"), alStandings, [scoredGame]);

    assert.equal(entry.awayScore, 4);
    assert.equal(entry.homeScore, 2);
    assert.equal(entry.rootFor?.abbreviation, "TOR");
  });
});
