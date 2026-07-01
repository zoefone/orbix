#!/usr/bin/env bash
set -euo pipefail
ROOT="${ORBIX_ROOT:-/root/orbix}"
ENV_FILE="${ORBIX_ENV_FILE:-/etc/orbix.env}"
INSTALL_ENABLE=0
INSTALL_START=0
for arg in "$@"; do
  case "$arg" in
    --enable) INSTALL_ENABLE=1 ;;
    --start) INSTALL_START=1 ;;
    --help|-h)
      cat <<'USAGE'
Usage: install-systemd.sh [--enable] [--start]

Creates systemd services for Orbix. It does not enable or start services
unless flags are provided. Configure /etc/orbix.env first for production.

Recommended production env:
  ORBIX_TOKEN=<long random token>
  ORBIX_SERVER_HOST=0.0.0.0
  ORBIX_SERVER_PORT=7320
  ORBIX_DAEMON_HOST=127.0.0.1
  ORBIX_DAEMON_PORT=7317
  # On controlled machines without public IP:
  # ORBIX_SERVER_URL=https://your-public-server.example
  # ORBIX_MACHINE_ID=my-pc
USAGE
      exit 0
      ;;
    *) echo "Unknown arg: $arg" >&2; exit 2 ;;
  esac
done

if [ ! -f "$ENV_FILE" ]; then
  cat >"$ENV_FILE" <<ENV
# Orbix environment. Set ORBIX_TOKEN before exposing services publicly.
ORBIX_SERVER_HOST=127.0.0.1
ORBIX_SERVER_PORT=7320
ORBIX_DAEMON_HOST=127.0.0.1
ORBIX_DAEMON_PORT=7317
# ORBIX_TOKEN=
# ORBIX_SERVER_URL=
# ORBIX_MACHINE_ID=
# ORBIX_MACHINE_NAME=
ENV
  chmod 600 "$ENV_FILE"
  echo "Created $ENV_FILE with localhost-safe defaults."
fi

if [ -x "$ROOT/scripts/install-work-commands.sh" ]; then
  "$ROOT/scripts/install-work-commands.sh"
fi

cat >/etc/systemd/system/orbix-daemon.service <<SERVICE
[Unit]
Description=Orbix Machine Daemon
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
EnvironmentFile=-$ENV_FILE
ExecStart=/usr/bin/env node $ROOT/apps/daemon/daemon.js --host \\${ORBIX_DAEMON_HOST} --port \\${ORBIX_DAEMON_PORT}
Restart=always
RestartSec=3
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
SERVICE

cat >/etc/systemd/system/orbix-server.service <<SERVICE
[Unit]
Description=Orbix Public Server
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT
EnvironmentFile=-$ENV_FILE
ExecStart=/usr/bin/env node $ROOT/apps/server/server.js --host \\${ORBIX_SERVER_HOST} --port \\${ORBIX_SERVER_PORT}
Restart=always
RestartSec=3
KillSignal=SIGTERM

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
if [ "$INSTALL_ENABLE" = 1 ]; then
  systemctl enable orbix-daemon.service orbix-server.service
fi
if [ "$INSTALL_START" = 1 ]; then
  systemctl restart orbix-daemon.service orbix-server.service
fi
cat <<DONE
Installed systemd units:
  /etc/systemd/system/orbix-daemon.service
  /etc/systemd/system/orbix-server.service
Environment file:
  $ENV_FILE

Next:
  1. Edit $ENV_FILE and set ORBIX_TOKEN before public exposure.
  2. systemctl enable --now orbix-daemon orbix-server
DONE
