# Quick Start

<Steps>

## Install ORBIX

::: code-group

```bash [npm]
npm install -g @orbix/cli --registry=https://registry.npmjs.org
```

```bash [Homebrew]
brew install tiann/tap/orbix
```

```bash [npx (one-off)]
npx @orbix/cli
```

:::

> Recommendation: use the official npm registry for global install. Some mirrors may not sync platform packages in time.

Other install options: [Installation](./installation.md)

## Start the hub

```bash
orbix hub --relay
```

On first run, ORBIX prints an access token and saves it to `~/.orbix/settings.json`.

`orbix server` remains supported as an alias.

The terminal will display a URL and QR code for remote access.

> End-to-end encrypted with WireGuard + TLS.

## Start a coding session

```bash
orbix
```

This starts Claude Code wrapped with ORBIX. The session appears in the web UI.

## Open the UI

Open the URL shown in the terminal, or scan the QR code with your phone.

Enter your access token to log in.

</Steps>

## Next steps

- [Seamless Handoff](./how-it-works.md#seamless-handoff) - Switch between terminal and phone seamlessly
- [Hub setup](./installation.md#hub-setup) - Access ORBIX from anywhere
- [Notifications](./installation.md#telegram-setup) - Set up Telegram notifications
- [Install the App](./pwa.md) - Add ORBIX to your home screen
