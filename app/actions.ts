"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getTeamByAbbreviation } from "@/lib/mlb/teams";
import { TEAM_COOKIE } from "@/lib/teamSelection";

export async function selectTeam(formData: FormData): Promise<void> {
  const value = formData.get("team");
  const team = getTeamByAbbreviation(typeof value === "string" ? value : undefined);

  if (!team) redirect("/");

  const cookieStore = await cookies();
  cookieStore.set(TEAM_COOKIE, team.abbreviation, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/");
}
