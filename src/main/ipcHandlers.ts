import { desktopCapturer, ipcMain, IpcMainInvokeEvent, screen } from 'electron';
import { IPC } from '../shared/ipc-channels';
import { getSettings, setSettings } from './config';
import { askClaude, askClaudeAboutImage } from './services/claudeCli';
import { captureScreenToFile } from './services/screenshot';
import { getScript, saveScript } from './services/teleprompter';
import {
  addAssistantMessage,
  addTranscriptLine,
  exportSessionMarkdown,
  getActiveSession,
  startNewMeeting,
  updateNotes,
  updateTranscriptLine,
} from './services/sessionStore';
import {
  ingestPcmChunk,
  isTranscriptionEnabled,
  onDiagnostic,
  onHeartbeat,
  onTranscriptLine,
  setTranscriptionEnabled,
} from './services/audioPipeline';
import { onTranslation, queueTranslation } from './services/translation';
import { getOverlayWindow, setOverlayPositionPreset, toggleClickThrough, toggleOverlayVisibility } from './windows/overlayWindow';
import { getAudioCaptureWindow } from './windows/audioCaptureWindow';
import { createOrShowSetupWindow, getSetupWindow } from './windows/setupWindow';
import { checkAllRequirements } from './services/requirements';
import { downloadWhisperBinary, downloadWhisperModel, installClaudeCliViaNpm, openClaudeLoginTerminal } from './services/setupActions';
import type { AssistantMessage, TranscriptLine } from '../shared/types';

function sendToOverlay(channel: string, payload: unknown): void {
  getOverlayWindow()?.webContents.send(channel, payload);
}

function sendToSetup(channel: string, payload: unknown): void {
  getSetupWindow()?.webContents.send(channel, payload);
}

export function registerIpcHandlers(): void {
  ipcMain.on(IPC.overlayToggle, () => toggleOverlayVisibility());
  ipcMain.handle(IPC.clickThroughToggle, () => toggleClickThrough());
  ipcMain.on(IPC.panelShow, (_e, panelId: string) => sendToOverlay(IPC.panelShow, panelId));
  ipcMain.on(IPC.overlaySetPositionPreset, (_e, preset) => setOverlayPositionPreset(preset));

  ipcMain.handle(IPC.askClaude, async (_e: IpcMainInvokeEvent, question: string) => {
    const pending: AssistantMessage = {
      id: `${Date.now()}`,
      timestamp: Date.now(),
      kind: 'question',
      text: question,
    };
    addAssistantMessage(pending);

    try {
      const answer = await askClaude(question);
      const msg: AssistantMessage = { id: `${Date.now()}-a`, timestamp: Date.now(), kind: 'answer', text: answer };
      addAssistantMessage(msg);
      return msg;
    } catch (err) {
      const msg: AssistantMessage = {
        id: `${Date.now()}-e`,
        timestamp: Date.now(),
        kind: 'error',
        text: (err as Error).message,
      };
      addAssistantMessage(msg);
      return msg;
    }
  });

  ipcMain.handle(IPC.screenshotAsk, async (_e: IpcMainInvokeEvent, question: string) => {
    try {
      const imagePath = await captureScreenToFile();
      addAssistantMessage({
        id: `${Date.now()}-shot`,
        timestamp: Date.now(),
        kind: 'screenshot',
        text: question,
        imagePath,
      });
      const answer = await askClaudeAboutImage(imagePath, question);
      const msg: AssistantMessage = { id: `${Date.now()}-a`, timestamp: Date.now(), kind: 'answer', text: answer };
      addAssistantMessage(msg);
      return msg;
    } catch (err) {
      const msg: AssistantMessage = {
        id: `${Date.now()}-e`,
        timestamp: Date.now(),
        kind: 'error',
        text: (err as Error).message,
      };
      addAssistantMessage(msg);
      return msg;
    }
  });

  // --- Transcription / audio ---
  ipcMain.handle(IPC.transcriptionEnable, (_e, enabled: boolean) => {
    setTranscriptionEnabled(enabled);
    getAudioCaptureWindow()?.webContents.send(enabled ? IPC.audioCaptureStart : IPC.audioCaptureStop);
    return enabled;
  });
  ipcMain.handle(IPC.transcriptionGetState, () => isTranscriptionEnabled());

  ipcMain.handle(IPC.audioGetDesktopSourceId, async () => {
    const display = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    const primary = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (!primary) throw new Error('No screen source available for audio loopback capture.');
    return primary.id;
  });

  ipcMain.on(IPC.audioChunk, (_e, payload: { speaker: 'you' | 'others'; pcm: ArrayBufferLike }) => {
    ingestPcmChunk(payload.speaker, Buffer.from(payload.pcm));
  });

  ipcMain.on(IPC.audioCaptureError, (_e, payload: { level: 'info' | 'error'; source: 'you' | 'others'; message: string }) => {
    const who = payload.source === 'you' ? 'Você (microfone)' : 'Outros (áudio do sistema)';
    sendToOverlay(IPC.diagnosticEvent, {
      level: payload.level,
      message: `${who}: ${payload.message}`,
      timestamp: Date.now(),
    });
  });

  onTranscriptLine((line: TranscriptLine) => {
    addTranscriptLine(line);
    sendToOverlay(IPC.transcriptEvent, line);
    queueTranslation(line);
  });

  onHeartbeat((info) => sendToOverlay(IPC.audioHeartbeat, info));
  onDiagnostic((message) => sendToOverlay(IPC.diagnosticEvent, { level: 'error', message, timestamp: Date.now() }));

  onTranslation((line: TranscriptLine) => {
    updateTranscriptLine(line.id, { translation: line.translation });
    sendToOverlay(IPC.translationEvent, line);
  });

  ipcMain.handle(IPC.translationEnable, (_e, enabled: boolean) => {
    setSettings({ translationEnabled: enabled });
    return enabled;
  });

  // --- Teleprompter ---
  ipcMain.handle(IPC.teleprompterGet, () => getScript());
  ipcMain.handle(IPC.teleprompterSet, (_e, script) => saveScript(script));

  // --- Session / notes ---
  ipcMain.handle(IPC.sessionGetActive, () => getActiveSession());
  ipcMain.handle(IPC.sessionUpdateNotes, (_e, notes: string) => updateNotes(notes));
  ipcMain.handle(IPC.sessionNewMeeting, () => startNewMeeting());
  ipcMain.handle(IPC.sessionExport, () => exportSessionMarkdown(getActiveSession()));

  // --- Settings ---
  ipcMain.handle(IPC.settingsGet, () => getSettings());
  ipcMain.handle(IPC.settingsSet, (_e, partial) => setSettings(partial));

  // --- Setup wizard ---
  ipcMain.on(IPC.setupOpenWindow, () => createOrShowSetupWindow());

  ipcMain.handle(IPC.setupCheckAll, () => checkAllRequirements());

  ipcMain.handle(IPC.setupInstallClaudeCli, async () => {
    try {
      await installClaudeCliViaNpm((line) => sendToSetup(IPC.setupLog, line));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.setupOpenClaudeLogin, () => {
    openClaudeLoginTerminal();
  });

  ipcMain.handle(IPC.setupDownloadWhisperBinary, async () => {
    try {
      const path = await downloadWhisperBinary((item, received, total) => sendToSetup(IPC.setupProgress, { item, received, total }));
      return { ok: true, path };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.setupDownloadWhisperModel, async (_e, modelName: 'tiny' | 'base' | 'small' | 'medium') => {
    try {
      const path = await downloadWhisperModel(modelName, (item, received, total) =>
        sendToSetup(IPC.setupProgress, { item, received, total })
      );
      return { ok: true, path };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  });

  ipcMain.handle(IPC.setupFinish, () => {
    setSettings({ setupCompleted: true });
    getSetupWindow()?.close();
    getOverlayWindow()?.show();
  });
}
