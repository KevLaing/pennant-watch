import type { Standing } from "../mlb/types";
import { relativeGames } from "./standings";
import type {
  PennantRaceState,
  RaceConsequence,
  RaceKind,
  RaceObjectiveKind,
} from "./types";

const EPSILON = 0.001;

function clean(value: number): number {
  if (Math.abs(value) < EPSILON || Object.is(value, -0)) return 0;
  return value;
}

function raceForObjective(kind: RaceObjectiveKind): RaceKind {
  switch (kind) {
    case "MAKE_PLAYOFFS":
    case "DEFEND_PLAYOFF_SPOT":
    case "IMPROVE_WILD_CARD_SEED": return "WILD_CARD";
    case "WIN_DIVISION":
    case "DEFEND_DIVISION": return "DIVISION";
    case "EARN_BYE":
    case "DEFEND_BYE": return "BYE";
    case "EARN_TOP_SEED":
    case "DEFEND_TOP_SEED": return "TOP_SEED";
  }
}

function margin(
  standings: readonly Standing[],
  selectedTeamId: number,
  targetTeamId: number,
): number | null {
  const selected = standings.find((standing) => standing.team.id === selectedTeamId);
  const target = standings.find((standing) => standing.team.id === targetTeamId);
  return selected && target ? clean(relativeGames(selected, target)) : null;
}

type Boundary = {
  race: RaceKind;
  mode: "CHASE" | "DEFEND";
  targetTeamId: number;
  rank?: number;
};

function boundaries(state: PennantRaceState): Boundary[] {
  const values: Boundary[] = [];
  if (
    !state.playoffClinched &&
    !state.playoffEliminated &&
    state.divisionRank !== 1 &&
    state.wildCardRank !== null
  ) {
    const targetTeamId = state.wildCardRank > 3
      ? state.wildCardCutoffId
      : state.wildCardTeamIds[3] ?? null;
    if (targetTeamId !== null) {
      values.push({
        race: "WILD_CARD",
        mode: state.wildCardRank > 3 ? "CHASE" : "DEFEND",
        targetTeamId,
        rank: Math.min(state.wildCardRank, 3),
      });
    }
  }

  const divisionTarget = state.divisionRank === 1
    ? state.divisionCompetitorIds[0]
    : state.divisionLeaderId;
  if (divisionTarget && !state.divisionClinched && !state.divisionEliminated) {
    values.push({
      race: "DIVISION",
      mode: state.divisionRank === 1 ? "DEFEND" : "CHASE",
      targetTeamId: divisionTarget,
    });
  }

  if (state.divisionRank === 1 && state.leagueSeed !== null) {
    const byeTarget = state.leagueSeed <= 2
      ? state.divisionWinnerIds[2]
      : state.divisionWinnerIds[1];
    if (byeTarget && !state.byeClinched && !state.byeEliminated) {
      values.push({
        race: "BYE",
        mode: state.leagueSeed <= 2 ? "DEFEND" : "CHASE",
        targetTeamId: byeTarget,
      });
    }

    const topTarget = state.leagueSeed === 1
      ? state.divisionWinnerIds[1]
      : state.divisionWinnerIds[0];
    if (topTarget && !state.topSeedClinched && !state.topSeedEliminated) {
      values.push({
        race: "TOP_SEED",
        mode: state.leagueSeed === 1 ? "DEFEND" : "CHASE",
        targetTeamId: topTarget,
      });
    }
  }

  return values;
}

function statusConsequences(
  before: PennantRaceState,
  after: PennantRaceState,
): RaceConsequence[] {
  const statuses = [
    ["topSeedClinched", "TOP_SEED"],
    ["byeClinched", "BYE"],
    ["divisionClinched", "DIVISION"],
    ["playoffClinched", "PLAYOFF"],
  ] as const;
  const eliminations = [
    ["playoffEliminated", "PLAYOFF"],
    ["divisionEliminated", "DIVISION"],
    ["byeEliminated", "BYE"],
    ["topSeedEliminated", "TOP_SEED"],
  ] as const;

  return [
    ...statuses.flatMap(([field, race]) =>
      !before[field] && after[field]
        ? [{ type: "CLINCH" as const, race }]
        : [],
    ),
    ...eliminations.flatMap(([field, race]) =>
      before[field] && !after[field]
        ? [{ type: "ELIMINATION_AVOIDED" as const, race }]
        : [],
    ),
  ];
}

function positionConsequences(
  before: PennantRaceState,
  after: PennantRaceState,
  afterStandings: readonly Standing[],
): RaceConsequence[] {
  const consequences: RaceConsequence[] = [];

  if (
    !before.inPlayoffPosition &&
    after.inPlayoffPosition &&
    after.divisionRank === 1
  ) {
    consequences.push({
      type: "POSITION_GAINED",
      race: "PLAYOFF",
      fromRank: before.wildCardRank ?? 99,
      toRank: after.leagueSeed ?? 3,
    });
  }

  if (before.wildCardRank !== null && after.wildCardRank !== null) {
    if (after.wildCardRank < before.wildCardRank) {
      consequences.push({
        type: "POSITION_GAINED",
        race: "WILD_CARD",
        fromRank: before.wildCardRank,
        toRank: after.wildCardRank,
      });
    } else if (after.wildCardRank > before.wildCardRank) {
      consequences.push({
        type: "POSITION_LOST",
        race: "WILD_CARD",
        fromRank: before.wildCardRank,
        toRank: after.wildCardRank,
      });
    }
  }

  if (before.divisionRank > 1 && after.divisionRank === 1) {
    const leadMargin = margin(
      afterStandings,
      before.selectedTeamId,
      before.divisionLeaderId,
    );
    consequences.push({
      type: leadMargin === 0 ? "TIE_CREATED" : "LEAD_TAKEN",
      race: "DIVISION",
      targetTeamId: before.divisionLeaderId,
    });
  } else if (after.divisionRank < before.divisionRank) {
    consequences.push({
      type: "POSITION_GAINED",
      race: "DIVISION",
      fromRank: before.divisionRank,
      toRank: after.divisionRank,
    });
  } else if (after.divisionRank > before.divisionRank) {
    consequences.push({
      type: "POSITION_LOST",
      race: "DIVISION",
      fromRank: before.divisionRank,
      toRank: after.divisionRank,
    });
  }

  if (
    before.divisionRank === 1 &&
    after.divisionRank === 1 &&
    before.leagueSeed !== null &&
    after.leagueSeed !== null
  ) {
    if (before.leagueSeed > 2 && after.leagueSeed <= 2) {
      const targetId = before.divisionWinnerIds[1];
      const targetMargin = targetId
        ? margin(afterStandings, before.selectedTeamId, targetId)
        : null;
      consequences.push(targetMargin === 0
        ? { type: "TIE_CREATED", race: "BYE", targetTeamId: targetId }
        : {
            type: "POSITION_GAINED",
            race: "BYE",
            fromRank: before.leagueSeed,
            toRank: after.leagueSeed,
          });
    }
    if (before.leagueSeed !== 1 && after.leagueSeed === 1) {
      const targetId = before.divisionWinnerIds[0];
      const targetMargin = targetId
        ? margin(afterStandings, before.selectedTeamId, targetId)
        : null;
      consequences.push(targetMargin === 0
        ? { type: "TIE_CREATED", race: "TOP_SEED", targetTeamId: targetId }
        : {
            type: "POSITION_GAINED",
            race: "TOP_SEED",
            fromRank: before.leagueSeed,
            toRank: 1,
          });
    }
  }
  return consequences;
}

function boundaryConsequences(
  before: PennantRaceState,
  beforeStandings: readonly Standing[],
  afterStandings: readonly Standing[],
): RaceConsequence[] {
  return boundaries(before).flatMap((boundary): RaceConsequence[] => {
    const fromValue = margin(
      beforeStandings,
      before.selectedTeamId,
      boundary.targetTeamId,
    );
    const toValue = margin(
      afterStandings,
      before.selectedTeamId,
      boundary.targetTeamId,
    );
    if (fromValue === null || toValue === null || toValue <= fromValue) return [];

    if (boundary.mode === "CHASE") {
      if (fromValue < 0 && toValue === 0) {
        return [{
          type: "TIE_CREATED" as const,
          race: boundary.race,
          targetTeamId: boundary.targetTeamId,
        }];
      }
      if (fromValue < 0 && toValue < 0) {
        return [{
          type: "GAP_CLOSED" as const,
          race: boundary.race,
          fromGamesBack: clean(-fromValue),
          toGamesBack: clean(-toValue),
          targetTeamId: boundary.targetTeamId,
        }];
      }
      if (fromValue <= 0 && toValue > 0 && boundary.race === "DIVISION") {
        return [{
          type: "LEAD_TAKEN" as const,
          race: boundary.race,
          targetTeamId: boundary.targetTeamId,
        }];
      }
    } else if (toValue > fromValue) {
      return [{
        type: "LEAD_EXTENDED" as const,
        race: boundary.race,
        fromLead: clean(fromValue),
        toLead: clean(toValue),
        targetTeamId: boundary.targetTeamId,
        ...(boundary.rank === undefined ? {} : { rank: boundary.rank }),
      }];
    }

    return [];
  });
}

function objectiveMarginConsequences(
  before: PennantRaceState,
  beforeStandings: readonly Standing[],
  afterStandings: readonly Standing[],
): RaceConsequence[] {
  const objectives = [
    ...(before.primaryObjective ? [before.primaryObjective] : []),
    ...before.secondaryObjectives,
  ];
  return objectives.flatMap((objective) =>
    objective.targetTeamIds.flatMap((targetTeamId): RaceConsequence[] => {
      const fromValue = margin(beforeStandings, before.selectedTeamId, targetTeamId);
      const toValue = margin(afterStandings, before.selectedTeamId, targetTeamId);
      return fromValue !== null && toValue !== null && toValue > fromValue
        ? [{
            type: "MARGIN_IMPROVED" as const,
            race: raceForObjective(objective.kind),
            fromValue,
            toValue,
            targetTeamId,
          }]
        : [];
    }),
  );
}

export function derivePairwiseRaceConsequence(
  beforeStandings: readonly Standing[],
  afterStandings: readonly Standing[],
  state: PennantRaceState,
  competitorTeamId: number,
): RaceConsequence | null {
  const activeObjectives = [
    ...(state.primaryObjective ? [state.primaryObjective] : []),
    ...state.secondaryObjectives,
  ];
  const objective = activeObjectives.find((candidate) =>
    candidate.targetTeamIds.includes(competitorTeamId) ||
    candidate.boundaryTeamIds.includes(competitorTeamId),
  ) ?? state.primaryObjective;
  if (!objective) return null;

  const fromValue = margin(
    beforeStandings,
    state.selectedTeamId,
    competitorTeamId,
  );
  const toValue = margin(
    afterStandings,
    state.selectedTeamId,
    competitorTeamId,
  );
  if (fromValue === null || toValue === null || toValue === fromValue) return null;

  const race = raceForObjective(objective.kind);
  if (toValue < fromValue) {
    return fromValue < 0 && toValue < 0
      ? {
          type: "GAP_WIDENED",
          race,
          fromGamesBack: clean(-fromValue),
          toGamesBack: clean(-toValue),
          targetTeamId: competitorTeamId,
        }
      : null;
  }
  if (fromValue < 0 && toValue < 0) {
    return {
      type: "GAP_CLOSED",
      race,
      fromGamesBack: clean(-fromValue),
      toGamesBack: clean(-toValue),
      targetTeamId: competitorTeamId,
    };
  }
  if (fromValue < 0 && toValue === 0) {
    return { type: "TIE_CREATED", race, targetTeamId: competitorTeamId };
  }
  if (fromValue <= 0 && toValue > 0) {
    return {
      type: "LEAD_TAKEN",
      race,
      targetTeamId: competitorTeamId,
      lead: clean(toValue),
    };
  }
  if (fromValue > 0) {
    return {
      type: "LEAD_EXTENDED",
      race,
      fromLead: clean(fromValue),
      toLead: clean(toValue),
      targetTeamId: competitorTeamId,
    };
  }
  return null;
}

export function consequencePriority(consequence: RaceConsequence): number {
  if (consequence.type === "CLINCH") return 1;
  if (consequence.type === "ELIMINATION_AVOIDED") return 2;
  if (
    consequence.type === "POSITION_GAINED" &&
    consequence.race === "WILD_CARD" &&
    consequence.fromRank > 3 && consequence.toRank <= 3
  ) return 2;
  if (consequence.type === "LEAD_TAKEN" && consequence.race === "DIVISION") return 3;
  if (consequence.type === "POSITION_GAINED" && consequence.race === "BYE") return 4;
  if (consequence.type === "POSITION_GAINED" && consequence.race === "TOP_SEED") return 5;
  if (consequence.type === "POSITION_GAINED") return 6;
  if (consequence.type === "TIE_CREATED") return 7;
  if (consequence.type === "GAP_CLOSED") return 8;
  if (consequence.type === "GAP_WIDENED") return 8;
  if (consequence.type === "LEAD_EXTENDED") return 9;
  if (consequence.type === "MARGIN_IMPROVED") return 10;
  if (consequence.type === "POSITION_HELD") return 11;
  return 12;
}

function consequenceKey(consequence: RaceConsequence): string {
  const target = "targetTeamId" in consequence
    ? consequence.targetTeamId ?? ""
    : "";
  return `${consequence.type}:${consequence.race}:${target}`;
}

export function deriveRaceConsequences(
  beforeStandings: readonly Standing[],
  afterStandings: readonly Standing[],
  before: PennantRaceState,
  after: PennantRaceState,
): RaceConsequence[] {
  const candidates = [
    ...statusConsequences(before, after),
    ...positionConsequences(before, after, afterStandings),
    ...boundaryConsequences(before, beforeStandings, afterStandings),
    ...objectiveMarginConsequences(before, beforeStandings, afterStandings),
  ];
  const seen = new Set<string>();
  const unique = candidates.filter((consequence) => {
    const key = consequenceKey(consequence);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length === 0) {
    if (
      before.wildCardRank !== null &&
      before.wildCardRank <= 3 &&
      after.wildCardRank === before.wildCardRank
    ) {
      unique.push({
        type: "POSITION_HELD",
        race: "WILD_CARD",
        rank: before.wildCardRank,
      });
    } else if (before.divisionRank === 1 && after.divisionRank === 1) {
      unique.push({ type: "POSITION_HELD", race: "DIVISION", rank: 1 });
    }
  }

  return unique.sort((first, second) =>
    consequencePriority(first) - consequencePriority(second),
  );
}
