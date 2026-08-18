import type { Standing, Team } from "../mlb/types";
import type {
  PennantRaceState,
  RaceConsequence,
  RaceObjectiveKind,
  RootingReason,
  RootingScenario,
} from "./types";
import { formatGameCount, formatGamesValue } from "./format";

function divisionName(team: Team): string {
  return `${team.league} ${team.division[0]}${team.division.slice(1).toLowerCase()}`;
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
      ? `${formatGamesValue(primary.gamesBack, { absolute: true })} games behind ${boundary.team.abbreviation}`
      : primary.gamesBack < 0
        ? `${formatGamesValue(primary.gamesBack, { absolute: true })} games ahead of ${boundary.team.abbreviation}`
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

function resultText(
  scenario: RootingScenario,
  selectedTeam: Team,
  teams: readonly Team[],
): string {
  const byId = new Map(
    [selectedTeam, ...teams].map((team) => [team.id, team.abbreviation]),
  );
  return scenario.requiredResults.map((required) =>
    `${byId.get(required.teamId) ?? `Team ${required.teamId}`} ${required.result.toLowerCase()}`,
  ).join(" + ");
}

function targetAbbreviation(
  consequence: RaceConsequence,
  selectedTeam: Team,
  teams: readonly Team[],
): string | null {
  if (!("targetTeamId" in consequence) || consequence.targetTeamId === undefined) {
    return null;
  }
  return [selectedTeam, ...teams].find(
    (team) => team.id === consequence.targetTeamId,
  )?.abbreviation ?? null;
}

function consequenceText(
  consequence: RaceConsequence,
  selectedTeam: Team,
  teams: readonly Team[],
): string {
  const club = selectedTeam.abbreviation;
  const target = targetAbbreviation(consequence, selectedTeam, teams);

  switch (consequence.type) {
    case "CLINCH":
      switch (consequence.race) {
        case "PLAYOFF": return `clinches a playoff berth for ${club}`;
        case "DIVISION": return `clinches the ${divisionName(selectedTeam)} for ${club}`;
        case "BYE": return `clinches a first-round bye for ${club}`;
        case "TOP_SEED": return `clinches the ${selectedTeam.league}'s #1 seed for ${club}`;
        case "WILD_CARD": return `clinches a Wild Card berth for ${club}`;
      }
    case "ELIMINATION_AVOIDED":
      return `keeps ${club} alive in the ${consequence.race.toLowerCase().replace("_", " ")} race`;
    case "POSITION_GAINED":
      switch (consequence.race) {
        case "WILD_CARD":
          return consequence.fromRank > 3 && consequence.toRank <= 3
            ? `puts ${club} into WC${consequence.toRank}`
            : `moves ${club} up to WC${consequence.toRank}`;
        case "BYE": return `moves ${club} into the second ${selectedTeam.league} bye`;
        case "TOP_SEED": return `moves ${club} into the ${selectedTeam.league}'s #1 seed`;
        case "DIVISION": return `moves ${club} to #${consequence.toRank} in the division`;
        case "PLAYOFF": return `puts ${club} into the postseason field`;
      }
    case "POSITION_LOST":
      return consequence.race === "WILD_CARD"
        ? `drops ${club} to WC${consequence.toRank}`
        : `drops ${club} to #${consequence.toRank} in the ${consequence.race.toLowerCase().replace("_", " ")} race`;
    case "GAP_CLOSED":
      switch (consequence.race) {
        case "WILD_CARD": return `pulls ${club} within ${formatGameCount(consequence.toGamesBack, { absolute: true })} of WC3`;
        case "DIVISION": return `cuts the division gap to ${formatGameCount(consequence.toGamesBack, { absolute: true })}`;
        case "BYE": return `cuts the first-round bye gap to ${formatGameCount(consequence.toGamesBack, { absolute: true })}`;
        case "TOP_SEED": return `cuts the #1 seed gap to ${formatGameCount(consequence.toGamesBack, { absolute: true })}`;
        case "PLAYOFF": return `cuts the playoff gap to ${formatGameCount(consequence.toGamesBack, { absolute: true })}`;
      }
    case "GAP_WIDENED":
      return target
        ? `widens ${club}'s gap to ${target} to ${formatGameCount(consequence.toGamesBack, { absolute: true })}`
        : `widens ${club}'s ${consequence.race.toLowerCase().replace("_", " ")} gap`;
    case "LEAD_EXTENDED":
      if (consequence.race === "WILD_CARD") {
        return `extends ${club}'s WC${consequence.rank ?? 3} cushion to ${formatGameCount(consequence.toLead, { absolute: true })}`;
      }
      if (consequence.race === "DIVISION") {
        return `extends ${club}'s division lead to ${formatGameCount(consequence.toLead, { absolute: true })}`;
      }
      if (consequence.race === "BYE") {
        return `extends ${club}'s bye cushion to ${formatGameCount(consequence.toLead, { absolute: true })}`;
      }
      return `extends ${club}'s #1 seed lead to ${formatGameCount(consequence.toLead, { absolute: true })}`;
    case "TIE_CREATED":
      switch (consequence.race) {
        case "WILD_CARD": return `ties ${club} for WC3`;
        case "DIVISION": return `ties ${club} for the ${divisionName(selectedTeam)} lead`;
        case "BYE": return `ties ${club} for the second ${selectedTeam.league} bye`;
        case "TOP_SEED": return `ties ${club} for the ${selectedTeam.league}'s #1 seed`;
        case "PLAYOFF": return `ties ${club} at the playoff boundary`;
      }
    case "LEAD_TAKEN":
      return consequence.race === "DIVISION"
        ? `puts ${club} into the ${divisionName(selectedTeam)} lead`
        : `puts ${club} in front of ${target ?? "the race boundary"}`;
    case "MARGIN_IMPROVED":
      if (target && consequence.toValue < 0) {
        return `pulls ${club} within ${formatGameCount(-consequence.toValue, { absolute: true })} of ${target}`;
      }
      if (target && consequence.toValue > 0) {
        return `moves ${club} ${formatGameCount(consequence.toValue, { absolute: true })} ahead of ${target}`;
      }
      return `improves ${club}'s ${consequence.race.toLowerCase().replace("_", " ")} margin`;
    case "POSITION_HELD":
      if (consequence.race === "WILD_CARD") return `keeps ${club} in WC${consequence.rank}`;
      if (consequence.race === "DIVISION") return `keeps ${club} in the division lead`;
      return `keeps ${club} at #${consequence.rank} in the ${consequence.race.toLowerCase().replace("_", " ")} race`;
  }
}

function pairwiseConsequenceText(
  consequence: RaceConsequence,
  selectedTeam: Team,
  teams: readonly Team[],
): string | null {
  const club = selectedTeam.abbreviation;
  const target = targetAbbreviation(consequence, selectedTeam, teams);
  if (!target) return null;

  switch (consequence.type) {
    case "GAP_CLOSED":
      return `cuts the gap to ${target} to ${formatGameCount(consequence.toGamesBack, { absolute: true })}`;
    case "GAP_WIDENED":
      return `widens ${club}'s gap to ${target} to ${formatGameCount(consequence.toGamesBack, { absolute: true })}`;
    case "TIE_CREATED":
      return `pulls ${club} even with ${target}`;
    case "LEAD_TAKEN":
      return consequence.lead === undefined
        ? null
        : `moves ${club} ${formatGameCount(consequence.lead, { absolute: true })} ahead of ${target}`;
    case "LEAD_EXTENDED":
      return `extends ${club}'s lead over ${target} to ${formatGameCount(consequence.toLead, { absolute: true })}`;
    default:
      return null;
  }
}

export function formatRootingScenario(
  scenario: RootingScenario,
  selectedTeam: Team,
  teams: readonly Team[],
): string {
  const results = resultText(scenario, selectedTeam, teams);
  const consequence = scenario.pairwiseConsequence
    ? pairwiseConsequenceText(
        scenario.pairwiseConsequence,
        selectedTeam,
        teams,
      ) ?? consequenceText(scenario.consequence, selectedTeam, teams)
    : consequenceText(scenario.consequence, selectedTeam, teams);
  return `${results} ${consequence}.`;
}
