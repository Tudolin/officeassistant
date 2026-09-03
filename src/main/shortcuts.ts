import { globalShortcut } from 'electron';
import type { AppSettings } from '../shared/types';

export interface ShortcutActions {
  toggleOverlay: () => void;
  toggleClickThrough: () => void;
  askClaude: () => void;
  screenshotAsk: () => void;
  toggleTranscription: () => void;
  toggleTeleprompter: () => void;
  toggleTranslation: () => void;
}

let registered: string[] = [];

export function registerShortcuts(hotkeys: AppSettings['hotkeys'], actions: ShortcutActions): void {
  unregisterShortcuts();

  const bindings: Array<[string, () => void]> = [
    [hotkeys.toggleOverlay, actions.toggleOverlay],
    [hotkeys.toggleClickThrough, actions.toggleClickThrough],
    [hotkeys.askClaude, actions.askClaude],
    [hotkeys.screenshotAsk, actions.screenshotAsk],
    [hotkeys.toggleTranscription, actions.toggleTranscription],
    [hotkeys.toggleTeleprompter, actions.toggleTeleprompter],
    [hotkeys.toggleTranslation, actions.toggleTranslation],
  ];

  for (const [accelerator, handler] of bindings) {
    if (!accelerator) continue;
    const ok = globalShortcut.register(accelerator, handler);
    if (ok) {
      registered.push(accelerator);
    } else {
      console.error(`[shortcuts] failed to register "${accelerator}" (likely already used by another app)`);
    }
  }
}

export function unregisterShortcuts(): void {
  for (const accelerator of registered) {
    globalShortcut.unregister(accelerator);
  }
  registered = [];
}
