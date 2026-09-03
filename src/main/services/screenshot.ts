import { desktopCapturer, screen } from 'electron';
import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Captures the primary display and saves it as a PNG in the OS temp dir.
 * Used for the "screenshot -> ask Claude" hotkey (question help / live-coding help).
 */
export async function captureScreenToFile(): Promise<string> {
  const display = screen.getPrimaryDisplay();
  const scale = display.scaleFactor || 1;

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: {
      width: Math.round(display.size.width * scale),
      height: Math.round(display.size.height * scale),
    },
  });

  const primarySource = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!primarySource) {
    throw new Error('No screen source available for capture.');
  }

  const png = primarySource.thumbnail.toPNG();
  const outPath = path.join(os.tmpdir(), `meeting-copilot-shot-${Date.now()}.png`);
  fs.writeFileSync(outPath, png);
  return outPath;
}
