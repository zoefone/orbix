# Deployment notes

## Same LAN

On the controlled machine:

```bash
orbix-daemon --host 0.0.0.0 --port 7317
```

On the Web UI or Android app, use:

```text
http://LAN_IP:7317
```

## Public relay for machines without public IP

On the public server:

```bash
ORBIX_TOKEN='change-me' orbix-server --host 0.0.0.0 --port 7320
```

On each controlled machine:

```bash
ORBIX_TOKEN='change-me' orbix-daemon \
  --host 127.0.0.1 \
  --port 7317 \
  --server-url https://your-domain.example \
  --machine-id my-pc
```

The daemon long-polls the public server. The public server never runs Codex/Claude/Cursor itself.

## Caddy HTTPS example

```caddyfile
your-domain.example {
  reverse_proxy 127.0.0.1:7320
}
```

Then use `https://your-domain.example` in the Web/Android connection URL.

## Token behavior

Set the same `ORBIX_TOKEN` on server and daemon. The Web and Android UIs include a token field and send both:

- `Authorization: Bearer <token>`
- `x-orbix-token: <token>`

The server serves static Web assets without a token so a browser can load the UI, but all API routes remain token-protected when `ORBIX_TOKEN` is set.

## systemd

```bash
orbix install-services
sudo editor /etc/orbix.env
sudo systemctl enable --now orbix-server orbix-daemon
```

The installer also refreshes the persistent work commands because `orbix-daemon` depends on `ai-work` for tmux-backed disconnect-safe control. For a public relay-only server, disable or ignore `orbix-daemon`. For a controlled private computer, set `ORBIX_SERVER_URL` in `/etc/orbix.env` so the daemon registers to the public server.
