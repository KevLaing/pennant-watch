import type { Team } from "../../mlb/types";
import { formatGameCount } from "../format";
import type { NightOutcomeSummary } from "./types";

export function formatNightDelta(delta: number): string {
  return formatGameCount(delta, { signed: true });
}

export function formatNightPosition(key: string): string {
  if (key === "DIVISION_LEADER") return "Division leader";
  if (key === "WCOUT") return "Outside the Wild Card field";
  if (key === "SEEDOUT") return "Outside the seeded field";
  if (key.startsWith("WC")) return `WC${key.slice(2)}`;
  if (key.startsWith("DIV")) return `Division #${key.slice(3)}`;
  if (key.startsWith("SEED")) return `Seed #${key.slice(4)}`;
  return key;
}

export function formatNightSuccess(
  summary: NightOutcomeSummary,
  selectedTeam: Team,
): string | null {
  if (!summary.target) return null;
  const count = summary.successfulScenarioCount.toLocaleString("en-US");
  const club = selectedTeam.abbreviation;
  switch (summary.target.objective) {
    case "MAKE_PLAYOFFS": return `${count} possible scoreboards put ${club} in WC3 or better.`;
    case "DEFEND_PLAYOFF_SPOT": return `${count} possible scoreboards keep ${club} in WC3 or better.`;
    case "IMPROVE_WILD_CARD_SEED": return `${count} possible scoreboards improve ${club}'s Wild Card position.`;
    case "WIN_DIVISION": return `${count} possible scoreboards put ${club} atop its division.`;
    case "DEFEND_DIVISION": return `${count} possible scoreboards keep ${club} atop its division.`;
    case "EARN_BYE": return `${count} possible scoreboards put ${club} in a first-round bye position.`;
    case "DEFEND_BYE": return `${count} possible scoreboards keep ${club} in a first-round bye position.`;
    case "EARN_TOP_SEED": return `${count} possible scoreboards put ${club} in the #1 seed.`;
    case "DEFEND_TOP_SEED": return `${count} possible scoreboards keep ${club} in the #1 seed.`;
  }
}

export function formatNightRaceLabel(
  summary: NightOutcomeSummary,
  selectedTeam: Team,
): string {
  const club = selectedTeam.abbreviation;
  switch (summary.target?.objective) {
    case "MAKE_PLAYOFFS":
    case "DEFEND_PLAYOFF_SPOT":
    case "IMPROVE_WILD_CARD_SEED": return `${club}'s Wild Card position`;
    case "WIN_DIVISION":
    case "DEFEND_DIVISION": return `${club}'s division position`;
    case "EARN_BYE":
    case "DEFEND_BYE": return `${club}'s bye position`;
    case "EARN_TOP_SEED":
    case "DEFEND_TOP_SEED": return `${club}'s #1 seed position`;
    case undefined: return `${club}'s postseason position`;
  }
}
