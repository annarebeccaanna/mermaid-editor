// Pure helpers for the cloud folder tree (no network, easy to test).

export interface FolderItem {
  id: string;
  name: string;
  parent_id: string | null;
}

export interface DiagramItem {
  id: string;
  name: string;
  folder_id: string | null;
  updated_at: string;
}

export interface FolderNode {
  folder: FolderItem;
  folders: FolderNode[];
  diagrams: DiagramItem[];
}

export interface Tree {
  folders: FolderNode[];
  diagrams: DiagramItem[];
}

const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' });

/** Folders first, everything sorted by name. Items whose folder is unknown end up at the top level. */
export function buildTree(folders: FolderItem[], diagrams: DiagramItem[]): Tree {
  const nodes = new Map<string, FolderNode>(folders.map((f) => [f.id, { folder: f, folders: [], diagrams: [] }]));
  const root: Tree = { folders: [], diagrams: [] };
  for (const n of nodes.values()) (nodes.get(n.folder.parent_id ?? '')?.folders ?? root.folders).push(n);
  for (const d of diagrams) (nodes.get(d.folder_id ?? '')?.diagrams ?? root.diagrams).push(d);
  const sort = (t: { folders: FolderNode[]; diagrams: DiagramItem[] }) => {
    t.folders.sort((a, b) => byName(a.folder, b.folder));
    t.diagrams.sort(byName);
    t.folders.forEach(sort);
  };
  sort(root);
  return root;
}

/**
 * Keep only diagrams whose name contains `query` (and the folders on the way to them),
 * plus everything inside a folder whose own name matches.
 */
export function filterTree(tree: Tree, query: string): Tree {
  const q = query.trim().toLocaleLowerCase('de');
  if (!q) return tree;
  const hit = (name: string) => name.toLocaleLowerCase('de').includes(q);
  const walk = (n: FolderNode): FolderNode | null => {
    if (hit(n.folder.name)) return n;
    const folders = n.folders.map(walk).filter((x): x is FolderNode => !!x);
    const diagrams = n.diagrams.filter((d) => hit(d.name));
    return folders.length || diagrams.length ? { folder: n.folder, folders, diagrams } : null;
  };
  return {
    folders: tree.folders.map(walk).filter((x): x is FolderNode => !!x),
    diagrams: tree.diagrams.filter((d) => hit(d.name)),
  };
}

/** The folder itself plus all folders below it. */
export function folderAndDescendants(folders: FolderItem[], id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const f of folders) {
      if (f.parent_id && ids.has(f.parent_id) && !ids.has(f.id)) {
        ids.add(f.id);
        grew = true;
      }
    }
  }
  return ids;
}

/** Folders in display order with their nesting depth, optionally without some subtrees. */
export function flattenFolders(tree: Tree, exclude: Set<string> = new Set()): Array<{ folder: FolderItem; depth: number }> {
  const out: Array<{ folder: FolderItem; depth: number }> = [];
  const walk = (nodes: FolderNode[], depth: number) => {
    for (const n of nodes) {
      if (exclude.has(n.folder.id)) continue;
      out.push({ folder: n.folder, depth });
      walk(n.folders, depth + 1);
    }
  };
  walk(tree.folders, 0);
  return out;
}

/** Folder ids from the top level down to `id` (excluding `id` itself), to expand the path to it. */
export function ancestors(folders: FolderItem[], id: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const out: string[] = [];
  for (let cur = id ? byId.get(id) : undefined; cur?.parent_id; cur = byId.get(cur.parent_id)) {
    out.push(cur.parent_id);
    if (out.length > folders.length) break;
  }
  return out;
}
