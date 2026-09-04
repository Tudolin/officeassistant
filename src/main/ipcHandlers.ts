import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { IPC } from '../shared/ipc-channels';
import { getSettings, setSettings } from './config';
import { answerFromTranscript, askClaude, askClaudeAboutImage } from './services/claudeCli';
import { captureScreenToFile } from './services/screenshot';
import { getScript, saveScript } from './services/teleprompter';
import {
  addAssistantMessage,
  addTranscriptLine,
  exportSessionMarkdown,
  getActiveSession,
  getRecentTranscript,
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
  waitForQueues,
} from './services/audioPipeline';
import { onTranslation, queueTranslation } from './services/translation';
import { getOverlayWindow, setOverlayPositionPreset, toggleClickThrough, toggleOverlayVisibility } from './windows/overlayWindow';
import { closePanelWindow, createPanelWindow, getAllPanelWindows } from './windows/panelWindow';
import { getAudioCaptureWindow } from './windows/audioCaptureWindow';
import { createOrShowSetupWindow, getSetupWindow } from './windows/setupWindow';
import { checkAllRequirements } from './services/requirements';
import { downloadWhisperBinary, downloadWhisperModel, installClaudeCliViaNpm, openClaudeLoginTerminal } from './services/setupActions';
import type { AssistantMessage, PoppablePanelId, TranscriptLine } from '../shared/types';

/** Every panel-content event (transcript lines, translations, etc.) needs to reach whichever window currently hosts that panel - the main overlay, or a popped-out window. */
function broadcastToPanelWindows(channel: string, payload: unknown): void {
  getOverlayWindow()?.webContents.send(channel, payload);
  for (const win of getAllPanelWindows()) win.webContents.send(channel, payload);
}

function sendToSetup(channel: string, payload: unknown): void {
  getSetupWindow()?.webContents.send(channel, payload);
}

export function registerIpcHandlers(): void {
  ipcMain.on(IPC.overlayToggle, () => toggleOverlayVisibility());
  ipcMain.handle(IPC.clickThroughToggle, () => toggleClickThrough());
  ipcMain.on(IPC.panelShow, (_e, panelId: string) => getOverlayWindow()?.webContents.send(IPC.panelShow, panelId));
  ipcMain.on(IPC.overlaySetPositionPreset, (_e, preset) => setOverlayPositionPreset(preset));

  ipcMain.on(IPC.panelPopOut, (_e, panelId: PoppablePanelId) => {
    createPanelWindow(panelId);
    broadcastToPanelWindows(IPC.panelPopStateChanged, { panelId, popped: true });
  });
  ipcMain.on(IPC.panelDock, (_e, panelId: PoppablePanelId) => {
    closePanelWindow(panelId);
    broadcastToPanelWindows(IPC.panelPopStateChanged, { panelId, popped: false });
  });

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

  ipcMain.handle(IPC.answerRecentQuestion, async () => {
    try {
      // Force out whatever's still sitting in the audio buffer (up to ~6s)
      // instead of waiting for the next scheduled flush - otherwise the
      // words spoken right before the shortcut was pressed might still be
      // unprocessed when we read the recent-transcript window below.
      getAudioCaptureWindow()?.webContents.send(IPC.audioFlushNow);
      await new Promise((r) => setTimeout(r, 400)); // let the flushed chunk's IPC round-trip land
      await waitForQueues();

      // 45s, not 30s: the pipeline itself eats 9-15s (6s buffer + whisper
      // time) before a spoken question even lands in the transcript, and
      // the user needs a moment to react and press the shortcut on top of
      // that - a tight 30s window let real questions age out, leaving only
      // whatever was said afterward.
      const recent = getRecentTranscript(45_000);
      if (recent.length === 0) {
        const msg: AssistantMessage = {
          id: `${Date.now()}-e`,
          timestamp: Date.now(),
          kind: 'error',
          text: 'Nenhuma fala capturada nos últimos 45s.',
        };
        addAssistantMessage(msg);
        return msg;
      }

      const transcriptText = recent
        .map((line) => `[${line.speaker === 'you' ? 'Voce' : 'Outros'}] ${line.text}`)
        .join('\n');
      const answer = await answerFromTranscript(transcriptText);
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

  ipcMain.on(IPC.audioChunk, (_e, payload: { speaker: 'you' | 'others'; pcm: ArrayBufferLike }) => {
    ingestPcmChunk(payload.speaker, Buffer.from(payload.pcm));
  });

  ipcMain.on(IPC.audioCaptureError, (_e, payload: { level: 'info' | 'error'; source: 'you' | 'others'; message: string }) => {
    const who = payload.source === 'you' ? 'Você (microfone)' : 'Outros (áudio do sistema)';
    broadcastToPanelWindows(IPC.diagnosticEvent, {
      level: payload.level,
      message: `${who}: ${payload.message}`,
      timestamp: Date.now(),
    });
  });

  onTranscriptLine((line: TranscriptLine) => {
    addTranscriptLine(line);
    broadcastToPanelWindows(IPC.transcriptEvent, line);
    queueTranslation(line);
  });

  onHeartbeat((info) => broadcastToPanelWindows(IPC.audioHeartbeat, info));
  onDiagnostic((message) => broadcastToPanelWindows(IPC.diagnosticEvent, { level: 'error', message, timestamp: Date.now() }));

  onTranslation((line: TranscriptLine) => {
    updateTranscriptLine(line.id, { translation: line.translation });
    broadcastToPanelWindows(IPC.translationEvent, line);
  });

  ipcMain.handle(IPC.translationEnable, (_e, enabled: boolean) => {
    setSettings({ translationEnabled: enabled });
    return enabled;
  });

  // --- Teleprompter ---
  ipcMain.handle(IPC.teleprompterGet, () => getScript());
  ipcMain.handle(IPC.teleprompterSet, (_e, script) => {
    saveScript(script);
    broadcastToPanelWindows(IPC.teleprompterEvent, script);
  });

  // --- Session / notes ---
  ipcMain.handle(IPC.sessionGetActive, () => getActiveSession());
  ipcMain.handle(IPC.sessionUpdateNotes, (_e, notes: string) => {
    updateNotes(notes);
    broadcastToPanelWindows(IPC.notesEvent, notes);
  });
  ipcMain.handle(IPC.sessionNewMeeting, () => {
    const session = startNewMeeting();
    broadcastToPanelWindows(IPC.sessionResetEvent, session);
    return session;
  });
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
