import type { NextRequest } from "next/server";
import { getBaseballDate } from "@/lib/mlb/date";
import { MlbApiError } from "@/lib/mlb/client";
import { getTeamByAbbreviation } from "@/lib/mlb/teams";
import { getPennantWatchData } from "@/lib/pennantWatch";

export async function GET(request: NextRequest) {
  const abbreviation = request.nextUrl.searchParams.get("team") ?? undefined;
  const team = getTeamByAbbreviation(abbreviation);

  if (!team) {
    return Response.json(
      { error: "The team parameter must be a valid MLB abbreviation." },
      { status: 400 },
    );
  }

  try {
    return Response.json(
      await getPennantWatchData(team, getBaseballDate()),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof MlbApiError) {
      return Response.json(
        {
          error: `MLB ${error.resource} data is temporarily unavailable.`,
          resource: error.resource,
        },
        { status: 502 },
      );
    }

    return Response.json(
      { error: "Unable to build the rooting guide." },
      { status: 500 },
    );
  }
}
