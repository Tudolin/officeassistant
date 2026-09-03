import { BrowserWindow } from 'electron';
import path from 'path';

let audioWindow: BrowserWindow | null = null;

export function createAudioCaptureWindow(): BrowserWindow {
  audioWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'audioCapturePreload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Needed so getUserMedia with desktop/loopback audio constraints works
      // without a permission prompt UI (there is no visible window to prompt on).
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  audioWindow.loadFile(path.join(__dirname, '..', 'renderer', 'audio', 'audio-capture.html'));

  audioWindow.on('closed', () => {
    audioWindow = null;
  });

  return audioWindow;
}

export function getAudioCaptureWindow(): BrowserWindow | null {
  return audioWindow;
}
