# Orbix Product Design System

> Source of truth reconciled with the Open Design `orbix-remote-control` project, the reference screens in `/root/images3`, live PWA screenshots, and UI/UX Pro Max mobile guidance.

## Product character

Orbix is a control plane for long-running coding agents. The interface must feel calm, precise and operational rather than promotional. It should make task state, required user action and changed files obvious without adding visual noise.

**Keywords:** monochrome, rounded, quiet, task-first, realtime, compact, trustworthy.

## Principles

1. **Content before chrome** — conversations, tool activity and approvals dominate the screen.
2. **Monochrome first** — black, white and neutral gray define structure. Color is reserved for diff and status semantics.
3. **Mobile is a control surface, not a reduced desktop** — minimum 44×44px targets, safe areas, reachable bottom actions and no hover-only behavior.
4. **State is explicit** — pair icons/color with text such as Working, Needs approval, Waiting, Completed or Failed.
5. **Progressive density** — common controls remain visible; advanced voice/theme/debug options use grouping and disclosure.
6. **Accessible by default** — browser zoom remains available, focus is visible, reduced motion is respected and async feedback uses live regions.

## Typography

- **UI/body:** `Inter`, `ui-sans-serif`, `system-ui`, `-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, sans-serif.
- **Code/paths/metrics:** `ui-monospace`, `SFMono-Regular`, `Cascadia Code`, `Roboto Mono`, monospace.
- Avoid decorative serif fonts in operational screens.
- Default body size: 16px; supporting metadata: 12–13px; never use tiny text as the only actionable target.
- Headings use weight and spacing rather than oversized display typography.

## Semantic colors

Values are represented through the existing `--app-*` variables so light, dark, OLED and user-customized themes share behavior.

| Role | Light baseline | Dark baseline | Usage |
| --- | --- | --- | --- |
| Background | `#ffffff` | `#18181a` | Main canvas |
| Surface | `#f4f4f5` | `#27282b` | Cards, composer, grouped tools |
| Primary text | `#111827` | `#f5f5f5` | Titles and body |
| Muted text | `#6b7280` | `#9ca3af` | Metadata and hints |
| Border/divider | low-alpha black | low-alpha white | Structure only |
| Primary action | near-black | near-white | Main CTA |
| Success/online | restrained green | restrained green | Online, passed, added diff |
| Warning/waiting | amber | amber | Pending, scheduled, attention |
| Error/destructive | red | red | Failed, denied, removed diff |

Never use a status color without a text label or accessible name.

## Geometry and spacing

- Base spacing unit: 4px.
- Common gaps: 8px, 12px, 16px, 24px.
- Mobile page padding: 12–16px.
- Card/surface radius: 16–24px.
- Compact controls/pills: 10–14px or fully rounded.
- Dialog radius: 20–24px.
- Minimum interactive target: **44×44px**.
- Adjacent touch targets: at least **8px** separation where layout permits.
- Borders are subtle; shadows are sparse and low contrast.

## Motion

- Standard transition: 150–200ms for color/opacity.
- Do not shift layout on hover.
- Avoid decorative parallax, bounce or continuous glow.
- Under `prefers-reduced-motion: reduce`, collapse animations and transitions to effectively instant state changes.

## Icon language

- Use one consistent outline family compatible with Lucide: 1.75–2px stroke, rounded caps/joins.
- Provider marks may use their official vector identity, normalized to the same visual box.
- No emoji as structural icons.
- Icon-only buttons require an accessible label and a 44px hit area even when the glyph is 16–20px.

## Core components

### Buttons

- Primary: solid high-contrast neutral, 44px minimum height, 12px radius.
- Secondary: neutral border/surface, same height and radius.
- Destructive: use red only when the action is destructive; confirmation remains explicit.
- Loading states keep width stable and replace the label with a clear progress verb.

### Session row

- Strong task title on line one.
- Metadata line: provider · workspace/machine · state · optional diff summary.
- Attention state must be visible through text and icon, not a dot alone.
- Group by Pinned, Today and workspace/machine when data volume warrants it.

### Conversation timeline

- User message uses a rounded neutral bubble.
- Assistant prose stays visually light and readable.
- Repetitive commands/tool calls collapse into compact summaries.
- Reasoning, diff, approvals, questions and generated media have distinct semantic cards.
- Copy/info actions retain 44px hit areas without visually dominating the message.

### Composer

- Floating rounded surface above the bottom safe area.
- Attachment, settings, terminal, stop/switch, schedule and send/voice controls remain reachable.
- Primary send/stop control is visually strongest.
- Toolbar may adapt or wrap rather than shrinking controls below 44px.
- Never hide the final message behind the composer or install banner.

### Notifications settings

- Explain HTTPS/browser requirements before asking permission.
- Permission prompt occurs only after tapping Enable.
- Subscribed state exposes **Send test** and **Disable** as separate 44px controls.
- Test result uses a polite live region and tells the user to background or lock the device.

### Dialogs and menus

- Keep destructive and cancel actions separated.
- Focus is trapped and visibly indicated.
- Close icon target is 44px.
- Menus should not extend behind phone safe areas.

## Page hierarchy

### Sessions

Header → machine/task summary → search/filter → grouped session rows → new-task affordance.

### Conversation

Session header → live timeline → compact working/attention state → floating composer.

### Settings

Language → Connection → Notifications → Display → Chat → Voice → About.

Connection and Notifications appear near the top because they determine whether remote control and alerts work at all.

## Responsive behavior

Verify at minimum:

- 390×844 mobile portrait
- 768px tablet
- 1024px compact desktop
- 1440×900 desktop

Rules:

- No horizontal page scroll.
- Mobile headers keep task title readable while actions retain 44px targets.
- Desktop uses sidebar + content, but content width remains readable.
- Safe-area top/bottom insets are applied to fixed/floating controls.
- Browser zoom to 200% remains usable.

## Privacy and security UX

- Display the active Hub origin in Settings.
- Changing Hub/account clearly explains that the saved token is removed from the device.
- Never persist authenticated session/machine payloads in shared Service Worker Cache Storage.
- Tokens are removed from the visible URL after authentication.
- Permission-bypass modes are visually explicit.

## Anti-patterns

- Decorative gradients/glassmorphism in task views.
- Green as a general brand color rather than a success semantic.
- Tiny icon buttons or metadata links used as the only action target.
- Automatic browser permission prompts.
- Hover-only controls on mobile.
- Color-only state communication.
- Forced browser zoom prevention.
- Long ungrouped settings pages without hierarchy.
- Caching authenticated task data under shared cache keys.
- Mixed emoji/custom/filled icon styles.

## Pre-release visual checklist

- [ ] Light, dark and OLED screenshots checked.
- [ ] 390px mobile has no horizontal overflow.
- [ ] Every visible mobile button is at least 44×44px.
- [ ] Safe-area and virtual-keyboard behavior checked.
- [ ] Focus indicators are visible.
- [ ] Browser zoom remains enabled.
- [ ] Reduced motion is respected.
- [ ] Notification enable/blocked/subscribed/test/error states reviewed.
- [ ] Working, approval, waiting, completed and failed sessions are distinguishable without color alone.
- [ ] Icons are consistent SVGs with accessible names.
- [ ] Authenticated API data is network-only in the Service Worker.
