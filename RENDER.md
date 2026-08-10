# Deploying Zeppelin on Render.com

This guide covers deploying Zeppelin as **three separate Render services**: bot, API, and dashboard.

## Architecture

| Service | Render type | Command | Description |
|---|---|---|---|
| `zeppelin-bot` | Background Worker | `bot` | Discord bot process |
| `zeppelin-api` | Web Service | `api` | REST API (binds to Render's `PORT`) |
| `zeppelin-dashboard` | Web Service | `dashboard` | Static dashboard (binds to Render's `PORT`) |

All three services use the same Docker image. The `dockerCommand` in `render.yaml` selects which process to run. The Dockerfile `ENTRYPOINT` passes that command to `entrypoint.sh`.

## Prerequisites

### External MySQL Database

Render does not offer managed MySQL. You need an external MySQL 8.0+ instance:

- [PlanetScale](https://planetscale.com/) (MySQL-compatible)
- [Railway](https://railway.app/) (managed MySQL)
- [Aiven](https://aiven.io/) (managed MySQL)
- Self-hosted MySQL on another VPS

**Important:** The database timezone must be set to UTC.

### Redis

Redis is used only as an optional user cache. The bot and API will run **without** it (caching is then disabled), so a missing or unreachable Redis will not crash a service.

You can use:

- [Render Redis](https://render.com/docs/redis) (managed add-on)
- An external Redis provider

If you don't set `REDIS_URL`, the services will log a warning and continue. Set it if you want the user cache to work.

### Discord OAuth Redirect

In the [Discord Developer Portal](https://discord.com/developers/applications), add this redirect URL for your application (replace with your actual API URL):

```
https://<your-api-service>.onrender.com/auth/oauth-callback
```

## Environment Variables

Create an **Environment Variable Group** called `zeppelin-shared` in the Render dashboard:

| Variable | Required | Description |
|---|---|---|
| `KEY` | ✅ | 32-character encryption key |
| `CLIENT_ID` | ✅ | Discord application client ID |
| `CLIENT_SECRET` | ✅ | Discord application client secret (32 chars) |
| `BOT_TOKEN` | ✅ | Discord bot token |
| `DASHBOARD_URL` | ✅ | Full URL of your dashboard (e.g. `https://zeppelin-dashboard.onrender.com`) |
| `API_URL` | ✅ | Full URL of your API (e.g. `https://zeppelin-api.onrender.com`) |
| `DB_HOST` | ✅ | MySQL hostname |
| `DB_PORT` | ✅ | MySQL port (usually `3306`) |
| `DB_USER` | ✅ | MySQL username |
| `DB_PASSWORD` | ✅ | MySQL password |
| `DB_DATABASE` | ✅ | MySQL database name |
| `REDIS_URL` | ❌ | Redis connection URL (e.g. `redis://...`). Optional — caching is disabled if unset or unreachable |
| `STAFF` | ❌ | Comma-separated Discord user IDs for bot staff |
| `DEFAULT_ALLOWED_SERVERS` | ❌ | Comma-separated server IDs |
| `FISHFISH_API_KEY` | ❌ | FishFish API key |
| `API_PATH_PREFIX` | ❌ | Leave **empty** on Render (API is on its own domain) |

Do **not** set `PORT` manually for web services. Render injects it automatically and both the API and dashboard bind to `0.0.0.0:$PORT`.

## Deployment

### Option A: Blueprint (Recommended)

1. Push your code to a GitHub/GitLab repository
2. Go to [Render Dashboard](https://dashboard.render.com) → **Blueprints** → **New Blueprint Instance**
3. Connect your repository
4. Render detects `render.yaml` and creates three services
5. Create the `zeppelin-shared` env group with all required variables
6. Deploy

### Option B: Manual Setup

Create three services manually. For each, use **Runtime: Docker** and the same repo/Dockerfile.

#### 1. Bot (Background Worker)

- **Docker Command:** `bot`
- **Environment:** Link the `zeppelin-shared` env group, set `NODE_ENV=production`

#### 2. API (Web Service)

- **Docker Command:** `api`
- **Health Check Path:** `/`
- **Environment:** Link the `zeppelin-shared` env group, set `NODE_ENV=production`

#### 3. Dashboard (Web Service)

- **Docker Command:** `dashboard`
- **Health Check Path:** `/`
- **Environment:** Link the `zeppelin-shared` env group, set `NODE_ENV=production`

> **Important:** Set the Docker Command to `dashboard`, `api`, or `bot` — not `npm run start-dashboard` or `./entrypoint.sh dashboard`. If your service was created with an old start command, update it under **Settings → Docker Command** in the Render dashboard.

## Running Database Migrations

Before the first deployment, or after updates with schema changes, run migrations using a Render Shell or one-off Job:

```bash
./entrypoint.sh migrate
```

Or from the repo root inside the container:

```bash
pnpm run run:migrate
```

## Troubleshooting

### Bot keeps restarting

- Check that all required environment variables are set in `zeppelin-shared`
- Verify your MySQL database is accessible from Render's network
- Check Render logs for connection errors

### API returns 502

- Ensure the API binds to `0.0.0.0` and uses Render's `PORT` (already configured in code)
- Do not override `PORT` in environment variables
- Check database connectivity

### `Missing script: "start-dashboard"` (or start-bot / start-api)

Your Render service is using an old Docker Command like `npm run start-dashboard`. Either:

1. **Recommended:** Change **Settings → Docker Command** to `dashboard` (or `api` / `bot` for the other services), then redeploy.
2. **Or** pull the latest code — root `package.json` now includes `start-dashboard`, `start-api`, and `start-bot` scripts for backward compatibility.

### Dashboard shows blank page

- Verify `API_URL` points to your API service URL (e.g. `https://zeppelin-api.onrender.com`)
- Open `/env.js` in the browser — it should show `window.API_URL = "https://..."`
- Check browser console for CORS errors
- Ensure `DASHBOARD_URL` matches the actual dashboard Render URL (used for API CORS)

### OAuth login fails

- Confirm the Discord redirect URL matches `{API_URL}/auth/oauth-callback` exactly
- Ensure `CLIENT_ID` and `CLIENT_SECRET` are correct

### Database connection errors

- Ensure your MySQL provider allows connections from Render's IP ranges
- Verify `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_DATABASE` are correct
- Check that the database timezone is UTC

### Redis connection errors

- Verify `REDIS_URL` is correct
- If using Render Redis, ensure it's in the same region as your services
