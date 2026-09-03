import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc-channels';
import type { RequirementStatus } from '../main/services/requirements';

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_event: IpcRendererEvent, payload: T) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

export interface SetupProgress {
  item: 'whisper-binary' | 'whisper-model';
  received: number;
  total: number;
}

const api = {
  checkAll: () => ipcRenderer.invoke(IPC.setupCheckAll) as Promise<RequirementStatus[]>,
  installClaudeCli: () => ipcRenderer.invoke(IPC.setupInstallClaudeCli) as Promise<{ ok: boolean; error?: string }>,
  openClaudeLogin: () => ipcRenderer.invoke(IPC.setupOpenClaudeLogin) as Promise<void>,
  downloadWhisperBinary: () =>
    ipcRenderer.invoke(IPC.setupDownloadWhisperBinary) as Promise<{ ok: boolean; path?: string; error?: string }>,
  downloadWhisperModel: (modelName: 'tiny' | 'base' | 'small' | 'medium') =>
    ipcRenderer.invoke(IPC.setupDownloadWhisperModel, modelName) as Promise<{ ok: boolean; path?: string; error?: string }>,
  finish: () => ipcRenderer.invoke(IPC.setupFinish) as Promise<void>,
  onProgress: (cb: (progress: SetupProgress) => void) => on<SetupProgress>(IPC.setupProgress, cb),
  onLog: (cb: (line: string) => void) => on<string>(IPC.setupLog, cb),
};

export type SetupApi = typeof api;

contextBridge.exposeInMainWorld('meetingCopilotSetup', api);
