import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc-channels';

const api = {
  sendChunk: (speaker: 'you' | 'others', pcm: ArrayBufferLike) => {
    // structured-clone friendly: ipcRenderer will copy the ArrayBuffer to main.
    ipcRenderer.send(IPC.audioChunk, { speaker, pcm });
  },
  onStart: (cb: () => void) => {
    const handler = (_e: IpcRendererEvent) => cb();
    ipcRenderer.on(IPC.audioCaptureStart, handler);
    return () => ipcRenderer.removeListener(IPC.audioCaptureStart, handler);
  },
  onStop: (cb: () => void) => {
    const handler = (_e: IpcRendererEvent) => cb();
    ipcRenderer.on(IPC.audioCaptureStop, handler);
    return () => ipcRenderer.removeListener(IPC.audioCaptureStop, handler);
  },
  onFlushNow: (cb: () => void) => {
    const handler = (_e: IpcRendererEvent) => cb();
    ipcRenderer.on(IPC.audioFlushNow, handler);
    return () => ipcRenderer.removeListener(IPC.audioFlushNow, handler);
  },
  reportDiagnostic: (level: 'info' | 'error', source: 'you' | 'others', message: string) => {
    ipcRenderer.send(IPC.audioCaptureError, { level, source, message });
  },
};

export type AudioCaptureApi = typeof api;

contextBridge.exposeInMainWorld('audioCapture', api);
