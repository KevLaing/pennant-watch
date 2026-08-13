import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTeamByAbbreviation } from "../lib/mlb/teams";
import type { Game, Standing, Team } from "../lib/mlb/types";
import {
  buildRootingGuide,
  isGameRelevantToLeague,
} from "../lib/postseason/rootingGuide";
import { relativeGames } from "../lib/postseason/standings";

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
});
