import { memo, useEffect, useRef, useState } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  Handle,
  type EdgeProps,
  type InternalNode,
  type NodeProps,
  NodeResizer,
  Position,
  getSmoothStepPath,
  useInternalNode,
  useStore as useFlowStore,
} from '@xyflow/react';
import { useStore } from '../store';
import { assetUrl } from '../desktop';
import { GROUP_DEFAULT, ShapeSvg, colorsFor } from './shapes';

/** Inline text editor used for node labels, group titles and edge labels. */
export function InlineEditor({
  value,
  onDone,
  className,
  style,
  singleLine,
}: {
  value: string;
  onDone: (v: string | null) => void;
  className?: string;
  style?: React.CSSProperties;
  singleLine?: boolean;
}) {
  const [v, setV] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const finish = (val: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(val);
  };
  return (
    <textarea
      ref={ref}
      className={`inline-editor nodrag nowheel nopan ${className ?? ''}`}
      style={style}
      value={v}
      rows={Math.max(1, v.split('\n').length)}
      onChange={(e) => setV(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter' && (!e.shiftKey || singleLine)) {
          e.preventDefault();
          finish(v);
        } else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(v)}
      onMouseDown={(e) => e.stopPropagation()}
    />
  );
}

const HANDLES: [string, Position][] = [
  ['t', Position.Top],
  ['r', Position.Right],
  ['b', Position.Bottom],
  ['l', Position.Left],
];

function Handles() {
  return (
    <>
      {HANDLES.map(([id, pos]) => (
        <Handle key={id} id={id} type="source" position={pos} className="conn-handle" />
      ))}
    </>
  );
}

export const ShapeNode = memo(function ShapeNode({ id, selected, width, height }: NodeProps) {
  const node = useStore((s) => s.diagram.nodes.find((n) => n.id === id));
  const classDefs = useStore((s) => s.diagram.classDefs);
  const editing = useStore((s) => s.editing === id);
  const filePath = useStore((s) => s.filePath);
  if (!node) return null;
  const w = width ?? 150;
  const h = height ?? 60;
  const colors = colorsFor({ classDefs }, node);
  const done = (v: string | null) => {
    const s = useStore.getState();
    s.setEditing(null);
    if (v !== null && v !== node.label) s.updateNode(id, { label: v });
  };
  const round = node.shape === 'circle' || node.shape === 'doublecircle';
  const textInset = node.shape === 'diamond' ? { left: w * 0.18, right: w * 0.18, top: h * 0.2, bottom: h * 0.2 } : {};

  return (
    <div className={`shape-node ${selected ? 'selected' : ''}`} style={{ width: w, height: h }}>
      <NodeResizer
        isVisible={selected}
        minWidth={40}
        minHeight={30}
        keepAspectRatio={round}
        color="#3b82f6"
        onResizeStart={() => useStore.getState().commit()}
      />
      {node.img ? (
        <div className="image-node">
          <img src={assetUrl(node.img, filePath)} alt={node.label} draggable={false} />
          {(node.label || editing) && (
            <div className="image-label" style={{ color: colors.color }}>
              {editing ? <InlineEditor value={node.label} onDone={done} /> : node.label}
            </div>
          )}
        </div>
      ) : (
        <>
          <ShapeSvg shape={node.shape} w={w} h={h} colors={colors} />
          <div className="node-label" style={{ color: colors.color, ...textInset }}>
            {editing ? <InlineEditor value={node.label} onDone={done} /> : node.label || ' '}
          </div>
        </>
      )}
      <Handles />
    </div>
  );
});

export const GroupNode = memo(function GroupNode({ id, selected, width, height }: NodeProps) {
  const group = useStore((s) => s.diagram.groups.find((g) => g.id === id));
  const classDefs = useStore((s) => s.diagram.classDefs);
  const editing = useStore((s) => s.editing === id);
  if (!group) return null;
  const colors = colorsFor({ classDefs }, group, GROUP_DEFAULT);
  return (
    <div
      className={`group-node ${selected ? 'selected' : ''}`}
      style={{
        width,
        height,
        background: colors.fill,
        borderColor: colors.stroke,
        borderWidth: colors.strokeWidth,
        borderStyle: colors.dash ? 'dashed' : 'solid',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={120}
        minHeight={80}
        color="#3b82f6"
        onResizeStart={() => useStore.getState().commit()}
      />
      <div className="group-title" style={{ color: colors.color }}>
        {editing ? (
          <InlineEditor
            singleLine
            value={group.title}
            onDone={(v) => {
              const s = useStore.getState();
              s.setEditing(null);
              if (v !== null && v !== group.title) s.updateGroup(id, { title: v.replace(/\n/g, ' ') });
            }}
          />
        ) : (
          group.title || group.id
        )}
        {group.direction && <span className="group-dir">{group.direction}</span>}
      </div>
      <Handles />
    </div>
  );
});

// ------------------------------------------------------------------ edges

function center(n: InternalNode) {
  const w = n.measured.width ?? 0;
  const h = n.measured.height ?? 0;
  return { x: n.internals.positionAbsolute.x + w / 2, y: n.internals.positionAbsolute.y + h / 2, w, h };
}

/** Pick the sides facing each other and return the attachment points. */
function edgeParams(s: InternalNode, t: InternalNode) {
  const a = center(s);
  const b = center(t);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const horizontal = Math.abs(dx) * (a.h + b.h) > Math.abs(dy) * (a.w + b.w);
  if (horizontal) {
    const sgn = Math.sign(dx) || 1;
    return {
      sx: a.x + (sgn * a.w) / 2,
      sy: a.y,
      tx: b.x - (sgn * b.w) / 2,
      ty: b.y,
      sp: sgn > 0 ? Position.Right : Position.Left,
      tp: sgn > 0 ? Position.Left : Position.Right,
    };
  }
  const sgn = Math.sign(dy) || 1;
  return {
    sx: a.x,
    sy: a.y + (sgn * a.h) / 2,
    tx: b.x,
    ty: b.y - (sgn * b.h) / 2,
    sp: sgn > 0 ? Position.Bottom : Position.Top,
    tp: sgn > 0 ? Position.Top : Position.Bottom,
  };
}

type Rect = { x: number; y: number; w: number; h: number };

/** Polyline with rounded corners. */
function roundedPath(pts: [number, number][], r = 10): string {
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[i + 1];
    const d1 = Math.hypot(cx - px, cy - py);
    const d2 = Math.hypot(nx - cx, ny - cy);
    const k = Math.min(r, d1 / 2, d2 / 2);
    const ax = cx - ((cx - px) / (d1 || 1)) * k;
    const ay = cy - ((cy - py) / (d1 || 1)) * k;
    const bx = cx + ((nx - cx) / (d2 || 1)) * k;
    const by = cy + ((ny - cy) / (d2 || 1)) * k;
    d += ` L${ax},${ay} Q${cx},${cy} ${bx},${by}`;
  }
  const [lx, ly] = pts[pts.length - 1];
  return d + ` L${lx},${ly}`;
}

/**
 * If shapes sit between source and target, route around them:
 * out of the source, sideways past the obstacles, along, back and into the target.
 * Works in "flow" coordinates where the main axis is y; horizontal edges are swapped.
 */
function detour(sx: number, sy: number, tx: number, ty: number, rects: Rect[], horizontal: boolean) {
  const sw = (x: number, y: number): [number, number] => (horizontal ? [y, x] : [x, y]);
  const [a, b] = sw(sx, sy);
  const [c, e] = sw(tx, ty);
  const obs = rects.map((r) => (horizontal ? { x: r.y, y: r.x, w: r.h, h: r.w } : r));
  const dir = Math.sign(e - b) || 1;
  const y0 = Math.min(b, e);
  const y1 = Math.max(b, e);
  const midY = (b + e) / 2;
  const hits = (x: number, ya: number, yb: number) =>
    obs.filter((o) => x > o.x - 6 && x < o.x + o.w + 6 && Math.max(ya, yb) > o.y && Math.min(ya, yb) < o.y + o.h);
  const hitsH = (y: number, xa: number, xb: number) =>
    obs.some((o) => y > o.y - 6 && y < o.y + o.h + 6 && Math.max(xa, xb) > o.x && Math.min(xa, xb) < o.x + o.w);
  const blocked = [...hits(a, y0, midY), ...hits(c, midY, y1)];
  if (!blocked.length && !hitsH(midY, a, c)) return null;
  const inRange = obs.filter((o) => o.y + o.h > y0 && o.y < y1);
  const left = Math.min(...blocked.map((o) => o.x)) - 24;
  const right = Math.max(...blocked.map((o) => o.x + o.w)) + 24;
  const free = (x: number) => !hits(x, y0 + 18, y1 - 18).length;
  const near = [left, right].sort((p, q) => Math.abs(p - a) + Math.abs(p - c) - (Math.abs(q - a) + Math.abs(q - c)));
  let lane = near.find(free);
  if (lane === undefined) lane = Math.max(...inRange.map((o) => o.x + o.w)) + 24;
  const off = 18 * dir;
  const pts: [number, number][] = [
    [a, b],
    [a, b + off],
    [lane, b + off],
    [lane, e - off],
    [c, e - off],
    [c, e],
  ].map(([x, y]) => sw(x, y));
  const [lx, ly] = sw(lane, midY);
  return { path: roundedPath(pts), lx, ly };
}

export const FloatingEdge = memo(function FloatingEdge({ id, source, target, selected }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const edge = useStore((st) => st.diagram.edges.find((e) => e.id === id));
  const editing = useStore((st) => st.editing === id);
  const nodeLookup = useFlowStore((st) => st.nodeLookup);
  if (!s || !t || !edge) return null;

  let path: string;
  let lx: number;
  let ly: number;
  if (source === target) {
    const c = center(s);
    const x = c.x + c.w / 2;
    path = `M${x},${c.y - 12} C${x + 60},${c.y - 50} ${x + 60},${c.y + 50} ${x},${c.y + 12}`;
    lx = x + 48;
    ly = c.y;
  } else {
    const p = edgeParams(s, t);
    const rects: Rect[] = [];
    for (const n of nodeLookup.values()) {
      if (n.type !== 'shape' || n.id === source || n.id === target) continue;
      const { x, y } = n.internals.positionAbsolute;
      rects.push({ x, y, w: n.measured.width ?? 0, h: n.measured.height ?? 0 });
    }
    const horizontal = p.sp === Position.Left || p.sp === Position.Right;
    const around = detour(p.sx, p.sy, p.tx, p.ty, rects, horizontal);
    if (around) ({ path, lx, ly } = around);
    else [path, lx, ly] = getSmoothStepPath({
      sourceX: p.sx,
      sourceY: p.sy,
      targetX: p.tx,
      targetY: p.ty,
      sourcePosition: p.sp,
      targetPosition: p.tp,
      borderRadius: 10,
    });
  }
  const sel = selected ? '-sel' : '';
  const marker = (head: string) => (head === 'none' ? undefined : `url(#me-${head}${sel})`);
  const style: React.CSSProperties = {
    stroke: selected ? '#3b82f6' : '#333',
    strokeWidth: edge.line === 'thick' ? 3.5 : 1.6,
    strokeDasharray: edge.line === 'dotted' ? '3 4' : undefined,
  };

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={style}
        markerEnd={marker(edge.head)}
        markerStart={edge.both ? marker(edge.head) : undefined}
        interactionWidth={18}
      />
      {(edge.label || editing) && (
        <EdgeLabelRenderer>
          <div
            className={`edge-label nodrag nopan ${selected ? 'selected' : ''}`}
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            onDoubleClick={() => useStore.getState().setEditing(id)}
            onClick={() => useStore.getState().select([id])}
          >
            {editing ? (
              <InlineEditor
                value={edge.label}
                onDone={(v) => {
                  const st = useStore.getState();
                  st.setEditing(null);
                  if (v !== null && v !== edge.label) st.updateEdge(id, { label: v });
                }}
              />
            ) : (
              edge.label
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

/** Marker definitions referenced by edges (normal + selected color). */
export function EdgeMarkers() {
  const defs = (suffix: string, color: string) => (
    <>
      <marker id={`me-arrow${suffix}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M0,0 L10,5 L0,10 z" fill={color} />
      </marker>
      <marker id={`me-circle${suffix}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <circle cx="5" cy="5" r="4" fill={color} />
      </marker>
      <marker id={`me-cross${suffix}`} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="10" markerHeight="10" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M1,1 L9,9 M9,1 L1,9" stroke={color} strokeWidth="2" />
      </marker>
    </>
  );
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0 }} aria-hidden>
      <defs>
        {defs('', '#333')}
        {defs('-sel', '#3b82f6')}
      </defs>
    </svg>
  );
}
