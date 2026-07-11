#!/usr/bin/env bash
set -euo pipefail

# Build-only envelope: Vite/Rollup needs a larger JS heap than the test suite,
# while the host still remains below its 2-GiB physical-memory ceiling.
exec systemd-run --scope --quiet --collect \
  -p MemoryHigh=760M \
  -p MemoryMax=820M \
  -p MemorySwapMax=512M \
  -p CPUQuota=120% \
  -p TasksMax=160 \
  "$@"
