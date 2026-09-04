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
      // This window is never shown, so Chromium treats its page as
      // permanently backgrounded and throttles it - including, critically,
      // the media/Web Audio pipeline. That's almost certainly why the
      // system-audio loopback track never delivered a single sample in
      // testing (regardless of which capture API was used) while the
      // microphone - driven by hardware audio-device callbacks, not by the
      // renderer's throttled timers - kept working. Disabling background
      // throttling keeps this window running at normal speed even though
      // it's never visible.
      backgroundThrottling: false,
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
