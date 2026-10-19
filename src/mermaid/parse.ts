import {
  type ArrowHead,
  type DEdge,
  type DGroup,
  type DNode,
  type Diagram,
  type Direction,
  type LineStyle,
  type Shape,
  emptyDiagram,
} from '../model';
import { LAYOUT_MARKER, type Layout } from './generate';

export interface ParseError {
  line: number;
  message: string;
}

export interface ParseResult {
  diagram: Diagram;
  layout: Layout | null;
  errors: ParseError[];
}

interface Statement {
  text: string;
  line: number;
}

/** Split source into statements on newlines/semicolons, respecting quotes. */
function splitStatements(src: string): Statement[] {
  const out: Statement[] = [];
  let buf = '';
  let line = 1;
  let startLine = 1;
  let inQuote = false;
  const flush = () => {
    if (buf.trim()) out.push({ text: buf.trim(), line: startLine });
    buf = '';
  };
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (!inQuote && buf.trim() === '' && src.startsWith('%%', i)) {
      // comment / directive until end of line
      const end = src.indexOf('\n', i);
      const text = src.slice(i, end === -1 ? src.length : end);
      out.push({ text: text.trim(), line });
      i = end === -1 ? src.length : end - 1;
      buf = '';
      continue;
    }
    if (c === '"') inQuote = !inQuote;
    if (!inQuote && (c === '\n' || c === ';')) {
      flush();
      if (c === '\n') line++;
      startLine = line;
      continue;
    }
    if (c === '\n') line++;
    if (buf.trim() === '') startLine = line;
    buf += c;
  }
  flush();
  return out;
}

const OPENERS: [string, Shape, string[]][] = [
  ['(((', 'doublecircle', [')))']],
  ['((', 'circle', ['))']],
  ['([', 'stadium', ['])']],
  ['[[', 'subroutine', [']]']],
  ['[(', 'cylinder', [')]']],
  ['[/', 'parallelogram', ['/]', '\\]']],
  ['[\\', 'parallelogram-alt', ['\\]', '/]']],
  ['{{', 'hexagon', ['}}']],
  ['[', 'rect', [']']],
  ['(', 'round', [')']],
  ['{', 'diamond', ['}']],
  ['>', 'asymmetric', [']']],
];

const NEW_SHAPES: Record<string, Shape> = {
  rect: 'rect', rectangle: 'rect', proc: 'rect', process: 'rect',
  rounded: 'round', event: 'round',
  stadium: 'stadium', pill: 'stadium', terminal: 'stadium',
  diamond: 'diamond', diam: 'diamond', decision: 'diamond', question: 'diamond',
  circle: 'circle', circ: 'circle',
  'dbl-circ': 'doublecircle', 'double-circle': 'doublecircle',
  hex: 'hexagon', hexagon: 'hexagon', prepare: 'hexagon',
  cyl: 'cylinder', cylinder: 'cylinder', database: 'cylinder', db: 'cylinder',
  subproc: 'subroutine', subroutine: 'subroutine', 'framed-rectangle': 'subroutine',
  'lean-r': 'parallelogram', 'in-out': 'parallelogram', 'lean-right': 'parallelogram',
  'lean-l': 'parallelogram-alt', 'out-in': 'parallelogram-alt', 'lean-left': 'parallelogram-alt',
  'trap-b': 'trapezoid', trapezoid: 'trapezoid', priority: 'trapezoid',
  'trap-t': 'trapezoid-alt', 'inv-trapezoid': 'trapezoid-alt', manual: 'trapezoid-alt',
  odd: 'asymmetric',
};

export function unescapeText(t: string): string {
  return t
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/#quot;/g, '"')
    .replace(/#35;/g, '#')
    .replace(/#59;/g, ';');
}

const ID_RE = /[\p{L}\p{N}_]+(?:-[\p{L}\p{N}_]+)*/uy;
const LINK_PLAIN = /([<ox])?(-{2,}[>ox]|-{3,}|={2,}[>ox]|={3,}|-\.+-[>ox]?)/y;
const LINK_TEXT_START = /([<ox])?(--|==|-\.)(?=\s|")/y;

interface NodeRef {
  id: string;
  shape?: Shape;
  label?: string;
  cls?: string;
  img?: string;
  size?: [number, number];
}

class StatementParser {
  pos = 0;
  constructor(private s: string) {}

  ws() {
    while (this.pos < this.s.length && /\s/.test(this.s[this.pos])) this.pos++;
  }
  eof() {
    this.ws();
    return this.pos >= this.s.length;
  }
  match(re: RegExp): RegExpExecArray | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.s);
    if (m) this.pos = re.lastIndex;
    return m;
  }
  fail(msg: string): never {
    throw new Error(`${msg} (bei „${this.s.slice(this.pos, this.pos + 20) || 'Zeilenende'}“)`);
  }

  /** Read label text up to one of the closers. Returns [text, closer]. */
  readText(closers: string[]): [string, string] {
    this.ws();
    if (this.s[this.pos] === '"') {
      const end = this.s.indexOf('"', this.pos + 1);
      if (end === -1) this.fail('Fehlendes schließendes "');
      const text = this.s.slice(this.pos + 1, end);
      this.pos = end + 1;
      this.ws();
      const closer = closers.find((c) => this.s.startsWith(c, this.pos));
      if (!closer) this.fail(`Erwartet ${closers.join(' oder ')}`);
      this.pos += closer.length;
      return [text, closer];
    }
    let best = -1;
    let closer = '';
    for (const c of closers) {
      const i = this.s.indexOf(c, this.pos);
      if (i !== -1 && (best === -1 || i < best)) {
        best = i;
        closer = c;
      }
    }
    if (best === -1) this.fail(`Erwartet ${closers.join(' oder ')}`);
    const text = this.s.slice(this.pos, best).trim();
    this.pos = best + closer.length;
    return [text, closer];
  }

  nodeRef(): NodeRef {
    this.ws();
    const m = this.match(ID_RE);
    if (!m) this.fail('Knoten-ID erwartet');
    const id = m[0];
    const res: NodeRef = { id };
    if (this.s.startsWith('@{', this.pos)) {
      const end = this.s.indexOf('}', this.pos);
      if (end === -1) this.fail('Fehlendes }');
      const body = this.s.slice(this.pos + 2, end);
      this.pos = end + 1;
      const props: Record<string, string> = {};
      for (const m of body.matchAll(/([\w-]+)\s*:\s*(?:"([^"]*)"|([^,]+))/g)) props[m[1]] = (m[2] ?? m[3]).trim();
      res.shape = NEW_SHAPES[props.shape] ?? 'rect';
      if (props.label !== undefined) res.label = unescapeText(props.label);
      if (props.img) {
        res.img = props.img;
        if (res.label === undefined) res.label = '';
        const w = Number(props.w);
        const h = Number(props.h);
        if (w && h) res.size = [w, h + (res.label ? 28 : 0)];
      }
    } else {
      for (const [open, shape, closers] of OPENERS) {
        if (this.s.startsWith(open, this.pos)) {
          this.pos += open.length;
          const [text, closer] = this.readText(closers);
          let sh = shape;
          if (open === '[/' && closer === '\\]') sh = 'trapezoid';
          if (open === '[\\' && closer === '/]') sh = 'trapezoid-alt';
          res.shape = sh;
          res.label = unescapeText(text);
          break;
        }
      }
    }
    const cls = this.match(/:::([\p{L}\p{N}_-]+)/uy);
    if (cls) res.cls = cls[1];
    return res;
  }

  nodeGroup() {
    const refs = [this.nodeRef()];
    for (;;) {
      this.ws();
      if (this.s[this.pos] !== '&') break;
      this.pos++;
      refs.push(this.nodeRef());
    }
    return refs;
  }

  link(): { line: LineStyle; head: ArrowHead; both: boolean; label: string } | null {
    this.ws();
    let m = this.match(LINK_PLAIN);
    let label = '';
    let op: string;
    let start: string | undefined;
    if (m) {
      start = m[1];
      op = m[2];
    } else {
      m = this.match(LINK_TEXT_START);
      if (!m) return null;
      start = m[1];
      const kind = m[2];
      const endRe = kind === '--' ? /-{2,}[>ox]?/g : kind === '==' ? /={2,}[>ox]?/g : /\.-+[>ox]?/g;
      this.ws();
      let textEnd: number;
      if (this.s[this.pos] === '"') {
        const q = this.s.indexOf('"', this.pos + 1);
        if (q === -1) this.fail('Fehlendes schließendes "');
        label = this.s.slice(this.pos + 1, q);
        textEnd = q + 1;
      } else textEnd = this.pos;
      endRe.lastIndex = textEnd;
      const em = endRe.exec(this.s);
      if (!em) this.fail('Ende der Verbindung erwartet');
      if (textEnd === this.pos) label = this.s.slice(this.pos, em.index).trim();
      this.pos = em.index + em[0].length;
      op = kind + em[0];
    }
    const last = op[op.length - 1];
    const head: ArrowHead = last === '>' ? 'arrow' : last === 'o' ? 'circle' : last === 'x' ? 'cross' : 'none';
    const line: LineStyle = op.includes('=') ? 'thick' : op.includes('.') ? 'dotted' : 'solid';
    const both = !!start && head !== 'none';
    this.ws();
    if (this.s[this.pos] === '|') {
      const [text] = (() => {
        this.pos++;
        if (this.s[this.pos] === '"') {
          const q = this.s.indexOf('"', this.pos + 1);
          const end = this.s.indexOf('|', q + 1);
          if (q === -1 || end === -1) this.fail('Fehlendes schließendes |');
          const t = this.s.slice(this.pos + 1, q);
          this.pos = end + 1;
          return [t];
        }
        const end = this.s.indexOf('|', this.pos);
        if (end === -1) this.fail('Fehlendes schließendes |');
        const t = this.s.slice(this.pos, end).trim();
        this.pos = end + 1;
        return [t];
      })();
      label = text;
    }
    return { line, head, both, label: unescapeText(label) };
  }
}

const stripQuotes = (s: string) => (/^".*"$/s.test(s) ? s.slice(1, -1) : s);

/** Parse Mermaid flowchart code into a Diagram (positions are all zero). */
export function parse(src: string): ParseResult {
  const d = emptyDiagram();
  const errors: ParseError[] = [];
  let layout: Layout | null = null;
  const nodes = new Map<string, DNode>();
  const groups = new Map<string, DGroup>();
  const stack: DGroup[] = [];
  const pendingClass: [string[], string][] = [];
  const pendingStyle: [string, string][] = [];
  let header = false;
  let edgeCounter = 0;

  const touch = (ref: NodeRef) => {
    let n = nodes.get(ref.id);
    if (!n) {
      n = { id: ref.id, label: ref.id, shape: 'rect', x: 0, y: 0 };
      nodes.set(ref.id, n);
    }
    if (ref.shape) n.shape = ref.shape;
    if (ref.label !== undefined) n.label = ref.label;
    if (ref.cls) n.className = ref.cls;
    if (ref.img) n.img = ref.img;
    if (ref.size) [n.w, n.h] = ref.size;
    const top = stack[stack.length - 1];
    if (top && !n.parent) n.parent = top.id;
  };

  for (const { text, line } of splitStatements(src)) {
    try {
      if (text.startsWith(LAYOUT_MARKER.trim())) {
        try {
          layout = JSON.parse(text.slice(LAYOUT_MARKER.trim().length).trim());
        } catch {
          /* ignore broken layout data */
        }
        continue;
      }
      if (text.startsWith('%%{')) {
        d.extra.push(text);
        continue;
      }
      if (text.startsWith('%%')) continue;
      if (text === '---' || /^title\s*:|^config\s*:/.test(text)) continue; // frontmatter bits

      if (!header) {
        const h = /^(flowchart|graph)(?:\s+(TD|TB|BT|LR|RL))?\s*$/i.exec(text);
        if (!h) throw new Error('Nur Flowcharts werden unterstützt – erwartet „flowchart TD“ o.ä.');
        d.direction = ((h[2] ?? 'TD').toUpperCase() as Direction);
        header = true;
        continue;
      }

      let m: RegExpExecArray | null;
      if ((m = /^subgraph\s+(.+)$/s.exec(text))) {
        const rest = m[1].trim();
        let id: string;
        let title: string;
        let mm: RegExpExecArray | null;
        if ((mm = /^([\p{L}\p{N}_-]+)\s*\[(.*)\]$/su.exec(rest))) {
          id = mm[1];
          title = unescapeText(stripQuotes(mm[2].trim()));
        } else if (/^[\p{L}\p{N}_-]+$/u.test(rest)) {
          id = rest;
          title = rest;
        } else {
          title = unescapeText(stripQuotes(rest));
          id = `S${groups.size + 1}`;
          while (groups.has(id) || nodes.has(id)) id += '_';
        }
        const g: DGroup = { id, title, x: 0, y: 0, w: 0, h: 0, parent: stack[stack.length - 1]?.id };
        groups.set(id, g);
        stack.push(g);
        continue;
      }
      if (text === 'end') {
        if (!stack.pop()) throw new Error('„end“ ohne passenden „subgraph“');
        continue;
      }
      if ((m = /^direction\s+(TD|TB|BT|LR|RL)$/i.exec(text))) {
        const dir = m[1].toUpperCase() as Direction;
        const top = stack[stack.length - 1];
        if (top) top.direction = dir;
        else d.direction = dir;
        continue;
      }
      if ((m = /^classDef\s+([^\s]+)\s+(.+)$/.exec(text))) {
        for (const name of m[1].split(',')) d.classDefs[name.trim()] = m[2].trim().replace(/;$/, '');
        continue;
      }
      if ((m = /^class\s+([^\s]+)\s+([^\s]+)$/.exec(text))) {
        pendingClass.push([m[1].split(',').map((s) => s.trim()), m[2]]);
        continue;
      }
      if ((m = /^style\s+([^\s]+)\s+(.+)$/.exec(text))) {
        pendingStyle.push([m[1], m[2].trim()]);
        continue;
      }
      if (/^(linkStyle|click|accTitle|accDescr|callback)\b/.test(text)) {
        d.extra.push(text);
        continue;
      }

      // Node / edge chain
      const p = new StatementParser(text);
      let left = p.nodeGroup();
      left.forEach(touch);
      while (!p.eof()) {
        const link = p.link();
        if (!link) throw new Error(`Verbindung (z.B. -->) erwartet (bei „${text.slice(p.pos, p.pos + 20)}“)`);
        const right = p.nodeGroup();
        right.forEach(touch);
        for (const a of left)
          for (const b of right)
            d.edges.push({ id: `e${++edgeCounter}`, source: a.id, target: b.id, ...link } satisfies DEdge);
        left = right;
      }
    } catch (e) {
      errors.push({ line, message: (e as Error).message });
    }
  }
  if (!header && errors.length === 0) errors.push({ line: 1, message: 'Leeres Diagramm – erwartet „flowchart TD“' });
  if (stack.length) errors.push({ line: 0, message: `subgraph „${stack[stack.length - 1].id}“ ohne „end“` });

  // Ids referenced as nodes that are actually subgraphs: edges point to the group
  for (const id of groups.keys()) nodes.delete(id);

  for (const [ids, cls] of pendingClass)
    for (const id of ids) {
      const t = nodes.get(id) ?? groups.get(id);
      if (t) t.className = cls;
    }
  for (const [id, css] of pendingStyle) {
    const t = nodes.get(id) ?? groups.get(id);
    if (t) t.style = css;
  }

  d.nodes = [...nodes.values()];
  d.groups = [...groups.values()];
  return { diagram: d, layout, errors };
}
