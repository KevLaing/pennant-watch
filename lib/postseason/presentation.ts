import type { Standing, Team } from "../mlb/types";
import type {
  PennantRaceState,
  RaceObjectiveKind,
  RootingReason,
} from "./types";

function formatGames(value: number): string {
  const absolute = Math.abs(value);
  return Number.isInteger(absolute) ? absolute.toFixed(1) : `${absolute}`;
}

export function objectiveLabel(
  kind: RaceObjectiveKind,
  state?: Pick<PennantRaceState, "league" | "division">,
): string {
  const division = state
    ? `${state.league} ${state.division.toLowerCase()}`
    : "division";
  switch (kind) {
    case "MAKE_PLAYOFFS": return "Chasing a Wild Card berth";
    case "DEFEND_PLAYOFF_SPOT": return "Defending a playoff spot";
    case "IMPROVE_WILD_CARD_SEED": return "Improving Wild Card seeding";
    case "WIN_DIVISION": return `Chasing the ${division} title`;
    case "DEFEND_DIVISION": return `Defending the ${division} lead`;
    case "EARN_BYE": return "Chasing a first-round bye";
    case "DEFEND_BYE": return "Defending a first-round bye";
    case "EARN_TOP_SEED": return `Chasing the ${state?.league ?? "league"}'s #1 seed`;
    case "DEFEND_TOP_SEED": return `Defending the ${state?.league ?? "league"}'s #1 seed`;
  }
}

function clinchedLabel(state: PennantRaceState): string | null {
  if (state.topSeedClinched) return `${state.league}'s #1 seed clinched`;
  if (state.byeClinched) return "First-round bye clinched";
  if (state.divisionClinched) {
    return `${state.league} ${state.division.toLowerCase()} champions`;
  }
  if (state.playoffClinched) return "Playoff berth clinched";
  return null;
}

function eliminatedLabel(state: PennantRaceState): string | null {
  if (state.playoffEliminated) return "Eliminated from postseason contention";
  if (state.divisionEliminated && state.byeEliminated) {
    return "Division and bye paths eliminated";
  }
  return null;
}

export type RaceSummary = {
  position: string;
  objective: string;
  margin: string | null;
};

export function formatRaceSummary(
  state: PennantRaceState,
  standings: readonly Standing[],
): RaceSummary {
  const clinched = clinchedLabel(state);
  const eliminated = eliminatedLabel(state);
  const position = clinched ?? eliminated ?? (
    state.divisionRank === 1
      ? `${state.league} ${state.division.toLowerCase()} leader · Seed #${state.leagueSeed}`
      : state.wildCardRank !== null && state.wildCardRank <= 3
        ? `Wild Card #${state.wildCardRank}`
        : state.wildCardRank !== null
          ? `Wild Card race · ${state.wildCardRank - 3} spot${state.wildCardRank - 3 === 1 ? "" : "s"} out`
          : `${state.divisionRank} in the ${state.league} ${state.division.toLowerCase()}`
  );
  const primary = state.primaryObjective;
  const boundaryId = primary?.boundaryTeamIds[0];
  const boundary = standings.find((standing) => standing.team.id === boundaryId);
  const margin = primary?.gamesBack === undefined || !boundary
    ? null
    : primary.gamesBack > 0
      ? `${formatGames(primary.gamesBack)} games behind ${boundary.team.abbreviation}`
      : primary.gamesBack < 0
        ? `${formatGames(primary.gamesBack)} games ahead of ${boundary.team.abbreviation}`
        : `Tied with ${boundary.team.abbreviation}`;

  return {
    position,
    objective: primary
      ? objectiveLabel(primary.kind, state)
      : clinched ?? eliminated ?? "No active postseason objective",
    margin,
  };
}

function reasonCategory(kind: RaceObjectiveKind): string {
  switch (kind) {
    case "MAKE_PLAYOFFS":
    case "DEFEND_PLAYOFF_SPOT": return "playoff spot";
    case "IMPROVE_WILD_CARD_SEED": return "Wild Card seeding";
    case "WIN_DIVISION":
    case "DEFEND_DIVISION": return "division";
    case "EARN_BYE":
    case "DEFEND_BYE": return "bye";
    case "EARN_TOP_SEED":
    case "DEFEND_TOP_SEED": return "top-seed";
  }
}

export function formatRootingReasons(
  reasons: readonly RootingReason[],
  selectedTeam?: Team,
): string | null {
  if (reasons.length === 0) return null;
  const club = selectedTeam?.abbreviation ?? "your club";
  const uniqueKinds = [...new Set(reasons.map((reason) => reason.objective))];
  const categories = [...new Set(uniqueKinds.map(reasonCategory))];

  if (categories.length > 1) {
    const finalCategory = categories.at(-1);
    return `Helps ${club} in the ${categories.slice(0, -1).join(", ")} and ${finalCategory} races`;
  }

  switch (uniqueKinds[0]) {
    case "MAKE_PLAYOFFS": return `Helps ${club} chase the final Wild Card spot`;
    case "DEFEND_PLAYOFF_SPOT": return `Protects ${club}'s playoff spot`;
    case "IMPROVE_WILD_CARD_SEED": return `Helps ${club} improve its Wild Card seed`;
    case "WIN_DIVISION": return `Helps ${club} gain in the division race`;
    case "DEFEND_DIVISION": return `Protects ${club}'s division lead`;
    case "EARN_BYE": return `Helps ${club} chase a first-round bye`;
    case "DEFEND_BYE": return `Protects ${club}'s first-round bye`;
    case "EARN_TOP_SEED": return `Helps ${club} chase the #1 seed`;
    case "DEFEND_TOP_SEED": return `Protects ${club}'s #1 seed`;
  }
}
