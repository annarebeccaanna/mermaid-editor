import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, FilePlus, FileText, Folder, FolderOpen, FolderPlus, RefreshCw } from 'lucide-react';
import { type TreeEntry, baseName, desktop } from '../desktop';
import { useStore } from '../store';
import { openPath } from '../files';
import { NameInput } from './NameInput';
import { CloudTree } from './CloudTree';
import { cloudEnabled } from '../cloud/client';
import { useAuth } from '../cloud/auth';

function Tree({ entries, depth, current }: { entries: TreeEntry[]; depth: number; current: string | null }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  // folders containing the current file start expanded
  const isOpen = (p: string) => open[p] ?? (!!current && current.startsWith(p) && /[\\/]/.test(current.charAt(p.length)));
  return (
    <ul className="tree">
      {entries.map((e) =>
        e.type === 'dir' ? (
          <li key={e.path}>
            <button className="tree-item" style={{ paddingLeft: 8 + depth * 14 }} onClick={() => setOpen({ ...open, [e.path]: !isOpen(e.path) })}>
              {isOpen(e.path) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <Folder size={14} />
              <span>{e.name}</span>
            </button>
            {isOpen(e.path) && e.children && <Tree entries={e.children} depth={depth + 1} current={current} />}
          </li>
        ) : (
          <li key={e.path}>
            <button
              className={`tree-item file ${current === e.path ? 'active' : ''}`}
              style={{ paddingLeft: 22 + depth * 14 }}
              title={`${e.path}\n(öffnet in neuem Fenster, falls hier schon etwas offen ist)`}
              onClick={() => openPath(e.path)}
            >
              <FileText size={14} />
              <span>{e.name.replace(/\.(mmd|mermaid)$/i, '')}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}

export function Sidebar() {
  const signedIn = useAuth((s) => !!s.session);
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [entries, setEntries] = useState<TreeEntry[]>([]);
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const filePath = useStore((s) => s.filePath);

  const refresh = useCallback(async () => {
    if (!desktop) return;
    setWorkspace(await desktop.getWorkspace());
    setEntries(await desktop.listWorkspace());
  }, []);

  useEffect(() => {
    refresh();
    return desktop?.onWorkspaceChanged(() => refresh());
  }, [refresh]);

  if (!desktop) {
    if (cloudEnabled && signedIn) return <CloudTree />;
    return (
      <aside className="sidebar">
        <div className="sidebar-head">{cloudEnabled ? 'Meine Diagramme' : 'Arbeitsordner'}</div>
        {cloudEnabled ? (
          <p className="hint pad">Melde dich an (oben rechts), um Diagramme in der Cloud zu speichern. Ohne Anmeldung: Öffnen/Speichern über die Datei-Buttons.</p>
        ) : (
          <p className="hint pad">Der Ordnerzugriff ist nur in der Desktop-App verfügbar. Im Browser: Öffnen/Speichern über die Datei-Buttons.</p>
        )}
      </aside>
    );
  }

  const create = async (name: string | null) => {
    const kind = creating;
    setCreating(null);
    if (!name || !kind) return;
    try {
      if (kind === 'file') {
        const p = await desktop!.createFile(null, name);
        await openPath(p);
      } else await desktop!.createFolder(null, name);
      refresh();
    } catch (e) {
      useStore.getState().showToast((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    }
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <span title={workspace ?? ''}>{workspace ? baseName(workspace) : 'Arbeitsordner'}</span>
        <div className="sidebar-actions">
          {workspace && (
            <>
              <button className="icon-btn" title="Neues Diagramm im Ordner" onClick={() => setCreating('file')}>
                <FilePlus size={15} />
              </button>
              <button className="icon-btn" title="Neuer Unterordner" onClick={() => setCreating('folder')}>
                <FolderPlus size={15} />
              </button>
              <button className="icon-btn" title="Aktualisieren" onClick={refresh}>
                <RefreshCw size={15} />
              </button>
            </>
          )}
          <button className="icon-btn" title="Arbeitsordner wählen" onClick={() => desktop!.chooseWorkspace().then(refresh)}>
            <FolderOpen size={15} />
          </button>
        </div>
      </div>
      {creating && (
        <div className="pad">
          <NameInput placeholder={creating === 'file' ? 'Name des Diagramms' : 'Ordnername'} onDone={create} />
        </div>
      )}
      {workspace ? (
        entries.length ? (
          <Tree entries={entries} depth={0} current={filePath} />
        ) : (
          <p className="hint pad">Noch keine .mmd-Dateien in diesem Ordner.</p>
        )
      ) : (
        <div className="pad">
          <p className="hint">Wähle einen Ordner, in dem deine Diagramme liegen. Dateien von anderswo kannst du jederzeit über „Öffnen“ laden.</p>
          <button className="primary-btn" onClick={() => desktop!.chooseWorkspace().then(refresh)}>
            <FolderOpen size={15} /> Ordner wählen
          </button>
        </div>
      )}
      {filePath && (
        <button className="sidebar-foot" title="Im Explorer zeigen" onClick={() => desktop!.reveal(filePath)}>
          <FileText size={13} /> {baseName(filePath)}
        </button>
      )}
    </aside>
  );
}
