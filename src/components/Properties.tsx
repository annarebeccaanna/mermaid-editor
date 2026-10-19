import { useEffect, useState } from 'react';
import { ArrowLeftRight, Ban, ImagePlus, Pin, Trash2 } from 'lucide-react';
import {
  type ArrowHead,
  type DEdge,
  type DGroup,
  type DNode,
  type Direction,
  type LineStyle,
  SHAPES,
  parseStyle,
} from '../model';
import { useStore } from '../store';
import { usePrefs } from '../prefs';
import { desktop } from '../desktop';
import { ShapeIcon } from './shapes';

export const DIRECTIONS: [Direction, string][] = [
  ['TD', '↓ Oben → Unten'],
  ['LR', '→ Links → Rechts'],
  ['BT', '↑ Unten → Oben'],
  ['RL', '← Rechts → Links'],
];

/** Text field that commits on blur / Enter so typing doesn't spam history. */
function Field({
  label,
  value,
  onCommit,
  multiline,
  validate,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => string | null | void;
  multiline?: boolean;
  validate?: boolean;
}) {
  const [v, setV] = useState(value);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setV(value);
    setErr(null);
  }, [value]);
  const commit = () => {
    if (v === value) return;
    const r = onCommit(v);
    if (validate && r) {
      setErr(r);
      setV(value);
    } else setErr(null);
  };
  const props = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !(multiline && e.shiftKey)) {
        e.preventDefault();
        commit();
      }
      if (e.key === 'Escape') setV(value);
    },
  };
  return (
    <label className="field">
      <span>{label}</span>
      {multiline ? <textarea rows={Math.min(5, Math.max(2, v.split('\n').length))} {...props} /> : <input {...props} />}
      {err && <em className="field-error">{err}</em>}
    </label>
  );
}

function ColorPicker({ ids, current, defaultFor }: { ids: string[]; current?: string; defaultFor?: string }) {
  const colors = usePrefs((s) => s.colors);
  const shapeDefaults = usePrefs((s) => s.shapeDefaults);
  const classDefs = useStore((s) => s.diagram.classDefs);
  const custom = Object.keys(classDefs).filter((c) => !colors.some((p) => p.name === c));
  const set = (c: string | undefined) => useStore.getState().setColor(ids, c);
  return (
    <div className="field">
      <span>Farbe</span>
      <div className="swatches">
        <button className={`swatch none ${!current ? 'active' : ''}`} title="Standard (ohne Klasse)" onClick={() => set(undefined)}>
          <Ban size={14} />
        </button>
        {colors.map((p) => (
          <button
            key={p.name}
            className={`swatch ${current === p.name ? 'active' : ''}`}
            title={`${p.label} (${p.name})`}
            style={{ background: p.fill, borderColor: p.stroke }}
            onClick={() => set(p.name)}
          />
        ))}
        {custom.map((c) => {
          const css = parseStyle(classDefs[c]);
          return (
            <button
              key={c}
              className={`swatch ${current === c ? 'active' : ''}`}
              title={`Klasse „${c}“ aus dem Diagramm`}
              style={{ background: css.fill ?? '#fff', borderColor: css.stroke ?? '#999' }}
              onClick={() => set(c)}
            />
          );
        })}
      </div>
      {defaultFor && (current || shapeDefaults[defaultFor as never]) && (
        <button
          className="link-btn"
          title="Neue Elemente dieser Form bekommen automatisch diese Farbe"
          onClick={() => usePrefs.getState().setShapeDefault(defaultFor as never, current)}
        >
          <Pin size={12} />
          {shapeDefaults[defaultFor as never] === current ? 'Ist Standardfarbe dieser Form' : current ? 'Als Standardfarbe für diese Form' : 'Ohne Farbe als Standard für diese Form'}
        </button>
      )}
    </div>
  );
}

function GroupSelect({ item }: { item: DNode | DGroup }) {
  const groups = useStore((s) => s.diagram.groups);
  const options = groups.filter((g) => g.id !== item.id);
  if (!options.length) return null;
  return (
    <label className="field">
      <span>In Gruppe</span>
      <select value={item.parent ?? ''} onChange={(e) => useStore.getState().setParent(item.id, e.target.value || undefined)}>
        <option value="">– keine –</option>
        {options.map((g) => (
          <option key={g.id} value={g.id}>
            {g.title || g.id} ({g.id})
          </option>
        ))}
      </select>
    </label>
  );
}

function NodeProps({ node }: { node: DNode }) {
  const s = useStore.getState();
  return (
    <>
      <h3>{node.img ? 'Bild' : 'Form'}</h3>
      <Field label="Text" value={node.label} multiline onCommit={(v) => s.updateNode(node.id, { label: v })} />
      <Field label="ID im Code" value={node.id} validate onCommit={(v) => s.renameId(node.id, v)} />
      {node.img ? (
        <div className="field">
          <span>Bildquelle</span>
          <div className="row">
            <Field label="" value={node.img} onCommit={(v) => s.updateNode(node.id, { img: v })} />
            {desktop && (
              <button
                className="icon-btn"
                title="Bild wählen"
                onClick={async () => {
                  const img = await desktop!.pickImage();
                  if (img) useStore.getState().updateNode(node.id, { img });
                }}
              >
                <ImagePlus size={16} />
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="field">
          <span>Form</span>
          <div className="shape-grid">
            {SHAPES.map((sh) => (
              <button
                key={sh.shape}
                title={sh.name}
                className={`shape-btn ${node.shape === sh.shape ? 'active' : ''}`}
                onClick={() => s.updateNode(node.id, { shape: sh.shape, w: undefined, h: undefined })}
              >
                <ShapeIcon shape={sh.shape} size={18} />
              </button>
            ))}
          </div>
        </div>
      )}
      <ColorPicker ids={[node.id]} current={node.className} defaultFor={node.img ? undefined : node.shape} />
      <GroupSelect item={node} />
      {(node.w || node.h) && !node.img && (
        <button className="link-btn" onClick={() => s.updateNode(node.id, { w: undefined, h: undefined })}>
          Größe automatisch
        </button>
      )}
    </>
  );
}

function GroupProps({ group }: { group: DGroup }) {
  const s = useStore.getState();
  return (
    <>
      <h3>Gruppe (Subgraph)</h3>
      <Field label="Titel" value={group.title} onCommit={(v) => s.updateGroup(group.id, { title: v })} />
      <Field label="ID im Code" value={group.id} validate onCommit={(v) => s.renameId(group.id, v)} />
      <label className="field">
        <span>Richtung innen</span>
        <select
          value={group.direction ?? ''}
          onChange={(e) => s.updateGroup(group.id, { direction: (e.target.value || undefined) as Direction | undefined })}
        >
          <option value="">wie Diagramm</option>
          {DIRECTIONS.map(([d, l]) => (
            <option key={d} value={d}>
              {l}
            </option>
          ))}
        </select>
      </label>
      <ColorPicker ids={[group.id]} current={group.className} defaultFor="group" />
      <GroupSelect item={group} />
      <p className="hint">Formen hineinziehen, um sie der Gruppe hinzuzufügen. Beim Löschen der Gruppe bleiben die Inhalte erhalten.</p>
    </>
  );
}

const LINES: [LineStyle, string, string][] = [
  ['solid', 'Durchgezogen', '──'],
  ['dotted', 'Gepunktet', '┄┄'],
  ['thick', 'Dick', '━━'],
];
const HEADS: [ArrowHead, string, string][] = [
  ['arrow', 'Pfeil', '→'],
  ['none', 'Keine', '—'],
  ['circle', 'Kreis', '○'],
  ['cross', 'Kreuz', '×'],
];

function EdgeProps({ edge }: { edge: DEdge }) {
  const s = useStore.getState();
  return (
    <>
      <h3>Verbindung</h3>
      <Field label="Beschriftung" value={edge.label} onCommit={(v) => s.updateEdge(edge.id, { label: v })} />
      <div className="field">
        <span>Linie</span>
        <div className="seg">
          {LINES.map(([v, l, icon]) => (
            <button key={v} title={l} className={edge.line === v ? 'active' : ''} onClick={() => s.updateEdge(edge.id, { line: v })}>
              {icon}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Spitze</span>
        <div className="seg">
          {HEADS.map(([v, l, icon]) => (
            <button key={v} title={l} className={edge.head === v ? 'active' : ''} onClick={() => s.updateEdge(edge.id, { head: v })}>
              {icon}
            </button>
          ))}
        </div>
      </div>
      <label className="check">
        <input type="checkbox" checked={edge.both} disabled={edge.head === 'none'} onChange={(e) => s.updateEdge(edge.id, { both: e.target.checked })} />
        An beiden Enden
      </label>
      <button
        className="link-btn"
        onClick={() => s.updateEdge(edge.id, { source: edge.target, target: edge.source })}
      >
        <ArrowLeftRight size={12} /> Richtung umkehren
      </button>
      <p className="hint">
        {edge.source} → {edge.target}
      </p>
    </>
  );
}

export function Properties() {
  const selection = useStore((s) => s.selection);
  const diagram = useStore((s) => s.diagram);
  const items = selection
    .map((id) => diagram.nodes.find((n) => n.id === id) ?? diagram.groups.find((g) => g.id === id) ?? diagram.edges.find((e) => e.id === id))
    .filter(Boolean);

  let body: React.ReactNode;
  if (items.length === 0) return null;
  if (items.length === 1) {
    const id = selection[0];
    const node = diagram.nodes.find((n) => n.id === id);
    const group = diagram.groups.find((g) => g.id === id);
    const edge = diagram.edges.find((e) => e.id === id);
    body = node ? <NodeProps key={id} node={node} /> : group ? <GroupProps key={id} group={group} /> : edge ? <EdgeProps key={id} edge={edge} /> : null;
  } else {
    const colorable = selection.filter((id) => diagram.nodes.some((n) => n.id === id) || diagram.groups.some((g) => g.id === id));
    const nodeIds = selection.filter((id) => diagram.nodes.some((n) => n.id === id));
    body = (
      <>
        <h3>{items.length} Elemente</h3>
        {colorable.length > 0 && <ColorPicker ids={colorable} />}
        {nodeIds.length > 0 && (
          <div className="field">
            <span>Form</span>
            <div className="shape-grid">
              {SHAPES.map((sh) => (
                <button
                  key={sh.shape}
                  title={sh.name}
                  className="shape-btn"
                  onClick={() =>
                    useStore.getState().change((d) => {
                      for (const n of d.nodes) if (nodeIds.includes(n.id) && !n.img) Object.assign(n, { shape: sh.shape, w: undefined, h: undefined });
                    })
                  }
                >
                  <ShapeIcon shape={sh.shape} size={18} />
                </button>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <aside className="properties" onDoubleClick={(e) => e.stopPropagation()}>
      {body}
      {items.length > 0 && (
        <button className="danger-btn" onClick={() => useStore.getState().deleteIds(selection)}>
          <Trash2 size={14} /> Löschen
        </button>
      )}
    </aside>
  );
}
