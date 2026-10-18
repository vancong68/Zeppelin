# Deploying Zeppelin on Render.com

This guide covers deploying Zeppelin as **three separate Render services**: bot, API, and dashboard. All three run the same Docker image; the `dockerCommand` in `render.yaml` (or the service's *Docker Command* setting) selects which process `entrypoint.sh` starts.

## Architecture

| Service              | Render type  | Command     | Plan                              | Notes                                            |
| -------------------- | ------------ | ----------- | --------------------------------- | ------------------------------------------------ |
| `zeppelin-bot`       | Web Service  | `bot`       | **paid** (e.g. `0.5c-512mb`)      | Discord bot; **must not run on the free plan**   |
| `zeppelin-api`       | Web Service  | `api`       | free or paid                      | REST API; binds Render's `PORT`                  |
| `zeppelin-dashboard` | Web Service  | `dashboard` | free or paid                      | Serves the UI; binds Render's `PORT`             |

### Why the bot needs a paid plan

Verified against [Render's free-tier documentation](https://render.com/docs/free):

- Free instances exist **only** for web services, static sites, Render Postgres and Key Value instances — **background workers cannot be free**.
- A free web service **spins down after 15 minutes without inbound traffic** (HTTP requests or WebSocket messages from existing connections). The bot only makes *outbound* connections (Discord gateway, MySQL), so a free bot service goes offline shortly after startup. Discord messages do **not** wake it up — only inbound HTTP does.
- A spun-down service takes about a minute to spin back up. Free services can also be restarted by Render at any time and have no shell access or one-off jobs.
- Keep-alive tricks (periodic pings / fake traffic) violate Render's policies and are **not** used by this project.

Give `zeppelin-bot` any paid plan (the blueprint uses `0.5c-512mb`) and it stays online continuously. As an alternative, the bot also works as a **Background Worker** (`type: worker`, same image, `bot` command) — a worker has no public URL or `PORT`, so the bot's health server is simply disabled there. Note that a service's *type* cannot be changed after creation, so switching to a worker means recreating the service in the Render dashboard.

`zeppelin-api` and `zeppelin-dashboard` are fine on the free plan if you accept a cold start (up to ~1 minute) on the first request after idling.

### Health checks

All three services set `healthCheckPath: /`. Health checks are **liveness** checks only: they fail when the process stops responding (crash, failed startup), not when Discord or the database is temporarily unavailable. This avoids restart loops during slow startups.

- **Bot** (`/`): always answers `200` while the process is alive, with a status body instead of a hard failure:
  `{"status":"ok","service":"zeppelin-bot","uptime_seconds":…,"discord":"ready|connecting","database":"connected|connecting"}`
  In production it binds Render's injected `PORT` automatically. Override with `BOT_HEALTH_PORT`; set `BOT_HEALTH_PORT=0` to disable it entirely.
- **API** (`/`): `200` with `{"status":"cookies","with":"milk"}`.
- **Dashboard** (`/`): `200` with the SPA's `index.html`.

Do **not** set `PORT` manually — Render injects it, and the bot, API, and dashboard all bind `0.0.0.0:$PORT`. The bot and the API also handle `SIGTERM`/`SIGINT` gracefully (close bots/HTTP servers, then the database pool).

## Prerequisites

### External MySQL database

Render does not offer managed MySQL. You need an external MySQL 8.0+ instance:

- [PlanetScale](https://planetscale.com/) (MySQL-compatible)
- [Railway](https://railway.app/) (managed MySQL)
- [Aiven](https://aiven.io/) (managed MySQL)
- Self-hosted MySQL on another VPS

**Important:** The database timezone must be UTC. The bot and API verify this on startup and refuse to connect with a clear error if the timezone is not UTC (`Database timezone must be UTC (detected …)`). The application also uses UTC internally.

### Redis (optional)

Redis is used only as a user cache. The bot and API run **without** it (caching is disabled while Redis is unreachable); a missing or unreachable Redis logs a single warning and never crashes a service.

You can use a [Render Key Value](https://render.com/docs/key-value) instance or an external Redis provider, ideally in the same region as your services. If you don't set `REDIS_URL`, the services continue without a cache.

### Discord application

In the [Discord Developer Portal](https://discord.com/developers/applications):

1. Add this OAuth redirect URL (replace with your actual API URL):
   `https://<your-api-service>.onrender.com/auth/oauth-callback`
2. Enable the **Privileged Gateway Intents** (Message Content, Server Members) under *Bot → Privileged Gateway Intents*. Without them the bot disconnects with a "Used disallowed intents" error. See `docs/PRIVILEGED_INTENTS.md` for the review process.

## Environment variables

The `render.yaml` blueprint creates the **`zeppelin-shared` env group empty** — blueprint environment groups don't support `sync: false`, so secret values must be added after the first blueprint sync:

1. Go to **Dashboard → Env Groups → `zeppelin-shared`**
2. Add every required key from the table below (and any optional ones you need)
3. Save — Render redeploys linked services

Values are intentionally **not** stored in `render.yaml` so secrets never end up in Git.

| Variable                  | Required | Description                                                                                             |
| ------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| `KEY`                     | ✅       | 32-character encryption key                                                                             |
| `CLIENT_ID`               | ✅       | Discord application client ID                                                                           |
| `CLIENT_SECRET`           | ✅       | Discord application client secret (32 chars)                                                            |
| `BOT_TOKEN`               | ✅       | Discord bot token                                                                                       |
| `DASHBOARD_URL`           | ✅       | Full URL of your dashboard (e.g. `https://zeppelin-dashboard.onrender.com`); used for API CORS          |
| `API_URL`                 | ✅       | Full URL of your API (e.g. `https://zeppelin-api.onrender.com`); used for OAuth and by the dashboard    |
| `DB_HOST`                 | ✅       | MySQL hostname                                                                                          |
| `DB_PORT`                 | ✅       | MySQL port (usually `3306`)                                                                             |
| `DB_USER`                 | ✅       | MySQL username                                                                                          |
| `DB_PASSWORD`             | ✅       | MySQL password                                                                                          |
| `DB_DATABASE`             | ✅       | MySQL database name                                                                                     |
| `REDIS_URL`               | ❌       | Redis connection URL (e.g. `redis://...`). Optional — caching is disabled if unset or unreachable      |
| `STAFF`                   | ❌       | Comma-separated Discord user IDs for bot staff                                                          |
| `DEFAULT_ALLOWED_SERVERS` | ❌       | Comma-separated server IDs                                                                              |
| `FISHFISH_API_KEY`        | ❌       | FishFish API key                                                                                        |
| `PHISHERMAN_API_KEY`      | ❌       | Phisherman API key                                                                                      |
| `DEFAULT_SUCCESS_EMOJI`   | ❌       | Default success emoji (default: `✅`)                                                                   |
| `DEFAULT_ERROR_EMOJI`     | ❌       | Default error emoji (default: `❌`)                                                                     |
| `DEBUG`                   | ❌       | Set to `true` to enable debug mode (disables signal handling; for local debugging only)                 |
| `API_PATH_PREFIX`         | ❌       | Leave **empty** on Render (API is on its own domain)                                                    |
| `BOT_HEALTH_PORT`         | ❌       | Bot only. Overrides the health-check port; `0` disables the health server. Ignored on background workers |

Missing or invalid variables abort startup with a clear list, e.g. `Invalid or missing environment variables: - BOT_TOKEN: …`.

## Deployment

### Option A: Blueprint (recommended)

1. Push your code to GitHub/GitLab
2. [Render Dashboard](https://dashboard.render.com) → **Blueprints** → **New Blueprint Instance**
3. Connect the repository — Render reads `render.yaml` and creates the three services plus the (empty) `zeppelin-shared` env group
4. Fill in the env group values (see above)
5. Redeploy the services (env group changes trigger a redeploy for linked services)

If you have the [Render CLI](https://render.com/docs/cli) (v2.7.0+), you can check the blueprint before deploying:

```bash
render blueprints validate render.yaml
```

### Option B: Manual setup

Create three services. For each: **New → Web Service**, Runtime **Docker**, same repo, Dockerfile Path `./Dockerfile`, Health Check Path `/`, and link the `zeppelin-shared` env group plus `NODE_ENV=production`.

| Service  | Docker Command | Compute plan                                            |
| -------- | -------------- | ------------------------------------------------------- |
| bot      | `bot`          | any **paid** plan (free will spin down — see above)     |
| api      | `api`          | free or paid                                            |
| dashboard | `dashboard`   | free or paid                                            |

> **Important:** Set the Docker Command to `dashboard`, `api`, or `bot` — not `npm run start-dashboard` or `./entrypoint.sh dashboard`. For backward compatibility the image also accepts `npm run start-bot` / `start-api` / `start-dashboard`, but the short commands are recommended. If a service was created with an old command, update it under **Settings → Docker Command**.

## Running database migrations

The services **never run migrations automatically** — run them yourself, exactly once, before deploying code that requires the new schema. Do **not** run migrations concurrently from several services or jobs at the same time.

```bash
# Inside the container (paid services: Dashboard → Shell)
./entrypoint.sh migrate
```

Alternatively:

- **One-off job (paid plans):** Dashboard → **New → Job**, same repo/Dockerfile, command `migrate`, link the `zeppelin-shared` env group.
- **Local Docker:** `docker build -t zeppelin . && docker run --rm --env-file .env.render zeppelin migrate`
- **Local with pnpm:** put the production values in a root `.env`, then `pnpm install && pnpm run build:backend && pnpm run run:migrate`.

TypeORM records executed migrations in the database, so re-running `migrate` is safe (already-applied migrations are skipped) and existing data is preserved. To revert the most recent migration, use `cd backend && pnpm run migrate-rollback` (inside a shell or locally).

## Verifying a deployment

- **Bot:** Render status **Live**; logs show `Connecting to database`, `Bot Initialized`, `Logging in...`. `curl https://<bot-service>.onrender.com/` returns the health JSON with `"discord":"ready","database":"connected"` (paid web service). The bot responds to commands in Discord.
- **API:** `curl https://<api-service>.onrender.com/` → `{"status":"cookies","with":"milk"}`. Discord OAuth login from the dashboard completes and redirects back to `/login-callback/`.
- **Dashboard:** `https://<dashboard-service>.onrender.com/` loads; `…/env.js` shows `window.API_URL = "https://<api-service>.onrender.com";`.

## Free-tier limitations (summary)

- 750 free instance-hours per workspace per month (spun-down services don't consume hours); services are suspended for the rest of the month if the limit is exceeded.
- Free web services spin down after 15 minutes without inbound traffic (~1 minute cold start), may be restarted at any time, and lose filesystem changes on redeploy/spin-down.
- No shell access, no one-off jobs, no scaling, no persistent disks, and no inbound private-network traffic on free instances.
- **The bot therefore requires a paid plan**; API and dashboard can stay free if cold starts are acceptable.

## Troubleshooting

### Build fails: `COPY failed: … "config-checker/package.json": not found`

`config-checker` is a pnpm workspace package, so it must stay in the Docker build context. If you edit `.dockerignore`, do **not** exclude `/config-checker` (the Dockerfile copies its `package.json` before `pnpm install --frozen-lockfile`).

### Startup fails with `Invalid or missing environment variables`

The message lists exactly which keys are missing/invalid. Add them to the `zeppelin-shared` env group (or the service's environment), then redeploy.

### Bot goes offline after ~15 minutes

The bot is running on the free plan, which spins down services without inbound traffic. Upgrade `zeppelin-bot` to a paid plan (keep-alive traffic is not allowed). See [Architecture](#architecture).

### `No open ports detected` during deploy (bot as web service)

Make sure the service uses the current image and Docker Command `bot` — the bot binds Render's `PORT` automatically in production. Don't set `PORT` manually.

### Bot disconnects with "Used disallowed intents"

Enable the **Message Content** and **Server Members** privileged intents in the Discord Developer Portal → your application → *Bot*.

### Database connection errors / `Database timezone must be UTC`

- Ensure the database server's timezone is UTC.
- Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` and that your MySQL provider allows connections from Render.
- Connection failures abort startup with a non-zero exit code and a clear log line, so the deploy fails visibly instead of running half-configured.

### API returns 502

- Check the service logs; the API exits on a failed database connection, so a 502 usually means it couldn't reach MySQL or is mid-restart.
- On the free plan, the first request after idling waits for the service to wake up (~1 minute).

### OAuth login fails

- The Discord redirect URL must match `{API_URL}/auth/oauth-callback` exactly.
- Verify `CLIENT_ID` and `CLIENT_SECRET`, and that `API_URL`/`DASHBOARD_URL` are the public `https://…onrender.com` URLs.

### Dashboard shows a blank page

- Check `/env.js` shows the right `API_URL`.
- `DASHBOARD_URL` must match the dashboard's public URL (used for API CORS).

### Redis connection errors

Optional and non-fatal — a single `[redis] Connection failed … continuing without Redis cache` warning is expected when `REDIS_URL` is unset or unreachable. Set a valid `REDIS_URL` (same region) to enable caching.

### `query failed … Duplicate entry … for key 'messages.PRIMARY'`

Harmless and non-fatal — the same Discord message was saved twice (e.g. on reconnect). The bot keeps running; no action needed.

## How this fork differs from upstream

This fork (originally `vancong68/Zeppelin`) keeps upstream's application code and adds everything needed to run the official Docker image layout on Render:

- `Dockerfile` — single-stage `node:24-slim` image: corepack-pinned pnpm (matching `packageManager`), layered workspace installs with `--frozen-lockfile`, full build, then a production-only reinstall (upstream uses a multi-stage `node:24-alpine` build with cache mounts; `pnpm prune --prod` must not be used — it breaks workspace production deps), runs as the non-root `node` user, and bakes `.commit-hash`/`.build-time` for `!about`.
- `entrypoint.sh` — supports `migrate | bot | api | dashboard` plus legacy `npm run start-*` commands and prints usage on unknown commands.
- `render.yaml` / `RENDER.md` / `start-all.sh` — fork-only deployment assets; `start-all.sh` (single-service quick start) is not used by the blueprint.
- `backend/src/index.ts` — health-check HTTP server (see [Health checks](#health-checks)).
- `backend/src/api/start.ts` — graceful `SIGTERM`/`SIGINT` shutdown for the API.
- `backend/src/data/redis.ts` + `backend/src/utils/getOrFetchUser.ts` — Redis is optional and non-blocking instead of required at startup.
- `backend/src/env.ts` — missing/invalid environment variables produce a readable list instead of a raw Zod error.
- `dashboard/serve.js` — injects `window.API_URL` at runtime via `/env.js`, binds `0.0.0.0:$PORT`, serves the SPA for all routes.
- `package.json` — `start-bot` / `start-api` / `start-dashboard` aliases, run scripts, pnpm pin.
- `.gitattributes` — forces LF line endings so Windows checkouts match CI.
