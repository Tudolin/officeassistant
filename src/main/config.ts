import Store from 'electron-store';
import { app } from 'electron';
import path from 'path';
import type { AppSettings } from '../shared/types';

const defaults: AppSettings = {
  claudeCliPath: 'claude',
  claudeModel: '',
  whisperBinaryPath: '',
  whisperModelPath: '',
  whisperLanguageYou: 'auto',
  whisperLanguageOthers: 'auto',
  translationEnabled: true,
  translationTargetPair: 'pt-en',
  keepAudioChunks: false,
  dataDir: '',
  setupCompleted: false,
  overlayBounds: null,
  overlayPositionPreset: 'top-right',
  glassOpacity: 0.42,
  panels: {
    assistant: true,
    transcript: true,
    translation: true,
    teleprompter: true,
    notes: true,
  },
  hotkeys: {
    toggleOverlay: 'Control+Shift+H',
    toggleClickThrough: 'Control+Shift+G',
    askClaude: 'Control+Shift+Space',
    screenshotAsk: 'Control+Shift+A',
    toggleTranscription: 'Control+Shift+M',
    toggleTeleprompter: 'Control+Shift+U',
    toggleTranslation: 'Control+Shift+L',
  },
};

// Global hotkeys are OS-level: while this app runs, these combos never reach
// the browser (or any other app) at all - they're fully claimed. The first
// defaults included Control+Shift+T ("reopen closed tab" in every major
// browser) and Control+Shift+R ("hard refresh"), so a habitual browser
// keypress would silently flip our toggles instead of doing what the user
// expected. Anyone whose settings file still has exactly those old defaults
// (i.e. never customized them) gets migrated to the new, collision-free ones.
const LEGACY_HOTKEY_DEFAULTS: Record<string, string> = {
  toggleTranscription: 'Control+Shift+T',
  toggleTeleprompter: 'Control+Shift+R',
};

const store = new Store<AppSettings>({
  name: 'meeting-copilot-settings',
  defaults,
});

function migrateLegacyHotkeys(): void {
  const current = store.get('hotkeys');
  if (!current) return;
  const patched: Partial<AppSettings['hotkeys']> = {};
  for (const [key, legacyValue] of Object.entries(LEGACY_HOTKEY_DEFAULTS)) {
    const k = key as keyof AppSettings['hotkeys'];
    if (current[k] === legacyValue) {
      patched[k] = defaults.hotkeys[k];
    }
  }
  if (Object.keys(patched).length > 0) {
    store.set('hotkeys', { ...current, ...patched });
  }
}

migrateLegacyHotkeys();

export function getSettings(): AppSettings {
  const settings = store.store;
  if (!settings.dataDir) {
    settings.dataDir = path.join(app.getPath('documents'), 'MeetingCopilot');
  }
  return settings;
}

export function setSettings(partial: Partial<AppSettings>): AppSettings {
  store.set(partial);
  return getSettings();
}

export function getDataDir(): string {
  return getSettings().dataDir;
}
