# Orbix Design System

Orbix uses a calm monochrome product surface inspired by Open Design MCP's OpenAI, Linear, and Minimal design systems plus the `ui-ux-pro-max` mobile/web accessibility checklist.

## Palette rules

- UI chrome is black, white, and gray only.
- Primary actions are ink-on-white or white-on-ink, never green.
- Diff additions use green only for `+` counts and added lines.
- Diff deletions use red only for `-` counts and deleted lines.
- Auto approval, full access, relay/direct, and other special modes use small light-blue badges.
- Light, dark, and follow-system modes are required on Web and App.

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#f7f7f5` | `#08090a` | page canvas |
| `surface` | `#ffffff` | `#111214` | cards and panels |
| `surface-soft` | `#f0f0ee` | `#17181b` | rows, composer, secondary controls |
| `text` | `#101010` | `#f3f4f4` | primary text |
| `muted` | `#858585` | `#85898f` | metadata |
| `border` | `#dededb` | `rgba(255,255,255,.08)` | hairline structure |
| `mode-blue` | `#2f7da8` | `#82c7ec` | tiny special-mode badges |
| `diff-add` | `#16803a` | `#45b66a` | diff additions only |
| `diff-del` | `#c43845` | `#ff7d86` | diff deletions/destructive only |

## Layout and components

- Split product into real pages: Workspaces, Session, New Task, Files, Terminal, Settings.
- Mobile uses an iOS-like bottom nav and rounded composer; Web uses a left rail on desktop and bottom rail on small screens.
- Touch targets are at least 44px with 8px spacing.
- Cards use 20–28px radius; pills use full radius.
- Typography uses Inter/system UI, modest weights 400/500/600, and tight tracking for page titles.
- Motion is subtle: 150–220ms hover/focus transitions; respect reduced motion.

## Interaction rules

- A session page must expose message composer, terminal output, quick keys, approvals, structured turns, jobs, and upload entry.
- Settings must contain connection, token, theme, and machine controls on a separate screen.
- Uploads must show returned target-machine paths and media/file metadata.
- Accessibility: sequential headings, visible focus, keyboard-reachable controls, mobile-safe fixed navigation.
