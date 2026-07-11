# Orbix

**Orbix is a self-hosted remote control for Codex, Claude Code, and Cursor Agent.** Run the official CLI on your computer or server, then monitor and control it from an installable phone PWA or any modern browser.

<p align="center">
  <img src="web/public/icon.svg" width="88" height="88" alt="Orbix logo">
</p>

## Highlights

- **One control plane, three CLIs** — Codex app-server, Claude Code SDK/stream, and Cursor ACP.
- **Realtime remote control** — messages, reasoning, tools, commands, diffs, terminal output, status, token usage, stop/resume and local/remote handoff.
- **Approvals and questions** — approve or deny permission requests and answer structured choices from a phone.
- **Remote session creation** — connect multiple machines through Runner and restrict each machine to explicit workspace roots.
- **Files and media** — upload images/files, use Android's Share Target, browse workspaces and inspect generated media.
- **Phone notifications** — persistent working status plus completion, failure, approval, question and ready-for-input alerts.
- **Notification self-test** — Settings can send a real Web Push delivery test to the installed device.
- **Responsive PWA** — mobile/desktop layouts, safe-area support, Service Worker updates and home-screen installation.
- **Monochrome UI** — rounded black/white/gray design with light, dark, OLED and follow-system modes.
- **Self-hosted security** — token namespaces, trusted HTTPS, scoped workspaces and no vendor cloud requirement.

## Architecture

```text
Phone / browser / installed PWA
             │ HTTPS · REST · SSE · WebSocket
             ▼
       ┌─────────────┐
       │  Orbix Hub  │  SQLite, auth, sync, Web Push
       └──────┬──────┘
              │ authenticated Socket.IO / RPC
       ┌──────▼──────┐
       │ Orbix Runner│  one or more controlled machines
       └──────┬──────┘
              │
      ┌───────┼──────────┐
      ▼       ▼          ▼
   Codex   Claude Code  Cursor Agent
```

The Hub and Runner may run on the same host or on different machines. The browser only connects to the Hub; agent credentials and workspaces remain on the Runner machine.

## Requirements

- Linux, macOS, or Windows host for the CLI/Runner
- [Bun](https://bun.sh/) 1.3.14 or compatible
- At least one provider installed and authenticated:
  - `codex --version`
  - `claude --version`
  - `agent --version` for Cursor Agent
- A trusted HTTPS URL for phone installation and Web Push

> The reconstructed CLI is currently distributed from this repository. An official `@orbix/cli` npm package or Homebrew tap has not been published for this rebuild.

## Quick start from source

```bash
git clone --branch rebuild/orbix-next https://github.com/zoefone/orbix.git
cd orbix
bun install
```

### 1. Start the Hub

```bash
export ORBIX_HOME="$HOME/.orbix"
export ORBIX_LISTEN_HOST=127.0.0.1
export ORBIX_LISTEN_PORT=3406
bun cli/src/index.ts hub
```

On first launch Orbix generates an access token and stores it in `$ORBIX_HOME/settings.json`. Keep this file private.

### 2. Start Runner

```bash
export ORBIX_HOME="$HOME/.orbix"
export ORBIX_API_URL=http://127.0.0.1:3406
bun cli/src/index.ts runner start-sync \
  --workspace-root "$HOME/projects" \
  --workspace-root /srv/work
```

Only the configured workspace roots and their descendants can be browsed or used to start remote sessions.

### 3. Open Orbix

Open the Hub URL, enter the access token, and create a session. You can choose Codex, Claude Code, or Cursor Agent from the same New Session screen.

Useful direct CLI modes:

```bash
bun cli/src/index.ts codex
bun cli/src/index.ts                 # Claude Code
bun cli/src/index.ts cursor
bun cli/src/index.ts resume <session-id>
```

Provider flags are forwarded to the official CLI where supported. Run `bun cli/src/index.ts --help` for the complete command list.

## Production HTTPS deployment

The Hub should listen on loopback and be exposed through a trusted HTTPS reverse proxy, VPN, Tailscale Serve, or named Cloudflare Tunnel.

```bash
ORBIX_LISTEN_HOST=127.0.0.1 \
ORBIX_LISTEN_PORT=3406 \
ORBIX_PUBLIC_URL=https://orbix.example.com \
bun cli/src/index.ts hub
```

An Nginx template is provided at [`deploy/nginx/orbix.conf.example`](deploy/nginx/orbix.conf.example). It includes:

- HTTP → HTTPS redirect
- WebSocket upgrade forwarding
- disabled buffering for SSE
- long-running agent timeouts
- 68 MiB upload support
- HSTS and basic browser security headers

After configuring DNS and Nginx, issue a certificate with your preferred ACME client. With Certbot webroot mode:

```bash
sudo certbot certonly --webroot \
  -w /var/www/orbix-acme \
  -d orbix.example.com
```

Configure a renewal deploy hook to run `nginx -t && systemctl reload nginx`.

See the complete [Installation Guide](docs/guide/installation.md) for Tailscale, Cloudflare Tunnel, systemd, launchd, PM2, Telegram and custom relay setups.

## Install on a phone

### Android

1. Open the trusted HTTPS Orbix URL in Chrome or Edge.
2. Choose **Install Orbix** or **Add to Home screen**.
3. Launch Orbix from the home-screen icon.
4. Open **Settings → Notifications**, tap **Enable**, then **Send test**.

Orbix also registers as a Web Share Target, allowing images and files to be shared from Android into a session.

### iPhone and iPad

1. Open Orbix in Safari.
2. Tap **Share → Add to Home Screen → Add**.
3. Open the installed Orbix app.
4. On iOS/iPadOS 16.4 or later, enable and test notifications in Settings.

## Main pages

- **Sessions** — machines, workspaces, active/completed tasks, search and task status.
- **Conversation** — realtime timeline, reasoning, tools, commands, approval cards and composer.
- **Files** — workspace tree, git changes and file previews.
- **Terminal** — interactive terminal connected to the selected Runner.
- **Settings** — Hub switching, notifications, themes, chat behavior, voice and diagnostics.

## Notifications

Orbix sends distinct Web Push events for:

| Event | Behavior |
| --- | --- |
| Session working | Persistent, silent status notification with a replaceable session tag |
| Completed / failed | Replaces working status and alerts normally |
| Permission request | Opens the relevant conversation/approval card |
| Question / ready for input | Alerts when user input is required |
| Test notification | Verifies the complete browser → Hub → push service → device path |

Notification permission is only requested after a user action. Authenticated session and machine API responses are never persisted in shared Service Worker Cache Storage.

## Configuration

Common environment variables:

| Variable | Purpose |
| --- | --- |
| `ORBIX_HOME` | State, database and settings directory |
| `ORBIX_API_URL` | Hub URL used by CLI/Runner |
| `CLI_API_TOKEN` | Explicit shared access token; generated when omitted |
| `ORBIX_LISTEN_HOST` | Hub bind host; use `127.0.0.1` behind a proxy |
| `ORBIX_LISTEN_PORT` | Hub HTTP port |
| `ORBIX_PUBLIC_URL` | Trusted external HTTPS URL |
| `CORS_ORIGINS` | Additional allowed browser origins |
| `ORBIX_EXTRA_HEADERS_JSON` | Extra CLI/Runner headers for protected tunnels |
| `VAPID_SUBJECT` | Web Push contact URL or `mailto:` address |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram integration |
| `SERVERCHAN_SENDKEY` | Optional ServerChan notifications |

Tokens can include a namespace suffix to isolate users. See [Installation](docs/guide/installation.md) and [FAQ](docs/guide/faq.md).

## Build and test

On a normal development machine:

```bash
bun run typecheck
bun run test
bun run build:web
bun run build:site
bun run build:single-exe
```

The repository CI performs package typechecks, Shared/Hub/CLI/Web tests, public-link audits, the production PWA build, website build and VitePress documentation build. Production artifacts are uploaded as `orbix-web`.

For small-memory hosts, avoid local full builds. This deployment includes `scripts/limited-run.sh` and `scripts/limited-build.sh`; the latter intentionally redirects normal production builds to GitHub Actions.

## Security notes

- Keep `settings.json`, access tokens, VAPID private keys and JWT secrets out of Git.
- Expose the Hub through trusted HTTPS; Service Workers and Web Push do not work correctly on insecure remote origins.
- Bind the Hub to loopback when using a reverse proxy.
- Give Runner only the workspace roots you intend to expose.
- Treat terminal and bypass-permission modes as full access to the selected machine/workspace.
- Orbix removes expired Web Push subscriptions and rate-limits notification self-tests.

See [SECURITY.md](SECURITY.md) for vulnerability reporting.

## Provider status

- **Codex:** native app-server integration; real end-to-end response verified.
- **Cursor Agent:** ACP integration; real end-to-end response and process-tree shutdown verified.
- **Claude Code:** SDK/stream transport verified. The Runner host must be logged in with `claude /login`; account rate limits remain provider-side.

Detailed evidence is maintained in [`docs/acceptance.md`](docs/acceptance.md).

## Design system

Orbix follows the Open Design artifact in the `orbix-remote-control` project and the UI/UX Pro Max guidance persisted under `design-system/orbix-next/`. The product uses 44px minimum mobile targets, safe-area padding, visible focus states, reduced-motion-safe transitions and one consistent outline icon language.

## License and attribution

Orbix is licensed under **GNU AGPL-3.0-only**. This rebuild is based on an audited AGPL HAPI foundation and retains the required source, license and attribution notices. Happy and Paseo were reviewed for architecture and interaction patterns.

See [NOTICE](NOTICE) and [`docs/upstream-references.md`](docs/upstream-references.md) for exact upstream commits and attribution.
