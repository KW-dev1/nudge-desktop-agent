import { app, powerMonitor } from 'electron';
import type { Settings } from '../shared/types';
import { AlertService } from './alerts';
import { broadcast, registerIpc } from './ipc';
import { log } from './log';
import { describeNotionError } from './notion/client';
import { createApiProvider, testConnection } from './notion/connection';
import { createManualSource } from './sources/manual';
import { createNotionMeetingsSource } from './sources/notionMeetings';
import { createNotionTasksSource } from './sources/notionTasks';
import type { ReminderSourceAdapter } from './sources/types';
import { cacheStore, monthCacheStore } from './store/cache';
import { listReminders, setReminderDone } from './store/reminders';
import { getPausedUntil, loadSchedulerState, saveSchedulerState, setPausedUntil } from './store/schedulerState';
import { getSettings } from './store/settings';
import { clearToken, hasToken, loadToken, saveToken } from './store/token';
import { SyncService } from './sync';
import { markQuitting, showMainWindow } from './windows/mainWindow';
import { initPopup, refreshPopupSettings, setPopupAlerts } from './windows/popup';
import { createTray, refreshTray } from './windows/tray';

// Launched by Windows at login with this flag, so the app starts in the tray
// without opening the main window.
const startHidden = process.argv.includes('--hidden');

/**
 * Wrap a Notion source so its failures carry a short, plain message (shown
 * in the footer and the popup) instead of a raw SDK error.
 */
function withFriendlyErrors(source: ReminderSourceAdapter): ReminderSourceAdapter {
  const friendly = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      throw new Error(describeNotionError(error));
    }
  };
  return {
    ...source,
    fetch: (range) => friendly(() => source.fetch(range)),
    markDone: source.markDone ? (item) => friendly(() => source.markDone!(item)) : undefined,
  };
}

/**
 * Register or remove the app as a Windows login item. It starts with
 * --hidden so it goes straight to the tray. Skipped in development, where
 * the "app" would be the bare Electron binary.
 */
function applyLoginItem(settings: Settings): void {
  if (!app.isPackaged) return;
  app.setLoginItemSettings({ openAtLogin: settings.startWithWindows, args: ['--hidden'] });
}

// Single instance: a second launch hands over to the first and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  void app.whenReady().then(async () => {
    // Windows uses this ID to group the tray icon and notifications.
    app.setAppUserModelId('com.kennethwebber.nudge');
    log(`Nudge ${app.getVersion()} started`);

    // The pluggable source list. The scheduler and popup only see the
    // normalized items these return, so a new source is one more entry here.
    const getNotionApi = createApiProvider(loadToken);
    const sources: ReminderSourceAdapter[] = [
      withFriendlyErrors(createNotionMeetingsSource(getNotionApi)),
      withFriendlyErrors(createNotionTasksSource(getNotionApi, monthCacheStore)),
      createManualSource({ list: listReminders, setDone: setReminderDone }),
    ];

    const sync = new SyncService({
      sources,
      cache: cacheStore,
      hasToken,
      onChange: () => broadcast('data:changed'),
      log,
    });

    const alerts = new AlertService({
      getItems: () => sync.items(),
      getSettings,
      loadState: loadSchedulerState,
      saveState: saveSchedulerState,
      getPausedUntil,
      setPausedUntil,
      markDone: async (item) => {
        const source = sync.sourceFor(item);
        if (!source?.markDone) throw new Error('This item cannot be marked done from here.');
        await source.markDone(item);
        // Reflect the change locally right away, without waiting for a sync.
        if (source.remote) sync.markDoneInCache(item);
        else await sync.refreshLocal();
      },
      onStackChange: setPopupAlerts,
      onPauseChange: refreshTray,
      log,
    });

    const onSettingsChanged = (settings: Settings) => {
      refreshPopupSettings();
      applyLoginItem(settings);
      // Lead times or the morning time may have changed what is due.
      alerts.tick();
      broadcast('data:changed');
    };

    registerIpc({
      alerts,
      sync,
      onSettingsChanged,
      notion: {
        saveToken: (token) => {
          saveToken(token);
          // A different token may see different pages. Look the tables up again.
          monthCacheStore.set(null);
          log('Notion token saved');
        },
        clearToken: () => {
          clearToken();
          log('Notion token removed');
        },
        test: () => testConnection(getNotionApi),
      },
    });
    applyLoginItem(getSettings());
    initPopup(getSettings);

    const syncAndTick = () => void sync.syncNow().then(() => alerts.tick());

    createTray({
      onOpen: showMainWindow,
      onSyncNow: syncAndTick,
      onTogglePause: () => alerts.togglePause(),
      onQuit: () => app.quit(),
      pausedUntil: () => alerts.pausedUntil(),
    });

    // Load manual reminders before the first tick so nothing local is missed,
    // then start the scheduler. It runs from the cache; the first network
    // sync happens in the background.
    await sync.refreshLocal();
    alerts.start();
    syncAndTick();

    // Check every 15 seconds whether the sync interval has passed. A short
    // check against the clock survives sleep better than one long timer.
    setInterval(() => sync.maybeSync(getSettings().syncIntervalMinutes), 15_000);

    // After sleep the timers above may be long overdue. Catch up at once:
    // tick from the cache first, then sync and tick again with fresh data.
    powerMonitor.on('resume', () => {
      log('Woke from sleep');
      alerts.tick();
      syncAndTick();
    });

    if (!startHidden) showMainWindow();
  });

  app.on('before-quit', markQuitting);

  // A tray app has no windows most of the time. Keep running when the last
  // window closes; quitting happens only through the tray menu.
  app.on('window-all-closed', () => {});
}
