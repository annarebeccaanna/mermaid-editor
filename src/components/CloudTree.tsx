import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Ellipsis, FilePlus, FileText, Folder, FolderPlus, RefreshCw, Search, X } from 'lucide-react';
import { useStore } from '../store';
import { useAuth } from '../cloud/auth';
import { listDiagrams } from '../cloud/diagrams';
import * as cloudFolders from '../cloud/folders';
import { ancestors, buildTree, filterTree, folderAndDescendants, type DiagramItem, type FolderItem, type FolderNode } from '../cloud/tree';
import * as files from '../files';
import { NameInput } from './NameInput';
import { MoveDialog } from './MoveDialog';

type Target = { kind: 'folder'; id: string } | { kind: 'diagram'; id: string };
type MenuItem = { label: string; run: () => void; danger?: boolean };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Web: the signed-in person's folders and diagrams in the cloud. */
export function CloudTree() {
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [diagrams, setDiagrams] = useState<DiagramItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState<{ kind: 'folder' | 'diagram'; parent: string | null } | null>(null);
  const [renaming, setRenaming] = useState<Target | null>(null);
  const [moving, setMoving] = useState<Target | null>(null);
  const [menu, setMenu] = useState<Target | null>(null);

  const cloudId = useStore((s) => s.cloudId);
  const cloudFolder = useStore((s) => s.cloudFolder);
  const title = useStore((s) => s.title);
  const userId = useAuth((s) => s.session?.user.id);
  const toast = useStore.getState().showToast;

  const refresh = useCallback(async () => {
    try {
      const [f, d] = await Promise.all([cloudFolders.listFolders(), listDiagrams()]);
      setFolders(f);
      setDiagrams(d);
      setFailed(false);
    } catch {
      setFailed(true);
    }
    setLoaded(true);
  }, []);

  // reload when the open diagram changes (created, opened, renamed, moved) or the account changes
  useEffect(() => {
    refresh();
  }, [refresh, cloudId, title, cloudFolder, userId]);

  const fullTree = useMemo(() => buildTree(folders, diagrams), [folders, diagrams]);
  const searching = query.trim() !== '';
  const tree = useMemo(() => filterTree(fullTree, query), [fullTree, query]);

  // the selected folder and the path to it start expanded
  const startOpen = useMemo(() => new Set([...ancestors(folders, cloudFolder), ...(cloudFolder ? [cloudFolder] : [])]), [folders, cloudFolder]);
  const isOpen = (id: string) => searching || creating?.parent === id || (open[id] ?? startOpen.has(id));

  /** Run a cloud change, report failures, and reload the lists. */
  const act = async (job: () => Promise<unknown>, failure: string) => {
    try {
      await job();
    } catch (e) {
      toast(`${failure}: ${errorText(e)}`);
    }
    await refresh();
  };

  const folderOf = (id: string) => folders.find((f) => f.id === id);
  const diagramOf = (id: string) => diagrams.find((d) => d.id === id);

  const create = (name: string | null) => {
    const c = creating;
    setCreating(null);
    if (!name || !c) return;
    if (c.kind === 'diagram') return void files.createCloudDiagramNamed(name).then(refresh);
    return void act(async () => {
      const f = await cloudFolders.createFolder(name, c.parent);
      setOpen((o) => ({ ...o, ...(c.parent && { [c.parent]: true }), [f.id]: true }));
    }, 'Ordner konnte nicht angelegt werden');
  };

  const rename = (name: string | null) => {
    const t = renaming;
    setRenaming(null);
    if (!name || !t) return;
    if (t.kind === 'diagram') return void files.renameCloudDiagram(t.id, name).then(refresh);
    if (name === folderOf(t.id)?.name) return;
    return void act(() => cloudFolders.updateFolder(t.id, { name }), 'Umbenennen fehlgeschlagen');
  };

  const move = (target: string | null) => {
    const t = moving;
    setMoving(null);
    if (!t) return;
    if (t.kind === 'diagram') return void files.moveCloudDiagram(t.id, target).then(refresh);
    void act(async () => {
      await cloudFolders.updateFolder(t.id, { parent_id: target });
      if (target) setOpen((o) => ({ ...o, [target]: true }));
    }, 'Verschieben fehlgeschlagen');
  };

  const removeDiagram = async (d: DiagramItem) => {
    if (await files.deleteCloudDiagram(d.id, d.name)) refresh();
  };

  const removeFolder = (f: FolderItem) => {
    const ids = folderAndDescendants(folders, f.id);
    const inside = diagrams.filter((d) => d.folder_id && ids.has(d.folder_id));
    const what = [ids.size > 1 && `${ids.size - 1} Unterordner`, inside.length && `${inside.length} Diagramm${inside.length === 1 ? '' : 'e'}`].filter(Boolean).join(' und ');
    if (!window.confirm(`Ordner „${f.name}“${what ? ` mit ${what}` : ''} endgültig löschen? Das lässt sich nicht rückgängig machen.`)) return;
    const openOne = inside.some((d) => d.id === cloudId);
    void act(async () => {
      await cloudFolders.deleteFolder(f.id);
      if (openOne) {
        files.detachCloud();
        toast('Gelöscht. Das Diagramm ist noch im Editor offen, aber nicht mehr gespeichert.');
      }
      if (cloudFolder && ids.has(cloudFolder)) useStore.setState({ cloudFolder: null });
    }, 'Löschen fehlgeschlagen');
  };

  const menuFor = (t: Target): MenuItem[] => {
    if (t.kind === 'diagram') {
      const d = diagramOf(t.id);
      if (!d) return [];
      return [
        { label: 'Umbenennen', run: () => setRenaming(t) },
        { label: 'Verschieben …', run: () => setMoving(t) },
        { label: 'Löschen', run: () => void removeDiagram(d), danger: true },
      ];
    }
    const f = folderOf(t.id);
    if (!f) return [];
    return [
      { label: 'Neues Diagramm hier', run: () => startCreating('diagram', f.id) },
      { label: 'Neuer Unterordner', run: () => startCreating('folder', f.id) },
      { label: 'Umbenennen', run: () => setRenaming(t) },
      { label: 'Verschieben …', run: () => setMoving(t) },
      { label: 'Löschen', run: () => removeFolder(f), danger: true },
    ];
  };

  const startCreating = (kind: 'folder' | 'diagram', parent: string | null) => {
    setQuery('');
    if (parent) setOpen((o) => ({ ...o, [parent]: true }));
    useStore.setState({ cloudFolder: parent });
    setCreating({ kind, parent });
  };

  const same = (a: Target | null, b: Target) => a?.kind === b.kind && a.id === b.id;

  const rowMenu = (t: Target) => (
    <>
      <button className="icon-btn row-menu-btn" title="Mehr" aria-label="Mehr" onClick={() => setMenu(same(menu, t) ? null : t)}>
        <Ellipsis size={14} />
      </button>
      {same(menu, t) && (
        <>
          <div className="menu-scrim" onMouseDown={() => setMenu(null)} />
          <div className="dropdown row-menu" role="menu">
            {menuFor(t).map((m) => (
              <button
                key={m.label}
                role="menuitem"
                className={m.danger ? 'danger-item' : undefined}
                onClick={() => {
                  setMenu(null);
                  m.run();
                }}
              >
                {m.label}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );

  const diagramRow = (d: DiagramItem, depth: number) => {
    const t: Target = { kind: 'diagram', id: d.id };
    if (same(renaming, t)) {
      return (
        <li key={d.id} className="pad-row" style={{ paddingLeft: 22 + depth * 14 }}>
          <NameInput placeholder="Name" initial={d.name} onDone={rename} />
        </li>
      );
    }
    return (
      <li key={d.id} className="tree-row">
        <button
          className={`tree-item file ${cloudId === d.id ? 'active' : ''}`}
          style={{ paddingLeft: 22 + depth * 14 }}
          title={`Zuletzt geändert: ${new Date(d.updated_at).toLocaleString()}`}
          onClick={() => files.openCloudDiagram(d.id)}
        >
          <FileText size={14} />
          <span>{d.name}</span>
        </button>
        {rowMenu(t)}
      </li>
    );
  };

  const newItemRow = (parent: string | null, depth: number) =>
    creating && creating.parent === parent ? (
      <li key="new" className="pad-row" style={{ paddingLeft: 22 + depth * 14 }}>
        <NameInput placeholder={creating.kind === 'folder' ? 'Ordnername' : 'Name des Diagramms'} onDone={create} />
      </li>
    ) : null;

  const folderRow = (n: FolderNode, depth: number): React.ReactNode => {
    const f = n.folder;
    const t: Target = { kind: 'folder', id: f.id };
    const expanded = isOpen(f.id);
    return (
      <li key={f.id}>
        {same(renaming, t) ? (
          <div className="pad-row" style={{ paddingLeft: 22 + depth * 14 }}>
            <NameInput placeholder="Ordnername" initial={f.name} onDone={rename} />
          </div>
        ) : (
          <div className="tree-row">
            <button
              className={`tree-item ${cloudFolder === f.id ? 'selected' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              aria-expanded={expanded}
              onClick={() => {
                useStore.setState({ cloudFolder: f.id });
                setOpen({ ...open, [f.id]: !expanded });
              }}
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={14} />
              <span>{f.name}</span>
            </button>
            {rowMenu(t)}
          </div>
        )}
        {expanded && (
          <ul className="tree">
            {newItemRow(f.id, depth + 1)}
            {n.folders.map((c) => folderRow(c, depth + 1))}
            {n.diagrams.map((d) => diagramRow(d, depth + 1))}
          </ul>
        )}
      </li>
    );
  };

  const empty = loaded && !failed && !folders.length && !diagrams.length;
  const targetName = cloudFolder ? folderOf(cloudFolder)?.name : null;
  const movingFolder = moving?.kind === 'folder' ? folderOf(moving.id) : null;
  const movingDiagram = moving?.kind === 'diagram' ? diagramOf(moving.id) : null;

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span>Meine Diagramme</span>
        <div className="sidebar-actions">
          <button className="icon-btn" title="Neues Diagramm" onClick={() => startCreating('diagram', cloudFolder)}>
            <FilePlus size={15} />
          </button>
          <button className="icon-btn" title="Neuer Ordner" onClick={() => startCreating('folder', cloudFolder)}>
            <FolderPlus size={15} />
          </button>
          <button className="icon-btn" title="Aktualisieren" onClick={refresh}>
            <RefreshCw size={15} />
          </button>
        </div>
      </div>
      <div className="sidebar-search">
        <Search size={13} />
        <input type="text" placeholder="Suchen …" aria-label="Diagramme suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
        {query && (
          <button className="icon-btn" title="Suche löschen" onClick={() => setQuery('')}>
            <X size={13} />
          </button>
        )}
      </div>
      {targetName && !searching && (
        <div className="target-line">
          <span title="Neue Diagramme und Ordner landen hier">Neu in: {targetName}</span>
          <button className="icon-btn" title="Zur obersten Ebene" onClick={() => useStore.setState({ cloudFolder: null })}>
            <X size={12} />
          </button>
        </div>
      )}
      {failed && <p className="hint pad">Die Liste konnte nicht geladen werden.</p>}
      {empty && <p className="hint pad">Noch nichts in der Cloud. Mit Strg+S speicherst du das aktuelle Diagramm hier, mit dem Ordner-Symbol legst du Ordner an.</p>}
      {searching && !tree.folders.length && !tree.diagrams.length && !failed && <p className="hint pad">Nichts gefunden.</p>}
      <ul className="tree">
        {newItemRow(null, 0)}
        {tree.folders.map((n) => folderRow(n, 0))}
        {tree.diagrams.map((d) => diagramRow(d, 0))}
      </ul>
      {(movingFolder || movingDiagram) && (
        <MoveDialog
          title={`„${(movingFolder ?? movingDiagram)!.name}“ verschieben nach …`}
          tree={fullTree}
          exclude={movingFolder ? folderAndDescendants(folders, movingFolder.id) : new Set()}
          current={movingFolder ? movingFolder.parent_id : movingDiagram!.folder_id}
          onPick={move}
          onClose={() => setMoving(null)}
        />
      )}
    </aside>
  );
}
