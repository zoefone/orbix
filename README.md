# Orbix

Orbix is a self-hosted Web + Android remote-control plane for **Codex**, **Claude Code**, and **Cursor Agent**. It controls the same persistent tmux sessions used by `codex-work`, `claude-work`, and `cursor-work`, so work continues after the browser, phone, relay, or SSH session disconnects.

## Features

- **One platform, three CLIs**: Codex, Claude Code, and Cursor Agent with persistent tmux-backed control.
- **Separate Web pages**: Workspaces, Session, New Task, Files & media, Terminal, and Settings.
- **Separate App pages**: mobile Workspaces, Session, New, Files, Terminal, and Settings with bottom navigation.
- **Monochrome UI**: black/white/gray main palette; green/red only for diff; light blue only for small special-mode badges.
- **Theme modes**: light, dark, and follow-system on Web and Android.
- **Uploads**: send images/files to the controlled machine and pass returned paths to the active CLI.
- **Approvals + jobs + structured turns**: handle approvals, run CLI subcommands, and inspect structured Codex/Claude/Cursor turns.
- **Relay or direct**: direct LAN daemon control or public-server relay for machines without public IP.

## Quick start

```bash
cd /root/orbix
npm install
npm run build:web
npm run install:work-commands
orbix-server --host 0.0.0.0 --port 7320
orbix-daemon --host 0.0.0.0 --port 7317
```

Open the Web UI:

```text
http://SERVER:7320
# or, behind a reverse proxy path:
http://SERVER/orbix/
```

For same-LAN direct control, enter the target daemon URL in Settings:

```text
http://COMPUTER_LAN_IP:7317
```

For cross-network relay:

```bash
orbix-daemon \
  --host 127.0.0.1 \
  --port 7317 \
  --server-url http://PUBLIC_SERVER:7320 \
  --machine-id my-pc
```

Then choose `my-pc` in Orbix Workspaces or Settings.

## Token protection

Set the same token on the server and daemon:

```bash
export ORBIX_TOKEN='change-me-long-random-token'
```

Clients send `Authorization: Bearer <token>` and `x-orbix-token: <token>`.

## Work commands

```bash
npm run install:work-commands
# installs: orbix, orbix-server, orbix-daemon, ai-work, codex-work, claude-work, cursor-work
```

Manual control remains available:

```bash
ai-work ensure codex --cwd /root
ai-work send codex "continue the task"
ai-work capture codex 120
ai-work keys codex C-c
```

| Provider | tmux session | Human command |
|---|---:|---|
| Codex | `ai-codex` | `codex-work` |
| Claude Code | `ai-claude` | `claude-work` |
| Cursor Agent | `ai-cursor` | `cursor-work` |

## Android release APK

Android release builds are intentionally done in **GitHub Actions only**. Do not run local Gradle/Expo native Android builds on small servers.

The workflow `.github/workflows/android-release.yml` builds a signed release APK on tags matching `v*` or manual dispatch.

Required GitHub secrets:

| Secret | Meaning |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | Base64 JKS/keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias |
| `ANDROID_KEY_PASSWORD` | Key password |

Create a release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The release asset is named `orbix-v*.apk`.

## Systemd deployment

```bash
orbix install-services
sudo editor /etc/orbix.env
sudo systemctl enable --now orbix-server orbix-daemon
```

Minimal `/etc/orbix.env`:

```env
ORBIX_TOKEN=change-me
ORBIX_SERVER_HOST=0.0.0.0
ORBIX_SERVER_PORT=7320
ORBIX_DAEMON_HOST=127.0.0.1
ORBIX_DAEMON_PORT=7317
ORBIX_SERVER_URL=http://127.0.0.1:7320
ORBIX_MACHINE_ID=this-server
```

## Checks

Safe local checks, no Android native build:

```bash
npm run check:syntax
npm test
npm run check:web
npm run check:mobile
npm run smoke
```

## Docs

- `docs/architecture.md` — runtime components and APIs.
- `docs/deployment.md` — LAN, relay, token, and systemd deployment.
- `docs/work-commands.md` — tmux/session compatibility contract.
- `docs/notifications.md` — notification strategy.
- `docs/reference-analysis.md` — notes from Paseo/Happy/HAPI style references.
- `design-system/orbix/MASTER.md` — Orbix UI rules from Open Design MCP and `ui-ux-pro-max`.
