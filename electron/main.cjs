// Electron main process: windows (one diagram per window), file access,
// workspace folder, native menu and the local image protocol.
const { app, BrowserWindow, Menu, dialog, ipcMain, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DEV_URL = process.env.VITE_DEV_SERVER_URL;
const DIAGRAM_EXT = ['.mmd', '.mermaid'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];

protocol.registerSchemesAsPrivileged([
  { scheme: 'mmd-asset', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

// ---------------------------------------------------------------- settings
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { workspace: null, bounds: null };
function loadSettings() {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
  } catch {
    /* first start */
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(settingsFile()), { recursive: true });
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
  } catch (e) {
    console.error('Einstellungen konnten nicht gespeichert werden', e);
  }
}

// ---------------------------------------------------------------- windows
/** @type {Map<number, {path: string|null, dirty: boolean, forceClose: boolean}>} */
const docs = new Map();

const samePath = (a, b) =>
  !!a && !!b && (process.platform === 'linux' ? a === b : path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase());

function findWindowFor(filePath) {
  for (const [id, doc] of docs) if (samePath(doc.path, filePath)) return BrowserWindow.fromId(id);
  return null;
}

function createWindow(filePath = null) {
  if (filePath) {
    const existing = findWindowFor(filePath);
    if (existing) {
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return existing;
    }
  }
  const focused = BrowserWindow.getFocusedWindow();
  const b = focused ? focused.getBounds() : settings.bounds;
  const win = new BrowserWindow({
    width: b?.width ?? 1440,
    height: b?.height ?? 900,
    x: focused ? b.x + 30 : b?.x,
    y: focused ? b.y + 30 : b?.y,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: '#f6f7f9',
    title: 'Mermaid Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  docs.set(win.id, { path: filePath, dirty: false, forceClose: false });
  const query = filePath ? { file: filePath } : {};
  if (DEV_URL) {
    const url = new URL(DEV_URL);
    if (filePath) url.searchParams.set('file', filePath);
    win.loadURL(url.toString());
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query });
  }
  win.once('ready-to-show', () => win.show());

  // links open in the browser, never inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('file:') && !(DEV_URL && url.startsWith(DEV_URL))) e.preventDefault();
  });

  const id = win.id;
  win.on('close', (e) => {
    settings.bounds = win.getBounds();
    saveSettings();
    const doc = docs.get(id);
    if (!doc || !doc.dirty || doc.forceClose) return;
    e.preventDefault();
    const name = doc.path ? path.basename(doc.path) : doc.title || 'Unbenannt';
    const choice = dialog.showMessageBoxSync(win, {
      type: 'warning',
      buttons: ['Speichern', 'Nicht speichern', 'Abbrechen'],
      defaultId: 0,
      cancelId: 2,
      message: `Änderungen an „${name}“ speichern?`,
      detail: 'Ungespeicherte Änderungen gehen sonst verloren.',
    });
    if (choice === 0) win.webContents.send('menu', 'save-and-close');
    else if (choice === 1) {
      doc.forceClose = true;
      win.close();
    }
  });
  win.on('closed', () => docs.delete(id));
  return win;
}

function updateTitle(win) {
  const doc = docs.get(win.id);
  if (!doc) return;
  const name = doc.path ? path.basename(doc.path) : doc.title || 'Unbenannt';
  win.setTitle(`${doc.dirty ? '● ' : ''}${name} — Mermaid Editor`);
  if (process.platform === 'darwin') {
    win.setRepresentedFilename(doc.path ?? '');
    win.setDocumentEdited(doc.dirty);
  }
}

const isDiagram = (p) => DIAGRAM_EXT.includes(path.extname(p).toLowerCase());

function filesFromArgv(argv) {
  return argv
    .slice(1)
    .filter((a) => !a.startsWith('-') && isDiagram(a))
    .map((a) => path.resolve(a))
    .filter((a) => fs.existsSync(a));
}

// ---------------------------------------------------------------- workspace
async function listDir(dir, depth = 0) {
  if (depth > 6) return [];
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out = [];
  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push({ type: 'dir', name: e.name, path: full, children: await listDir(full, depth + 1) });
    else if (isDiagram(e.name)) out.push({ type: 'file', name: e.name, path: full });
  }
  return out.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'de') : a.type === 'dir' ? -1 : 1));
}

let watcher = null;
let watchTimer = null;
function watchWorkspace() {
  watcher?.close();
  watcher = null;
  if (!settings.workspace) return;
  try {
    watcher = fs.watch(settings.workspace, { recursive: true }, () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(broadcastWorkspace, 300);
    });
    watcher.on('error', () => {});
  } catch {
    /* recursive watch unsupported – the sidebar still has a refresh button */
  }
}
function broadcastWorkspace() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('workspace-changed', settings.workspace);
}

async function chooseWorkspace(win) {
  const r = await dialog.showOpenDialog(win, {
    title: 'Arbeitsordner wählen',
    properties: ['openDirectory', 'createDirectory'],
    defaultPath: settings.workspace ?? app.getPath('documents'),
  });
  if (r.canceled || !r.filePaths[0]) return settings.workspace;
  settings.workspace = r.filePaths[0];
  saveSettings();
  watchWorkspace();
  broadcastWorkspace();
  return settings.workspace;
}

// ---------------------------------------------------------------- IPC
const winOf = (e) => BrowserWindow.fromWebContents(e.sender);
const diagramFilters = [
  { name: 'Mermaid', extensions: ['mmd', 'mermaid'] },
  { name: 'Alle Dateien', extensions: ['*'] },
];

ipcMain.handle('file:read', (_e, p) => fsp.readFile(p, 'utf8'));
ipcMain.handle('file:write', async (_e, p, content) => {
  await fsp.writeFile(p, content, 'utf8');
  app.addRecentDocument(p);
});
ipcMain.handle('file:rename', async (e, p, newName) => {
  const ext = path.extname(p) || '.mmd';
  const target = path.join(path.dirname(p), newName + ext);
  if (samePath(target, p) && path.basename(target) === path.basename(p)) return p;
  // case-only renames on Windows/macOS hit the same file, which is fine
  if (fs.existsSync(target) && !samePath(target, p)) throw new Error(`„${newName}${ext}“ existiert bereits`);
  await fsp.rename(p, target);
  const win = winOf(e);
  const doc = docs.get(win.id);
  if (doc) doc.path = target;
  updateTitle(win);
  broadcastWorkspace();
  return target;
});
ipcMain.handle('dialog:open', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Diagramm öffnen',
    properties: ['openFile', 'multiSelections'],
    defaultPath: settings.workspace ?? undefined,
    filters: diagramFilters,
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('dialog:save', async (e, defaultName) => {
  const doc = docs.get(winOf(e).id);
  const base = doc?.path ? path.dirname(doc.path) : settings.workspace ?? app.getPath('documents');
  const r = await dialog.showSaveDialog(winOf(e), {
    title: 'Diagramm speichern',
    defaultPath: path.join(base, defaultName || 'diagramm.mmd'),
    filters: diagramFilters,
  });
  return r.canceled ? null : r.filePath;
});
ipcMain.handle('export:save', async (e, defaultName, data, ext) => {
  const doc = docs.get(winOf(e).id);
  const base = doc?.path ? path.dirname(doc.path) : settings.workspace ?? app.getPath('documents');
  const r = await dialog.showSaveDialog(winOf(e), {
    title: 'Exportieren',
    defaultPath: path.join(base, defaultName),
    filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
  });
  if (r.canceled || !r.filePath) return null;
  await fsp.writeFile(r.filePath, typeof data === 'string' ? data : Buffer.from(data));
  return r.filePath;
});
ipcMain.handle('image:pick', async (e) => {
  const r = await dialog.showOpenDialog(winOf(e), {
    title: 'Bild einfügen',
    properties: ['openFile'],
    filters: [{ name: 'Bilder', extensions: IMAGE_EXT.map((x) => x.slice(1)) }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const img = r.filePaths[0];
  const doc = docs.get(winOf(e).id);
  // relative to the diagram file when possible – keeps folders portable
  if (doc?.path) {
    const rel = path.relative(path.dirname(doc.path), img);
    if (!rel.startsWith('..' + path.sep + '..') && !path.isAbsolute(rel)) return rel.split(path.sep).join('/');
  }
  return img.split(path.sep).join('/');
});
ipcMain.handle('window:open', (_e, p) => {
  createWindow(p ?? null);
});
ipcMain.handle('window:close-confirmed', (e) => {
  const win = winOf(e);
  const doc = docs.get(win.id);
  if (doc) doc.forceClose = true;
  win.close();
});
ipcMain.on('doc:state', (e, state) => {
  const win = winOf(e);
  const doc = docs.get(win.id);
  if (!doc) return;
  doc.path = state.path;
  doc.dirty = state.dirty;
  doc.title = state.title ?? null;
  updateTitle(win);
});
ipcMain.handle('doc:is-open-elsewhere', (e, p) => {
  const w = findWindowFor(p);
  return !!w && w.id !== winOf(e).id;
});
ipcMain.handle('workspace:get', () => settings.workspace);
ipcMain.handle('workspace:choose', (e) => chooseWorkspace(winOf(e)));
ipcMain.handle('workspace:list', async () => (settings.workspace ? listDir(settings.workspace) : []));
ipcMain.handle('workspace:create-file', async (_e, dir, name) => {
  let file = name.trim();
  if (!isDiagram(file)) file += '.mmd';
  const full = path.join(dir || settings.workspace, file);
  if (fs.existsSync(full)) throw new Error(`„${file}“ existiert bereits`);
  await fsp.writeFile(full, 'flowchart TD\n', 'utf8');
  broadcastWorkspace();
  return full;
});
ipcMain.handle('workspace:create-folder', async (_e, dir, name) => {
  const full = path.join(dir || settings.workspace, name.trim());
  await fsp.mkdir(full, { recursive: true });
  broadcastWorkspace();
  return full;
});
ipcMain.handle('shell:reveal', (_e, p) => shell.showItemInFolder(p));

// ---------------------------------------------------------------- menu
function send(action) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) win.webContents.send('menu', action);
  else if (action === 'new') createWindow();
}
// Shortcuts are handled in the page (so the code editor keeps its own undo etc.)
const item = (label, action, accelerator) => ({ label, accelerator, registerAccelerator: false, click: () => send(action) });

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'Datei',
      submenu: [
        { label: 'Neues Fenster', accelerator: 'CmdOrCtrl+N', click: () => createWindow() },
        item('Öffnen …', 'open', 'CmdOrCtrl+O'),
        { label: 'Zuletzt geöffnet', role: 'recentDocuments', submenu: [{ role: 'clearRecentDocuments', label: 'Liste leeren' }] },
        { label: 'Arbeitsordner wählen …', click: () => chooseWorkspace(BrowserWindow.getFocusedWindow()) },
        { type: 'separator' },
        item('Speichern', 'save', 'CmdOrCtrl+S'),
        item('Speichern unter …', 'save-as', 'CmdOrCtrl+Shift+S'),
        { type: 'separator' },
        item('Als SVG exportieren …', 'export-svg'),
        item('Als PNG exportieren …', 'export-png', 'CmdOrCtrl+E'),
        item('Mermaid-Code kopieren', 'copy-code', 'CmdOrCtrl+Shift+C'),
        { type: 'separator' },
        isMac ? { role: 'close', label: 'Fenster schließen' } : { role: 'quit', label: 'Beenden' },
      ],
    },
    {
      label: 'Bearbeiten',
      submenu: [
        item('Rückgängig', 'undo', 'CmdOrCtrl+Z'),
        item('Wiederholen', 'redo', 'CmdOrCtrl+Y'),
        { type: 'separator' },
        { role: 'cut', label: 'Ausschneiden' },
        { role: 'copy', label: 'Kopieren' },
        { role: 'paste', label: 'Einfügen' },
        item('Duplizieren', 'duplicate', 'CmdOrCtrl+D'),
        item('Alles auswählen', 'select-all', 'CmdOrCtrl+A'),
      ],
    },
    {
      label: 'Ansicht',
      submenu: [
        item('Automatisch anordnen', 'layout', 'CmdOrCtrl+L'),
        item('Alles einpassen', 'fit', 'Shift+1'),
        { type: 'separator' },
        item('Seitenleiste ein/aus', 'toggle-sidebar', 'CmdOrCtrl+B'),
        item('Code-Panel ein/aus', 'toggle-code', 'CmdOrCtrl+J'),
        { type: 'separator' },
        { role: 'reload', label: 'Neu laden' },
        { role: 'toggleDevTools', label: 'Entwicklertools' },
        { role: 'togglefullscreen', label: 'Vollbild' },
      ],
    },
    {
      label: 'Hilfe',
      submenu: [
        { label: 'Mermaid-Dokumentation (Flowchart)', click: () => shell.openExternal('https://mermaid.js.org/syntax/flowchart.html') },
        item('Tastenkürzel', 'shortcuts'),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- app lifecycle
const pendingOpen = [];
app.on('open-file', (e, p) => {
  // macOS: double click in Finder
  e.preventDefault();
  if (app.isReady()) createWindow(p);
  else pendingOpen.push(p);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_e, argv) => {
    const files = filesFromArgv(argv);
    if (files.length) files.forEach((f) => createWindow(f));
    else createWindow();
  });

  app.whenReady().then(() => {
    loadSettings();
    protocol.handle('mmd-asset', (req) => {
      const p = decodeURIComponent(new URL(req.url).pathname.slice(1));
      if (!IMAGE_EXT.includes(path.extname(p).toLowerCase())) return new Response('forbidden', { status: 403 });
      return net.fetch(pathToFileURL(p).toString());
    });
    buildMenu();
    watchWorkspace();
    const files = [...pendingOpen, ...filesFromArgv(process.argv)];
    if (files.length) files.forEach((f) => createWindow(f));
    else createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
