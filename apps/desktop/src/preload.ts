/**
 * Puente mínimo y seguro entre la interfaz y el sistema (contextIsolation + sandbox).
 * Solo expone funciones concretas; la interfaz no tiene acceso a Node.js.
 */
import { contextBridge, ipcRenderer, webUtils } from 'electron';

function arg(name: string): string {
  const prefix = `--${name}=`;
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length) ?? '';
}

contextBridge.exposeInMainWorld('l10n', {
  isDesktop: true,
  platform: process.platform,
  appVersion: arg('l10n-version'),
  chooseDirectory: (options?: { title?: string; defaultPath?: string }) =>
    ipcRenderer.invoke('dialog:choose-directory', options ?? {}),
  chooseFile: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) =>
    ipcRenderer.invoke('dialog:choose-file', options ?? {}),
  openPath: (path: string) => ipcRenderer.invoke('shell:open-path', path),
  showItemInFolder: (path: string) => ipcRenderer.invoke('shell:show-item', path),
  notify: (title: string, body: string) => ipcRenderer.invoke('app:notify', title, body),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  reload: () => ipcRenderer.invoke('app:reload'),
  onEngineStatus: (callback: (status: string) => void) => {
    const listener = (_event: unknown, status: string) => callback(status);
    ipcRenderer.on('engine:status', listener);
    return () => ipcRenderer.removeListener('engine:status', listener);
  },
});
