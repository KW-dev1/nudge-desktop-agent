# Nudge

A Windows desktop app that pops a reminder in the center of the screen for
upcoming meetings, tasks, and follow-ups. It reads from Notion and also takes
reminders added by hand. It lives in the system tray all day.

The full spec is in [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md).

## What it does

- **Meeting alerts** from the Notion Meetings database, 60 and 30 minutes
  before the start (both configurable).
- **Task and follow-up reminders** from the monthly Notion task tables. The
  current month's table is found at runtime, so nothing needs changing when a
  new month starts.
- **Manual reminders** stored on this computer. They work with no network and
  no Notion token.
- **A centered popup** with Snooze, Dismiss, Open in Notion, and Mark done. It
  stays on top without taking keyboard focus.
- **A customizable look**: background color, transparency, corner radius,
  accent color, optional blur, with a live preview.
- **Offline support**: the last Notion results are cached, so alerts keep
  firing when Notion cannot be reached.

## Getting started

Needs Node.js 22 or newer.

```bash
npm install
```

```bash
npm run dev
```

The app opens its main window and adds a tray icon. Closing the window hides
it to the tray; use **Quit** in the tray menu to exit.

### Connect Notion

1. Create an internal integration at notion.so/profile/integrations and copy
   its token.
2. In Notion, share the **Meetings** database and the **Todo List** page with
   that integration (••• menu, Connections).
3. In Nudge, open **Settings**, paste the token, and click **Save token**.
   **Test connection** shows which of the two sources the integration can read.

To let Mark done work, the integration needs the "Update content" capability.

The database and page IDs, and every property name, are in
[`src/main/notion/config.ts`](src/main/notion/config.ts). If a column is
renamed in Notion, that file is the only place to change.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run the app with hot reload |
| `npm test` | Run the unit tests (Vitest) |
| `npm run typecheck` | Type-check the main process and the renderer |
| `npm run build` | Type-check and bundle into `out/` |
| `npm run dist:win` | Build the Windows installer into `dist/` |

### Building the installer

Run `npm run dist:win` on Windows. It produces `dist/Nudge-Setup-<version>.exe`.

Building on Linux or macOS packages the app (`dist/win-unpacked`) but the last
installer step needs Wine. The **Build Windows installer** GitHub Actions
workflow does the whole build on a Windows runner instead: run it from the
Actions tab, or push a tag such as `v0.1.0`, and download the installer from
the run's artifacts.

The installer is not code-signed, so Windows SmartScreen will warn on first
run.

## How it works

```
src/
  main/            Electron main process
    scheduler/     alert rules, fired keys, snooze (pure logic, no Electron imports)
    sources/       notionMeetings, notionTasks, manual (one interface for all)
    notion/        client wrapper, month table discovery, retries
    store/         settings, token, cache, fired keys
    windows/       popup window, main window, tray
    alerts.ts      runs the scheduler every 15 seconds, owns the open alerts
    sync.ts        fetches sources, caches results, reports status
    ipc.ts         every channel the renderer may call
  preload/         the typed bridge exposed to the renderer
  renderer/        React UI (popup, main window, settings)
  shared/          types and pure helpers used by both sides
tests/             unit tests for every rule in section 5 of the spec
```

A few design points worth knowing:

- **The scheduler is pure.** `runTick(now, items, state, config)` returns what
  to show and the new state. It never reads the clock or the disk, which is
  why every alert rule has a unit test.
- **Short ticks, no long timers.** Every 15 seconds the app compares the
  current time against the plan. Sleep, restarts, and pauses are all handled
  by the same catch-up rules.
- **One item shape.** Every source returns `ReminderItem`. The scheduler and
  popup never see raw Notion data. The phase 2 agent Alerts table is one more
  source in the list in `src/main/index.ts`.
- **The token stays in the main process.** It is encrypted with Electron
  `safeStorage` (Windows DPAPI) before it is written, it is never sent to the
  renderer, and the log masks anything that looks like a token. If the OS
  cannot encrypt, the app refuses to save it.

### Where data lives

Everything is under the app data folder (`%APPDATA%\Nudge` on Windows):

| File | Contents |
|---|---|
| `settings.json` | Settings and appearance |
| `secrets.json` | The encrypted Notion token |
| `reminders.json` | Manual reminders |
| `scheduler.json` | Fired alert keys, pending snoozes, tray pause |
| `cache.json` | Last Notion results and the monthly table IDs |
| `logs/nudge.log` | Rotating log (titles only, no page content) |

## Notion API version

The app uses `@notionhq/client` 5.x, which sends `Notion-Version: 2025-09-03`.
In that version rows are queried through data sources rather than databases,
which is why the code works with data source IDs and resolves them for each
monthly table.

## Known limits

- **Esc** dismisses the alert once the popup has keyboard focus (after a
  click on it). The popup does not take focus when it opens, by design.
- **Blur** uses the Windows 11 acrylic backdrop (22H2 or newer). The system
  draws the window corners in that mode, so the corner radius setting does not
  apply while blur is on. It is off by default.
- **Start with Windows** only registers in an installed build, not in
  `npm run dev`.
