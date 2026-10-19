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

export const FloatingEdge = memo(function FloatingEdge({ id, source, target, selected }: EdgeProps) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  const edge = useStore((st) => st.diagram.edges.find((e) => e.id === id));
  const editing = useStore((st) => st.editing === id);
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
    [path, lx, ly] = getSmoothStepPath({
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
