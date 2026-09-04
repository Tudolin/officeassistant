import path from 'path';
import os from 'os';
import fs from 'fs';
import { pcm16ToWav } from './wav';
import { transcribeWavFile } from './whisper';
import { getSettings } from '../config';
import type { SpeakerTag, TranscriptLine } from '../../shared/types';

const SAMPLE_RATE = 16_000;

type TranscriptListener = (line: TranscriptLine) => void;
type HeartbeatListener = (info: { speaker: SpeakerTag; timestamp: number; hadSpeech: boolean }) => void;
type DiagnosticListener = (message: string) => void;

let enabled = false;
let listener: TranscriptListener | null = null;
let heartbeatListener: HeartbeatListener | null = null;
let diagnosticListener: DiagnosticListener | null = null;

// One serial queue per speaker so we never spawn overlapping whisper.cpp
// processes for the same audio source (system audio vs. microphone).
const queues: Record<SpeakerTag, Promise<void>> = {
  you: Promise.resolve(),
  others: Promise.resolve(),
};

export function setTranscriptionEnabled(value: boolean): void {
  enabled = value;
}

export function isTranscriptionEnabled(): boolean {
  return enabled;
}

export function onTranscriptLine(cb: TranscriptListener): void {
  listener = cb;
}

/** Fires after every processed chunk (speech or not) - proof the pipeline is alive. */
export function onHeartbeat(cb: HeartbeatListener): void {
  heartbeatListener = cb;
}

/** Fires when a chunk fails to process (e.g. whisper.cpp missing/crashing). */
export function onDiagnostic(cb: DiagnosticListener): void {
  diagnosticListener = cb;
}

/** Resolves once whatever chunk is currently queued for each speaker has finished transcribing. */
export function waitForQueues(): Promise<void> {
  return Promise.all([queues.you, queues.others]).then(() => undefined);
}

/**
 * Called from the IPC handler whenever the hidden audio-capture window flushes
 * a ~6s buffer of raw 16-bit PCM mono samples for one source.
 */
export function ingestPcmChunk(speaker: SpeakerTag, pcmBuffer: Buffer): void {
  if (!enabled) return;

  queues[speaker] = queues[speaker].then(async () => {
    const wav = pcm16ToWav(pcmBuffer, SAMPLE_RATE, 1);
    const wavPath = path.join(os.tmpdir(), `meeting-copilot-${speaker}-${Date.now()}.wav`);
    fs.writeFileSync(wavPath, wav);

    try {
      const settings = getSettings();
      const language = speaker === 'you' ? settings.whisperLanguageYou : settings.whisperLanguageOthers;
      const { text } = await transcribeWavFile(wavPath, language);
      const cleaned = cleanTranscript(text);
      heartbeatListener?.({ speaker, timestamp: Date.now(), hadSpeech: !!cleaned });
      if (!cleaned) return;

      const line: TranscriptLine = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        speaker,
        language: language === 'auto' ? 'unknown' : language,
        text: cleaned,
      };
      listener?.(line);
    } catch (err) {
      const message = `Transcrição falhou (${speaker === 'you' ? 'Você' : 'Outros'}): ${(err as Error).message}`;
      console.error('[audioPipeline]', message);
      diagnosticListener?.(message);
    }
  });
}

function cleanTranscript(raw: string): string {
  const text = raw.replace(/\[[^\]]*\]/g, '').trim();
  // Filter whisper.cpp's common "silence" hallucinations on empty/near-silent chunks.
  const noise = ['', '.', '...', 'you', 'thank you.', '[BLANK_AUDIO]'];
  if (noise.includes(text.toLowerCase())) return '';
  return text;
}
