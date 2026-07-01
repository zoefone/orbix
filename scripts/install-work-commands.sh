#!/usr/bin/env bash
set -euo pipefail
ROOT="${ORBIX_ROOT:-/root/orbix}"
BIN_DIR="${ORBIX_BIN_DIR:-/usr/local/bin}"
mkdir -p "$BIN_DIR"
install -m 0755 "$ROOT/scripts/ai-work" "$BIN_DIR/ai-work"
install -m 0755 "$ROOT/scripts/orbix" "$BIN_DIR/orbix"
cat >"$BIN_DIR/orbix-server" <<'WRAP'
#!/usr/bin/env bash
exec orbix server "$@"
WRAP
cat >"$BIN_DIR/orbix-daemon" <<'WRAP'
#!/usr/bin/env bash
exec orbix daemon "$@"
WRAP
cat >"$BIN_DIR/codex-work" <<'WRAP'
#!/usr/bin/env bash
exec ai-work codex "$@"
WRAP
cat >"$BIN_DIR/claude-work" <<'WRAP'
#!/usr/bin/env bash
exec ai-work claude "$@"
WRAP
cat >"$BIN_DIR/cursor-work" <<'WRAP'
#!/usr/bin/env bash
exec ai-work cursor "$@"
WRAP
chmod 0755 "$BIN_DIR/orbix-server" "$BIN_DIR/orbix-daemon" "$BIN_DIR/codex-work" "$BIN_DIR/claude-work" "$BIN_DIR/cursor-work"
cat <<DONE
Installed Orbix persistent work commands into $BIN_DIR:
  ai-work
  orbix
  orbix-server -> orbix server
  orbix-daemon -> orbix daemon
  codex-work -> ai-work codex
  claude-work -> ai-work claude
  cursor-work -> ai-work cursor

These commands share fixed tmux sessions:
  codex  -> ai-codex
  claude -> ai-claude
  cursor -> ai-cursor

Remote-control commands:
  ai-work ensure PROVIDER [--cwd DIR]
  ai-work capture PROVIDER [LINES]
  ai-work send PROVIDER TEXT
  ai-work keys PROVIDER KEY...
DONE
