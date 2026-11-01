// File-level actions shared by the toolbar, menu and keyboard shortcuts.
import { useStore } from './store';
import { baseName, desktop, dirName, download, pickTextFile } from './desktop';
import { generate } from './mermaid/generate';
import { exportPng, exportSvg } from './mermaid/render';
import { cloudEnabled } from './cloud/client';
import { useAuth } from './cloud/auth';
import * as cloud from './cloud/diagrams';

/** Characters Windows does not allow in file names */
export const cleanFileName = (name: string) =>
  name
    .replace(/\.(mmd|mermaid)$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .trim()
    .replace(/[. ]+$/, '');

/** Display name of the document, without extension. */
export const docName = () => {
  const { filePath, title } = useStore.getState();
  if (filePath) return baseName(filePath).replace(/\.(mmd|mermaid)$/i, '');
  return title || 'Unbenannt';
};

const fileBase = () => {
  const { filePath, title } = useStore.getState();
  return (filePath || title ? cleanFileName(docName()) : '') || 'diagramm';
};

/** Rename the document: renames the file on disk if it was saved already. */
export async function rename(raw: string): Promise<void> {
  const name = cleanFileName(raw);
  const s = useStore.getState();
  if (!name || name === docName()) return;
  if (s.cloudId) return renameCloud(name);
  if (desktop && s.filePath) {
    try {
      const p = await desktop.renameFile(s.filePath, name);
      useStore.setState({ filePath: p });
    } catch (e) {
      s.showToast((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  } else s.setTitle(name);
}

/** Apply pending code edits before saving/exporting. */
function flushCode() {
  const s = useStore.getState();
  if (s.codeDirty && !s.applyCode()) {
    s.showToast('Der Code enthält Fehler – verwendet wird der Stand der Leinwand.');
  }
}

/** Web only: cloud storage is available when Supabase is set up and someone is signed in. */
const cloudReady = () => !desktop && cloudEnabled && !!useAuth.getState().session;

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// Cloud saves run one after another, so autosave and Ctrl+S never use the same version twice.
let cloudQueue: Promise<unknown> = Promise.resolve();
const inCloudQueue = <T>(job: () => Promise<T>): Promise<T> => {
  const run = cloudQueue.then(job, job);
  cloudQueue = run.catch(() => undefined);
  return run;
};

/** Mark the diagram as saved, unless it was edited while the request was running. */
function markCloudSaved(version: number, savedDiagram: unknown) {
  const s = useStore.getState();
  useStore.setState({ cloudVersion: version, dirty: s.dirty && s.diagram !== savedDiagram });
}

function saveCloud(): Promise<boolean> {
  return inCloudQueue(async () => {
    const s = useStore.getState();
    if (!s.cloudId) return false;
    if (!useAuth.getState().session) {
      s.showToast('Zum Speichern in der Cloud bitte anmelden.');
      return false;
    }
    if (s.conflict) return false;
    if (!s.dirty) return true;
    const snapshot = s.diagram;
    try {
      markCloudSaved(await cloud.saveDiagram(s.cloudId, s.cloudVersion, { content: s.fileContent() }), snapshot);
      return true;
    } catch (e) {
      if (e instanceof cloud.ConflictError) useStore.setState({ conflict: true });
      else s.showToast(`Speichern fehlgeschlagen: ${errorMessage(e)}`);
      return false;
    }
  });
}

/** First save of a new diagram while signed in: creates it in the cloud. */
async function createCloud(): Promise<boolean> {
  const s = useStore.getState();
  const snapshot = s.diagram;
  try {
    const d = await cloud.createDiagram(s.title ?? 'Unbenannt', s.fileContent());
    useStore.setState({ cloudId: d.id, cloudVersion: d.version, conflict: false, title: d.name });
    markCloudSaved(d.version, snapshot);
    s.showToast('In der Cloud gespeichert');
    return true;
  } catch (e) {
    s.showToast(`Speichern fehlgeschlagen: ${errorMessage(e)}`);
    return false;
  }
}

function renameCloud(name: string): Promise<void> {
  return inCloudQueue(async () => {
    const s = useStore.getState();
    if (!s.cloudId) return;
    try {
      const version = await cloud.saveDiagram(s.cloudId, s.cloudVersion, { name });
      useStore.setState({ cloudVersion: version, title: name });
    } catch (e) {
      if (e instanceof cloud.ConflictError) useStore.setState({ conflict: true });
      else s.showToast(`Umbenennen fehlgeschlagen: ${errorMessage(e)}`);
    }
  });
}

export async function save(): Promise<boolean> {
  flushCode();
  const s = useStore.getState();
  if (s.cloudId) return saveCloud();
  if (!desktop) {
    if (cloudReady()) return createCloud();
    download(`${fileBase()}.mmd`, s.fileContent());
    s.markSaved(null);
    return true;
  }
  if (!s.filePath) return saveAs();
  await desktop.writeFile(s.filePath, s.fileContent());
  s.markSaved(s.filePath);
  return true;
}

/** Save as a .mmd file (in the browser: download). */
export async function saveAs(): Promise<boolean> {
  flushCode();
  const s = useStore.getState();
  if (!desktop) {
    download(`${fileBase()}.mmd`, s.fileContent());
    // a download does not save a cloud diagram
    if (!s.cloudId) s.markSaved(null);
    return true;
  }
  const p = await desktop.showSave(`${fileBase()}.mmd`);
  if (!p) return false;
  await desktop.writeFile(p, s.fileContent());
  s.markSaved(p);
  return true;
}

/** Show a diagram from the cloud, after asking when the current one has unsaved changes. */
export async function openCloudDiagram(id: string) {
  const s = useStore.getState();
  if (s.cloudId === id) return;
  if (s.dirty && !window.confirm('Die aktuellen Änderungen sind noch nicht gespeichert. Trotzdem wechseln?')) return;
  try {
    useStore.getState().openCloud(await cloud.loadDiagram(id));
  } catch (e) {
    s.showToast(`Diagramm konnte nicht geöffnet werden: ${errorMessage(e)}`);
  }
}

/** Resolve a save conflict: keep my version, take theirs, or keep both. */
export async function resolveConflict(choice: 'overwrite' | 'reload' | 'copy') {
  const s = useStore.getState();
  if (!s.cloudId) return useStore.setState({ conflict: false });
  try {
    if (choice === 'reload') {
      s.openCloud(await cloud.loadDiagram(s.cloudId));
    } else if (choice === 'overwrite') {
      const latest = await cloud.loadDiagram(s.cloudId);
      const snapshot = s.diagram;
      const version = await cloud.saveDiagram(s.cloudId, latest.version, { content: s.fileContent() });
      useStore.setState({ conflict: false });
      markCloudSaved(version, snapshot);
    } else {
      const snapshot = s.diagram;
      const d = await cloud.createDiagram(`${docName()} (Kopie)`, s.fileContent());
      useStore.setState({ cloudId: d.id, cloudVersion: d.version, title: d.name, conflict: false });
      markCloudSaved(d.version, snapshot);
      s.showToast('Als Kopie gespeichert');
    }
  } catch (e) {
    s.showToast(`Das hat nicht geklappt: ${errorMessage(e)}`);
  }
}

/** Can this window show another file instead of opening a new one? */
function windowIsDisposable() {
  const s = useStore.getState();
  return !s.filePath && !s.dirty && !s.title;
}

export async function openPath(p: string) {
  const s = useStore.getState();
  if (!desktop || s.filePath === p) return;
  if (windowIsDisposable() && !(await desktop.isOpenElsewhere(p))) {
    try {
      s.load(await desktop.readFile(p), p);
    } catch (e) {
      s.showToast(`Datei konnte nicht geöffnet werden: ${(e as Error).message}`);
    }
  } else {
    await desktop.openWindow(p);
  }
}

export async function open() {
  if (!desktop) {
    const f = await pickTextFile();
    if (f) useStore.getState().load(f.text, null);
    return;
  }
  const paths = await desktop.showOpen();
  for (const p of paths) await openPath(p);
}

export function newWindow() {
  if (desktop) desktop.openWindow(null);
  else useStore.getState().newDiagram();
}

export async function copyCode() {
  flushCode();
  await navigator.clipboard.writeText(generate(useStore.getState().diagram));
  useStore.getState().showToast('Mermaid-Code kopiert');
}

export async function doExportSvg() {
  flushCode();
  const s = useStore.getState();
  try {
    const svg = await exportSvg(s.diagram, s.filePath);
    if (desktop) {
      const p = await desktop.saveExport(`${fileBase()}.svg`, svg, 'svg');
      if (p) s.showToast(`Exportiert: ${baseName(p)}`);
    } else download(`${fileBase()}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
  } catch (e) {
    s.showToast(`Export fehlgeschlagen: ${(e as Error).message}`);
  }
}

export async function doExportPng() {
  flushCode();
  const s = useStore.getState();
  try {
    const blob = await exportPng(s.diagram, s.filePath);
    if (desktop) {
      const p = await desktop.saveExport(`${fileBase()}.png`, await blob.arrayBuffer(), 'png');
      if (p) s.showToast(`Exportiert: ${baseName(p)}`);
    } else download(`${fileBase()}.png`, blob);
  } catch (e) {
    s.showToast(`Export fehlgeschlagen: ${(e as Error).message}`);
  }
}

/** Store image paths relative to the diagram file when they live below it. */
export function imageRef(absPath: string): string {
  const p = absPath.replace(/\\/g, '/');
  const doc = useStore.getState().filePath;
  if (doc) {
    const dir = dirName(doc).replace(/\\/g, '/') + '/';
    if (p.toLowerCase().startsWith(dir.toLowerCase())) return p.slice(dir.length);
  }
  return p;
}

export async function insertImage(pos: { x: number; y: number }, parent?: string) {
  const s = useStore.getState();
  let img: string | null = null;
  if (desktop) img = await desktop.pickImage();
  else img = window.prompt('Bild-URL', 'https://');
  if (!img) return;
  s.addNode('rect', pos, { img, label: '', parent, className: undefined });
}
