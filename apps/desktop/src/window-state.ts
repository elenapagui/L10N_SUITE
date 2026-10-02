import fs from 'node:fs';
import path from 'node:path';
import { screen, type BrowserWindow, type Rectangle } from 'electron';

interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

const DEFAULT: WindowState = { bounds: { x: 0, y: 0, width: 1360, height: 860 }, maximized: false };

export function loadWindowState(dir: string): WindowState & { hasPosition: boolean } {
  try {
    const state = JSON.parse(
      fs.readFileSync(path.join(dir, 'ventana.json'), 'utf8'),
    ) as WindowState;
    // Si la ventana quedó en una pantalla que ya no está conectada, se centra en la principal.
    const display = screen.getDisplayMatching(state.bounds);
    const area = display.workArea;
    const visible =
      state.bounds.x < area.x + area.width - 50 &&
      state.bounds.y < area.y + area.height - 50 &&
      state.bounds.x + state.bounds.width > area.x + 50 &&
      state.bounds.y > area.y - 10;
    if (!visible) return { ...DEFAULT, hasPosition: false };
    return { ...state, hasPosition: true };
  } catch {
    return { ...DEFAULT, hasPosition: false };
  }
}

export function trackWindowState(win: BrowserWindow, dir: string): void {
  const save = () => {
    if (win.isDestroyed()) return;
    const state: WindowState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    try {
      fs.writeFileSync(path.join(dir, 'ventana.json'), JSON.stringify(state));
    } catch {
      // No es grave: la próxima vez se abrirá con el tamaño por defecto.
    }
  };
  win.on('close', save);
}
