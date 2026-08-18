# PennantWatch

PennantWatch turns today’s MLB schedule into a rooting guide for a selected team’s postseason race. It is a Next.js 16 App Router application with server-rendered MLB data, cookie-based team selection, and no database or authentication.

## Postseason model

PennantWatch models the current six-team postseason field in each league: three division winners seeded 1–3 and three Wild Cards seeded 4–6. Seeds 1 and 2 receive first-round byes.

The domain flow is:

```text
Standings
  ↓
Race-state detection
  ↓
Active postseason objectives
  ↓
Hypothetical home/away game outcomes
  ↓
Priority-aware objective comparison
  ↓
Rooting recommendation + structured reasons
  ↓
Selected-team conditional result
  ↓
Recommended external result
  ↓
Hypothetical race-state diff
  ↓
Concrete daily consequence + “Why” explanation
```

Supported objectives are making or defending a playoff spot, winning or defending a division, improving Wild Card seed, earning or defending a bye, and earning or defending the league’s top seed. A club can hold several objectives at once. The primary objective is the unresolved boundary with the greatest postseason consequence—berth, division, bye, top seed, then Wild Card seeding—and remaining objectives are retained as secondary context.

Each game outcome is evaluated independently by rebuilding the selected club’s race state. Outcomes are compared lexicographically across the ordered objectives: crossing or preserving the boundary comes first, then position/rank, then games-relative margins against the relevant boundary clubs. No playoff probability, arbitrary weighted score, or Monte Carlo simulation is used.

`RootingReason` records why a recommended result matters conceptually, such as the Wild Card, division, bye, or top-seed objective. `RootingScenario` retains the broader race consequence and a preferred pairwise consequence when a reliable competitor is known. The Rooting Guide renders that direct relationship—for example, cutting the gap to BAL, pulling even, moving ahead, or extending a lead—rather than claiming a league-wide rank that may depend on other unresolved games. The objective reason remains the fallback when no reliable pairwise comparison is available.

The visible Rooting Guide is intentionally limited to **Game**, **Cheer**, and **Why**. Its competitor comes from the primary objective's affected team when that team participates in the row; selected-team games use the primary objective boundary. Numeric `winImpact`, `loseImpact`, and projected position fields remain in the domain model and API for tests and future leverage analysis, but are not rendered as separate table columns.

For an external game, the primary scenario assumes a selected-team win when its earliest unresolved game is scheduled or live, then applies the recommended external result. Live scores are not projected to a final result. If all selected-team games are final, the most recent final result is included as context without applying it to standings a second time. When no selected-team game exists, the external result is evaluated alone. For doubleheaders, the earliest unresolved game is the conditional “take care of our own business” result; if none remains, the most recent final is used. This conditional explanation deliberately avoids enumerating every combination inside each game row.

### Tonight's outcome space

The overview above the Rooting Guide evaluates the night as a whole. Its relevance rule is deliberately conservative: it includes every scheduled, live, or final game involving at least one club from the selected team's league, including interleague games, and excludes games involving only the other league. Postponed games are excluded. Final games are fixed at their actual winner; every scheduled or live game remains a two-result home/away winner variable. Live scores do not change the enumeration. Only games the MLB feed normalizes as postponed are omitted; any other nonfinal state normalized as scheduled or live remains an unresolved binary result.

```text
Today's relevant unresolved games
  ↓
Enumerate 2^N possible scoreboards
  ↓
Apply each scoreboard to standings
  ↓
Evaluate the selected team's postseason state
  ↓
Compare with the current primary objective
  ↓
Aggregate improved / unchanged / worsened,
best / worst, position distribution, and target success count
  ↓
Tonight's Outcome Space overview
```

Enumeration is deterministic and request-local. The generator uses a bitmask—bit `0` means the away team wins and bit `1` means the home team wins—and the aggregator discards each scenario's standings after evaluation. It retains only aggregate counters plus the best and worst result sets, so even a full 15-game, 32,768-scoreboard slate does not retain 32,768 standings snapshots.

These counts are exhaustive possible result combinations, not probabilities. PennantWatch does not assign win probabilities, convert scenario shares into odds, or use Monte Carlo sampling.

Clinching and elimination flags are deliberately conservative. With a complete 15-team league table, PennantWatch uses 162-game maximum-win bounds and marks a status only when it is guaranteed regardless of ties. The MLB standings response used here does not contain the complete head-to-head and intradivision records needed to apply every official tiebreaker, so tied maximum-win cases remain unresolved rather than being labeled clinched or eliminated. Schedule quirks such as canceled games are likewise not inferred from the standings feed.

## Development

Use Node.js 22 or newer. Wrangler 4 requires Node.js 22.

```bash
npm install
npm run dev
```

The normal development command remains the Next.js development server at `http://localhost:3000`.

## Cloudflare deployment

PennantWatch uses the official [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare/get-started) adapter for full-stack Next.js on Cloudflare Workers.

### One-time Cloudflare setup

1. Log in to Cloudflare from Wrangler:

   ```bash
   npx wrangler login
   ```

2. Ensure Workers and R2 are enabled for the Cloudflare account, then create the portable cache bucket referenced by `wrangler.jsonc`:

   ```bash
   npx wrangler r2 bucket create pennant-watch-opennext-cache
   ```

   OpenNext stores Next.js fetch-cache entries in this bucket. Its Durable Object queue is declared in `wrangler.jsonc` and is created/migrated on deployment. No D1 database is needed because PennantWatch uses time-based fetch revalidation but not `revalidateTag` or `revalidatePath`.

3. Deploy the Worker once:

   ```bash
   npm run deploy
   ```

4. After deployment, attach `pennantwatch.com` under the Worker’s **Settings → Domains & Routes → Add → Custom Domain**. If the domain is an active Cloudflare zone, Cloudflare creates the required DNS record. Otherwise, first add the domain to Cloudflare and update its authoritative nameservers.

Do not add account IDs, route IDs, bucket IDs, or secrets to the repository. For CI, configure Cloudflare authentication as protected build secrets.

### Commands

Normal Next.js development:

```bash
npm run dev
```

Build the Cloudflare Worker bundle without starting it:

```bash
npm run build:cloudflare
```

Build and preview locally in the `workerd` runtime:

```bash
npm run preview
```

Build and deploy to Cloudflare Workers:

```bash
npm run deploy
```

Generate binding types after changing `wrangler.jsonc`:

```bash
npm run cf-typegen
```

### Caching

The MLB schedule and standings keep their existing Next.js revalidation windows of 60 and 180 seconds. `open-next.config.ts` maps the Next.js incremental/data cache to R2 and uses the `DOQueueHandler` Durable Object to coordinate time-based revalidation.

Local preview uses Wrangler’s local emulations of these bindings. Deployment populates the configured remote cache through the OpenNext CLI.

Wrangler may warn during local preview that adapter-internal Durable Objects are not available in ordinary local development. The generated OpenNext worker exports `DOQueueHandler`, and deployment/dry-run binding validation resolves it correctly; the warning only limits testing time-based queue execution locally.

### Committed and generated files

Committed deployment configuration:

- `wrangler.jsonc` — Worker entry point, compatibility flags, assets, R2, self-reference, and Durable Object bindings.
- `open-next.config.ts` — OpenNext R2 cache and revalidation queue overrides.
- `public/_headers` — immutable caching for Next.js static build assets.
- `.dev.vars.example` — safe template for local Worker environment variables.

Generated output is intentionally not committed:

- `.open-next/` — generated Worker and static assets.
- `.wrangler/` — Wrangler local state.
- `.dev.vars` — local values and potential secrets.
- `cloudflare-env.d.ts` — optional output of `npm run cf-typegen`; regenerate it after binding changes if application code begins consuming Cloudflare bindings.

## Quality checks

```bash
npm test
npm run lint
npm run build
npm run build:cloudflare
```
