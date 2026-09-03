import { translateLine } from './claudeCli';
import { getSettings } from '../config';
import type { TranscriptLine } from '../../shared/types';

type TranslationListener = (line: TranscriptLine) => void;

let listener: TranslationListener | null = null;
let queue: Promise<void> = Promise.resolve();

export function onTranslation(cb: TranslationListener): void {
  listener = cb;
}

export function queueTranslation(line: TranscriptLine): void {
  if (!getSettings().translationEnabled) return;

  queue = queue.then(async () => {
    try {
      const translation = await translateLine(line.text);
      const updated: TranscriptLine = { ...line, translation };
      listener?.(updated);
    } catch (err) {
      console.error('[translation] failed:', (err as Error).message);
    }
  });
}
