import path from 'path';
import os from 'os';
import fs from 'fs';
import { pcm16ToWav } from './wav';
import { transcribeWavFile } from './whisper';
import type { SpeakerTag, TranscriptLine } from '../../shared/types';

const SAMPLE_RATE = 16_000;

type TranscriptListener = (line: TranscriptLine) => void;

let enabled = false;
let listener: TranscriptListener | null = null;

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
      const { text } = await transcribeWavFile(wavPath);
      const cleaned = cleanTranscript(text);
      if (!cleaned) return;

      const line: TranscriptLine = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        speaker,
        language: 'unknown',
        text: cleaned,
      };
      listener?.(line);
    } catch (err) {
      console.error('[audioPipeline] transcription failed:', (err as Error).message);
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
