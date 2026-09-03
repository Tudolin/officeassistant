import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getSettings } from '../config';
import type { WhisperLang } from '../../shared/types';

export interface WhisperResult {
  text: string;
}

/**
 * Runs a local whisper.cpp binary (whisper-cli.exe / main.exe) against one WAV
 * chunk and returns the transcribed text. Fully local/offline - no audio ever
 * leaves the machine. `language` is picked per audio source (mic vs system)
 * so a meeting can e.g. transcribe your own voice as English-only while
 * auto-detecting the other participants, or vice-versa.
 */
export function transcribeWavFile(wavPath: string, language: WhisperLang): Promise<WhisperResult> {
  const settings = getSettings();
  if (!settings.whisperBinaryPath || !settings.whisperModelPath) {
    return Promise.reject(
      new Error('Whisper binary/model path not configured. Open Settings and point to whisper.cpp.')
    );
  }

  const outBase = path.join(os.tmpdir(), `meeting-copilot-whisper-${Date.now()}-${Math.random().toString(36).slice(2)}`);

  const args = [
    '-m', settings.whisperModelPath,
    '-f', wavPath,
    '-l', language,
    '-nt', // no timestamps in output text
    '-otxt',
    '-of', outBase,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(settings.whisperBinaryPath, args, { windowsHide: true });

    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('whisper.cpp timed out'));
    }, 30_000);

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to launch whisper.cpp ("${settings.whisperBinaryPath}"): ${err.message}`));
    });

    child.on('close', () => {
      clearTimeout(timer);
      const txtPath = `${outBase}.txt`;
      try {
        const text = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8').trim() : '';
        resolve({ text });
      } catch (err) {
        reject(err);
      } finally {
        fs.rm(txtPath, { force: true }, () => undefined);
        if (!settings.keepAudioChunks) {
          fs.rm(wavPath, { force: true }, () => undefined);
        }
        if (stderr && !fs.existsSync(txtPath)) {
          console.error('[whisper]', stderr.slice(-500));
        }
      }
    });
  });
}
