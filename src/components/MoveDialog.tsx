import { Folder, Home, X } from 'lucide-react';
import { flattenFolders, type Tree } from '../cloud/tree';

/** Pick a target folder (or the top level) for a folder or diagram. */
export function MoveDialog({
  title,
  tree,
  exclude,
  current,
  onPick,
  onClose,
}: {
  title: string;
  tree: Tree;
  /** folders that are not valid targets (the folder itself and everything below it) */
  exclude: Set<string>;
  /** where the item is now (null: top level) */
  current: string | null;
  onPick: (folderId: string | null) => void;
  onClose: () => void;
}) {
  const options = [{ id: null as string | null, name: 'Oberste Ebene', depth: 0 }, ...flattenFolders(tree, exclude).map((x) => ({ id: x.folder.id, name: x.folder.name, depth: x.depth + 1 }))];
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal small" role="dialog" aria-label={title} onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} title="Schließen">
            <X size={18} />
          </button>
        </header>
        <div className="modal-body move-list">
          {options.map((o) => (
            <button key={o.id ?? 'root'} className="tree-item" style={{ paddingLeft: 8 + o.depth * 16 }} disabled={o.id === current} onClick={() => onPick(o.id)}>
              {o.id === null ? <Home size={14} /> : <Folder size={14} />}
              <span>{o.name}</span>
              {o.id === current && <em className="hint">aktuell</em>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
