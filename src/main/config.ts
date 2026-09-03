import Store from 'electron-store';
import { app } from 'electron';
import path from 'path';
import type { AppSettings } from '../shared/types';

const defaults: AppSettings = {
  claudeCliPath: 'claude',
  claudeModel: '',
  whisperBinaryPath: '',
  whisperModelPath: '',
  whisperLanguage: 'auto',
  translationEnabled: true,
  translationTargetPair: 'pt-en',
  keepAudioChunks: false,
  dataDir: '',
  setupCompleted: false,
  hotkeys: {
    toggleOverlay: 'Control+Shift+H',
    toggleClickThrough: 'Control+Shift+G',
    askClaude: 'Control+Shift+Space',
    screenshotAsk: 'Control+Shift+A',
    toggleTranscription: 'Control+Shift+T',
    toggleTeleprompter: 'Control+Shift+R',
    toggleTranslation: 'Control+Shift+L',
  },
};

const store = new Store<AppSettings>({
  name: 'meeting-copilot-settings',
  defaults,
});

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
