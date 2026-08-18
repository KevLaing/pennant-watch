import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { RootingGuideTable } from "@/components/RootingGuideTable";
import { StandingsTable } from "@/components/StandingsTable";
import { TeamPicker } from "@/components/TeamPicker";
import { MlbApiError } from "@/lib/mlb/client";
import { formatBaseballDate, getBaseballDate } from "@/lib/mlb/date";
import { getTeamByAbbreviation } from "@/lib/mlb/teams";
import { getPennantWatchData } from "@/lib/pennantWatch";
import { formatRaceSummary } from "@/lib/postseason/presentation";
import { TEAM_COOKIE } from "@/lib/teamSelection";
import { readableTextColor } from "@/lib/theme";

export default async function Home() {
  const cookieStore = await cookies();
  const selectedTeam = getTeamByAbbreviation(cookieStore.get(TEAM_COOKIE)?.value);
  const date = getBaseballDate();
  const primaryColor = selectedTeam?.primaryColor ?? "#081824";
  const secondaryColor = selectedTeam?.secondaryColor ?? "#D7493E";
  const clubBarTheme = {
    "--club-primary": primaryColor,
    "--club-secondary": secondaryColor,
    "--club-primary-contrast": readableTextColor(primaryColor),
  } as CSSProperties;

  let data = null;
  let errorResource: MlbApiError["resource"] | "unknown" | null = null;

  if (selectedTeam) {
    try {
      data = await getPennantWatchData(selectedTeam, date);
    } catch (error) {
      errorResource = error instanceof MlbApiError ? error.resource : "unknown";
    }
  }
  const raceSummary = data?.raceState
    ? formatRaceSummary(data.raceState, data.standings)
    : null;

  return (
    <main>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="PennantWatch home">
          <span className="brand-mark" aria-hidden="true">PW</span>
          <span>PennantWatch</span>
        </Link>
        <span className="header-date">{formatBaseballDate(date)}</span>
      </header>

      <div className="page-shell">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">A smarter scoreboard</p>
            <h1>
              Know who to cheer for <span>today.</span>
            </h1>
            <p className="hero-description">
              Choose your club. We&apos;ll turn today&apos;s MLB slate into a clear guide to the games that can help its postseason standing.
            </p>
          </div>
          <TeamPicker selectedTeam={selectedTeam} prominent={!selectedTeam} />
        </section>

        {!selectedTeam ? (
          <section className="welcome-panel">
            <div className="welcome-score" aria-hidden="true">
              <span>AWAY</span><strong>—</strong><i>FINAL</i><strong>—</strong><span>HOME</span>
            </div>
            <div>
              <p className="eyebrow">First pitch</p>
              <h2>Your daily rooting card starts here.</h2>
              <p>Choose one of the 30 clubs above. We&apos;ll remember it for your next visit.</p>
            </div>
          </section>
        ) : errorResource ? (
          <section className="error-panel" role="alert">
            <span className="error-panel__icon" aria-hidden="true">!</span>
            <div>
              <p className="eyebrow">Temporary data delay</p>
              <h2>We couldn&apos;t load MLB {errorResource === "unknown" ? "" : `${errorResource} `}data.</h2>
              <p>The upstream feed may be between pitches. Refresh in a moment to try again.</p>
            </div>
          </section>
        ) : data ? (
          <div className="dashboard">
            <div className="selected-club-bar" style={clubBarTheme}>
              <div>
                <span className="selected-club-code">{selectedTeam.abbreviation}</span>
                <div>
                  <p>{selectedTeam.name}</p>
                  <span className="selected-club-position">
                    {raceSummary?.position ?? `${selectedTeam.league} ${selectedTeam.division.toLowerCase()} postseason picture`}
                  </span>
                  {raceSummary && (
                    <span className="selected-club-objective">
                      {raceSummary.objective}{raceSummary.margin ? ` · ${raceSummary.margin}` : ""}
                    </span>
                  )}
                </div>
              </div>
              <span className="as-of">Games dated {data.date}</span>
            </div>
            <RootingGuideTable
              games={data.games}
              totalGames={data.scheduleGameCount}
              selectedTeam={selectedTeam}
            />
            <StandingsTable
              selectedTeam={selectedTeam}
              standings={data.standings}
              games={data.games}
            />
          </div>
        ) : null}
      </div>

      <footer>
        <span>PennantWatch</span>
        <p>PennantWatch is an independent fan site and is not affiliated with, endorsed by, or sponsored by Major League Baseball or any MLB club. Team names are used solely to identify the teams discussed.</p>
      
        <p>Data from MLB Stats API · Refreshed every few minutes</p>
      </footer>
    </main>
  );
}
