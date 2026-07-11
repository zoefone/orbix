# Quick Start

<Steps>

## Install ORBIX

```bash
git clone --branch rebuild/orbix-next https://github.com/zoefone/orbix.git
cd orbix
bun install
bun run build:single-exe
sudo install -m 755 cli/dist-exe/*/orbix /usr/local/bin/orbix
```

The reconstructed CLI is currently installed from source; no official npm or Homebrew package has been published for this rebuild.

Other install options: [Installation](./installation.md)

## Start the hub

```bash
orbix hub
```

On first run, ORBIX prints an access token and saves it to `~/.orbix/settings.json`.

`orbix server` remains supported as an alias.

For access outside the machine, expose the Hub through your own trusted HTTPS URL. HTTPS is required for phone installation and Web Push. See [Hub setup](./installation.md#hub-setup).

## Start a coding session

```bash
orbix
```

This starts Claude Code wrapped with ORBIX. The session appears in the web UI.

## Open the UI

Open the Hub URL in a browser or installed PWA.

Enter your access token to log in.

</Steps>

## Next steps

- [Seamless Handoff](./how-it-works.md#seamless-handoff) - Switch between terminal and phone seamlessly
- [Hub setup](./installation.md#hub-setup) - Access ORBIX from anywhere
- [Notifications](./installation.md#telegram-setup) - Set up Telegram notifications
- [Install the App](./pwa.md) - Add ORBIX to your home screen
