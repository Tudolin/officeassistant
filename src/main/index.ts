import { app } from 'electron';
import { createOverlayWindow, getOverlayWindow, toggleClickThrough, toggleOverlayVisibility } from './windows/overlayWindow';
import { getPanelWindow, isPanelPopped, restorePoppedPanels } from './windows/panelWindow';
import { createAudioCaptureWindow } from './windows/audioCaptureWindow';
import { createOrShowSetupWindow } from './windows/setupWindow';
import { createTray } from './tray';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { registerIpcHandlers } from './ipcHandlers';
import { getSettings } from './config';
import { setTranscriptionEnabled } from './services/audioPipeline';
import { IPC } from '../shared/ipc-channels';
import type { PoppablePanelId } from '../shared/types';

/**
 * Every hotkey/tray action that targets a panel needs to reach whichever
 * window currently owns it - the main overlay, or its own popped-out window
 * if the user dragged it out. Sending to the wrong one would silently do
 * nothing visible (the event lands on a hidden tab in the main overlay).
 */
function showAndTarget(panelId: PoppablePanelId, channel: string, ...args: unknown[]): void {
  if (isPanelPopped(panelId)) {
    const win = getPanelWindow(panelId);
    win?.show();
    win?.focus();
    win?.webContents.send(channel, ...args);
  } else {
    getOverlayWindow()?.show();
    getOverlayWindow()?.webContents.send(channel, ...args);
  }
}

// Single instance: a second launch (e.g. double-clicking the exe again) just
// focuses/shows the existing overlay instead of opening a duplicate app.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    getOverlayWindow()?.show();
  });

  app.whenReady().then(() => {
    registerIpcHandlers();

    const settings = getSettings();
    createOverlayWindow({ startVisible: settings.setupCompleted });
    createAudioCaptureWindow();
    restorePoppedPanels();

    const sharedActions = {
      toggleOverlay: () => toggleOverlayVisibility(),
      toggleClickThrough: () => {
        const enabled = toggleClickThrough();
        getOverlayWindow()?.webContents.send(IPC.clickThroughToggle, enabled);
      },
      askClaude: () => showAndTarget('assistant', IPC.shortcutAskClaude),
      screenshotAsk: () => showAndTarget('assistant', IPC.shortcutScreenshotAsk),
      toggleTranscription: () => showAndTarget('transcript', IPC.shortcutToggleTranscription),
      toggleTeleprompter: () => showAndTarget('teleprompter', IPC.panelShow, 'teleprompter'),
      toggleTranslation: () => showAndTarget('translation', IPC.shortcutToggleTranslation),
      openSettings: () => {
        getOverlayWindow()?.show();
        getOverlayWindow()?.webContents.send(IPC.panelShow, 'settings');
      },
      openSetupWizard: () => createOrShowSetupWindow(),
      quit: () => app.quit(),
    };

    registerShortcuts(settings.hotkeys, sharedActions);
    createTray(sharedActions);

    if (!settings.setupCompleted) {
      createOrShowSetupWindow();
    }
  });

  // The app lives in the system tray (no taskbar icon, see skipTaskbar on every
  // window) - closing an individual window should never quit the whole app.
  // The only way out is the tray's "Sair" entry, which calls app.quit() directly.
  app.on('window-all-closed', () => {
    // no-op: keep running in the tray
  });

  app.on('will-quit', () => {
    unregisterShortcuts();
    setTranscriptionEnabled(false);
  });
}
