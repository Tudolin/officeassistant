import { BrowserWindow } from 'electron';
import path from 'path';

let setupWindow: BrowserWindow | null = null;

export function createOrShowSetupWindow(): BrowserWindow {
  if (setupWindow) {
    setupWindow.show();
    setupWindow.focus();
    return setupWindow;
  }

  setupWindow = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: true,
    // Kept off the taskbar on purpose: the app lives in the system tray only.
    skipTaskbar: true,
    title: 'Meeting Copilot - Configuração inicial',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'setupPreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  setupWindow.setMenuBarVisibility(false);
  setupWindow.loadFile(path.join(__dirname, '..', 'renderer', 'setup', 'index.html'));

  setupWindow.on('closed', () => {
    setupWindow = null;
  });

  return setupWindow;
}

export function getSetupWindow(): BrowserWindow | null {
  return setupWindow;
}
