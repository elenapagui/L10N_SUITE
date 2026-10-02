import { app, Menu, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

export function buildMenu(getWindow: () => BrowserWindow | null, dataDir: string): void {
  const isMac = process.platform === 'darwin';
  const go = (hash: string) => {
    const win = getWindow();
    if (win) void win.webContents.executeJavaScript(`location.hash = ${JSON.stringify(hash)}`);
  };

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: 'about', label: `Acerca de ${app.name}` },
              { type: 'separator' },
              { label: 'Ajustes…', accelerator: 'Cmd+,', click: () => go('#/ajustes') },
              { type: 'separator' },
              { role: 'hide', label: `Ocultar ${app.name}` },
              { role: 'hideOthers', label: 'Ocultar otras' },
              { role: 'unhide', label: 'Mostrar todo' },
              { type: 'separator' },
              { role: 'quit', label: `Salir de ${app.name}` },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Buscar o ir a…',
          accelerator: 'CmdOrCtrl+K',
          click: () =>
            void getWindow()?.webContents.executeJavaScript(
              "window.dispatchEvent(new CustomEvent('l10n:command-palette'))",
            ),
        },
        { label: 'Copias de seguridad', click: () => go('#/ajustes?tab=copias') },
        ...(isMac
          ? []
          : ([
              { label: 'Ajustes', accelerator: 'Ctrl+,', click: () => go('#/ajustes') },
            ] as MenuItemConstructorOptions[])),
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Cerrar ventana' } : { role: 'quit', label: 'Salir' },
      ],
    },
    {
      label: 'Edición',
      submenu: [
        { role: 'undo', label: 'Deshacer' },
        { role: 'redo', label: 'Rehacer' },
        { type: 'separator' },
        { role: 'cut', label: 'Cortar' },
        { role: 'copy', label: 'Copiar' },
        { role: 'paste', label: 'Pegar' },
        { role: 'pasteAndMatchStyle', label: 'Pegar sin formato' },
        { role: 'selectAll', label: 'Seleccionar todo' },
      ],
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload', label: 'Recargar' },
        { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Tamaño real' },
        { role: 'zoomIn', label: 'Ampliar' },
        { role: 'zoomOut', label: 'Reducir' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Pantalla completa' },
      ],
    },
    {
      label: 'Ventana',
      submenu: [
        { role: 'minimize', label: 'Minimizar' },
        { role: 'zoom', label: 'Zoom' },
        ...(isMac
          ? ([
              { type: 'separator' },
              { role: 'front', label: 'Traer todo al frente' },
            ] as MenuItemConstructorOptions[])
          : []),
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Abrir carpeta de datos', click: () => void shell.openPath(dataDir) },
        {
          label: 'Abrir carpeta de registros',
          click: () => void shell.openPath(`${dataDir}/logs`),
        },
        ...(isMac
          ? []
          : ([{ role: 'about', label: `Acerca de ${app.name}` }] as MenuItemConstructorOptions[])),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
