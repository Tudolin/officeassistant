import type { AudioCaptureApi } from '../../preload/audioCapturePreload';

declare global {
  interface Window {
    audioCapture: AudioCaptureApi;
  }
}

const SAMPLE_RATE = 16_000;
const CHUNK_SECONDS = 6;
const CHUNK_SAMPLES = SAMPLE_RATE * CHUNK_SECONDS;

interface Pipeline {
  speaker: 'you' | 'others';
  context: AudioContext;
  processor: ScriptProcessorNode;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  buffered: Float32Array[];
  bufferedLength: number;
}

let pipelines: Pipeline[] = [];

function float32ToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function flush(pipeline: Pipeline): void {
  if (pipeline.bufferedLength === 0) return;
  const merged = new Float32Array(pipeline.bufferedLength);
  let offset = 0;
  for (const chunk of pipeline.buffered) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  pipeline.buffered = [];
  pipeline.bufferedLength = 0;

  const int16 = float32ToInt16(merged);
  window.audioCapture.sendChunk(pipeline.speaker, int16.buffer);
}

function attachPipeline(speaker: 'you' | 'others', stream: MediaStream): Pipeline {
  const context = new AudioContext({ sampleRate: SAMPLE_RATE });
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  const silentGain = context.createGain();
  silentGain.gain.value = 0;

  const pipeline: Pipeline = { speaker, context, processor, source, stream, buffered: [], bufferedLength: 0 };

  processor.onaudioprocess = (event) => {
    const data = event.inputBuffer.getChannelData(0);
    pipeline.buffered.push(new Float32Array(data));
    pipeline.bufferedLength += data.length;
    if (pipeline.bufferedLength >= CHUNK_SAMPLES) {
      flush(pipeline);
    }
  };

  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(context.destination);

  return pipeline;
}

async function startCapture(): Promise<void> {
  if (pipelines.length > 0) return;

  try {
    const sourceId = await window.audioCapture.getDesktopSourceId();
    const systemStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
        },
      } as unknown as MediaTrackConstraints,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          maxWidth: 1,
          maxHeight: 1,
          maxFrameRate: 1,
        },
      } as unknown as MediaTrackConstraints,
    });
    // We only need the audio loopback track; drop the throwaway 1x1 video track.
    systemStream.getVideoTracks().forEach((t) => t.stop());
    pipelines.push(attachPipeline('others', systemStream));
  } catch (err) {
    console.error('[audio-capture] failed to capture system audio loopback:', err);
  }

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    pipelines.push(attachPipeline('you', micStream));
  } catch (err) {
    console.error('[audio-capture] failed to capture microphone:', err);
  }
}

function stopCapture(): void {
  for (const pipeline of pipelines) {
    flush(pipeline);
    pipeline.processor.disconnect();
    pipeline.source.disconnect();
    pipeline.stream.getTracks().forEach((t) => t.stop());
    pipeline.context.close();
  }
  pipelines = [];
}

window.audioCapture.onStart(() => {
  startCapture();
});
window.audioCapture.onStop(() => {
  stopCapture();
});
