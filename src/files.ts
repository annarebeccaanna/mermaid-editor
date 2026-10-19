// File-level actions shared by the toolbar, menu and keyboard shortcuts.
import { useStore } from './store';
import { baseName, desktop, dirName, download, pickTextFile } from './desktop';
import { generate } from './mermaid/generate';
import { exportPng, exportSvg } from './mermaid/render';

const docName = () => {
  const p = useStore.getState().filePath;
  return p ? baseName(p).replace(/\.(mmd|mermaid)$/i, '') : 'diagramm';
};

/** Apply pending code edits before saving/exporting. */
function flushCode() {
  const s = useStore.getState();
  if (s.codeDirty && !s.applyCode()) {
    s.showToast('Der Code enthält Fehler – verwendet wird der Stand der Leinwand.');
  }
}

export async function save(): Promise<boolean> {
  flushCode();
  const s = useStore.getState();
  if (!desktop) {
    download(`${docName()}.mmd`, s.fileContent());
    s.markSaved(null);
    return true;
  }
  if (!s.filePath) return saveAs();
  await desktop.writeFile(s.filePath, s.fileContent());
  s.markSaved(s.filePath);
  return true;
}

export async function saveAs(): Promise<boolean> {
  flushCode();
  const s = useStore.getState();
  if (!desktop) return save();
  const p = await desktop.showSave(`${docName()}.mmd`);
  if (!p) return false;
  await desktop.writeFile(p, s.fileContent());
  s.markSaved(p);
  return true;
}

/** Can this window show another file instead of opening a new one? */
function windowIsDisposable() {
  const s = useStore.getState();
  return !s.filePath && !s.dirty;
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
      const p = await desktop.saveExport(`${docName()}.svg`, svg, 'svg');
      if (p) s.showToast(`Exportiert: ${baseName(p)}`);
    } else download(`${docName()}.svg`, new Blob([svg], { type: 'image/svg+xml' }));
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
      const p = await desktop.saveExport(`${docName()}.png`, await blob.arrayBuffer(), 'png');
      if (p) s.showToast(`Exportiert: ${baseName(p)}`);
    } else download(`${docName()}.png`, blob);
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
