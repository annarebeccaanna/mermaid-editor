import { useEffect, useState } from 'react';
import { ReactFlowProvider, useReactFlow } from '@xyflow/react';
import {
  Code2,
  Download,
  FilePlus2,
  FolderOpen,
  Menu,
  Network,
  Palette,
  Pencil,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { useStore } from './store';
import { baseName, desktop } from './desktop';
import * as files from './files';
import { Canvas, FIT_PADDING } from './components/Canvas';
import { Toolbar } from './components/Toolbar';
import { DIRECTIONS, Properties } from './components/Properties';
import type { Direction } from './model';
import { CodePanel } from './components/CodePanel';
import { Sidebar } from './components/Sidebar';
import { ColorSettings } from './components/ColorSettings';
import { AccountMenu } from './components/AccountMenu';
import { ConflictDialog } from './components/ConflictDialog';
import { useAuth } from './cloud/auth';

const pref = (k: string, def: boolean) => {
  const v = localStorage.getItem(`mermaid-editor:${k}`);
  return v === null ? def : v === '1';
};
const setPref = (k: string, v: boolean) => localStorage.setItem(`mermaid-editor:${k}`, v ? '1' : '0');

const isTextInput = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.closest('input, textarea, select, [contenteditable="true"], .cm-editor') !== null);

function ExportMenu({ onClose }: { onClose: () => void }) {
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <div className="dropdown" onMouseLeave={onClose}>
      <button onClick={run(files.doExportPng)}>Als PNG (transparent)</button>
      <button onClick={run(files.doExportSvg)}>Als SVG (transparent)</button>
      <button onClick={run(files.copyCode)}>Mermaid-Code kopieren</button>
      <button onClick={run(files.saveAs)}>{desktop ? 'Als .mmd speichern …' : 'Als .mmd herunterladen'}</button>
    </div>
  );
}

function Shortcuts({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ['Doppelklick auf Leinwand', 'Neue Form'],
    ['Vom Rand einer Form ziehen', 'Verbinden (ins Leere: neue Form)'],
    ['Form in Gruppe ziehen', 'Zur Gruppe (Subgraph) hinzufügen'],
    ['Doppelklick auf Form / Pfeil', 'Text bearbeiten'],
    ['Enter / F2', 'Text der Auswahl bearbeiten'],
    ['Tab', 'Neue verbundene Folge-Form'],
    ['Shift + Tab', 'Neue Geschwister-Form'],
    ['Entf / Rücktaste', 'Auswahl löschen'],
    ['Strg + D', 'Duplizieren'],
    ['Strg + A', 'Alles auswählen'],
    ['Strg + Z / Strg + Y', 'Rückgängig / Wiederholen'],
    ['Strg + L', 'Automatisch anordnen'],
    ['Shift + 1', 'Alles einpassen'],
    ['Pfeiltasten', 'Auswahl verschieben (Shift: weiter)'],
    ['Ziehen auf Leinwand', 'Ansicht verschieben'],
    ['Shift + Ziehen', 'Mehrere auswählen'],
    ['Mausrad / Strg + Mausrad', 'Zoomen'],
    ['Strg + S / Strg + Shift + S', 'Speichern / Speichern unter'],
    ['Strg + O / Strg + N', 'Öffnen / Neues Fenster'],
    ['Strg + B / Strg + J', 'Seitenleiste / Code-Panel'],
    ['Strg + Enter (im Code)', 'Code übernehmen'],
  ];
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal small" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Tastenkürzel</h2>
        </header>
        <div className="modal-body">
          <table className="shortcut-table">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k}>
                  <td>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer>
          <button className="primary-btn" onClick={onClose}>
            OK
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Document name in the top bar – click to rename. */
function DocTitle() {
  const filePath = useStore((s) => s.filePath);
  const title = useStore((s) => s.title);
  const dirty = useStore((s) => s.dirty);
  const cloudId = useStore((s) => s.cloudId);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const name = files.docName();
  const hint = cloudId
    ? 'In der Cloud gespeichert\nKlicken zum Umbenennen'
    : filePath
      ? `${filePath}\nKlicken zum Umbenennen der Datei`
      : 'Klicken, um dem Diagramm einen Namen zu geben – er wird beim Speichern vorgeschlagen';
  void title; // re-render when the name of an unsaved diagram changes

  if (editing) {
    const done = (commit: boolean) => {
      setEditing(false);
      if (commit) files.rename(value);
    };
    return (
      <input
        className="doc-title-input"
        autoFocus
        value={value}
        placeholder="Name des Diagramms"
        onFocus={(e) => e.target.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => done(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') done(true);
          if (e.key === 'Escape') done(false);
        }}
        size={Math.max(12, value.length + 2)}
      />
    );
  }
  return (
    <button
      className={`doc-title ${!filePath && !title ? 'untitled' : ''}`}
      title={hint}
      onClick={() => {
        setValue(filePath || title ? name : '');
        setEditing(true);
      }}
    >
      <span className="doc-title-text">{name}</span>
      <Pencil size={13} className="doc-title-pencil" />
      {dirty && <span className="dirty-dot" title="Ungespeicherte Änderungen" />}
    </button>
  );
}

function Editor() {
  const rf = useReactFlow();
  const filePath = useStore((s) => s.filePath);
  const dirty = useStore((s) => s.dirty);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const toast = useStore((s) => s.toast);
  const direction = useStore((s) => s.diagram.direction);
  const empty = useStore((s) => s.diagram.nodes.length === 0 && s.diagram.groups.length === 0);
  const [sidebar, setSidebar] = useState(() => pref('sidebar', true));
  const [code, setCode] = useState(() => pref('code', true));
  const [colors, setColors] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const cloudId = useStore((s) => s.cloudId);
  const conflict = useStore((s) => s.conflict);
  const diagram = useStore((s) => s.diagram);
  const userId = useAuth((s) => s.session?.user.id ?? null);

  const toggleSidebar = () => setSidebar((v) => (setPref('sidebar', !v), !v));
  const toggleCode = () => setCode((v) => (setPref('code', !v), !v));

  // Actions shared by menu and keyboard
  const actions: Record<string, () => void> = {
    new: files.newWindow,
    open: files.open,
    save: files.save,
    'save-as': files.saveAs,
    'export-svg': files.doExportSvg,
    'export-png': files.doExportPng,
    'copy-code': files.copyCode,
    undo: () => useStore.getState().undo(),
    redo: () => useStore.getState().redo(),
    duplicate: () => useStore.getState().duplicate(useStore.getState().selection),
    'select-all': () => {
      const d = useStore.getState().diagram;
      useStore.getState().select([...d.nodes.map((n) => n.id), ...d.groups.map((g) => g.id), ...d.edges.map((e) => e.id)]);
    },
    layout: () => useStore.getState().layout(),
    fit: () => rf.fitView({ padding: FIT_PADDING, duration: 250, maxZoom: 1.2 }),
    'toggle-sidebar': toggleSidebar,
    'toggle-code': toggleCode,
    shortcuts: () => setShortcuts(true),
    'save-and-close': async () => {
      if (await files.save()) desktop?.closeConfirmed();
    },
  };

  // Native menu → actions
  useEffect(() => desktop?.onMenu((a) => actions[a]?.()));

  // Window title / unsaved state for the main process
  const title = useStore((s) => s.title);
  useEffect(() => {
    desktop?.setDocState({ path: filePath, dirty, title });
    document.title = `${dirty ? '● ' : ''}${filePath ? baseName(filePath) : title || 'Unbenannt'} — Mermaid Editor`;
  }, [filePath, dirty, title]);

  // Cloud diagrams save themselves shortly after the last change
  useEffect(() => {
    if (!cloudId || !dirty || conflict) return;
    const t = setTimeout(() => void files.save(), 2000);
    return () => clearTimeout(t);
  }, [cloudId, dirty, conflict, diagram]);

  // Signed out (or another account): the open diagram is no longer linked to the cloud
  useEffect(() => {
    if (useStore.getState().cloudId) useStore.setState({ cloudId: null, cloudVersion: 0, conflict: false, dirty: true });
  }, [userId]);

  // Browser: warn before leaving with unsaved changes
  useEffect(() => {
    if (desktop) return;
    const h = (e: BeforeUnloadEvent) => {
      if (useStore.getState().dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      const s = useStore.getState();
      // global (also inside text fields)
      if (mod && k === 's') return e.preventDefault(), actions[e.shiftKey ? 'save-as' : 'save']();
      if (mod && k === 'o') return e.preventDefault(), actions.open();
      if (mod && k === 'n') return e.preventDefault(), actions.new();
      if (mod && k === 'b') return e.preventDefault(), toggleSidebar();
      if (mod && k === 'j') return e.preventDefault(), toggleCode();
      if (mod && k === 'e') return e.preventDefault(), actions['export-png']();
      if (isTextInput(e.target) || s.editing) return;

      const sel = s.selection;
      const single = sel.length === 1 ? sel[0] : null;
      if (mod && k === 'z') return e.preventDefault(), e.shiftKey ? s.redo() : s.undo();
      if (mod && k === 'y') return e.preventDefault(), s.redo();
      if (mod && k === 'l') return e.preventDefault(), s.layout();
      if (mod && k === 'd') return e.preventDefault(), s.duplicate(sel);
      if (mod && k === 'a') return e.preventDefault(), actions['select-all']();
      if (mod && e.shiftKey && k === 'c') return e.preventDefault(), files.copyCode();
      if (e.key === 'Delete' || e.key === 'Backspace') return e.preventDefault(), s.deleteIds(sel);
      if (e.key === 'Escape') return s.select([]);
      if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) return actions.fit();
      if ((e.key === 'Enter' || e.key === 'F2') && single) return e.preventDefault(), s.setEditing(single);
      if (e.key === 'Tab' && single && s.diagram.nodes.some((n) => n.id === single)) {
        e.preventDefault();
        s.addChild(single, e.shiftKey ? 'sibling' : 'next');
        return;
      }
      if (e.key.startsWith('Arrow') && sel.length) {
        e.preventDefault();
        const step = e.shiftKey ? 40 : 8;
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
        s.change((d) => {
          for (const item of [...d.nodes, ...d.groups])
            if (sel.includes(item.id) && !(item.parent && sel.includes(item.parent))) {
              item.x += dx;
              item.y += dy;
            }
        });
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="app">
      <header className="topbar">
        <button className="icon-btn" title="Seitenleiste (Strg+B)" onClick={toggleSidebar}>
          <Menu size={20} />
        </button>
        <div className="logo">
          <Network size={18} />
        </div>
        <DocTitle />
        <div className="topbar-group">
          <button className="icon-btn" title="Neues Fenster (Strg+N)" onClick={files.newWindow}>
            <FilePlus2 size={18} />
          </button>
          <button className="icon-btn" title="Öffnen (Strg+O)" onClick={files.open}>
            <FolderOpen size={18} />
          </button>
          <button className="icon-btn" title="Speichern (Strg+S)" onClick={files.save}>
            <Save size={18} />
          </button>
        </div>
        <div className="topbar-group">
          <button className="icon-btn" title="Rückgängig (Strg+Z)" disabled={!canUndo} onClick={() => useStore.getState().undo()}>
            <Undo2 size={18} />
          </button>
          <button className="icon-btn" title="Wiederholen (Strg+Y)" disabled={!canRedo} onClick={() => useStore.getState().redo()}>
            <Redo2 size={18} />
          </button>
        </div>
        <div className="spacer" />
        <select
          className="dir-select"
          title="Richtung des Diagramms"
          value={direction === 'TB' ? 'TD' : direction}
          onChange={(e) => useStore.getState().setDirection(e.target.value as Direction)}
        >
          {DIRECTIONS.map(([d, l]) => (
            <option key={d} value={d}>
              {l}
            </option>
          ))}
        </select>
        <button className="text-btn" title="Automatisch anordnen (Strg+L)" onClick={() => useStore.getState().layout()}>
          Anordnen
        </button>
        <button className="icon-btn" title="Farben & Standards" onClick={() => setColors(true)}>
          <Palette size={18} />
        </button>
        <button className={`icon-btn ${code ? 'active' : ''}`} title="Code-Panel (Strg+J)" onClick={toggleCode}>
          <Code2 size={18} />
        </button>
        <div className="dropdown-wrap">
          <button className="primary-btn" onClick={() => setExportOpen(!exportOpen)}>
            <Download size={16} /> Export
          </button>
          {exportOpen && <ExportMenu onClose={() => setExportOpen(false)} />}
        </div>
        <AccountMenu />
      </header>
      <div className="main">
        {sidebar && <Sidebar />}
        {code && <CodePanel onClose={toggleCode} />}
        <div className="canvas-wrap">
          <Canvas />
          <Toolbar />
          <Properties />
          {empty && (
            <div className="empty-hint">
              <b>Leeres Diagramm</b>
              Doppelklick auf die Fläche oder eine Form links anklicken bzw. hineinziehen.
              <br />
              Oder Mermaid-Code links einfügen.
            </div>
          )}
        </div>
      </div>
      {colors && <ColorSettings onClose={() => setColors(false)} />}
      {shortcuts && <Shortcuts onClose={() => setShortcuts(false)} />}
      {conflict && <ConflictDialog />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Editor />
    </ReactFlowProvider>
  );
}
