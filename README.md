# Orbix

Orbix is a self-hosted remote control for **Codex, Claude Code, and Cursor Agent**. Run the official CLI on your own computer or server, then monitor and control it from a phone or browser through a responsive PWA.

The new implementation in this repository is independent from every earlier local Orbix prototype. It is rebuilt on an audited AGPL foundation and keeps the complete source available.

## Features

- **Seamless Handoff** - Work locally, switch to remote when needed, switch back anytime. No context loss, no session restart.
- **One app, three CLIs** - Codex app-server, Claude Code, and Cursor Agent share one task-oriented interface.
- **Native First** - Orbix wraps the official agent instead of replacing it. Same credentials, configuration, tools, and session history.
- **AFK Without Stopping** - Step away from your desk? Approve AI requests from your phone with one tap.
- **Realtime control** - Stream messages, reasoning, tool calls, diffs, terminal output, status, and token usage.
- **Approvals and questions** - Respond to permission requests and structured multiple-choice questions remotely.
- **Files and media** - Upload images/files, share into the installed PWA, browse scoped workspaces, and preview generated media.
- **Phone notifications** - Web Push alerts for approvals, questions, failures, and completed work.
- **Themes** - Light, dark, OLED, and follow-system modes using a monochrome design system.
- **Secure connection** - Direct self-hosting, private tunnels, or WireGuard + TLS relay; access-token namespaces isolate users.
- **Terminal Anywhere** - Run commands from your phone or browser, directly connected to the working machine.
- **Voice Control** - Talk to your AI agent hands-free using the built-in voice assistant.
- **Workspace Browser** - Opt-in via one or more `orbix runner start --workspace-root <path>` flags: browse scoped file trees from the web and start sessions in allowed subdirectories.

## Getting Started

```bash
bun install
bun run build
bun run --cwd cli dev hub      # start the Hub / Web app
bun run --cwd cli dev          # launch Claude Code through Orbix
```

Use `orbix codex`, `orbix cursor`, or the New Session page to select another provider.

Open the Hub URL from your browser. For phone installation and Web Push, publish it through a trusted HTTPS endpoint such as a named Cloudflare Tunnel, Tailscale Serve, your VPN, or an HTTPS reverse proxy.

`orbix hub --relay` is also available when you operate a compatible custom WireGuard/TLS relay; it is not required for normal self-hosting.

For self-hosted options (Cloudflare Tunnel, Tailscale), see [Installation](docs/guide/installation.md)

## Docs

- [App](docs/guide/pwa.md)
- [How it Works](docs/guide/how-it-works.md)
- [Cursor Agent](docs/guide/cursor.md)
- [Voice Assistant](docs/guide/voice-assistant.md)
- [Why ORBIX](docs/guide/why-orbix.md)
- [FAQ](docs/guide/faq.md)

## Build from source

```bash
bun install
bun run build:single-exe
```

## License and attribution

Orbix is licensed under GNU AGPL-3.0-only. This rebuild is based on the AGPL-licensed HAPI codebase; its architecture was compared with Happy and Paseo. See [NOTICE](NOTICE) and `references/` for attribution and the exact audited upstream snapshots.
