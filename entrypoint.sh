#!/bin/sh
set -e

export NODE_ENV=production

# Render/Docker may pass "npm run start-*" as the container command instead of "bot" / "api" / "dashboard".
if [ "$1" = "npm" ]; then
    shift
    exec npm "$@"
fi

case "$1" in
    migrate) exec pnpm run --silent run:migrate;;
    bot|start-bot) exec pnpm run --silent run:bot;;
    api|start-api) exec pnpm run --silent run:api;;
    dashboard|start-dashboard) exec pnpm run --silent run:dashboard;;
    "")
        echo "Usage: entrypoint.sh <command>"
        echo "Available commands: migrate, bot, api, dashboard"
        exit 1
        ;;
    *)
        echo "Unknown command: $1"
        echo "Available commands: migrate, bot, api, dashboard"
        exit 1
        ;;
esac
