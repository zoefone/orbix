# Installation

Install the ORBIX CLI and set up the hub.

## Prerequisites

- Claude Code, OpenAI Codex CLI, Cursor Agent CLI, Google Gemini CLI, or OpenCode CLI installed

Verify your CLI is installed:

```bash
# For Claude Code
claude --version

# For OpenAI Codex CLI
codex --version

# For Cursor Agent CLI
agent --version

# For Google Gemini CLI
gemini --version

# For OpenCode CLI
opencode --version
```

## Architecture

ORBIX has three components:

| Component | Role | Required |
|-----------|------|----------|
| **CLI** | Wraps AI agents (Claude/Codex/Cursor/Gemini/OpenCode), runs sessions | Yes |
| **Hub** | Central coordinator: persistence, real-time sync, remote access | Yes |
| **Runner** | Background service for remote session spawning | Optional |

### How they work together

```
┌─────────────────────────────────────────────────────┐
│              Your Machine                           │
│                                                     │
│  ┌─────────┐    Socket.IO    ┌─────────────┐       │
│  │  CLI    │◄───────────────►│    Hub      │       │
│  │+ Agent  │                 │  + SQLite   │       │
│  └─────────┘                 └──────┬──────┘       │
│       ▲                             │ SSE          │
│       │ spawn                       ▼              │
│  ┌────┴────┐                 ┌─────────────┐       │
│  │ Runner  │◄────RPC────────►│   Web App   │       │
│  │(背景)   │                 └─────────────┘       │
│  └─────────┘                                       │
└─────────────────────────────────────────────────────┘
                    │
           [Tunnel / Public URL]
                    │
              ┌─────▼─────┐
              │ Phone/Web │
              └───────────┘
```

- **CLI**: Start a session with `orbix`. The CLI wraps your AI agent and syncs with the hub.
- **Hub**: Run `orbix hub`. Stores sessions, handles permissions, enables remote access.
- **Runner**: Run `orbix runner start`. Lets you spawn sessions from phone/web without keeping a terminal open.

### Typical workflows

**Local only**: `orbix hub` → `orbix` → work in terminal

**Remote access**: expose `orbix hub` through your own HTTPS URL (named Cloudflare Tunnel, Tailscale Serve, reverse proxy, or VPN) → `orbix runner start` → control from phone/web.

## Install the CLI

```bash
git clone --branch rebuild/orbix-next https://github.com/zoefone/orbix.git
cd orbix
bun install
bun run build:single-exe

# Output: cli/dist-exe/<bun-target>/orbix
sudo install -m 755 cli/dist-exe/*/orbix /usr/local/bin/orbix
orbix --help
```

The reconstructed CLI is currently distributed from this repository. Do not install `@orbix/cli` from npm or an unrelated Homebrew tap; no official package has been published there for this rebuild yet.

## Hub setup

The hub can be deployed on:

- **Local desktop** (default) - Run on your development machine
- **Remote host** - Deploy the hub on a VPS, cloud host, or any machine with network access

### Recommended: Your own HTTPS endpoint

Run the Hub locally, then publish it through a trusted HTTPS endpoint. HTTPS is required for installable PWA features and Web Push notifications on phones.

```bash
ORBIX_LISTEN_HOST=127.0.0.1 orbix hub
```

Use a named Cloudflare Tunnel, Tailscale Serve, a VPN, or an HTTPS reverse proxy as described under [Self-hosted tunnels](#self-hosted-tunnels). Set `ORBIX_PUBLIC_URL` to that HTTPS URL so links and notifications point to the correct address.

For Nginx, start from [`deploy/nginx/orbix.conf.example`](https://github.com/zoefone/orbix/blob/rebuild/orbix-next/deploy/nginx/orbix.conf.example). The example preserves WebSocket upgrades, disables proxy buffering for SSE, permits Orbix uploads, redirects HTTP to HTTPS, and includes mobile-PWA security headers. When using Certbot `certonly --webroot`, add a deploy hook that validates and reloads Nginx after renewal.

`orbix server` remains supported as an alias.

### Optional custom WireGuard relay

`orbix hub --relay` is available for operators who run a compatible `tunwg` relay. Configure the relay endpoint and credentials explicitly:

```bash
ORBIX_RELAY_API=relay.your-domain.example \
ORBIX_RELAY_AUTH=your-relay-auth \
orbix hub --relay
```

Set `ORBIX_RELAY_FORCE_TCP=true` when UDP is unavailable. Orbix does not require or silently depend on a vendor-hosted relay.

### Local Only

```bash
orbix hub
# or
orbix hub --no-relay
```

The hub listens on `http://localhost:3006` by default.

On first run, ORBIX:

1. Creates `~/.orbix/`
2. Generates a secure access token
3. Prints the token and saves it to `~/.orbix/settings.json`

<details>
<summary>Config files</summary>

```
~/.orbix/
├── settings.json      # Main configuration
├── orbix.db           # SQLite database (hub)
├── runner.state.json  # Runner process state
└── logs/             # Log files
```
</details>

<details>
<summary>Environment variables</summary>

| Variable | Default | settings.json | Description |
|----------|---------|---------------|-------------|
| `CLI_API_TOKEN` | Auto-generated | `cliApiToken` | Shared secret for authentication |
| `ORBIX_API_URL` | `http://localhost:3006` | `apiUrl` | Hub URL for CLI connections |
| `ORBIX_EXTRA_HEADERS_JSON` | - | - | JSON object of extra outbound headers for CLI → hub HTTP/WebSocket requests |
| `ORBIX_LISTEN_HOST` | `127.0.0.1` | `listenHost` | Hub HTTP bind address |
| `ORBIX_LISTEN_PORT` | `3006` | `listenPort` | Hub HTTP port |
| `ORBIX_PUBLIC_URL` | - | `publicUrl` | Public URL for external access |
| `CORS_ORIGINS` | - | `corsOrigins` | Allowed CORS origins (comma-separated) |
| `TELEGRAM_BOT_TOKEN` | - | `telegramBotToken` | Telegram Bot API token |
| `TELEGRAM_NOTIFICATION` | `true` | `telegramNotification` | Enable Telegram notifications |
| `ORBIX_RELAY_API` | - | - | Custom `tunwg` relay API domain used with `--relay` |
| `ORBIX_RELAY_AUTH` | - | - | Authentication key for the custom relay |
| `ORBIX_RELAY_FORCE_TCP` | `false` | - | Force TCP mode for custom relay |
| `VAPID_SUBJECT` | Repository URL | - | Web Push contact URL or `mailto:` address |
| `ORBIX_HOME` | `~/.orbix` | - | Config directory path |
| `DB_PATH` | `~/.orbix/orbix.db` | - | Database file path |
| `ELEVENLABS_API_KEY` | - | - | ElevenLabs API key for voice |
| `ELEVENLABS_AGENT_ID` | Auto-created | - | Custom ElevenLabs agent ID |
</details>

<details>
<summary>settings.json example</summary>

Configuration priority: **ENV > settings.json > default**

When ENV values are set and not present in settings.json, they are automatically saved.

```json
{
  "listenHost": "0.0.0.0",
  "listenPort": 3006,
  "publicUrl": "https://your-domain.com"
}
```

Schema source: [`docs/public/schemas/settings.schema.json`](../public/schemas/settings.schema.json)
</details>

## CLI setup

If the hub is not on localhost, set these before running `orbix`:

```bash
export ORBIX_API_URL="http://your-hub:3006"
export CLI_API_TOKEN="your-token-here"
export ORBIX_EXTRA_HEADERS_JSON='{"Cookie":"CF_Authorization=..."}'
```

Or use interactive login:

```bash
orbix auth login
```

Authentication commands:

```bash
orbix auth status
orbix auth login
orbix auth logout
```

Each machine gets a unique ID stored in `~/.orbix/settings.json`. This allows:

- Multiple machines to connect to one hub
- Remote session spawning on specific machines
- Machine health monitoring

## Operations

### Self-hosted tunnels

If you prefer not to use the public relay (e.g., for lower latency or self-managed infrastructure), you can use these alternatives:

<details>
<summary>Cloudflare Tunnel</summary>

https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/

> **Note:** Cloudflare Quick Tunnels (TryCloudflare) are not supported because they [do not support SSE](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/), which ORBIX uses for real-time updates. Use a Named Tunnel instead.

**Named tunnel setup:**

```bash
# Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Create and configure a named tunnel
cloudflared tunnel create orbix
cloudflared tunnel route dns orbix orbix.yourdomain.com

# Run the tunnel
cloudflared tunnel --protocol http2 run orbix
```

> **Tip:** Use `--protocol http2` instead of QUIC (the default) to avoid potential timeout issues with long-lived connections.

</details>

<details>
<summary>Tailscale</summary>

https://tailscale.com/download

```bash
sudo tailscale up
orbix hub
```

Access via your Tailscale IP:

```
http://100.x.x.x:3006
```
</details>

<details>
<summary>Public IP / Reverse Proxy</summary>

If the hub has a public IP, access directly via `http://your-hub-ip:3006`.

Use HTTPS (via Nginx, Caddy, etc.) for production.

**Self-signed certificates (HTTPS)**

If `ORBIX_API_URL` is set to an `https://...` URL with a self-signed (or otherwise untrusted) certificate, the CLI may fail with:

```
Error: self signed certificate
```

Recommended fixes (in order):

1. Use a publicly trusted certificate (e.g., Let's Encrypt)
2. Trust your private CA (recommended for private networks)
3. Dev-only workaround: disable TLS verification (insecure)

```bash
# Preferred: trust your own CA
export NODE_EXTRA_CA_CERTS="/path/to/your-ca.pem"

# Dev-only workaround: disable TLS verification (INSECURE)
export NODE_TLS_REJECT_UNAUTHORIZED=0
```

If you use the dev-only workaround, assume MITM risk; do not use on public networks.

</details>

### Telegram setup

Enable Telegram notifications and Mini App access:

1. Message [@BotFather](https://t.me/BotFather) and create a bot
2. Set the bot token and public URL
3. Start the hub and bind your account

```bash
export TELEGRAM_BOT_TOKEN="your-bot-token"
export ORBIX_PUBLIC_URL="https://your-public-url"

orbix hub
```

Then message your bot with `/start`, open the app, and enter your `CLI_API_TOKEN`.

**Troubleshooting:**

- If binding fails, verify `ORBIX_PUBLIC_URL` is accessible from the internet
- Telegram Mini App requires HTTPS (not HTTP)

### Runner setup

Run a background service for remote session spawning:

```bash
orbix runner start
orbix runner status
orbix runner logs
orbix runner stop
```

With the runner running:

- Your machine appears in the "Machines" list
- You can spawn sessions remotely from the web app
- Sessions persist even when the terminal is closed

<details>
<summary>Alternative: pm2</summary>

If you prefer pm2 for process management:

```bash
pm2 start "orbix runner start-sync" --name orbix-runner
pm2 save
```
</details>

### Background service deployment

Keep ORBIX running persistently so it survives terminal closes, system restarts, and continues running in the background.

<details>
<summary>Quick: nohup</summary>

Simple one-liner for quick background runs:

```bash
# Hub
nohup orbix hub --relay > ~/.orbix/logs/hub.log 2>&1 &

# Runner
nohup orbix runner start-sync > ~/.orbix/logs/runner.log 2>&1 &
```

View logs:

```bash
tail -f ~/.orbix/logs/hub.log
tail -f ~/.orbix/logs/runner.log
```

Stop processes:

```bash
pkill -f "orbix hub"
pkill -f "orbix runner"
```
</details>

<details>
<summary>pm2 (recommended for Node.js users)</summary>

pm2 provides process management with auto-restart on crashes and system reboot.

```bash
# Install pm2
npm install -g pm2

# Start hub and runner
pm2 start "orbix hub --relay" --name orbix-hub
pm2 start "orbix runner start-sync" --name orbix-runner

# View status and logs
pm2 status
pm2 logs orbix-hub
pm2 logs orbix-runner

# Auto-restart on system reboot
pm2 startup    # Follow the printed instructions
pm2 save       # Save current process list
```
</details>

<details>
<summary>macOS: launchd</summary>

Create plist files for automatic startup on macOS.

**Hub** (`~/Library/LaunchAgents/com.orbix.hub.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.orbix.hub</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/orbix</string>
        <string>hub</string>
        <string>--relay</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.orbix/logs/hub.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.orbix/logs/hub.log</string>
</dict>
</plist>
```

**Runner** (`~/Library/LaunchAgents/com.orbix.runner.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.orbix.runner</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/orbix</string>
        <string>runner</string>
        <string>start-sync</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/YOUR_USERNAME/.orbix/logs/runner.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/YOUR_USERNAME/.orbix/logs/runner.log</string>
</dict>
</plist>
```

Load/unload services:

```bash
# Load (start)
launchctl load ~/Library/LaunchAgents/com.orbix.hub.plist
launchctl load ~/Library/LaunchAgents/com.orbix.runner.plist

# Unload (stop)
launchctl unload ~/Library/LaunchAgents/com.orbix.hub.plist
launchctl unload ~/Library/LaunchAgents/com.orbix.runner.plist
```

> **macOS sleep note:** macOS may suspend background processes when the display sleeps. Use `caffeinate` to prevent this:
> ```bash
> caffeinate -dimsu orbix hub --relay
> ```
> Or run `caffeinate -dimsu` in a separate terminal while ORBIX is running.
</details>

<details>
<summary>Linux: systemd</summary>

Create user-level systemd services for automatic startup.

**Hub** (`~/.config/systemd/user/orbix-hub.service`):

```ini
[Unit]
Description=ORBIX Hub
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/orbix hub --relay
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

**Runner** (`~/.config/systemd/user/orbix-runner.service`):

```ini
[Unit]
Description=ORBIX Runner
After=network.target orbix-hub.service

[Service]
Type=simple
KillMode=process
ExecStart=/usr/local/bin/orbix runner start-sync
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

> **Why `KillMode=process`?** The runner spawns each agent session as a detached child process (`detached: true` in `cli/src/runner/run.ts`) so that sessions stay alive when the runner exits. Without `KillMode=process`, systemd's default `KillMode=control-group` sends SIGTERM to every PID in the runner's cgroup when the unit stops, defeating the detach and forcibly archiving every running session. `KillMode=process` preserves the contract: stopping or restarting the runner only signals the runner itself; agent sessions stay alive, and a fresh runner re-establishes control via the existing socket.io reconnect path. This applies to runner upgrades, manual restarts, and any reboot in which the runner unit is stopped before agents have finished.

Enable and start:

```bash
# Reload systemd
systemctl --user daemon-reload

# Enable (auto-start on login)
systemctl --user enable orbix-hub
systemctl --user enable orbix-runner

# Start now
systemctl --user start orbix-hub
systemctl --user start orbix-runner

# View status/logs
systemctl --user status orbix-hub
journalctl --user -u orbix-hub -f
```

> **Persist after logout:** To keep services running even when not logged in:
> ```bash
> loginctl enable-linger $USER
> ```
</details>

### Voice assistant setup

Enable voice control:

1. Get an API key from [elevenlabs.io](https://elevenlabs.io/app/settings/api-keys)
2. Set the environment variable:

```bash
export ELEVENLABS_API_KEY="your-api-key"
orbix hub --relay
```

See [Voice Assistant](./voice-assistant.md) for usage details.

### Security notes

- Keep tokens secret and rotate if needed
- Use HTTPS for public access
- Restrict CORS origins in production

<details>
<summary>Firewall example (ufw)</summary>

```bash
ufw allow from 192.168.1.0/24 to any port 3006
```
</details>
