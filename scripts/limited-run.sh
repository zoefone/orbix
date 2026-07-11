#!/usr/bin/env bash
set -euo pipefail

# Orbix development guardrail for the 2-core / 2-GiB host.
# Every expensive build/test command must run through this wrapper so a
# runaway compiler or browser cannot make the machine unresponsive.
exec systemd-run --scope --quiet --collect \
  -p MemoryHigh=650M \
  -p MemoryMax=700M \
  -p MemorySwapMax=512M \
  -p CPUQuota=140% \
  -p TasksMax=160 \
  "$@"
