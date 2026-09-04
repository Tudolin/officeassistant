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
    // whisper.cpp defaults to only 4 threads regardless of what the CPU
    // has available. Mic ("you") and system audio ("others") transcribe
    // concurrently on separate queues, so giving each call every logical
    // core oversubscribes the CPU when both fire at once - measured 15-27s
    // spikes vs. a steady ~4-8s when each gets half the cores instead.
    '-t', String(Math.max(1, Math.floor(os.cpus().length / 2))),
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(settings.whisperBinaryPath, args, { windowsHide: true });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('whisper.cpp timed out'));
    }, 30_000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Failed to launch whisper.cpp ("${settings.whisperBinaryPath}"): ${err.message}`));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const txtPath = `${outBase}.txt`;
      const txtExists = fs.existsSync(txtPath);
      try {
        if (!txtExists) {
          // whisper.cpp always writes the -otxt output file when it actually
          // runs the transcription, even for silent/empty audio. No file
          // means the binary didn't transcribe at all - e.g. it's the
          // deprecated main.exe stub (whisper.cpp renamed it to
          // whisper-cli.exe and left a shim that only prints a notice and
          // exits 0), a crash, or a bad argument - and that must never be
          // swallowed as an empty transcript.
          const combined = `${stdout}${stderr}`.trim();
          throw new Error(
            `whisper.cpp produced no output file (exit code ${code}). stdout/stderr: ${combined.slice(-500) || '(empty)'}`
          );
        }
        const text = fs.readFileSync(txtPath, 'utf8').trim();
        resolve({ text });
      } catch (err) {
        reject(err);
      } finally {
        fs.rm(txtPath, { force: true }, () => undefined);
        if (!settings.keepAudioChunks) {
          fs.rm(wavPath, { force: true }, () => undefined);
        }
      }
    });
  });
}
