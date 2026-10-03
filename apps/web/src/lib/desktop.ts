/** Funciones nativas que expone la app de escritorio (preload). En el navegador no existen. */
export interface DesktopBridge {
  isDesktop: true;
  platform: 'win32' | 'darwin' | 'linux';
  appVersion: string;
  chooseDirectory(options?: { title?: string; defaultPath?: string }): Promise<string | null>;
  chooseFile(options?: {
    title?: string;
    filters?: { name: string; extensions: string[] }[];
  }): Promise<string | null>;
  openPath(path: string): Promise<string>;
  showItemInFolder(path: string): Promise<void>;
  notify(title: string, body: string): Promise<void>;
  getPathForFile(file: File): string;
  onEngineStatus(callback: (status: 'ready' | 'restarting' | 'failed') => void): () => void;
  reload(): Promise<void>;
  /** Desde la v0.3.1 (opcionales por si la interfaz y la app no coinciden). */
  getEngineStatus?(): Promise<'ready' | 'restarting' | 'failed'>;
  retryEngine?(): Promise<void>;
  onClosing?(callback: () => void): () => void;
}

declare global {
  interface Window {
    l10n?: DesktopBridge;
  }
}

export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' ? (window.l10n ?? null) : null;

export const isMac =
  typeof navigator !== 'undefined' &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

export const modKey = isMac ? '⌘' : 'Ctrl';
