#!/usr/bin/env bash
set -euo pipefail
# Intentionally refuses unless ALLOW_LOCAL_HEAVY_BUILD=1. Normal builds belong in GitHub Actions.
exec /root/bin/safe-run build "$@"
