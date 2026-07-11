# FAQ

## General

### What is ORBIX?

ORBIX is a local-first, self-hosted platform for running and controlling AI coding agents (Claude Code, Codex, Gemini, OpenCode) remotely. It lets you start coding sessions on your computer and monitor/control them from your phone.

### What does ORBIX stand for?

ORBIX (哈皮) is a Chinese transliteration of "Happy", reflecting the project's goal of making AI coding assistance a happier experience by freeing you from the terminal.

### Is ORBIX free?

Yes, ORBIX is open source and free to use under the AGPL-3.0-only license.

### What AI agents does ORBIX support?

- **Claude Code** (recommended)
- **OpenAI Codex**
- **Cursor Agent**
- **Google Gemini**
- **OpenCode**

## Setup & Installation

### Do I need a hub?

ORBIX includes an embedded hub. Just run `orbix hub` on your machine - no external hub required.

`orbix server` remains supported as an alias.

### How do I access ORBIX from my phone?

For local network access:
```
http://<your-computer-ip>:3006
```

If your phone cannot connect, make sure the hub is not only listening on `127.0.0.1`. For LAN access, set `listenHost` to `0.0.0.0` in `~/.orbix/settings.json` or set `ORBIX_LISTEN_HOST=0.0.0.0`, then restart `orbix hub`.

For internet access:
- If the hub has a public IP, access it directly (use HTTPS via reverse proxy for production)
- If behind NAT, set up a tunnel (Cloudflare Tunnel, Tailscale, or ngrok)

### What's the access token for?

The `CLI_API_TOKEN` is a shared secret that authenticates:
- CLI connections to the hub
- Web app logins
- Telegram account binding

It's auto-generated on first hub start and saved to `~/.orbix/settings.json`.

### Do you support multiple accounts?

Yes. We support lightweight multi-account access via namespaces for shared team hubs. See [Namespace (Advanced)](./namespace.md).

### Can I use ORBIX without Telegram?

Yes. Telegram is optional. You can use the web app directly in any browser or install it as a PWA.

## Usage

### How do I approve permissions remotely?

1. When your AI agent requests permission (e.g., to edit a file), you'll see a notification
2. Open ORBIX on your phone
3. Navigate to the active session
4. Approve or deny the pending permission

### How do I receive notifications?

ORBIX supports two methods:

1. **PWA Push Notifications** - Enable when prompted, works even when app is closed
2. **Telegram Bot** - See [Telegram Setup](./installation.md#telegram-setup)

### Can I start sessions remotely?

Yes, with runner mode:

1. Run `orbix runner start` on your computer
2. Your machine appears in the "Machines" list in the web app
3. Tap to spawn new sessions from anywhere

### How do I see what files were changed?

In the session view, tap the "Files" tab to:
- Browse project files
- View git status
- See diffs of changed files

### Can I send messages to the AI from my phone?

Yes. Open any session and use the chat interface to send messages directly to the AI agent.

### Can I access a terminal remotely?

Yes. Open a session in the web app and tap the Terminal tab for a remote shell.

Linux and macOS hosts use Bun's POSIX PTY support. Windows hosts use Bun's ConPTY support, which requires Bun 1.3.14 or newer.

### How do I use voice control?

Set `ELEVENLABS_API_KEY`, open a session in the web app, and click the microphone button. See [Voice Assistant](./voice-assistant.md).

## Security

### Is my data safe?

Yes. ORBIX is local-first:
- All data stays on your machine
- Nothing is uploaded to external servers
- The database is stored locally in `~/.orbix/`

### How secure is the token authentication?

The auto-generated token is 256-bit (cryptographically secure). For external access, always use HTTPS via a tunnel.

### Can others access my ORBIX instance?

Only if they have your access token. For additional security:
- Use a strong, unique token
- Always use HTTPS for external access
- Consider Tailscale for private networking

## Troubleshooting

### "Connection refused" error

- Ensure hub is running: `orbix hub`
- Check firewall allows port 3006
- Verify `ORBIX_API_URL` is correct

### My phone cannot access ORBIX on the local network

If ORBIX works on your computer but not from another device on the same LAN, check the hub bind address first. By default, ORBIX listens on `127.0.0.1`, which only accepts localhost connections.

Use one of these:

```json
{
  "listenHost": "0.0.0.0"
}
```

```bash
export ORBIX_LISTEN_HOST=0.0.0.0
```

Then restart `orbix hub` and open:

```bash
http://<your-computer-ip>:3006
```

Also verify your OS firewall allows inbound connections on port `3006`.

### "Invalid token" error

- Re-run `orbix auth login`
- Check token matches in CLI and hub
- Verify `~/.orbix/settings.json` has correct `cliApiToken`

### Runner won't start

```bash
# Check status
orbix runner status

# Clear stale lock file
rm ~/.orbix/runner.state.json.lock

# Check logs
orbix runner logs
```

### Claude Code not found

Install Claude Code or set custom path:
```bash
npm install -g @anthropic-ai/claude-code
# or
export ORBIX_CLAUDE_PATH=/path/to/claude
```

### Cursor Agent not found

Install Cursor Agent CLI:
```bash
# macOS/Linux
curl https://cursor.com/install -fsS | bash

# Windows (PowerShell)
irm 'https://cursor.com/install?win32=true' | iex
```

Ensure `agent` is on your PATH.

### How do I run diagnostics?

```bash
orbix doctor
```

This checks hub connectivity, token validity, agent availability, and more.

## Comparison

### ORBIX vs Happy

| Aspect | Happy | ORBIX |
|--------|-------|------|
| Design | Cloud-first | Local-first |
| Users | Multi-user | Single user |
| Deployment | Multiple services | Single binary |
| Data | Encrypted on server | Never leaves your machine |

See [Why ORBIX](./why-orbix.md) for detailed comparison.

### ORBIX vs running Claude Code directly

| Feature | Claude Code | ORBIX + Claude Code |
|---------|-------------|-------------------|
| Remote access | No | Yes |
| Mobile control | No | Yes |
| Permission approval | Terminal only | Phone/web |
| Session persistence | No | Yes |
| Multi-machine | Manual | Built-in |

## Contributing

### How can I contribute?

Visit our [GitHub repository](https://github.com/zoefone/orbix) to:
- Report issues
- Submit pull requests
- Suggest features

### Where do I report bugs?

Open an issue on [GitHub Issues](https://github.com/zoefone/orbix/issues).
