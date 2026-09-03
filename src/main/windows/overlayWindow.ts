import { BrowserWindow, screen } from 'electron';
import path from 'path';

let overlayWindow: BrowserWindow | null = null;
let clickThrough = false;

export function createOverlayWindow(): BrowserWindow {
  const display = screen.getPrimaryDisplay();
  const width = 420;
  const height = 560;

  overlayWindow = new BrowserWindow({
    width,
    height,
    x: display.workArea.x + display.workArea.width - width - 24,
    y: display.workArea.y + 24,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  // Highest tier so the overlay stays above fullscreen shared apps (Teams/Meet/Zoom).
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // The key trick: exclude this window from any screen capture/share (Windows: WDA_EXCLUDEFROMCAPTURE).
  overlayWindow.setContentProtection(true);

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'index.html'));

  overlayWindow.once('ready-to-show', () => {
    overlayWindow?.show();
  });

  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });

  return overlayWindow;
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow;
}

export function toggleOverlayVisibility(): void {
  if (!overlayWindow) return;
  if (overlayWindow.isVisible()) {
    overlayWindow.hide();
  } else {
    overlayWindow.show();
  }
}

export function toggleClickThrough(): boolean {
  if (!overlayWindow) return clickThrough;
  clickThrough = !clickThrough;
  // forward: true still lets mouse-move events reach the renderer so we could
  // show a "click-through active" indicator if desired.
  overlayWindow.setIgnoreMouseEvents(clickThrough, { forward: true });
  return clickThrough;
}

export function isClickThrough(): boolean {
  return clickThrough;
}
