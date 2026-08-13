import type { MlbScheduleResponse, MlbStandingsResponse } from "./types";

const MLB_API_BASE = "https://statsapi.mlb.com/api/v1";
const REVALIDATE_SECONDS = 180;

export class MlbApiError extends Error {
  constructor(
    public readonly resource: "schedule" | "standings",
    public readonly status?: number,
  ) {
    super(`MLB ${resource} data is unavailable${status ? ` (${status})` : ""}.`);
    this.name = "MlbApiError";
  }
}

async function requestMlb<T>(
  resource: MlbApiError["resource"],
  pathname: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${MLB_API_BASE}/${pathname}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: REVALIDATE_SECONDS },
    });

    if (!response.ok) {
      throw new MlbApiError(resource, response.status);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof MlbApiError) throw error;
    throw new MlbApiError(resource);
  }
}

export function fetchSchedule(date: string): Promise<MlbScheduleResponse> {
  return requestMlb("schedule", "schedule", { sportId: "1", date });
}

export function fetchStandings(season: string): Promise<MlbStandingsResponse> {
  return requestMlb("standings", "standings", {
    leagueId: "103,104",
    season,
    standingsTypes: "regularSeason",
  });
}
