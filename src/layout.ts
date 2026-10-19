import dagre from '@dagrejs/dagre';
import { type DNode, type Diagram, shapeInfo } from './model';
import type { Layout } from './mermaid/generate';

const GROUP_PAD = 24;
const GROUP_TITLE = 32;

/** Effective size of a node: explicit size, or estimated from its label. */
export function nodeSize(n: DNode): { w: number; h: number } {
  const info = shapeInfo(n.shape);
  if (n.w && n.h) return { w: n.w, h: n.h };
  const lines = n.label.split('\n');
  const longest = Math.max(...lines.map((l) => l.length));
  const textW = longest * 7.4 + 36;
  const textH = lines.length * 19 + 26;
  if (n.shape === 'circle' || n.shape === 'doublecircle') {
    const s = Math.max(info.w, Math.min(220, Math.max(textW, textH) * 0.9));
    return { w: s, h: s };
  }
  if (n.shape === 'diamond') {
    return { w: Math.max(info.w, Math.min(320, textW * 1.5)), h: Math.max(info.h, textH * 1.6) };
  }
  return { w: Math.max(info.w, Math.min(320, textW)), h: Math.max(info.h, textH) };
}

const absolutePos = (d: Diagram, parent: string | undefined): { x: number; y: number } => {
  let x = 0;
  let y = 0;
  let p = parent;
  while (p) {
    const g = d.groups.find((gg) => gg.id === p);
    if (!g) break;
    x += g.x;
    y += g.y;
    p = g.parent;
  }
  return { x, y };
};

export const absoluteOf = (d: Diagram, id: string) => {
  const n = d.nodes.find((x) => x.id === id) ?? d.groups.find((x) => x.id === id);
  if (!n) return { x: 0, y: 0 };
  const p = absolutePos(d, n.parent);
  return { x: p.x + n.x, y: p.y + n.y };
};

/** Full automatic layout with dagre. Returns a new diagram. */
export function autoLayout(src: Diagram): Diagram {
  const d: Diagram = structuredClone(src);
  const g = new dagre.graphlib.Graph({ compound: true });
  const rankdir = d.direction === 'TD' ? 'TB' : d.direction;
  g.setGraph({ rankdir, nodesep: 50, ranksep: 70, marginx: 40, marginy: 40 });
  g.setDefaultEdgeLabel(() => ({}));

  const groupIds = new Set(d.groups.map((x) => x.id));
  for (const grp of d.groups) g.setNode(grp.id, {});
  for (const grp of d.groups) if (grp.parent && groupIds.has(grp.parent)) g.setParent(grp.id, grp.parent);
  for (const n of d.nodes) {
    const { w, h } = nodeSize(n);
    g.setNode(n.id, { width: w, height: h });
    if (n.parent && groupIds.has(n.parent)) g.setParent(n.id, n.parent);
  }
  for (const e of d.edges) {
    if (groupIds.has(e.source) || groupIds.has(e.target)) continue;
    if (!g.hasNode(e.source) || !g.hasNode(e.target)) continue;
    g.setEdge(e.source, e.target, e.label ? { width: e.label.length * 7 + 16, height: 22, labelpos: 'c' } : {});
  }
  // Empty groups still need a size
  for (const grp of d.groups) {
    const hasChildren = d.nodes.some((n) => n.parent === grp.id) || d.groups.some((c) => c.parent === grp.id);
    if (!hasChildren) g.setNode(grp.id, { width: 200, height: 120 });
  }
  dagre.layout(g);

  // Absolute top-left positions for nodes
  const abs = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const n of d.nodes) {
    const p = g.node(n.id);
    const { w, h } = nodeSize(n);
    abs.set(n.id, { x: p.x - w / 2, y: p.y - h / 2, w, h });
  }
  // Groups: bounding boxes from children, deepest first
  const depth = (id: string): number => {
    const grp = d.groups.find((x) => x.id === id);
    return grp?.parent ? 1 + depth(grp.parent) : 0;
  };
  for (const grp of [...d.groups].sort((a, b) => depth(b.id) - depth(a.id))) {
    const kids = [
      ...d.nodes.filter((n) => n.parent === grp.id).map((n) => abs.get(n.id)!),
      ...d.groups.filter((c) => c.parent === grp.id).map((c) => abs.get(c.id)!),
    ].filter(Boolean);
    if (!kids.length) {
      const p = g.node(grp.id);
      abs.set(grp.id, { x: p.x - 100, y: p.y - 60, w: 200, h: 120 });
      continue;
    }
    const x0 = Math.min(...kids.map((k) => k.x)) - GROUP_PAD;
    const y0 = Math.min(...kids.map((k) => k.y)) - GROUP_PAD - GROUP_TITLE;
    const x1 = Math.max(...kids.map((k) => k.x + k.w)) + GROUP_PAD;
    const y1 = Math.max(...kids.map((k) => k.y + k.h)) + GROUP_PAD;
    abs.set(grp.id, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  }
  // Back to parent-relative coordinates
  for (const grp of d.groups) {
    const a = abs.get(grp.id)!;
    const pa = grp.parent ? abs.get(grp.parent) : undefined;
    Object.assign(grp, { x: a.x - (pa?.x ?? 0), y: a.y - (pa?.y ?? 0), w: a.w, h: a.h });
  }
  for (const n of d.nodes) {
    const a = abs.get(n.id)!;
    const pa = n.parent ? abs.get(n.parent) : undefined;
    n.x = a.x - (pa?.x ?? 0);
    n.y = a.y - (pa?.y ?? 0);
    n.w = undefined;
    n.h = undefined;
  }
  return d;
}

/**
 * Apply positions to a freshly parsed diagram: from the layout comment, from the
 * previous diagram (same ids), and place any remaining nodes next to a neighbour.
 */
export function placeDiagram(next: Diagram, layout: Layout | null, prev: Diagram | null): Diagram {
  const d: Diagram = structuredClone(next);
  const known = new Set<string>();
  const prevNodes = new Map(prev?.nodes.map((n) => [n.id, n]));
  const prevGroups = new Map(prev?.groups.map((n) => [n.id, n]));

  for (const n of d.nodes) {
    const l = layout?.[n.id];
    const p = prevNodes.get(n.id);
    if (l) {
      [n.x, n.y] = l;
      if (l.length >= 4) [, , n.w, n.h] = l;
      known.add(n.id);
    } else if (p && p.parent === n.parent) {
      Object.assign(n, { x: p.x, y: p.y, w: p.w, h: p.h });
      known.add(n.id);
    }
  }
  for (const grp of d.groups) {
    const l = layout?.[grp.id];
    const p = prevGroups.get(grp.id);
    if (l && l.length >= 4) {
      [grp.x, grp.y, grp.w, grp.h] = l;
      known.add(grp.id);
    } else if (p && p.parent === grp.parent) {
      Object.assign(grp, { x: p.x, y: p.y, w: p.w, h: p.h });
      known.add(grp.id);
    }
  }

  const total = d.nodes.length + d.groups.length;
  if (total === 0) return d;
  // Mostly unknown (new file / big paste) or new groups → full auto layout
  const unknownGroups = d.groups.some((g) => !known.has(g.id));
  if (known.size === 0 || unknownGroups || known.size < total / 2) return autoLayout(d);

  const horizontal = d.direction === 'LR' || d.direction === 'RL';
  for (const n of d.nodes) {
    if (known.has(n.id)) continue;
    const neighbour = d.edges
      .map((e) => (e.target === n.id ? e.source : e.source === n.id ? e.target : null))
      .find((id) => id && known.has(id) && d.nodes.some((x) => x.id === id && x.parent === n.parent));
    const nb = neighbour ? d.nodes.find((x) => x.id === neighbour)! : null;
    const size = nodeSize(n);
    let x: number;
    let y: number;
    if (nb) {
      const ns = nodeSize(nb);
      const incoming = d.edges.some((e) => e.source === nb.id && e.target === n.id);
      const sign = incoming ? 1 : -1;
      x = horizontal ? nb.x + sign * (ns.w + 70) : nb.x + ns.w / 2 - size.w / 2;
      y = horizontal ? nb.y + ns.h / 2 - size.h / 2 : nb.y + sign * (ns.h + 60);
    } else {
      const siblings = d.nodes.filter((x) => known.has(x.id) && x.parent === n.parent);
      x = siblings.length ? Math.min(...siblings.map((s) => s.x)) : 40;
      y = siblings.length ? Math.max(...siblings.map((s) => s.y + nodeSize(s).h)) + 60 : 40;
    }
    // avoid stacking exactly on top of another node
    while (d.nodes.some((o) => known.has(o.id) && o.parent === n.parent && Math.abs(o.x - x) < 30 && Math.abs(o.y - y) < 30)) {
      if (horizontal) y += size.h + 30;
      else x += size.w + 40;
    }
    n.x = x;
    n.y = y;
    known.add(n.id);
  }
  return d;
}
