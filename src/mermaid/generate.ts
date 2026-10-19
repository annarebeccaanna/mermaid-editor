import {
  type ArrowHead,
  type DEdge,
  type DGroup,
  type DNode,
  type Diagram,
  type LineStyle,
  shapeInfo,
} from '../model';

const INDENT = '    ';
const SAFE_TEXT = /^[\p{L}\p{N} _.,?!'\-:/]+$/u;

/** Escape a label for use inside Mermaid brackets; quotes only when needed. */
export function formatText(text: string): string {
  const t = text.replace(/\r/g, '');
  const safe =
    SAFE_TEXT.test(t) &&
    t.trim() === t &&
    !t.includes('--') &&
    !/^[/-]|\/$/.test(t) &&
    !/\b(end|graph|subgraph)\b/i.test(t);
  if (safe) return t;
  const escaped = t.replace(/"/g, '#quot;').replace(/\n/g, '<br>');
  return `"${escaped}"`;
}

export function nodeDef(n: DNode): string {
  if (n.img) {
    const q = (v: string) => `"${v.replace(/"/g, '#quot;').replace(/\n/g, '<br>')}"`;
    const parts = [`img: ${q(n.img)}`];
    if (n.label) parts.push(`label: ${q(n.label)}`, 'pos: "b"');
    if (n.w && n.h) parts.push(`w: ${Math.round(n.w)}`, `h: ${Math.round(n.h - (n.label ? 28 : 0))}`);
    parts.push('constraint: "on"');
    return `${n.id}@{ ${parts.join(', ')} }`;
  }
  const info = shapeInfo(n.shape);
  if (n.shape === 'rect' && n.label === n.id) return n.id;
  const label = n.label === '' ? '" "' : formatText(n.label);
  return `${n.id}${info.open}${label}${info.close}`;
}

const HEADS: Record<ArrowHead, string> = { arrow: '>', none: '', circle: 'o', cross: 'x' };
const STARTS: Record<ArrowHead, string> = { arrow: '<', none: '', circle: 'o', cross: 'x' };

export function linkOp(line: LineStyle, head: ArrowHead, both: boolean): string {
  const h = HEADS[head];
  let body: string;
  if (line === 'dotted') body = '-.-';
  else if (line === 'thick') body = h ? '==' : '===';
  else body = h ? '--' : '---';
  const start = both ? STARTS[head] : '';
  return `${start}${body}${h}`;
}

export function edgeLine(e: DEdge): string {
  const op = linkOp(e.line, e.head, e.both);
  const label = e.label ? `|${formatText(e.label)}|` : '';
  return `${e.source} ${op}${label} ${e.target}`;
}

/** Generate clean Mermaid flowchart code from the diagram. */
export function generate(d: Diagram): string {
  const out: string[] = [`flowchart ${d.direction}`];

  const nodesByParent = new Map<string | undefined, DNode[]>();
  for (const n of d.nodes) {
    const key = n.parent && d.groups.some((g) => g.id === n.parent) ? n.parent : undefined;
    nodesByParent.set(key, [...(nodesByParent.get(key) ?? []), n]);
  }
  const groupsByParent = new Map<string | undefined, DGroup[]>();
  for (const g of d.groups) {
    const key = g.parent && d.groups.some((p) => p.id === g.parent) ? g.parent : undefined;
    groupsByParent.set(key, [...(groupsByParent.get(key) ?? []), g]);
  }

  const emitScope = (parent: string | undefined, depth: number) => {
    const pad = INDENT.repeat(depth);
    for (const n of nodesByParent.get(parent) ?? []) out.push(pad + nodeDef(n));
    for (const g of groupsByParent.get(parent) ?? []) {
      const title = g.title && g.title !== g.id ? ` [${formatText(g.title)}]` : '';
      out.push(`${pad}subgraph ${g.id}${title}`);
      if (g.direction) out.push(`${pad}${INDENT}direction ${g.direction}`);
      emitScope(g.id, depth + 1);
      out.push(`${pad}end`);
    }
  };
  emitScope(undefined, 1);

  if (d.edges.length) {
    out.push('');
    for (const e of d.edges) out.push(INDENT + edgeLine(e));
  }

  // Styling: classDefs, class assignments, inline styles
  const classMembers = new Map<string, string[]>();
  for (const item of [...d.nodes, ...d.groups]) {
    if (item.className) classMembers.set(item.className, [...(classMembers.get(item.className) ?? []), item.id]);
  }
  const styleLines: string[] = [];
  for (const [name, css] of Object.entries(d.classDefs)) {
    styleLines.push(`${INDENT}classDef ${name} ${css}`);
  }
  for (const [name, ids] of classMembers) styleLines.push(`${INDENT}class ${ids.join(',')} ${name}`);
  for (const item of [...d.nodes, ...d.groups]) {
    if (item.style) styleLines.push(`${INDENT}style ${item.id} ${item.style}`);
  }
  if (styleLines.length) out.push('', ...styleLines);

  if (d.extra.length) out.push('', ...d.extra.map((l) => INDENT + l));
  return out.join('\n') + '\n';
}

export const LAYOUT_MARKER = '%% @layout ';

export type Layout = Record<string, number[]>;

export function layoutOf(d: Diagram): Layout {
  const r = (v: number) => Math.round(v);
  const layout: Layout = {};
  for (const n of d.nodes) layout[n.id] = n.w && n.h ? [r(n.x), r(n.y), r(n.w), r(n.h)] : [r(n.x), r(n.y)];
  for (const g of d.groups) layout[g.id] = [r(g.x), r(g.y), r(g.w), r(g.h)];
  return layout;
}

/** Code plus a single comment line carrying canvas positions (ignored by Mermaid). */
export function generateWithLayout(d: Diagram): string {
  return generate(d) + '\n' + LAYOUT_MARKER + JSON.stringify(layoutOf(d)) + '\n';
}
