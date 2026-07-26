# Orbix — Agent Notes

Remote control (Android app + Web) for three local AI CLIs: **codex**, **claude**, **cursor-agent**.

## Architecture

Local-first (hapi-style). The hub (`packages/server`) runs on the machine with the CLIs and spawns/controls them via their **native machine protocols — never PTY scraping**:

| CLI | Primary protocol | Fallback | Resume | Runtime approvals |
|---|---|---|---|---|
| claude | `@anthropic-ai/claude-agent-sdk` (`canUseTool` callback) | — | `options.resume = sessionId` | `canUseTool` → allow/deny(+updatedInput) |
| codex | `codex app-server` JSON-RPC stdio | — | `thread/resume {threadId}` | `item/*/requestApproval` → `{decision: accept|acceptForSession|decline}` |
| cursor | `agent acp` (ACP JSON-RPC) | `agent -p --output-format stream-json [--resume id]` | `session/load` or `--resume <chatId>` | `session/request_permission` → select optionId; none in fallback (pre-grant via `--force`/`--mode`) |

- **Shared protocol**: `packages/shared/src/index.ts` (zod) is the single source of truth for Session/TimelineEvent/WS commands. WS = `{rid, cmd...}` RPC + unsolicited `{push: session|event|notify}` frames. HTTP = login/pair/upload/uploads/health/fs.
- **Persistence**: JSON files in `~/.orbix` (`config.json`, `data/sessions/*.json`, `data/timelines/*.jsonl`, `uploads/`). Atomic writes, no migrations, optional fields only.
- **Streaming**: manager merges `agent_message` deltas into one event id (150ms throttle) and folds consecutive `reasoning` events; clients dedupe by event id.
- **Native session discovery**: adapters scan `~/.claude/projects/**/*.jsonl` (title=first user msg), `~/.codex/sessions/**/rollout-*.jsonl` (session_meta; skip `<...>` context blocks), `~/.cursor/chats/*/*/store.db` (sql.js reads `meta['0']` hex JSON → name/model; cwd from meta.json).
- **Native id back-channel**: adapters emit `reasoning` with text `|native:<id>`; manager stores it as `session.nativeSessionId` and drops the event.

## Environment quirks (this machine)

- Node 20 lives in `.tools/node/bin` (system node is 18 — too old for some tooling). CLIs in `~/.local/bin` (`codex` 0.144.6, `claude` 2.1.215, `agent` 2026.07.16).
- Claude SDK must pass `settingSources: ['user','project','local']` or it won't read `~/.claude/settings.json` (custom API token there) → "Not logged in".
- Claude `bypassPermissions` **fails as root** (`--dangerously-skip-permissions cannot be used with root`) → adapter degrades bypass→acceptEdits under uid 0.
- codex/claude use a custom API (anyrouter) that may be overloaded — flaky content is not our bug. Cursor is logged in (model `composer-2.5`) — use it for e2e tests.
- Android toolchain in `/root/tools` (jdk17, android-sdk). App: Expo SDK 57 / RN 0.86; build with `JAVA_HOME=/root/tools/jdk17 ANDROID_HOME=/root/tools/android-sdk ./gradlew assembleRelease` from `packages/app/android`. `punycode` npm shim is required by markdown-it under Metro.
- When shelling: **never `pkill -f <pattern>` where the pattern appears in your own command line** (self-kill); kill by PID/port (`fuser <port>/tcp`).

## Commands

```bash
# dev/build
npm run build            # shared -> web -> server
npm start                # run server (serve). Also: node packages/server/dist/index.js [pair|tunnel]
npm run dev:web          # vite dev (proxies to :8760)
node packages/relay/dist/index.js   # self-hosted relay (ORBIX_RELAY_KEY/ORBIX_RELAY_PORT)

# server CLI
node packages/server/dist/index.js            # serve (prints password on first run, pairing QR)
node packages/server/dist/index.js pair       # mint a pairing code against running server
node packages/server/dist/index.js tunnel --relay ws(s)://host:8770 --key K
node packages/server/dist/index.js tunnel --cloudflared
```

## Testing

- E2E lives in `/tmp/orbix-test/` (ws-client.mjs / approval-test.mjs) — drive the WS API against the running server with the server password.
- Verify web UI by screenshotting with playwright (installed in `/tmp/pwtest`).
- Minimize test calls against the anyrouter-backed codex/claude; cursor is the reliable e2e target.

## Design language (mockups/ dir is canonical)

Zinc monochrome (bg #FAFAFA / #09090B, card #FFF / #131316, line zinc-200/800), single blue accent (#2F6FED / #5B8DEF), radius 12–26px pills, NO liquid glass. Screens: Connect, Sessions(=mockup 01), Chat(=02), New Session(=03), Settings(=04), attach sheet+notifications(=06), desktop web(=07). Web (`packages/web`) and app (`packages/app`) implement the same design tokens.
