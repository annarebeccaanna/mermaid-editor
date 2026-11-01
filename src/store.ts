import { create } from 'zustand';
import {
  COLOR_PRESETS,
  type DEdge,
  type DGroup,
  type DNode,
  type Diagram,
  type Direction,
  type Shape,
  allIds,
  emptyDiagram,
  nextId,
  presetStyle,
  shapeInfo,
} from './model';
import { generate, generateWithLayout } from './mermaid/generate';
import { type ParseError, parse } from './mermaid/parse';
import { absoluteOf, autoLayout, nodeSize, place, placeDiagram } from './layout';
import { colorStyle, usePrefs } from './prefs';

const HISTORY_LIMIT = 200;

export type EdgeDefaults = Pick<DEdge, 'line' | 'head' | 'both'>;

interface State {
  diagram: Diagram;
  past: Diagram[];
  future: Diagram[];
  selection: string[];
  /** Text in the code editor */
  code: string;
  /** User edited the code and it has not been applied to the canvas yet */
  codeDirty: boolean;
  codeErrors: ParseError[];
  autoUpdate: boolean;
  filePath: string | null;
  /** Id of the cloud diagram that is open (null: local file or not saved yet) */
  cloudId: string | null;
  /** Folder in the cloud where new diagrams are saved (set by clicking a folder or opening a diagram). */
  cloudFolder: string | null;
  /** Version of the cloud diagram this editor last read or wrote (for conflict detection) */
  cloudVersion: number;
  /** Someone else saved the cloud diagram meanwhile; waiting for the user's decision */
  conflict: boolean;
  /** The last attempt to save the cloud diagram failed (offline, session ended, …); it is retried */
  saveFailed: boolean;
  /** Name for a diagram that has not been saved yet (suggested when saving); name of a cloud diagram */
  title: string | null;
  dirty: boolean;
  edgeDefaults: EdgeDefaults;
  /** Node whose label is being edited inline */
  editing: string | null;
  /** Bumped when the view should fit the diagram (load, layout, …) */
  fitNonce: number;
  toast: string | null;
  showToast: (msg: string) => void;

  commit: () => void;
  /** Update the diagram. `history: false` for continuous changes (dragging). */
  change: (fn: (d: Diagram) => void, opts?: { history?: boolean }) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[]) => void;
  setEditing: (id: string | null) => void;

  addNode: (shape: Shape, pos: { x: number; y: number }, opts?: { parent?: string; label?: string; className?: string; img?: string }) => string;
  addGroup: (pos: { x: number; y: number }) => string;
  addEdge: (source: string, target: string, patch?: Partial<DEdge>) => string | null;
  addChild: (fromId: string, side?: 'next' | 'sibling') => string | null;
  updateNode: (id: string, patch: Partial<DNode>) => void;
  updateGroup: (id: string, patch: Partial<DGroup>) => void;
  updateEdge: (id: string, patch: Partial<DEdge>) => void;
  renameId: (oldId: string, newId: string) => string | null;
  setColor: (ids: string[], className: string | undefined) => void;
  setParent: (id: string, parent: string | undefined, opts?: { history?: boolean }) => void;
  deleteIds: (ids: string[]) => void;
  duplicate: (ids: string[]) => void;
  setDirection: (dir: Direction) => void;
  layout: () => void;

  setCode: (code: string) => void;
  applyCode: () => boolean;
  setAutoUpdate: (on: boolean) => void;
  newDiagram: () => void;
  load: (text: string, path: string | null) => void;
  /** Show a diagram from the cloud */
  openCloud: (d: { id: string; name: string; content: string; version: number; folder_id?: string | null }) => void;
  markSaved: (path: string | null) => void;
  setTitle: (title: string | null) => void;
  fileContent: () => string;
}

const clone = (d: Diagram) => structuredClone(d);

/** The document is not linked to a cloud diagram. */
const NO_CLOUD = { cloudId: null, cloudVersion: 0, conflict: false, saveFailed: false } as const;

const SAMPLE = `flowchart TD
    A([Start]) --> B[Anfrage eingegangen]
    B --> C{Kunde bekannt?}
    C -->|ja| D[Kunde laden]
    C -->|nein| E[Kunde anlegen]
    D --> F[Auftrag bearbeiten]
    E --> F
    F --> G((Ende))

    classDef green fill:#c8e6c9,stroke:#2e7d32
    classDef yellow fill:#fff9c4,stroke:#f9a825
    class A,G green
    class C yellow
`;

function initial(): Pick<State, 'diagram' | 'code'> {
  // Show the example once, afterwards new windows start empty
  let first = false;
  try {
    first = !localStorage.getItem('mermaid-editor:seen-sample');
    localStorage.setItem('mermaid-editor:seen-sample', '1');
  } catch {
    /* ignore */
  }
  const fromFile = new URLSearchParams(location.search).has('file');
  const diagram = first && !fromFile ? autoLayout(parse(SAMPLE).diagram) : emptyDiagram();
  return { diagram, code: generate(diagram) };
}

/** Drop classDefs that are unused and just copies of a color preset. */
function pruneClassDefs(d: Diagram) {
  const used = new Set([...d.nodes, ...d.groups].map((x) => x.className).filter(Boolean));
  const presetCss = new Set([...COLOR_PRESETS, ...usePrefs.getState().colors].map(presetStyle));
  for (const [name, css] of Object.entries(d.classDefs)) {
    if (!used.has(name) && presetCss.has(css)) delete d.classDefs[name];
  }
}

export const useStore = create<State>((set, get) => {
  /** After any canvas change: regenerate the code unless the user is mid-edit. */
  const afterChange = (diagram: Diagram, extra: Partial<State> = {}) => {
    const s = get();
    const patch: Partial<State> = { diagram, dirty: true, ...extra };
    if (!s.codeDirty) {
      patch.code = generate(diagram);
      patch.codeErrors = [];
    }
    set(patch);
  };

  /** Make sure a color class used on the canvas has a (current) classDef. */
  const ensureClassDef = (d: Diagram, className: string | undefined) => {
    if (!className) return;
    const css = colorStyle(className);
    if (css) d.classDefs[className] = css;
  };

  return {
    ...initial(),
    filePath: null,
    cloudId: null,
    cloudFolder: null,
    saveFailed: false,
    cloudVersion: 0,
    conflict: false,
    title: null,
    past: [],
    future: [],
    selection: [],
    codeDirty: false,
    codeErrors: [],
    autoUpdate: true,
    dirty: false,
    edgeDefaults: { line: 'solid', head: 'arrow', both: false },
    editing: null,
    fitNonce: 0,
    toast: null,
    showToast: (msg) => {
      set({ toast: msg });
      setTimeout(() => get().toast === msg && set({ toast: null }), 2800);
    },

    commit: () => {
      const { diagram, past } = get();
      set({ past: [...past.slice(-HISTORY_LIMIT), clone(diagram)], future: [] });
    },

    change: (fn, opts = {}) => {
      if (opts.history !== false) get().commit();
      const d = clone(get().diagram);
      fn(d);
      pruneClassDefs(d);
      afterChange(d);
    },

    undo: () => {
      const { past, future, diagram } = get();
      if (!past.length) return;
      const prev = past[past.length - 1];
      set({ past: past.slice(0, -1), future: [clone(diagram), ...future], codeDirty: false });
      afterChange(prev, { selection: [] });
    },

    redo: () => {
      const { past, future, diagram } = get();
      if (!future.length) return;
      set({ past: [...past, clone(diagram)], future: future.slice(1), codeDirty: false });
      afterChange(future[0], { selection: [] });
    },

    select: (ids) => {
      const cur = get().selection;
      if (cur.length === ids.length && ids.every((id) => cur.includes(id))) return;
      set({ selection: ids });
    },
    setEditing: (id) => set({ editing: id }),

    addNode: (shape, pos, opts = {}) => {
      const id = nextId(allIds(get().diagram));
      const info = shapeInfo(shape);
      const className = 'className' in opts ? opts.className : usePrefs.getState().shapeDefaults[shape];
      get().change((d) => {
        ensureClassDef(d, className);
        const parentAbs = opts.parent ? absoluteOf(d, opts.parent) : { x: 0, y: 0 };
        d.nodes.push({
          id,
          label: opts.label ?? info.name,
          shape,
          className,
          parent: opts.parent,
          img: opts.img,
          w: opts.img ? 120 : undefined,
          h: opts.img ? 128 : undefined,
          x: pos.x - (opts.img ? 60 : info.w / 2) - parentAbs.x,
          y: pos.y - (opts.img ? 64 : info.h / 2) - parentAbs.y,
        });
      });
      set({ selection: [id] });
      return id;
    },

    addGroup: (pos) => {
      const d0 = get().diagram;
      let i = d0.groups.length + 1;
      while (allIds(d0).includes(`S${i}`)) i++;
      const id = `S${i}`;
      const className = usePrefs.getState().shapeDefaults.group;
      get().change((d) => {
        ensureClassDef(d, className);
        d.groups.push({ id, title: `Gruppe ${i}`, className, x: pos.x - 160, y: pos.y - 110, w: 320, h: 220 });
      });
      set({ selection: [id] });
      return id;
    },

    addEdge: (source, target, patch = {}) => {
      let id = '';
      get().change((d) => {
        let n = d.edges.length + 1;
        while (d.edges.some((e) => e.id === `e${n}`)) n++;
        id = `e${n}`;
        d.edges.push({ id, source, target, label: '', ...get().edgeDefaults, ...patch });
      });
      return id;
    },

    addChild: (fromId, side = 'next') => {
      const d = get().diagram;
      const from = d.nodes.find((n) => n.id === fromId);
      if (!from) return null;
      const horizontal = d.direction === 'LR' || d.direction === 'RL';
      const reverse = d.direction === 'BT' || d.direction === 'RL';
      const size = nodeSize(from);
      const abs = absoluteOf(d, fromId);
      const cx = abs.x + size.w / 2;
      const cy = abs.y + size.h / 2;
      const shape: Shape = from.shape === 'diamond' || from.shape === 'circle' || from.shape === 'doublecircle' ? 'rect' : from.shape;
      const info = shapeInfo(shape);
      let x: number;
      let y: number;
      if (side === 'next') {
        const dist = (horizontal ? size.w / 2 + info.w / 2 : size.h / 2 + info.h / 2) + 70;
        x = horizontal ? cx + (reverse ? -dist : dist) : cx;
        y = horizontal ? cy : cy + (reverse ? -dist : dist);
        // skip past existing children so new ones fan out
        const kids = d.edges.filter((e) => e.source === fromId).length;
        if (horizontal) y += kids * (info.h + 30);
        else x += kids * (info.w + 40);
      } else {
        x = horizontal ? cx : cx + size.w / 2 + info.w / 2 + 40;
        y = horizontal ? cy + size.h / 2 + info.h / 2 + 30 : cy;
      }
      const id = get().addNode(shape, { x, y }, { parent: from.parent, label: '', className: from.className });
      if (side === 'next') get().addEdge(fromId, id);
      else {
        const incoming = d.edges.find((e) => e.target === fromId);
        if (incoming) get().addEdge(incoming.source, id);
      }
      // merge the 2–3 history entries into one
      const past = get().past;
      set({ past: past.slice(0, past.length - (side === 'next' ? 1 : 0)), selection: [id], editing: id });
      return id;
    },

    updateNode: (id, patch) =>
      get().change((d) => {
        const n = d.nodes.find((x) => x.id === id);
        if (n) Object.assign(n, patch);
      }),

    updateGroup: (id, patch) =>
      get().change((d) => {
        const g = d.groups.find((x) => x.id === id);
        if (g) Object.assign(g, patch);
      }),

    updateEdge: (id, patch) => {
      get().change((d) => {
        const e = d.edges.find((x) => x.id === id);
        if (e) Object.assign(e, patch);
      });
      const style: Partial<EdgeDefaults> = {};
      if (patch.line) style.line = patch.line;
      if (patch.head) style.head = patch.head;
      if (patch.both !== undefined) style.both = patch.both;
      set({ edgeDefaults: { ...get().edgeDefaults, ...style } });
    },

    renameId: (oldId, raw) => {
      const newId = raw.trim();
      if (newId === oldId) return null;
      if (!/^[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*$/u.test(newId)) return 'Nur Buchstaben, Ziffern, _ und -';
      if (/^(end|graph|subgraph|flowchart|class|classDef|style|click|direction)$/i.test(newId))
        return 'Reserviertes Wort';
      if (allIds(get().diagram).includes(newId)) return 'ID ist bereits vergeben';
      get().change((d) => {
        for (const n of [...d.nodes, ...d.groups]) {
          if (n.id === oldId) n.id = newId;
          if (n.parent === oldId) n.parent = newId;
        }
        for (const e of d.edges) {
          if (e.source === oldId) e.source = newId;
          if (e.target === oldId) e.target = newId;
        }
      });
      set({ selection: get().selection.map((s) => (s === oldId ? newId : s)) });
      return null;
    },

    setColor: (ids, className) =>
      get().change((d) => {
        ensureClassDef(d, className);
        for (const item of [...d.nodes, ...d.groups]) if (ids.includes(item.id)) item.className = className;
      }),

    setParent: (id, parent, opts) =>
      get().change((d) => {
        const item = d.nodes.find((n) => n.id === id) ?? d.groups.find((g) => g.id === id);
        if (!item || item.parent === parent) return;
        // prevent cycles for groups
        for (let p = parent; p; p = d.groups.find((g) => g.id === p)?.parent) if (p === id) return;
        const abs = absoluteOf(d, id);
        const pAbs = parent ? absoluteOf(d, parent) : { x: 0, y: 0 };
        item.parent = parent;
        item.x = abs.x - pAbs.x;
        item.y = abs.y - pAbs.y;
      }, opts),

    deleteIds: (ids) => {
      if (!ids.length) return;
      get().change((d) => {
        const del = new Set(ids);
        // deleting a group keeps its children (moved to the group's parent)
        for (const g of d.groups.filter((x) => del.has(x.id))) {
          for (const c of [...d.nodes, ...d.groups]) {
            if (c.parent === g.id && !del.has(c.id)) {
              c.x += g.x;
              c.y += g.y;
              c.parent = g.parent;
            }
          }
        }
        d.nodes = d.nodes.filter((n) => !del.has(n.id));
        d.groups = d.groups.filter((g) => !del.has(g.id));
        d.edges = d.edges.filter((e) => !del.has(e.id) && !del.has(e.source) && !del.has(e.target));
      });
      set({ selection: [] });
    },

    duplicate: (ids) => {
      const d0 = get().diagram;
      const nodes = d0.nodes.filter((n) => ids.includes(n.id));
      if (!nodes.length) return;
      const map = new Map<string, string>();
      get().change((d) => {
        for (const n of nodes) {
          const id = nextId(allIds(d));
          map.set(n.id, id);
          d.nodes.push({ ...structuredClone(n), id, x: n.x + 30, y: n.y + 30 });
        }
        for (const e of d0.edges) {
          if (map.has(e.source) && map.has(e.target)) {
            d.edges.push({ ...e, id: `e${d.edges.length + 1}_${Date.now() % 10000}`, source: map.get(e.source)!, target: map.get(e.target)! });
          }
        }
      });
      set({ selection: [...map.values()] });
    },

    setDirection: (dir) => get().change((d) => void (d.direction = dir)),

    layout: () => {
      get().commit();
      afterChange(autoLayout(get().diagram), { fitNonce: get().fitNonce + 1 });
    },

    setCode: (code) => set({ code, codeDirty: true }),

    applyCode: () => {
      const { code, diagram } = get();
      const r = parse(code);
      if (r.errors.length) {
        set({ codeErrors: r.errors });
        return false;
      }
      get().commit();
      const { diagram: placed, full } = place(r.diagram, r.layout, diagram);
      const ids = new Set(allIds(placed));
      // keep the user's text as-is (no reformatting while typing)
      set({
        diagram: placed,
        codeDirty: false,
        codeErrors: [],
        dirty: true,
        fitNonce: full ? get().fitNonce + 1 : get().fitNonce,
        selection: get().selection.filter((s) => ids.has(s) || placed.edges.some((e) => e.id === s)),
      });
      return true;
    },

    setAutoUpdate: (on) => set({ autoUpdate: on }),

    newDiagram: () => {
      const d = emptyDiagram();
      set({ past: [], future: [], selection: [], filePath: null, ...NO_CLOUD, title: null, codeDirty: false });
      afterChange(d, { dirty: false, fitNonce: get().fitNonce + 1 });
    },

    load: (text, path) => {
      const r = parse(text);
      if (r.errors.length) {
        // show the text so the user can fix it
        set({ code: text, codeDirty: true, codeErrors: r.errors, filePath: path, ...NO_CLOUD, title: null });
        return;
      }
      const d = placeDiagram(r.diagram, r.layout, null);
      set({ past: [], future: [], selection: [], filePath: path, ...NO_CLOUD, title: null, codeDirty: false });
      afterChange(d, { dirty: false, fitNonce: get().fitNonce + 1 });
    },

    openCloud: ({ id, name, content, version, folder_id }) => {
      get().load(content, null);
      set({ cloudId: id, cloudVersion: version, conflict: false, saveFailed: false, title: name, ...(folder_id !== undefined && { cloudFolder: folder_id }) });
    },

    markSaved: (path) => set({ dirty: false, filePath: path }),
    setTitle: (title) => set({ title: title?.trim() || null }),

    fileContent: () => generateWithLayout(get().diagram),
  };
});

