// Core diagram model. The canvas and the Mermaid code are both views on this.

export type Direction = 'TD' | 'TB' | 'BT' | 'LR' | 'RL';

export type Shape =
  | 'rect'
  | 'round'
  | 'stadium'
  | 'subroutine'
  | 'cylinder'
  | 'circle'
  | 'doublecircle'
  | 'asymmetric'
  | 'diamond'
  | 'hexagon'
  | 'parallelogram'
  | 'parallelogram-alt'
  | 'trapezoid'
  | 'trapezoid-alt';

export type LineStyle = 'solid' | 'dotted' | 'thick';
export type ArrowHead = 'arrow' | 'none' | 'circle' | 'cross';

export interface DNode {
  id: string;
  label: string;
  shape: Shape;
  className?: string;
  /** Raw `style` directive content, e.g. "fill:#f9f,stroke:#333" */
  style?: string;
  /** Image node (`@{ img: … }`): URL or file path */
  img?: string;
  /** Id of the containing subgraph */
  parent?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface DGroup {
  id: string;
  title: string;
  direction?: Direction;
  parent?: string;
  className?: string;
  style?: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DEdge {
  id: string;
  source: string;
  target: string;
  label: string;
  line: LineStyle;
  head: ArrowHead;
  /** Same marker on both ends (`<-->`, `o--o`, `x--x`) */
  both: boolean;
}

export interface Diagram {
  direction: Direction;
  nodes: DNode[];
  groups: DGroup[];
  edges: DEdge[];
  classDefs: Record<string, string>;
  /** Lines we don't model (click, linkStyle, accTitle, …) – kept verbatim */
  extra: string[];
}

export const emptyDiagram = (): Diagram => ({
  direction: 'TD',
  nodes: [],
  groups: [],
  edges: [],
  classDefs: {},
  extra: [],
});

export interface ShapeInfo {
  shape: Shape;
  name: string;
  open: string;
  close: string;
  w: number;
  h: number;
}

export const SHAPES: ShapeInfo[] = [
  { shape: 'rect', name: 'Rechteck', open: '[', close: ']', w: 150, h: 60 },
  { shape: 'round', name: 'Abgerundet', open: '(', close: ')', w: 150, h: 60 },
  { shape: 'stadium', name: 'Stadion', open: '([', close: '])', w: 160, h: 56 },
  { shape: 'diamond', name: 'Entscheidung', open: '{', close: '}', w: 140, h: 110 },
  { shape: 'circle', name: 'Kreis', open: '((', close: '))', w: 100, h: 100 },
  { shape: 'doublecircle', name: 'Doppelkreis', open: '(((', close: ')))', w: 100, h: 100 },
  { shape: 'hexagon', name: 'Sechseck', open: '{{', close: '}}', w: 160, h: 70 },
  { shape: 'cylinder', name: 'Datenbank', open: '[(', close: ')]', w: 120, h: 80 },
  { shape: 'subroutine', name: 'Unterprozess', open: '[[', close: ']]', w: 160, h: 60 },
  { shape: 'parallelogram', name: 'Ein-/Ausgabe', open: '[/', close: '/]', w: 160, h: 60 },
  { shape: 'parallelogram-alt', name: 'Parallelogramm ↖', open: '[\\', close: '\\]', w: 160, h: 60 },
  { shape: 'trapezoid', name: 'Trapez', open: '[/', close: '\\]', w: 160, h: 60 },
  { shape: 'trapezoid-alt', name: 'Trapez ↓', open: '[\\', close: '/]', w: 160, h: 60 },
  { shape: 'asymmetric', name: 'Fahne', open: '>', close: ']', w: 150, h: 60 },
];

export const shapeInfo = (s: Shape): ShapeInfo => SHAPES.find((i) => i.shape === s) ?? SHAPES[0];

export interface ColorPreset {
  name: string;
  label: string;
  fill: string;
  stroke: string;
  color?: string;
}

/** Color presets, emitted as classDefs when used. Names double as class names. */
export const COLOR_PRESETS: ColorPreset[] = [
  { name: 'yellow', label: 'Gelb', fill: '#fff9c4', stroke: '#f9a825' },
  { name: 'orange', label: 'Orange', fill: '#ffe0b2', stroke: '#ef6c00' },
  { name: 'red', label: 'Rot', fill: '#ffcdd2', stroke: '#c62828' },
  { name: 'pink', label: 'Pink', fill: '#f8bbd0', stroke: '#ad1457' },
  { name: 'purple', label: 'Lila', fill: '#e1bee7', stroke: '#6a1b9a' },
  { name: 'blue', label: 'Blau', fill: '#bbdefb', stroke: '#1565c0' },
  { name: 'teal', label: 'Türkis', fill: '#b2dfdb', stroke: '#00695c' },
  { name: 'green', label: 'Grün', fill: '#c8e6c9', stroke: '#2e7d32' },
  { name: 'gray', label: 'Grau', fill: '#eceff1', stroke: '#546e7a' },
  { name: 'dark', label: 'Dunkel', fill: '#37474f', stroke: '#263238', color: '#ffffff' },
];

export const presetStyle = (p: ColorPreset) =>
  `fill:${p.fill},stroke:${p.stroke}${p.color ? `,color:${p.color}` : ''}`;

/** Parse "fill:#fff,stroke:#000,color:#111" into a map */
export function parseStyle(s: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!s) return out;
  for (const part of s.split(/[,;]/)) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

/** Spreadsheet-style id generator: A..Z, AA, AB, … skipping used ids */
export function nextId(used: Iterable<string>, prefix = ''): string {
  const set = new Set(used);
  for (let n = 0; ; n++) {
    let k = n;
    let s = '';
    do {
      s = String.fromCharCode(65 + (k % 26)) + s;
      k = Math.floor(k / 26) - 1;
    } while (k >= 0);
    const id = prefix + s;
    if (!set.has(id)) return id;
  }
}

export function allIds(d: Diagram): string[] {
  return [...d.nodes.map((n) => n.id), ...d.groups.map((g) => g.id)];
}
