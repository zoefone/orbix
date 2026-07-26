# ◍ Orbix

**Remote control for Codex · Claude Code · Cursor Agent — from your phone and browser.**

[中文文档 →](README.zh-CN.md)

Orbix runs a small server on the machine where your AI CLIs live, and gives you a mobile app (Android) and web app to start sessions, watch agents work in real time, approve their actions, upload files/screenshots — and **import your existing CLI sessions (with full history) and keep chatting with them**, from anywhere.

```
┌──────────────┐         ┌──────────────┐
│ Android app  │         │   Web app    │
└──────┬───────┘         └──────┬───────┘
       │  WS + HTTPS            │
       ▼                        ▼
┌──────────────────────────────────────┐
│  Orbix server (hub on your machine)  │
│  auth · sessions · uploads · relay   │
└───┬──────────────┬──────────────┬────┘
 codex          claude         cursor
app-server    agent-sdk         acp
```

## Features

- **One platform, three CLIs** — unified sessions for `codex`, `claude` and `cursor-agent`, each driven through its native machine protocol (never PTY scraping):
  - **Claude Code** → `@anthropic-ai/claude-agent-sdk` (stream-json control protocol, `canUseTool` permission callbacks, session resume)
  - **Codex** → `codex app-server` (JSON-RPC over stdio: thread/turn management, approval requests, delta streaming)
  - **Cursor Agent** → `agent acp` (Agent Client Protocol with permission prompts; automatic fallback to `agent -p --output-format stream-json`)
- **Sync & resume existing sessions** — Orbix discovers past sessions from `~/.claude/projects`, `~/.codex/sessions` and `~/.cursor/chats`, imports them **with their message history backfilled from the native transcripts** (user messages, replies, reasoning, tool calls), and lets you continue them.
- **Real-time timeline** — streaming text, tool calls (shell/read/edit/write/search) with outputs & diffs, reasoning blocks, plan/todo cards, context-usage display, permission requests.
- **Remote approvals** — approve / always-allow / deny from the app, web, or straight from the Android notification.
- **Capability-driven controls** — model list, thinking effort, speed, interaction mode and permission mode are fetched live from each CLI; slash commands (`/plan`, `/compact`, `/summarize`, …) with a searchable palette.
- **Android notifications** — persistent status while an agent works; high-priority alerts on completion / approval requests, with Approve/Deny buttons that work from the lock screen.
- **File & image upload** — attach photos/files in the composer; they land on the server and are referenced in the prompt (images are passed as native image input where the CLI supports it).
- **Dark / Light / System themes · English / 中文** — monochrome zinc design, rounded, no glass.
- **Connect your way** —
  - same LAN → direct connect + 6-digit pairing code (or QR)
  - public server → IP + password
  - anywhere else → built-in **relay** (self-hosted) or **cloudflared** quick tunnel.

## Repository layout

```
packages/
  shared/    protocol & domain types (zod) shared by server/web
  server/    the hub: Fastify + WS, agent adapters, persistence, uploads, tunnel client
  relay/     self-hosted NAT-traversal relay (deploy on any VPS)
  web/       React + Vite + Tailwind web client (served by the hub)
  app/       Expo / React Native Android app
mockups/     HTML design mockups (+ rendered screenshots) the UI is built from
```

## Quick start (server)

Requirements: Node ≥ 20, and the CLIs you want to control (`codex`, `claude`, `agent`/cursor-agent) installed & logged in.

```bash
git clone https://github.com/zoefone/orbix.git
cd orbix
npm install
npm run build
npm start          # = node packages/server/dist/index.js
```

On first run Orbix prints:

- the **server password** (generated once, stored hashed in `~/.orbix/config.json`; override with `ORBIX_PASSWORD`)
- a **pairing code + QR** for LAN pairing
- detected CLI versions

Web UI: `http://<machine>:8760` — log in with the password.

Useful env vars: `ORBIX_PORT`, `ORBIX_HOST`, `ORBIX_PASSWORD`, `ORBIX_HOME`, `ORBIX_CLAUDE_PATH`, `ORBIX_CODEX_PATH`, `ORBIX_CURSOR_PATH`.

## Connect from the app / web

| Situation | What to do |
|---|---|
| Phone & computer on same LAN | Server prints a pairing code/QR on start (or run `orbix pair`). App → **Pairing** tab → enter machine IP + 6-digit code. |
| Server with public IP | App → **Direct** tab → `http://IP:8760` + password. (Put nginx/Caddy TLS in front for HTTPS.) |
| Anywhere else (NAT) | Option A: `orbix tunnel --cloudflared` → use the printed `https://*.trycloudflare.com` URL. Option B: run the relay on a VPS: `node packages/relay/dist/index.js` (set `ORBIX_RELAY_KEY`), then `orbix tunnel --relay wss://your-vps:8770 --key <key>` → use the printed `/t/<slug>` URL. |

## Android app

Prebuilt APK: see the [Releases](https://github.com/zoefone/orbix/releases) page.

```bash
cd packages/app
npm install
npx expo prebuild -p android   # generate the android/ project
# debug build (needs JDK17 + Android SDK):
cd android && ./gradlew assembleDebug
# standalone release build (JS bundled, debug-signed):
./gradlew assembleRelease   # apk at app/build/outputs/apk/release/app-release.apk
```

The app keeps a foreground-service WebSocket connection and posts:

- an **ongoing status notification** while an agent is working,
- **completion** alerts,
- **approval** alerts with Approve/Deny actions that work even from the lock screen.

## How sessions & resume work

- New sessions are started through each CLI's native protocol and get their native session id recorded.
- **Imported sessions** (discovered on disk) get their timeline backfilled from the CLI's own transcript files, and resume through the same native mechanisms: Claude `--resume <session-id>`, Codex `thread/resume`, Cursor `session/load` (ACP) or `--resume <chatId>` fallback.
- Timeline events are append-only in `~/.orbix/data/timelines/*.jsonl`; streaming deltas merge into single entries.

## Permission modes

| Mode | Claude | Codex | Cursor |
|---|---|---|---|
| Ask (default) | `canUseTool` callback → approve in app | `requestApproval` → approve in app | ACP `request_permission` → approve in app |
| Auto-edit | `acceptEdits` | — | `--force` |
| Full access | `bypassPermissions`¹ | `yolo` (danger-full-access) | `run-everything` |

¹ Claude refuses `--dangerously-skip-permissions` when running as root; Orbix automatically degrades to `acceptEdits` and tells you in the timeline.

## Security notes

- Password is scrypt-hashed; tokens are HMAC-signed (180-day expiry), sent over WS `?token=` / HTTP `Authorization: Bearer`.
- Pairing codes are 6-digit, single-use, 10-minute TTL.
- The relay sees only what your TLS/plaintext traffic carries — for sensitive use, put the relay behind TLS (e.g. Caddy) or use cloudflared (always HTTPS).

## License

AGPL-3.0
