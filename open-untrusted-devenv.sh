#!/usr/bin/env bash
set -eou pipefail

docker compose -f ./docker-compose.development.yml run \
    --quiet \
    --rm \
    -w /workspace/zeppelin \
    untrusted /bin/bash
