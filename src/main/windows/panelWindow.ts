import { BrowserWindow } from 'electron';
import path from 'path';
import { getSettings, setSettings } from '../config';
import { computePresetBounds, createGlassWindow, isOnAnyDisplay } from './overlayWindow';
import type { OverlayPositionPreset, PanelWindowState, PoppablePanelId, WindowBounds } from '../../shared/types';

const panelWindows = new Map<PoppablePanelId, BrowserWindow>();
const saveBoundsTimers = new Map<PoppablePanelId, NodeJS.Timeout>();

const DEFAULT_PRESET: OverlayPositionPreset = 'top-right';

// Default sizes per popped-out panel - Roteiro gets a bigger window since its
// script view is large-format scrolling text meant to be read at a glance,
// the rest match the main overlay's default 420x560.
const DEFAULT_SIZE: Record<PoppablePanelId, { width: number; height: number }> = {
  assistant: { width: 420, height: 560 },
  transcript: { width: 420, height: 560 },
  translation: { width: 420, height: 560 },
  teleprompter: { width: 720, height: 480 },
  notes: { width: 420, height: 560 },
};

function initialBoundsFor(panelId: PoppablePanelId): WindowBounds {
  const state = getSettings().poppedPanels[panelId];
  const { width, height } = DEFAULT_SIZE[panelId];
  if (state?.bounds && isOnAnyDisplay(state.bounds)) return state.bounds;
  return computePresetBounds(state?.positionPreset ?? DEFAULT_PRESET, width, height);
}

function persistPanelState(panelId: PoppablePanelId, patch: Partial<PanelWindowState>): void {
  const current = getSettings().poppedPanels;
  const existing: PanelWindowState = current[panelId] ?? { popped: false, bounds: null, positionPreset: DEFAULT_PRESET };
  setSettings({ poppedPanels: { ...current, [panelId]: { ...existing, ...patch } } });
}

export function isPanelPopped(panelId: PoppablePanelId): boolean {
  return panelWindows.has(panelId);
}

export function getPanelWindow(panelId: PoppablePanelId): BrowserWindow | null {
  return panelWindows.get(panelId) ?? null;
}

export function getAllPanelWindows(): BrowserWindow[] {
  return Array.from(panelWindows.values());
}

/** Creates (or returns the existing) floating window for one popped-out panel. */
export function createPanelWindow(panelId: PoppablePanelId): BrowserWindow {
  const existing = panelWindows.get(panelId);
  if (existing) return existing;

  const bounds = initialBoundsFor(panelId);
  const win = createGlassWindow(bounds);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'overlay', 'index.html'), { query: { pop: panelId } });
  win.once('ready-to-show', () => win.show());

  const persistBounds = () => {
    const timer = saveBoundsTimers.get(panelId);
    if (timer) clearTimeout(timer);
    saveBoundsTimers.set(
      panelId,
      setTimeout(() => {
        const [x, y] = win.getPosition();
        const [width, height] = win.getSize();
        persistPanelState(panelId, { bounds: { x, y, width, height }, positionPreset: 'custom' });
      }, 400)
    );
  };
  win.on('moved', persistBounds);
  win.on('resized', persistBounds);

  // Covers the "dock" button as well as the window being closed some other
  // way (e.g. Alt+F4) - either way, the state must not be left claiming this
  // panel is still popped out.
  win.on('closed', () => {
    panelWindows.delete(panelId);
    persistPanelState(panelId, { popped: false });
  });

  panelWindows.set(panelId, win);
  persistPanelState(panelId, { popped: true });
  return win;
}

export function closePanelWindow(panelId: PoppablePanelId): void {
  const win = panelWindows.get(panelId);
  if (win && !win.isDestroyed()) win.close();
}

/** Recreates whatever panel windows were still popped out when the app last quit. */
export function restorePoppedPanels(): void {
  const { poppedPanels } = getSettings();
  for (const [panelId, state] of Object.entries(poppedPanels) as Array<[PoppablePanelId, PanelWindowState | undefined]>) {
    if (state?.popped) createPanelWindow(panelId);
  }
}
