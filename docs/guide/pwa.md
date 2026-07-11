# Progressive Web App (PWA)

ORBIX's web interface is a fully-featured PWA that can be installed on your phone for a native app-like experience.

## What is PWA?

A Progressive Web App (PWA) is a web application that can be installed on your device and works like a native app:

- **Home screen icon** - Launch ORBIX like any other app
- **Full screen mode** - No browser chrome, immersive experience
- **Resilient app shell** - The installed interface can launch while connectivity recovers
- **Auto-updates** - Always get the latest version

## Installing ORBIX PWA

### Android (Chrome/Edge)

1. Open ORBIX in Chrome or Edge browser
2. Look for the **"Install ORBIX"** banner at the bottom
3. Tap **"Install"**
4. ORBIX appears on your home screen

::: tip
If you don't see the install banner, tap the three-dot menu and select **"Add to Home screen"** or **"Install app"**.
:::

### iOS (Safari)

1. Open ORBIX in Safari browser
2. Tap the **Share** button (square with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Tap **"Add"** in the top right corner

::: warning
iOS requires Safari for PWA installation. Chrome/Firefox on iOS don't support the "Add to Home Screen" feature.
:::

### Desktop (Chrome/Edge)

1. Open ORBIX in your browser
2. Click the install icon in the address bar (⊕)
3. Or use the menu: **"Install ORBIX..."**
4. ORBIX opens as a standalone window

## PWA Features

### Offline Mode

When offline, Orbix keeps the installed app shell available and shows an offline indicator. Session, machine and message APIs are intentionally **not** stored in Service Worker Cache Storage because they contain authenticated workspace data. Reconnect before reading or controlling tasks.

### Auto-Update

ORBIX checks for updates in the background and lets you choose when to reload:

- Updates are checked hourly and when you return to the tab
- When a new version is available, a persistent in-app banner appears at the top
- Tap **Reload** when you're ready to apply the update — the banner stays until you do
- Expand **"Why can't I dismiss this?"** on the banner for the rationale

ORBIX uses a user-controlled reload instead of forcing an automatic refresh, so you choose when to reload. The banner cannot be dismissed without upgrading, so you won't forget you're on an old build.

## Caching Strategy

ORBIX uses intelligent caching:

| Content | Strategy | Duration |
|---------|----------|----------|
| App shell | Cache first | Until update |
| Authenticated APIs | Network only | Never persisted by Service Worker |
| Static assets | Cache first | Forever |

## Notifications

ORBIX supports push notifications to alert you when agents need attention.

### Enable Notifications

1. Open Orbix through a trusted **HTTPS** URL
2. Open **Settings → Notifications**
3. Tap **Enable**, then approve the browser/system permission prompt
4. Tap **Send test** and confirm the notification appears after locking the phone or putting Orbix in the background

On iOS/iPadOS 16.4 or later, install Orbix to the Home Screen first, open the installed app, and then enable notifications from Settings.

### Notification Types

| Type | When Sent |
|------|-----------|
| Permission Request | Agent needs your approval |
| Ready | Agent finished and awaits input |
| Working | A CLI session is actively running |
| Completed / Failed | A task ended or encountered an error |
| Question | The agent needs a structured choice from you |

::: tip
If push notifications don't work in your region (e.g., FCM unavailable), use [Telegram integration](./installation.md#telegram-setup) instead.
:::

## Managing Your PWA

### Check Install Status

ORBIX shows different UI based on install status:

- **Not installed** - Shows install prompt
- **Installing** - Shows progress indicator
- **Installed** - No prompt shown

### Uninstalling

**Android:**
1. Long-press the ORBIX icon
2. Drag to "Uninstall" or tap the X

**iOS:**
1. Long-press the ORBIX icon
2. Tap "Remove App" → "Delete App"

**Desktop:**
1. Open ORBIX
2. Click the three-dot menu
3. Select "Uninstall ORBIX"

### Clearing Cache

If you experience issues:

1. Open ORBIX in browser (not installed version)
2. Open Developer Tools (F12)
3. Go to Application → Storage
4. Click "Clear site data"

## Best Practices

### Battery Optimization

On Android, disable battery optimization for ORBIX to ensure:
- Background sync works reliably
- Notifications arrive promptly

Settings → Apps → ORBIX → Battery → Unrestricted

### Data Usage

ORBIX uses minimal data:

- Initial load: ~500KB
- Cached after first load
- Only syncs changed data

### Multiple Devices

You can install ORBIX on multiple devices:

- All devices use the same server
- Sessions sync across devices
- Same access token works everywhere

## Troubleshooting

### Install Button Not Showing

- Ensure you're using HTTPS (required for PWA)
- Try refreshing the page
- Check if already installed

### App Not Updating

1. Close the app completely
2. Reopen and wait for update prompt
3. If stuck, clear cache and reinstall

### Offline Mode Not Working

- Ensure you've loaded the app at least once online
- Check if ServiceWorker is registered (DevTools → Application)
- Clear cache and reload

### iOS-Specific Issues

- Must use Safari for installation
- No background sync on iOS
- Limited offline capabilities

## Telegram Mini App Alternative

If PWA doesn't suit your needs, consider the Telegram Mini App:

- Works inside Telegram
- No separate installation
- Same features as PWA
- Integrated notifications

See [Installation Guide](./installation.md#telegram-setup) for Telegram setup.
