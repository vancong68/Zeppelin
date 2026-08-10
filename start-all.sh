#!/bin/sh
# start-all.sh - Run bot, API, and dashboard concurrently in a single process
# Useful for Render.com single-service deployments

pnpm run run:bot &
BOT_PID=$!

pnpm run run:api &
API_PID=$!

pnpm run run:dashboard &
DASHBOARD_PID=$!

# If any process exits, kill the others and exit
trap "kill $BOT_PID $API_PID $DASHBOARD_PID 2>/dev/null; exit 1" INT TERM

# Wait for all processes - if any exits, stop everything
wait -n 2>/dev/null || wait $BOT_PID $API_PID $DASHBOARD_PID
EXIT_CODE=$?

echo "A process exited with code $EXIT_CODE, shutting down..."
kill $BOT_PID $API_PID $DASHBOARD_PID 2>/dev/null
exit $EXIT_CODE
