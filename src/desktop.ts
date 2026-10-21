// Typed access to the Electron bridge (electron/preload.cjs), with browser fallbacks
// so the UI also runs via `npm run dev:web`.

export interface TreeEntry {
  type: 'dir' | 'file';
  name: string;
  path: string;
  children?: TreeEntry[];
}

export interface DesktopApi {
  platform: string;
  readFile(p: string): Promise<string>;
  writeFile(p: string, content: string): Promise<void>;
  renameFile(p: string, newName: string): Promise<string>;
  showOpen(): Promise<string[]>;
  showSave(defaultName: string): Promise<string | null>;
  saveExport(defaultName: string, data: string | ArrayBuffer, ext: string): Promise<string | null>;
  pickImage(): Promise<string | null>;
  openWindow(p: string | null): Promise<void>;
  closeConfirmed(): Promise<void>;
  setDocState(state: { path: string | null; dirty: boolean; title?: string | null }): void;
  isOpenElsewhere(p: string): Promise<boolean>;
  getWorkspace(): Promise<string | null>;
  chooseWorkspace(): Promise<string | null>;
  listWorkspace(): Promise<TreeEntry[]>;
  createFile(dir: string | null, name: string): Promise<string>;
  createFolder(dir: string | null, name: string): Promise<string>;
  reveal(p: string): Promise<void>;
  pathForFile(file: File): string;
  onMenu(cb: (action: string) => void): () => void;
  onWorkspaceChanged(cb: (dir: string | null) => void): () => void;
}

export const desktop: DesktopApi | undefined = (window as unknown as { desktop?: DesktopApi }).desktop;
export const isDesktop = !!desktop;

export const baseName = (p: string) => p.split(/[\\/]/).pop() ?? p;
export const dirName = (p: string) => p.replace(/[\\/][^\\/]*$/, '');

/** Resolve an image reference to something the page can load. */
export function assetUrl(img: string, docPath: string | null): string {
  if (/^(https?:|data:|blob:|mmd-asset:)/i.test(img)) return img;
  const isAbs = /^([a-zA-Z]:[\\/]|\/|\\\\)/.test(img);
  if (!isDesktop) return img;
  const full = isAbs ? img : docPath ? `${dirName(docPath)}/${img}` : img;
  return `mmd-asset://local/${encodeURIComponent(full)}`;
}

/** Browser fallback: download a file */
export function download(name: string, data: string | Blob) {
  const blob = typeof data === 'string' ? new Blob([data], { type: 'text/plain' }) : data;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Browser fallback: pick a file and read it as text */
export function pickTextFile(): Promise<{ name: string; text: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.mmd,.mermaid,.txt,.md';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}
