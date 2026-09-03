import { BrowserWindow, screen } from 'electron';
import path from 'path';
import { getSettings, setSettings } from '../config';
import type { OverlayPositionPreset, WindowBounds } from '../../shared/types';

let overlayWindow: BrowserWindow | null = null;
let clickThrough = false;
let saveBoundsTimer: NodeJS.Timeout | null = null;
let suppressBoundsPersist = false;

const DEFAULT_WIDTH = 420;
const DEFAULT_HEIGHT = 560;
const MARGIN = 24;

function computePresetBounds(preset: OverlayPositionPreset, width: number, height: number): WindowBounds {
  const { workArea } = screen.getPrimaryDisplay();
  const left = workArea.x + MARGIN;
  const right = workArea.x + workArea.width - width - MARGIN;
  const top = workArea.y + MARGIN;
  const bottom = workArea.y + workArea.height - height - MARGIN;

  switch (preset) {
    case 'top-left':
      return { x: left, y: top, width, height };
    case 'bottom-left':
      return { x: left, y: bottom, width, height };
    case 'bottom-right':
      return { x: right, y: bottom, width, height };
    case 'top-right':
    default:
      return { x: right, y: top, width, height };
  }
}

function isOnAnyDisplay(bounds: WindowBounds): boolean {
  return screen.getAllDisplays().some((d) => {
    const a = d.workArea;
    return bounds.x >= a.x - 50 && bounds.y >= a.y - 50 && bounds.x < a.x + a.width && bounds.y < a.y + a.height;
  });
}

function initialBounds(): WindowBounds {
  const settings = getSettings();
  if (settings.overlayBounds && isOnAnyDisplay(settings.overlayBounds)) {
    return settings.overlayBounds;
  }
  return computePresetBounds(settings.overlayPositionPreset, DEFAULT_WIDTH, DEFAULT_HEIGHT);
}

export function createOverlayWindow(options: { startVisible: boolean } = { startVisible: true }): BrowserWindow {
  const bounds = initialBounds();

  overlayWindow = new BrowserWindow({
    ...bounds,
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
    if (options.startVisible) overlayWindow?.show();
  });

  // Persist wherever the user drags/resizes it to, debounced so we don't hit
  // disk on every intermediate drag frame. A manual drag/resize also flips
  // the "position preset" to custom so it isn't silently snapped back later.
  const persistBounds = () => {
    if (suppressBoundsPersist) return;
    if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
    saveBoundsTimer = setTimeout(() => {
      if (!overlayWindow) return;
      const [x, y] = overlayWindow.getPosition();
      const [width, height] = overlayWindow.getSize();
      setSettings({ overlayBounds: { x, y, width, height }, overlayPositionPreset: 'custom' });
    }, 400);
  };
  overlayWindow.on('moved', persistBounds);
  overlayWindow.on('resized', persistBounds);

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

export function setOverlayPositionPreset(preset: OverlayPositionPreset): void {
  if (!overlayWindow || preset === 'custom') {
    setSettings({ overlayPositionPreset: preset });
    return;
  }
  const [width, height] = overlayWindow.getSize();
  const bounds = computePresetBounds(preset, width, height);

  // setBounds() also fires 'moved'/'resized' - suppress the debounced
  // persistence for that programmatic change so it doesn't immediately
  // relabel the preset we just set as "custom".
  suppressBoundsPersist = true;
  overlayWindow.setBounds(bounds);
  setSettings({ overlayBounds: bounds, overlayPositionPreset: preset });
  setTimeout(() => {
    suppressBoundsPersist = false;
  }, 500);
}
