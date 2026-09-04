import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type {
  AppSettings,
  AssistantMessage,
  AudioHeartbeat,
  DiagnosticEvent,
  MeetingSession,
  OverlayPositionPreset,
  PoppablePanelId,
  TeleprompterScript,
  TranscriptLine,
} from '../shared/types';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  overlay: {
    hide: () => ipcRenderer.send(IPC.overlayToggle),
    toggleClickThrough: () => ipcRenderer.invoke(IPC.clickThroughToggle) as Promise<boolean>,
    showPanel: (panelId: string) => ipcRenderer.send(IPC.panelShow, panelId),
    onShowPanel: (cb: (panelId: string) => void) => on<string>(IPC.panelShow, cb),
    onClickThroughChanged: (cb: (enabled: boolean) => void) => on<boolean>(IPC.clickThroughToggle, cb),
    onShortcutAskClaude: (cb: () => void) => on<void>(IPC.shortcutAskClaude, cb),
    onShortcutScreenshotAsk: (cb: () => void) => on<void>(IPC.shortcutScreenshotAsk, cb),
    onShortcutToggleTranscription: (cb: () => void) => on<void>(IPC.shortcutToggleTranscription, cb),
    onShortcutToggleTranslation: (cb: () => void) => on<void>(IPC.shortcutToggleTranslation, cb),
    setPositionPreset: (preset: OverlayPositionPreset) => ipcRenderer.send(IPC.overlaySetPositionPreset, preset),
    popOut: (panelId: PoppablePanelId) => ipcRenderer.send(IPC.panelPopOut, panelId),
    dock: (panelId: PoppablePanelId) => ipcRenderer.send(IPC.panelDock, panelId),
    onPopStateChanged: (cb: (info: { panelId: PoppablePanelId; popped: boolean }) => void) =>
      on<{ panelId: PoppablePanelId; popped: boolean }>(IPC.panelPopStateChanged, cb),
  },
  assistant: {
    ask: (question: string) => ipcRenderer.invoke(IPC.askClaude, question) as Promise<AssistantMessage>,
    screenshotAsk: (question: string) =>
      ipcRenderer.invoke(IPC.screenshotAsk, question) as Promise<AssistantMessage>,
    answerRecentQuestion: () => ipcRenderer.invoke(IPC.answerRecentQuestion) as Promise<AssistantMessage>,
    onEvent: (cb: (msg: AssistantMessage) => void) => on<AssistantMessage>(IPC.assistantEvent, cb),
  },
  transcription: {
    setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC.transcriptionEnable, enabled) as Promise<boolean>,
    getState: () => ipcRenderer.invoke(IPC.transcriptionGetState) as Promise<boolean>,
    onLine: (cb: (line: TranscriptLine) => void) => on<TranscriptLine>(IPC.transcriptEvent, cb),
    onHeartbeat: (cb: (info: AudioHeartbeat) => void) => on<AudioHeartbeat>(IPC.audioHeartbeat, cb),
  },
  diagnostics: {
    onEvent: (cb: (event: DiagnosticEvent) => void) => on<DiagnosticEvent>(IPC.diagnosticEvent, cb),
  },
  translation: {
    setEnabled: (enabled: boolean) => ipcRenderer.invoke(IPC.translationEnable, enabled) as Promise<boolean>,
    onUpdate: (cb: (line: TranscriptLine) => void) => on<TranscriptLine>(IPC.translationEvent, cb),
  },
  teleprompter: {
    get: () => ipcRenderer.invoke(IPC.teleprompterGet) as Promise<TeleprompterScript>,
    set: (script: TeleprompterScript) => ipcRenderer.invoke(IPC.teleprompterSet, script) as Promise<void>,
    onUpdate: (cb: (script: TeleprompterScript) => void) => on<TeleprompterScript>(IPC.teleprompterEvent, cb),
  },
  session: {
    getActive: () => ipcRenderer.invoke(IPC.sessionGetActive) as Promise<MeetingSession>,
    updateNotes: (notes: string) => ipcRenderer.invoke(IPC.sessionUpdateNotes, notes) as Promise<void>,
    newMeeting: () => ipcRenderer.invoke(IPC.sessionNewMeeting) as Promise<MeetingSession>,
    exportMarkdown: () => ipcRenderer.invoke(IPC.sessionExport) as Promise<string>,
    onNotesUpdate: (cb: (notes: string) => void) => on<string>(IPC.notesEvent, cb),
    onReset: (cb: (session: MeetingSession) => void) => on<MeetingSession>(IPC.sessionResetEvent, cb),
  },
  settings: {
    get: () => ipcRenderer.invoke(IPC.settingsGet) as Promise<AppSettings>,
    set: (partial: Partial<AppSettings>) => ipcRenderer.invoke(IPC.settingsSet, partial) as Promise<AppSettings>,
    openSetupWizard: () => ipcRenderer.send(IPC.setupOpenWindow),
  },
};

export type MeetingCopilotApi = typeof api;

contextBridge.exposeInMainWorld('meetingCopilot', api);
