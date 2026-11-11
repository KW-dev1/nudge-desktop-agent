import { app } from 'electron';
import type { Settings } from '../shared/types';
import { AlertService } from './alerts';
import { broadcast, registerIpc } from './ipc';
import { log } from './log';
import { createManualSource } from './sources/manual';
import type { ReminderSourceAdapter } from './sources/types';
import { cacheStore } from './store/cache';
import { listReminders, setReminderDone } from './store/reminders';
import { getPausedUntil, loadSchedulerState, saveSchedulerState, setPausedUntil } from './store/schedulerState';
import { getSettings } from './store/settings';
import { hasToken } from './store/token';
import { SyncService } from './sync';
import { markQuitting, showMainWindow } from './windows/mainWindow';
import { initPopup, refreshPopupSettings, setPopupAlerts } from './windows/popup';
import { createTray, refreshTray } from './windows/tray';

// Launched by Windows at login with this flag, so the app starts in the tray
// without opening the main window.
const startHidden = process.argv.includes('--hidden');

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
    const sources: ReminderSourceAdapter[] = [
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

    const onSettingsChanged = (_settings: Settings) => {
      refreshPopupSettings();
      // Lead times or the morning time may have changed what is due.
      alerts.tick();
      broadcast('data:changed');
    };

    registerIpc({ alerts, sync, onSettingsChanged });
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

    if (!startHidden) showMainWindow();
  });

  app.on('before-quit', markQuitting);

  // A tray app has no windows most of the time. Keep running when the last
  // window closes; quitting happens only through the tray menu.
  app.on('window-all-closed', () => {});
}
