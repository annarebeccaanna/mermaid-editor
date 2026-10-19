import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  type Edge,
  MiniMap,
  type Node,
  type NodeChange,
  ReactFlow,
  SelectionMode,
  useReactFlow,
} from '@xyflow/react';
import { useStore } from '../store';
import type { Diagram, Shape } from '../model';
import { absoluteOf, nodeSize } from '../layout';
import { EdgeMarkers, FloatingEdge, GroupNode, ShapeNode } from './nodes';
import { desktop } from '../desktop';
import { imageRef, openPath } from '../files';

const nodeTypes = { shape: ShapeNode, subgraph: GroupNode };
const edgeTypes = { floating: FloatingEdge };

export const SHAPE_MIME = 'application/x-mermaid-shape';

function groupDepth(d: Diagram, id: string): number {
  const g = d.groups.find((x) => x.id === id);
  return g?.parent ? 1 + groupDepth(d, g.parent) : 0;
}

/** Deepest group that contains the point (absolute coords), excluding `skip` and its descendants. */
export function groupAt(d: Diagram, x: number, y: number, skip?: string): string | undefined {
  const isInside = (id: string): boolean => {
    for (let p: string | undefined = id; p; p = d.groups.find((g) => g.id === p)?.parent) if (p === skip) return true;
    return false;
  };
  let best: string | undefined;
  let bestDepth = -1;
  for (const g of d.groups) {
    if (skip && isInside(g.id)) continue;
    const a = absoluteOf(d, g.id);
    if (x >= a.x && x <= a.x + g.w && y >= a.y && y <= a.y + g.h) {
      const dep = groupDepth(d, g.id);
      if (dep > bestDepth) {
        best = g.id;
        bestDepth = dep;
      }
    }
  }
  return best;
}

export function Canvas() {
  const diagram = useStore((s) => s.diagram);
  const selection = useStore((s) => s.selection);
  const fitNonce = useStore((s) => s.fitNonce);
  const rf = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);

  const nodes: Node[] = useMemo(() => {
    const sel = new Set(selection);
    const groups = [...diagram.groups]
      .sort((a, b) => groupDepth(diagram, a.id) - groupDepth(diagram, b.id))
      .map<Node>((g) => ({
        id: g.id,
        type: 'subgraph',
        position: { x: g.x, y: g.y },
        width: g.w,
        height: g.h,
        parentId: g.parent,
        selected: sel.has(g.id),
        data: {},
        zIndex: groupDepth(diagram, g.id) - 10,
      }));
    const shapes = diagram.nodes.map<Node>((n) => {
      const { w, h } = nodeSize(n);
      return {
        id: n.id,
        type: 'shape',
        position: { x: n.x, y: n.y },
        width: w,
        height: h,
        parentId: n.parent && diagram.groups.some((g) => g.id === n.parent) ? n.parent : undefined,
        selected: sel.has(n.id),
        data: {},
        zIndex: 1,
      };
    });
    return [...groups, ...shapes];
  }, [diagram, selection]);

  const edges: Edge[] = useMemo(() => {
    const sel = new Set(selection);
    return diagram.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'floating',
      selected: sel.has(e.id),
      zIndex: 5,
    }));
  }, [diagram.edges, selection]);

  useEffect(() => {
    if (fitNonce) requestAnimationFrame(() => rf.fitView({ padding: 0.15, duration: 250, maxZoom: 1.2 }));
  }, [fitNonce, rf]);
  // initial view
  useEffect(() => {
    requestAnimationFrame(() => rf.fitView({ padding: 0.15, maxZoom: 1.2 }));
  }, [rf]);

  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const s = useStore.getState();
    const moves = changes.filter((c) => c.type === 'position' && c.position);
    const dims = changes.filter((c) => c.type === 'dimensions' && c.resizing && c.dimensions);
    const selects = changes.filter((c) => c.type === 'select');
    if (moves.length || dims.length) {
      s.change(
        (d) => {
          for (const c of moves) {
            if (c.type !== 'position' || !c.position) continue;
            const item = d.nodes.find((n) => n.id === c.id) ?? d.groups.find((g) => g.id === c.id);
            if (item) {
              item.x = c.position.x;
              item.y = c.position.y;
            }
          }
          for (const c of dims) {
            if (c.type !== 'dimensions' || !c.dimensions) continue;
            const n = d.nodes.find((x) => x.id === c.id);
            const g = d.groups.find((x) => x.id === c.id);
            if (n) {
              n.w = c.dimensions.width;
              n.h = c.dimensions.height;
            }
            if (g) {
              g.w = c.dimensions.width;
              g.h = c.dimensions.height;
            }
          }
        },
        { history: false },
      );
    }
    if (selects.length) {
      const cur = new Set(s.selection);
      for (const c of selects) if (c.type === 'select') c.selected ? cur.add(c.id) : cur.delete(c.id);
      s.select([...cur]);
    }
  }, []);

  const onEdgesChange = useCallback((changes: { type: string; id?: string; selected?: boolean }[]) => {
    const s = useStore.getState();
    const cur = new Set(s.selection);
    let touched = false;
    for (const c of changes)
      if (c.type === 'select' && c.id) {
        touched = true;
        c.selected ? cur.add(c.id) : cur.delete(c.id);
      }
    if (touched) s.select([...cur]);
  }, []);

  /** After dragging: move nodes into / out of subgraphs. */
  const onNodeDragStop = useCallback((_e: unknown, _node: Node, dragged: Node[]) => {
    const s = useStore.getState();
    const d = s.diagram;
    const ids = new Set(dragged.map((n) => n.id));
    const moves: [string, string | undefined][] = [];
    for (const n of dragged) {
      const item = d.nodes.find((x) => x.id === n.id) ?? d.groups.find((x) => x.id === n.id);
      if (!item) continue;
      // parent itself moves with the selection → keep structure
      if (item.parent && ids.has(item.parent)) continue;
      const abs = absoluteOf(d, n.id);
      const size = 'w' in item && item.w && item.h ? { w: item.w, h: item.h } : nodeSize(item as never);
      const target = groupAt(d, abs.x + size.w / 2, abs.y + size.h / 2, d.groups.some((g) => g.id === n.id) ? n.id : undefined);
      if (target !== item.parent) moves.push([n.id, target]);
    }
    for (const [id, parent] of moves) s.setParent(id, parent, { history: false });
  }, []);

  const onConnect = useCallback((c: { source: string; target: string }) => {
    useStore.getState().addEdge(c.source, c.target);
  }, []);

  /** Dropping a connection on empty canvas creates a new connected node (Miro style). */
  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent, state: { isValid: boolean | null; fromNode: { id: string } | null }) => {
      if (state.isValid || !state.fromNode) return;
      const target = event.target as HTMLElement;
      if (!target.classList.contains('react-flow__pane')) return;
      const pt = 'changedTouches' in event ? event.changedTouches[0] : event;
      const pos = rf.screenToFlowPosition({ x: pt.clientX, y: pt.clientY });
      const s = useStore.getState();
      const from = s.diagram.nodes.find((n) => n.id === state.fromNode!.id);
      const shape: Shape = from && !['diamond', 'circle', 'doublecircle'].includes(from.shape) && !from.img ? from.shape : 'rect';
      const parent = groupAt(s.diagram, pos.x, pos.y);
      const id = s.addNode(shape, pos, { parent, label: '' });
      s.addEdge(state.fromNode.id, id);
      s.select([id]);
      s.setEditing(id);
    },
    [rf],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const s = useStore.getState();
      const parent = groupAt(s.diagram, pos.x, pos.y);
      const shape = e.dataTransfer.getData(SHAPE_MIME);
      if (shape === 'group') {
        s.addGroup(pos);
        return;
      }
      if (shape) {
        s.addNode(shape as Shape, pos, { parent });
        return;
      }
      // files from the OS: images become image nodes, diagrams are opened
      for (const file of Array.from(e.dataTransfer.files)) {
        const path = desktop?.pathForFile(file);
        if (/\.(mmd|mermaid)$/i.test(file.name)) {
          if (path) openPath(path);
          else s.load(await file.text(), null);
        } else if (file.type.startsWith('image/')) {
          const img = path ? imageRef(path) : await new Promise<string>((res) => {
            const r = new FileReader();
            r.onload = () => res(r.result as string);
            r.readAsDataURL(file);
          });
          s.addNode('rect', pos, { img, label: '', parent, className: undefined });
        }
      }
    },
    [rf],
  );

  /** Double click on empty canvas: new node there. */
  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      const s = useStore.getState();
      const groupEl = t.closest('.react-flow__node-subgraph');
      if (!t.classList.contains('react-flow__pane') && !(groupEl && !t.closest('.group-title'))) return;
      const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const id = s.addNode('rect', pos, { parent: groupAt(s.diagram, pos.x, pos.y), label: '' });
      s.setEditing(id);
    },
    [rf],
  );

  return (
    <div className="canvas" ref={wrapper} onDoubleClick={onDoubleClick} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}>
      <EdgeMarkers />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={() => useStore.getState().commit()}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onNodeDoubleClick={(_e, n) => useStore.getState().setEditing(n.id)}
        onEdgeDoubleClick={(_e, ed) => useStore.getState().setEditing(ed.id)}
        elevateNodesOnSelect={false}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={30}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control', 'Shift']}
        selectionMode={SelectionMode.Partial}
        panOnDrag
        zoomOnDoubleClick={false}
        snapToGrid
        snapGrid={[8, 8]}
        minZoom={0.1}
        maxZoom={4}
        defaultEdgeOptions={{ type: 'floating' }}
        connectionLineStyle={{ stroke: '#3b82f6', strokeWidth: 2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Cross} gap={24} size={6} color="#d4dbe3" />
        <MiniMap pannable zoomable nodeStrokeWidth={2} className="minimap" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>
    </div>
  );
}
