import { BrowserWindow, desktopCapturer, session } from 'electron';
import path from 'path';

let audioWindow: BrowserWindow | null = null;

/**
 * Wires up the modern, actively-supported Electron API for system-audio
 * loopback capture: the renderer calls getDisplayMedia({audio: true}), and
 * this handler answers it with the primary screen source plus Electron's
 * 'loopback' audio sentinel (captures whatever the system is currently
 * outputting). This replaces the legacy chromeMediaSource "mandatory"
 * getUserMedia constraints, which - even with the paired video track kept
 * alive - still failed to ever deliver an 'others' audio frame in testing.
 */
function registerDisplayMediaHandler(): void {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer.getSources({ types: ['screen'] }).then((sources) => {
      const primary = sources[0];
      if (!primary) {
        callback({});
        return;
      }
      callback({ video: primary, audio: 'loopback' });
    });
  });
}

export function createAudioCaptureWindow(): BrowserWindow {
  registerDisplayMediaHandler();

  audioWindow = new BrowserWindow({
    show: false,
    skipTaskbar: true,
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
