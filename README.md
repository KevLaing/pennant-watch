# PennantWatch

PennantWatch turns today’s MLB schedule into a rooting guide for a selected team’s postseason race. It is a Next.js 16 App Router application with server-rendered MLB data, cookie-based team selection, and no database or authentication.

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
