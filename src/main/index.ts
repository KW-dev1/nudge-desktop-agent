import { app } from 'electron';
import { AlertService } from './alerts';
import { registerIpc } from './ipc';
import { log } from './log';
import { createManualSource } from './sources/manual';
import type { ReminderSourceAdapter } from './sources/types';
import { listReminders, setReminderDone } from './store/reminders';
import { getPausedUntil, loadSchedulerState, saveSchedulerState, setPausedUntil } from './store/schedulerState';
import { getSettings } from './store/settings';
import { manualToItem } from '../shared/reminders';
import { markQuitting, showMainWindow } from './windows/mainWindow';
import { initPopup, setPopupAlerts } from './windows/popup';
import { createTray, refreshTray } from './windows/tray';

// Launched by Windows at login with this flag, so the app starts in the tray
// without opening the main window.
const startHidden = process.argv.includes('--hidden');

// Single instance: a second launch hands over to the first and exits.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());

  void app.whenReady().then(() => {
    // Windows uses this ID to group the tray icon and notifications.
    app.setAppUserModelId('com.kennethwebber.nudge');
    log(`Nudge ${app.getVersion()} started`);

    const manual = createManualSource({ list: listReminders, setDone: setReminderDone });
    const sources: ReminderSourceAdapter[] = [manual];

    const alerts = new AlertService({
      getItems: () => listReminders().map(manualToItem),
      getSettings,
      loadState: loadSchedulerState,
      saveState: saveSchedulerState,
      getPausedUntil,
      setPausedUntil,
      markDone: async (item) => {
        const source = sources.find((s) => s.id === item.source);
        if (!source?.markDone) throw new Error('This item cannot be marked done from here.');
        await source.markDone(item);
      },
      onStackChange: setPopupAlerts,
      onPauseChange: refreshTray,
      log,
    });

    registerIpc({ alerts });
    initPopup(getSettings);

    createTray({
      onOpen: showMainWindow,
      onSyncNow: () => {},
      onTogglePause: () => alerts.togglePause(),
      onQuit: () => app.quit(),
      pausedUntil: () => alerts.pausedUntil(),
    });

    alerts.start();
    if (!startHidden) showMainWindow();
  });

  app.on('before-quit', markQuitting);

  // A tray app has no windows most of the time. Keep running when the last
  // window closes; quitting happens only through the tray menu.
  app.on('window-all-closed', () => {});
}
