import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { IPC } from '../shared/ipc-channels';

const api = {
  getDesktopSourceId: () => ipcRenderer.invoke(IPC.audioGetDesktopSourceId) as Promise<string>,
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
  reportError: (source: 'you' | 'others', message: string) => {
    ipcRenderer.send(IPC.audioCaptureError, { source, message });
  },
};

export type AudioCaptureApi = typeof api;

contextBridge.exposeInMainWorld('audioCapture', api);
