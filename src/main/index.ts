import { app } from 'electron';
import { createOverlayWindow, getOverlayWindow, toggleClickThrough, toggleOverlayVisibility } from './windows/overlayWindow';
import { createAudioCaptureWindow } from './windows/audioCaptureWindow';
import { registerShortcuts, unregisterShortcuts } from './shortcuts';
import { registerIpcHandlers } from './ipcHandlers';
import { getSettings } from './config';
import { setTranscriptionEnabled } from './services/audioPipeline';
import { IPC } from '../shared/ipc-channels';

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
    createOverlayWindow();
    createAudioCaptureWindow();

    const settings = getSettings();
    registerShortcuts(settings.hotkeys, {
      toggleOverlay: () => toggleOverlayVisibility(),
      toggleClickThrough: () => {
        const enabled = toggleClickThrough();
        getOverlayWindow()?.webContents.send(IPC.clickThroughToggle, enabled);
      },
      askClaude: () => getOverlayWindow()?.webContents.send(IPC.shortcutAskClaude),
      screenshotAsk: () => getOverlayWindow()?.webContents.send(IPC.shortcutScreenshotAsk),
      toggleTranscription: () => getOverlayWindow()?.webContents.send(IPC.shortcutToggleTranscription),
      toggleTeleprompter: () => getOverlayWindow()?.webContents.send(IPC.panelShow, 'teleprompter'),
      toggleTranslation: () => getOverlayWindow()?.webContents.send(IPC.shortcutToggleTranslation),
    });
  });

  app.on('window-all-closed', () => {
    unregisterShortcuts();
    setTranscriptionEnabled(false);
    app.quit();
  });

  app.on('will-quit', () => {
    unregisterShortcuts();
  });
}
