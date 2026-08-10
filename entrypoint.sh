#!/bin/sh
set -e

export NODE_ENV=production

case "$1" in
    migrate) exec pnpm run --silent run:migrate;;
    bot) exec pnpm run --silent run:bot;;
    api) exec pnpm run --silent run:api;;
    dashboard) exec pnpm run --silent run:dashboard;;
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
