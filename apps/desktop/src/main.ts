import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  nativeTheme,
  Notification,
  session,
  shell,
} from 'electron';
import { APP_ORIGIN, handleAppProtocol, registerAppScheme } from './bridge';
import { EngineHost } from './engine-host';
import { buildMenu } from './menu';
import { EXECUTABLE_EXTENSIONS, isInside } from './paths';
import type { EngineStatus } from './protocol';
import { loadWindowState, trackWindowState } from './window-state';

const SELFTEST = process.argv.includes('--selftest');
const appRoot = path.resolve(__dirname, '..');
const webDir = path.join(appRoot, 'web');
const migrationsDir = path.join(appRoot, 'migrations');

if (process.env.L10N_DISABLE_GPU === '1') app.disableHardwareAcceleration();

// Interfaz de Chromium en español (formato de fechas de los campos, diálogos, corrector…).
app.commandLine.appendSwitch('lang', 'es');
registerAppScheme();

if (!SELFTEST && !app.requestSingleInstanceLock()) {
  // Ya hay una ventana abierta: se enfoca esa en lugar de abrir otra sobre los mismos datos.
  app.quit();
}

const dataDir = SELFTEST
  ? fs.mkdtempSync(path.join(os.tmpdir(), 'l10n-autocomprobacion-'))
  : app.getPath('userData');
fs.mkdirSync(path.join(dataDir, 'logs'), { recursive: true });
const mainLog = path.join(dataDir, 'logs', 'app.log');

function log(message: string) {
  const line = `${new Date().toISOString()} ${message}\n`;
  try {
    fs.appendFileSync(mainLog, line);
  } catch {
    // Sin registro en disco.
  }
  if (SELFTEST || !app.isPackaged) process.stdout.write(line);
  // En la integración continua, el registro de la autocomprobación se guarda donde se indique.
  if (SELFTEST && process.env.L10N_SELFTEST_LOG) {
    try {
      fs.appendFileSync(process.env.L10N_SELFTEST_LOG, line);
    } catch {
      // Sin registro adicional.
    }
  }
}

let mainWindow: BrowserWindow | null = null;

function broadcastEngineStatus(status: EngineStatus) {
  log(`[app] estado del motor: ${status}`);
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('engine:status', status);
}

const engine = new EngineHost(
  path.join(__dirname, 'engine.cjs'),
  {
    L10N_DATA_DIR: dataDir,
    L10N_MIGRATIONS_DIR: migrationsDir,
    L10N_APP_VERSION: app.getVersion(),
    L10N_AUTO_BACKUP: SELFTEST ? '0' : '1',
  },
  broadcastEngineStatus,
  log,
);

function createWindow(): BrowserWindow {
  const state = loadWindowState(dataDir);
  const win = new BrowserWindow({
    ...(state.hasPosition
      ? state.bounds
      : { width: state.bounds.width, height: state.bounds.height }),
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'L10N Suite',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1b1c22' : '#fcfcfd',
    autoHideMenuBar: process.platform !== 'darwin',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: [`--l10n-version=${app.getVersion()}`],
    },
  });
  if (state.maximized) win.maximize();
  trackWindowState(win, dataDir);

  // Los enlaces externos se abren en el navegador; la ventana nunca sale de la app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(APP_ORIGIN)) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.on('render-process-gone', (_e, details) => {
    log(`[app] la interfaz se ha cerrado inesperadamente: ${details.reason}`);
    if (details.reason !== 'clean-exit' && !win.isDestroyed()) win.reload();
  });

  win.once('ready-to-show', () => {
    if (!SELFTEST || process.argv.some((a) => a.startsWith('--screenshot='))) win.show();
  });
  void win.loadURL(`${APP_ORIGIN}/index.html`);
  return win;
}

function registerIpc() {
  ipcMain.handle(
    'dialog:choose-directory',
    async (_e, options: { title?: string; defaultPath?: string }) => {
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
      const result = await dialog.showOpenDialog(win!, {
        title: options.title,
        defaultPath: options.defaultPath,
        properties: ['openDirectory', 'createDirectory'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );

  ipcMain.handle(
    'dialog:choose-file',
    async (_e, options: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow;
      const result = await dialog.showOpenDialog(win!, {
        title: options.title,
        filters: options.filters,
        properties: ['openFile'],
      });
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
  );

  // Abrir carpetas, o archivos de la carpeta de datos. Los ejecutables nunca se abren directamente.
  ipcMain.handle('shell:open-path', async (_e, target: string) => {
    if (typeof target !== 'string' || target === '') return 'Ruta no válida';
    let stat: fs.Stats;
    try {
      stat = fs.statSync(target);
    } catch {
      return 'No se encuentra el archivo o la carpeta.';
    }
    if (!stat.isDirectory()) {
      const ext = path.extname(target).toLowerCase();
      if (!isInside(dataDir, target) || EXECUTABLE_EXTENSIONS.has(ext)) {
        shell.showItemInFolder(target);
        return '';
      }
    }
    return shell.openPath(target);
  });

  ipcMain.handle('shell:show-item', async (_e, target: string) => {
    if (typeof target === 'string' && target !== '') shell.showItemInFolder(target);
  });

  ipcMain.handle('app:notify', async (_e, title: string, body: string) => {
    if (Notification.isSupported())
      new Notification({ title: String(title), body: String(body) }).show();
  });

  ipcMain.handle('app:reload', async (e) => {
    BrowserWindow.fromWebContents(e.sender)?.reload();
  });
}

/** Autocomprobación de la app empaquetada: arranca, migra, hace una copia y carga la interfaz. */
async function runSelfTest(win: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 90_000;
  const evaluate = <T>(code: string) => win.webContents.executeJavaScript(code, true) as Promise<T>;
  try {
    await engine.waitReady(60_000);
    log('[autocomprobación] motor listo');
    while (Date.now() < deadline) {
      const ready = await evaluate<boolean>(
        'Boolean(document.querySelector(\'[data-app-ready="true"]\'))',
      ).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    const result = await evaluate<{
      info: { integrity: string; schemaVersion: number };
      backupStatus: number;
    }>(`
      (async () => {
        const info = await fetch('./api/app-info').then((r) => r.json());
        const backup = await fetch('./api/backups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
        return { info, backupStatus: backup.status };
      })()
    `);
    log(`[autocomprobación] ${JSON.stringify(result)}`);
    const title = await evaluate<string>('document.title');
    const uiReady = await evaluate<boolean>(
      'Boolean(document.querySelector(\'[data-app-ready="true"]\'))',
    );
    if (
      result.info.integrity !== 'ok' ||
      result.info.schemaVersion < 1 ||
      result.backupStatus !== 201 ||
      !uiReady
    ) {
      throw new Error(`Comprobación fallida (interfaz cargada: ${uiReady}, título: ${title})`);
    }
    const shotArg = process.argv.find((a) => a.startsWith('--screenshot='));
    if (shotArg) {
      await new Promise((r) => setTimeout(r, 800));
      try {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(shotArg.slice('--screenshot='.length), image.toPNG());
      } catch (error) {
        log(`[autocomprobación] no se ha podido capturar la ventana: ${(error as Error).message}`);
      }
    }
    log('[autocomprobación] CORRECTA');
    await engine.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
    app.exit(0);
  } catch (error) {
    log(`[autocomprobación] FALLIDA: ${(error as Error).message} ${engine.lastFatal ?? ''}`);
    await engine.stop().catch(() => undefined);
    app.exit(1);
  }
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || SELFTEST) return;
  event.preventDefault();
  quitting = true;
  for (const win of BrowserWindow.getAllWindows()) win.hide();
  log('[app] cerrando: copia al cerrar y cierre de la base de datos');
  void engine.stop().finally(() => app.quit());
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin' || SELFTEST) app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
});

process.on('uncaughtException', (error) =>
  log(`[app] excepción no controlada: ${error.stack ?? error.message}`),
);

void app.whenReady().then(() => {
  log(`[app] L10N Suite ${app.getVersion()} — datos en ${dataDir}`);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === 'clipboard-sanitized-write' || permission === 'notifications');
  });
  if (process.platform !== 'darwin') {
    session.defaultSession.setSpellCheckerLanguages(['es-ES', 'en-US']);
  }
  registerIpc();
  engine.start();
  handleAppProtocol(engine, webDir);
  buildMenu(() => mainWindow, dataDir);
  mainWindow = createWindow();
  if (SELFTEST) void runSelfTest(mainWindow);
});
