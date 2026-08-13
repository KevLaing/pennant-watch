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
  pickScoreState,
} from "../lib/postseason/rootingGuide";
import {
  projectLiveStandings,
  relativeGames,
} from "../lib/postseason/standings";
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

describe("live standings projection", () => {
  it("projects a live leader's win and a trailing team's loss", () => {
    const standings = [
      { ...standing("NYY", 52, 38), divisionRank: 1 },
      { ...standing("TOR", 51, 39), divisionRank: 2 },
      { ...standing("BOS", 48, 42), divisionRank: 3 },
    ];
    const liveGame = {
      ...game(30, "TOR", "NYY"),
      awayScore: 4,
      homeScore: 2,
      status: { state: "live" as const, detail: "Top 7th" },
    };
    const projection = projectLiveStandings(standings, [liveGame]);
    const tor = projection.standings.find((row) => row.team.abbreviation === "TOR");
    const nyy = projection.standings.find((row) => row.team.abbreviation === "NYY");

    assert.equal(projection.liveStates.get(team("TOR").id), "winning");
    assert.equal(projection.liveStates.get(team("NYY").id), "losing");
    assert.deepEqual([tor?.wins, tor?.losses, tor?.divisionRank], [52, 39, 1]);
    assert.deepEqual([nyy?.wins, nyy?.losses, nyy?.divisionRank], [52, 39, 2]);
  });

  it("leaves records unchanged while a live game is tied", () => {
    const tiedGame = {
      ...game(31, "TOR", "NYY"),
      awayScore: 3,
      homeScore: 3,
      status: { state: "live" as const, detail: "Bottom 8th" },
    };
    const projection = projectLiveStandings(alStandings, [tiedGame]);
    const tor = projection.standings.find((row) => row.team.abbreviation === "TOR");

    assert.equal(projection.liveStates.get(team("TOR").id), "tied");
    assert.deepEqual([tor?.wins, tor?.losses], [50, 40]);
  });

  it("does not project scheduled or final games", () => {
    const finalGame = {
      ...game(32, "TOR", "NYY"),
      awayScore: 5,
      homeScore: 1,
      status: { state: "final" as const, detail: "Final" },
    };
    const projection = projectLiveStandings(alStandings, [
      game(33, "BOS", "BAL"),
      finalGame,
    ]);

    assert.equal(projection.liveStates.size, 0);
    assert.deepEqual(
      projection.standings.map(({ wins, losses }) => [wins, losses]),
      alStandings.map(({ wins, losses }) => [wins, losses]),
    );
  });

  it("calculates Wild Card GB from the third-place cutoff", () => {
    const standings = [
      standing("NYY", 60, 40),
      standing("CLE", 58, 42),
      standing("HOU", 57, 43),
      standing("BOS", 56, 44),
      standing("TB", 55, 45),
      standing("BAL", 53, 47),
      standing("TOR", 51, 48),
    ];
    const torLoss = {
      ...game(34, "TOR", "LAD"),
      awayScore: 2,
      homeScore: 4,
      status: { state: "live" as const, detail: "Bottom 7th" },
    };
    const projection = projectLiveStandings(standings, [torLoss]);
    const tor = projection.standings.find((row) => row.team.abbreviation === "TOR");
    const wildCardTeams = projection.standings
      .filter((row) => row.wildCardRank !== null)
      .sort((a, b) => (a.wildCardRank ?? 99) - (b.wildCardRank ?? 99));

    assert.deepEqual(
      wildCardTeams.slice(0, 3).map((row) => row.wildCardGamesBack),
      ["-", "-", "-"],
    );
    assert.equal(tor?.wildCardRank, 4);
    assert.equal(tor?.wildCardGamesBack, "2.0");
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

  it("picks the opponent of each Wild Card contender ahead of the selected team", () => {
    const standings = [
      { ...standing("TB", 74, 46), divisionRank: 1 },
      { ...standing("NYY", 68, 52), divisionRank: 2, wildCardRank: 1 },
      { ...standing("BOS", 64, 56), divisionRank: 3, wildCardRank: 2 },
      { ...standing("TOR", 59, 63), divisionRank: 4, wildCardRank: 6 },
      { ...standing("BAL", 58, 63), divisionRank: 5, wildCardRank: 8 },
      { ...standing("CWS", 62, 57), divisionRank: 1 },
      { ...standing("DET", 60, 61), divisionRank: 2, wildCardRank: 3 },
      { ...standing("MIN", 60, 62), divisionRank: 3, wildCardRank: 5 },
      { ...standing("CLE", 59, 63), divisionRank: 4, wildCardRank: 7 },
      { ...standing("KC", 49, 73), divisionRank: 5, wildCardRank: 10 },
      { ...standing("HOU", 62, 60), divisionRank: 1 },
      { ...standing("TEX", 60, 61), divisionRank: 2, wildCardRank: 4 },
      { ...standing("SEA", 56, 65), divisionRank: 3, wildCardRank: 9 },
      { ...standing("ATH", 47, 74), divisionRank: 4, wildCardRank: 11 },
      { ...standing("LAA", 47, 74), divisionRank: 5, wildCardRank: 12 },
    ];
    const result = buildRootingGuide(team("TOR"), standings, [
      game(105, "CLE", "DET"),
      game(106, "TEX", "LAA"),
    ]);

    assert.equal(result[0].rootFor?.abbreviation, "CLE");
    assert.equal(result[1].rootFor?.abbreviation, "LAA");
  });

  it("picks the farther-ahead club when two teams above the selected team play", () => {
    const standings = [
      { ...standing("TB", 74, 46), divisionRank: 1 },
      { ...standing("NYY", 68, 52), divisionRank: 2, wildCardRank: 1 },
      { ...standing("BOS", 64, 56), divisionRank: 3, wildCardRank: 2 },
      { ...standing("TOR", 59, 63), divisionRank: 4, wildCardRank: 6 },
    ];
    const [entry] = buildRootingGuide(
      team("TOR"),
      standings,
      [game(107, "NYY", "BOS")],
    );

    assert.equal(entry.rootFor?.abbreviation, "NYY");
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

  it("reports whether the current rooting pick is winning, losing, or tied", () => {
    const scoredGame = {
      ...game(104, "TOR", "NYY"),
      status: { state: "live" as const, detail: "Top 7th" },
    };
    const [entry] = buildRootingGuide(team("TOR"), alStandings, [scoredGame]);

    assert.equal(pickScoreState(entry), null);
    assert.equal(pickScoreState({ ...entry, awayScore: 4, homeScore: 2 }), "winning");
    assert.equal(pickScoreState({ ...entry, awayScore: 2, homeScore: 4 }), "losing");
    assert.equal(pickScoreState({ ...entry, awayScore: 3, homeScore: 3 }), "tied");
  });
});
