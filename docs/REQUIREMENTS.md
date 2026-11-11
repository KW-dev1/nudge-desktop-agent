# Desktop Reminder App: Requirements

## 1. Overview

A Windows desktop app that shows a popup in the center of the screen for upcoming meetings, tasks, and follow-ups. It reads from Notion and also takes reminders added by hand in the app. A later phase lets a Claude agent send alerts through a Notion table.

Single user, personal tool. It runs in the system tray all day.

## 2. Tech stack

- Electron + TypeScript
- React + Vite for the renderer
- Tailwind CSS for styling
- @notionhq/client for Notion
- electron-store for settings and local data
- Electron safeStorage for the Notion token
- electron-builder for the Windows installer (.exe)
- Vitest for unit tests

Target: Windows 10 and 11. Keep the code free of Windows-only calls where possible so a macOS build stays an option.

## 3. Scope

In scope for v1:
- Meeting alerts from the Notion Meetings database
- Task and follow-up reminders from the Notion monthly task tables
- Manual reminders stored locally
- Centered popup with snooze, dismiss, open in Notion, and mark done
- Customizable look (color, transparency, corner radius)
- Tray icon, start with Windows, settings window

Out of scope for v1:
- Google Calendar events
- Editing Notion content other than marking a task Done
- Mobile or multi-user support
- Agent alerts (phase 2, see section 12)

## 4. Data sources

### 4.1 Notion Meetings database

- Database ID: 37abbf26d2a7424db8368472a9e4f629
- Data source ID: 2e84d4ad-4662-46b8-989c-827ff3bd6736

| Property | Type | Values |
|---|---|---|
| Meeting | title | |
| Date | date | date or date with time |
| Client | select | AJ, Ana, John, Kenneth, Ilico, Xiong, Thomas, Paul, Keith, Frank, Josh |
| With | text | |
| Type | select | Discovery call, Interview, Client check-in, Follow-up, Internal |
| Status | select | Prep, Done, Follow-up needed |

### 4.2 Notion Todo List (monthly task tables)

- Todo List page ID: 407676ec4d5b81a7977cc379d80a83bd
- The page has one child page per month, titled YYYY-MM (for example 2026-11).
- Each month page holds one inline database titled "Tasks – YYYY-MM".
- Example for 2026-11: database ID dc36d96d04c14f70aee4edb6c65f1328, data source ID 4ad4288e-145f-4d68-a918-5f7bac232268.

| Property | Type | Values |
|---|---|---|
| Task | title | |
| Due | date | date or date with time |
| Client | select | varies by month |
| Priority | select | High, Medium, Low |
| Status | status | To Do, In Progress, Done |
| Notes | text | |
| Week | select | for example "Week 2 (11-09 - 11-15)" |

Do not hard-code the monthly database ID. Find it at runtime:
1. List the child blocks of the Todo List page.
2. Find the child page titled with the current month (YYYY-MM). Also check next month so tasks due right after month end are picked up.
3. List that page's child blocks and take the child database.
4. Cache the IDs and refresh them once a day and when the month changes.
5. If a month page does not exist yet, skip it without an error.

### 4.3 Manual reminders

Stored locally. Fields: id, title, kind (meeting, task, follow-up), date, time (optional), note, done flag, created time.

### 4.4 Notion API notes

- Use an internal integration token that the user pastes into Settings. The user shares the Meetings database and the Todo List page with the integration.
- Check the current Notion API version in the official docs before coding. Newer versions query through data sources instead of databases, so both IDs are listed above.
- Rate limit is about 3 requests per second. Handle 429 with retry and backoff.
- Read property names from config constants in one file, so a renamed column is a one-line fix.

## 5. Alert rules

All times are shown in the computer's local time zone. Notion datetimes come with an offset and must be converted.

### 5.1 Meetings (Notion and manual)

- Fire one alert at each lead time before the start. Default lead times: 60 and 30 minutes.
- Skip meetings whose Status is Done.
- A meeting with a date but no time gets one alert at the morning time (default 9:00 AM) on that day.
- Headline format: "Meeting in 30 minutes", "Meeting in 1 hour", "Meeting today".

### 5.2 Tasks and follow-ups (Notion and manual)

- Due with a time: fire at that time.
- Due with a date only: fire at the morning time on that day.
- Skip items whose Status is Done or whose done flag is set.
- A Notion meeting with Status "Follow-up needed" gets one follow-up reminder at the morning time on the day after the meeting date.

### 5.3 Missed and repeated alerts

- Each alert has a stable key: source + item ID + alert kind + scheduled time. Store fired keys locally so a restart never repeats an alert.
- If an alert time passed while the app was closed and the event has not started yet, fire it right away and compute the headline from the real time left (for example "Meeting in 42 minutes").
- If several lead alerts for the same meeting are due at once, show only one popup.
- A task that came due while the app was closed fires once on launch if it is less than 24 hours overdue. Older ones are marked as fired without a popup.
- If an item's time changes in Notion, the new time produces a new key, so the alert fires again for the new time.
- Clean up fired keys older than 30 days.

### 5.4 Snooze

- Snooze re-fires the same alert after the snooze length (default 10 minutes).
- Snoozed alerts survive a restart.
- A snoozed meeting alert is dropped once the meeting start time has passed by 15 minutes.

## 6. Popup

### 6.1 Behavior

- Opens in the center of the screen that currently has the mouse cursor.
- Always on top, frameless, not shown in the taskbar.
- Does not steal keyboard focus from the app the user is typing in.
- Plays a short sound when it opens (can be turned off).
- Fade and slight scale-in animation on open (about 180 ms), fade-out on close.
- Stays open until the user acts. No auto-dismiss by default; an optional auto-dismiss time lives in Settings.
- When more than one alert is due at the same time, show them in one popup as a stack with a counter ("1 of 3") and next and previous controls.
- Esc dismisses the current alert.

### 6.2 Content

- Kind label and icon (meeting, task, follow-up)
- Headline ("Meeting in 30 minutes")
- Title
- Date and time
- Client, With, Type for meetings
- Priority and Notes for tasks
- Note for manual reminders

Hide any field that is empty.

### 6.3 Actions

- Open in Notion: opens the page URL in the default browser. Hidden for manual reminders.
- Snooze: default 10 minutes, with a small menu for 5, 10, 30, and 60 minutes.
- Mark done: for Notion tasks, sets Status to Done through the API. For manual reminders, sets the done flag. Hidden for Notion meetings.
- Dismiss: closes the alert and marks it as fired.

If Mark done fails (offline, permission), show an inline error in the popup and keep the alert open.

## 7. Appearance

- Modern, clean look: rounded corners, soft shadow, generous spacing, one accent color.
- Background is semi-transparent. Default 25% transparent (75% opacity).
- Only the background is see-through. Text, icons, and buttons stay fully solid.
- Optional blur behind the popup when the OS supports it. Fall back to plain transparency when it does not.
- Text color switches between light and dark automatically based on the background color, so contrast stays readable.

Appearance settings:
- Background color picker
- Transparency slider, 0 to 50%
- Corner radius slider, 0 to 32 px (default 20)
- Accent color picker
- Blur on or off
- Live preview of the popup while adjusting
- Reset to defaults

## 8. Main window

Opened from the tray icon. Uses the same visual style as the popup.

- Upcoming tab: all upcoming items from Notion and manual entry, sorted by time, grouped by Today, Tomorrow, and Later. Each row shows kind, title, time, client, and source.
- Reminders tab: add, edit, and delete manual reminders. Form fields: title, kind, date, time (optional), note.
- Settings tab: see section 9.
- Sync status in the footer: last sync time, a Sync now button, and the last error if any.

Closing the window hides it to the tray. The app keeps running.

## 9. Settings

| Setting | Default |
|---|---|
| Notion token | empty |
| Meeting lead times (minutes) | 60, 30 |
| Morning time for date-only items | 9:00 AM |
| Snooze length | 10 minutes |
| Sync interval | 2 minutes |
| Sound | on |
| Auto-dismiss | off |
| Start with Windows | on |
| Appearance settings | see section 7 |

- The Notion token is stored encrypted with Electron safeStorage. It never appears in logs and is never sent to the renderer after saving.
- A Test connection button checks the token and reports which of the two sources (Meetings, Todo List) it can read.

## 10. Sync and offline behavior

- Poll Notion on the sync interval. Query only items dated from yesterday through 14 days ahead.
- Keep the last successful result in a local cache. If Notion is unreachable, keep scheduling alerts from the cache and show the error in the footer.
- Manual reminders work with no connection and no Notion token.
- The scheduler ticks every 15 seconds and compares the current time against pending alerts. Do not rely on long timers, since they drift when the computer sleeps.
- On wake from sleep, run a sync and a scheduler tick right away.

## 11. System behavior

- Tray icon with a menu: Open, Sync now, Pause alerts for 1 hour, Quit.
- Single instance. Launching a second copy focuses the first.
- Start with Windows, hidden to the tray.
- Rotating log file in the app data folder. No tokens or page content in logs beyond titles.

## 12. Phase 2: agent alerts

Not built in v1. Keep the alert source layer pluggable so this can be added without touching the scheduler or popup.

- A new Notion database named Alerts. Properties: Title, Message, Fire at (date with time), Context (text), Status (New, Shown, Answered), Reply (text).
- A Claude agent writes rows with Status = New.
- The app polls this table, shows each New row as a popup at its Fire at time, and sets Status to Shown.
- The popup gets a reply box and quick buttons. The answer is written to Reply and Status becomes Answered, so the agent can read it on its next run.

## 13. Project structure

```
src/
  main/            Electron main process
    scheduler/     alert rules, fired keys, snooze (pure logic, no Electron imports)
    sources/       notionMeetings, notionTasks, manual (one interface for all)
    notion/        client wrapper, month table discovery, retries
    store/         settings, cache, fired keys
    windows/       popup window, main window, tray
  renderer/        React UI (popup, main window, settings)
  shared/          types shared by main and renderer
tests/
```

Each source returns the same normalized item shape:

```ts
type ReminderItem = {
  id: string;
  source: 'notion-meeting' | 'notion-task' | 'manual';
  kind: 'meeting' | 'task' | 'follow-up';
  title: string;
  start: string;        // ISO datetime or date
  hasTime: boolean;
  done: boolean;
  client?: string;
  with?: string;
  type?: string;
  priority?: string;
  notes?: string;
  url?: string;
};
```

## 14. Build order

1. Project setup: Electron, Vite, React, TypeScript, Tailwind, tray icon, single instance.
2. Scheduler as pure logic with unit tests for every rule in section 5.
3. Popup window: centered, transparent, rounded, animated, with actions wired to the scheduler. Test with manual reminders only.
4. Main window: Upcoming, Reminders, Settings, appearance controls with live preview.
5. Notion sync for Meetings.
6. Notion sync for the monthly task tables, including month discovery and Mark done.
7. Offline cache, sleep and wake handling, start with Windows.
8. Windows installer build.

## 15. Acceptance criteria

- A manual meeting set 61 minutes ahead shows a popup at 60 minutes and again at 30 minutes, centered on the screen.
- A Notion meeting with Status Done never shows a popup.
- A Notion task due today with no time shows one popup at the morning time.
- Restarting the app after an alert fired does not show that alert again.
- Starting the app 40 minutes before a meeting shows one popup that says about 40 minutes, not two popups.
- Snooze for 10 minutes brings the same alert back 10 minutes later, including after a restart.
- Mark done on a Notion task sets its Status to Done in Notion.
- Changing the background color, transparency, or radius updates the live preview and the next real popup.
- With the network off, manual reminders and cached Notion items still fire.
- On December 1, tasks from the 2026-12 table appear without any config change.
- The Notion token cannot be found in plain text in any file the app writes.
