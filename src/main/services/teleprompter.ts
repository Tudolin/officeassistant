import fs from 'fs';
import path from 'path';
import { getDataDir } from '../config';
import type { TeleprompterScript } from '../../shared/types';

function filePath(): string {
  return path.join(getDataDir(), 'teleprompter.json');
}

const empty: TeleprompterScript = { title: 'Roteiro', content: '' };

export function getScript(): TeleprompterScript {
  try {
    const raw = fs.readFileSync(filePath(), 'utf8');
    return { ...empty, ...JSON.parse(raw) };
  } catch {
    return empty;
  }
}

export function saveScript(script: TeleprompterScript): void {
  fs.mkdirSync(getDataDir(), { recursive: true });
  fs.writeFileSync(filePath(), JSON.stringify(script, null, 2), 'utf8');
}
