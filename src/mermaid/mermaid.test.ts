import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { generate, generateWithLayout } from './generate';

const SCREENSHOT = `flowchart TD
    A_OLD["new AMS form completed
(Webhook/Event)"]
    A_NEW["Poll GET /api/v1/Ams/Brief (periodisch, newerThan)"]
    A_OLD -.-> B
    A_NEW --> B["get customer (AMS)"]
    B --> C["check open campaigns (KlickTipp)"]
    C --> D{"campaign found?"}
    D -- yes --> E["set tag: GOAL_BÜ_FORMULAR (Ende) [KlickTipp]"]
    D -- no --> F["continue"]
    E --> G["check open tasks
(AMS)"]
    F --> G
    G --> G_NEW["Task via gespeicherte ID aus KlickTipp holen"]
    G_NEW --> H{"task found?"}
    H -- yes --> I["close task (AMS)"]
    H -- no --> J(("end"))
    I --> K(("task closed"))
    STAR["★ Tag: GOAL_BÜ_FORMULAR Beendet Kampagne in KlickTipp"]

    A_OLD:::removed
    B:::unchanged
    STAR:::note
    classDef unchanged fill:#fff9c4,stroke:#f9a825
    classDef removed fill:#ffcdd2,stroke:#c62828,stroke-dasharray: 5 5
    classDef note fill:#e1bee7,stroke:#6a1b9a
`;

describe('parse', () => {
  it('parses the screenshot diagram', () => {
    const r = parse(SCREENSHOT);
    expect(r.errors).toEqual([]);
    const d = r.diagram;
    expect(d.nodes.map((n) => n.id)).toContain('G_NEW');
    expect(d.nodes.find((n) => n.id === 'D')!.shape).toBe('diamond');
    expect(d.nodes.find((n) => n.id === 'J')!.shape).toBe('circle');
    expect(d.nodes.find((n) => n.id === 'A_OLD')!.label).toBe('new AMS form completed\n(Webhook/Event)');
    expect(d.nodes.find((n) => n.id === 'A_OLD')!.className).toBe('removed');
    const yes = d.edges.find((e) => e.source === 'D' && e.target === 'E')!;
    expect(yes.label).toBe('yes');
    expect(d.edges.find((e) => e.source === 'A_OLD')!.line).toBe('dotted');
    expect(d.classDefs.removed).toBe('fill:#ffcdd2,stroke:#c62828,stroke-dasharray: 5 5');
  });

  it('handles all link variants', () => {
    const r = parse(`graph LR
A --> B
A --- C
A -.-> D
A ==> E
A <--> F
A --o G
A --x H
A -->|lbl| I
A == thick ==> J
A -. dot .-> K
A -- "q" --> L
A & B --> M & N`);
    expect(r.errors).toEqual([]);
    const e = (t: string) => r.diagram.edges.find((x) => x.target === t)!;
    expect(e('B')).toMatchObject({ line: 'solid', head: 'arrow', both: false });
    expect(e('C')).toMatchObject({ head: 'none' });
    expect(e('D')).toMatchObject({ line: 'dotted', head: 'arrow' });
    expect(e('E')).toMatchObject({ line: 'thick', head: 'arrow' });
    expect(e('F')).toMatchObject({ both: true });
    expect(e('G')).toMatchObject({ head: 'circle' });
    expect(e('H')).toMatchObject({ head: 'cross' });
    expect(e('I').label).toBe('lbl');
    expect(e('J')).toMatchObject({ line: 'thick', label: 'thick' });
    expect(e('K')).toMatchObject({ line: 'dotted', label: 'dot' });
    expect(e('L').label).toBe('q');
    expect(r.diagram.edges.filter((x) => x.target === 'M' || x.target === 'N')).toHaveLength(4);
  });

  it('parses all shapes', () => {
    const r = parse(`flowchart TD
a[r] --> b(r) --> c([s]) --> d[[s]] --> e[(c)] --> f((c)) --> g>a] --> h{d} --> i{{h}}
j[/p/] --> k[\\p\\] --> l[/t\\] --> m[\\t/] --> n(((d))) --> o@{ shape: cyl, label: "DB" }`);
    expect(r.errors).toEqual([]);
    expect(r.diagram.nodes.map((n) => n.shape)).toEqual([
      'rect', 'round', 'stadium', 'subroutine', 'cylinder', 'circle', 'asymmetric', 'diamond', 'hexagon',
      'parallelogram', 'parallelogram-alt', 'trapezoid', 'trapezoid-alt', 'doublecircle', 'cylinder',
    ]);
  });

  it('parses subgraphs', () => {
    const r = parse(`flowchart LR
subgraph one [Eins]
  direction TB
  a1 --> a2
  subgraph inner
    x
  end
end
subgraph "Zwei Drei"
  b1
end
a2 --> b1
one --> b1`);
    expect(r.errors).toEqual([]);
    const g = r.diagram.groups;
    expect(g.map((x) => x.id)).toEqual(['one', 'inner', 'S3']);
    expect(g[0]).toMatchObject({ title: 'Eins', direction: 'TB' });
    expect(g[1].parent).toBe('one');
    expect(r.diagram.nodes.find((n) => n.id === 'x')!.parent).toBe('inner');
    expect(r.diagram.nodes.find((n) => n.id === 'one')).toBeUndefined();
  });

  it('reports errors with line numbers', () => {
    const r = parse(`flowchart TD
A --> B
A -->
C[unclosed`);
    expect(r.errors.map((e) => e.line)).toEqual([3, 4]);
  });
});

describe('generate', () => {
  it('round-trips', () => {
    const r1 = parse(SCREENSHOT);
    const code1 = generate(r1.diagram);
    const r2 = parse(code1);
    expect(r2.errors).toEqual([]);
    expect(generate(r2.diagram)).toBe(code1);
    expect(r2.diagram.nodes.map((n) => [n.id, n.label, n.shape, n.className])).toEqual(
      r1.diagram.nodes.map((n) => [n.id, n.label, n.shape, n.className]),
    );
  });

  it('writes clean code', () => {
    const r = parse(`flowchart LR
A[Start] -->|ja| B{Ok?}
B -.-> C["Hallo #quot;Welt#quot; (1)"]
subgraph S1 [Gruppe 1]
  D
end`);
    expect(r.errors).toEqual([]);
    expect(generate(r.diagram)).toMatchInlineSnapshot(`
      "flowchart LR
          A[Start]
          B{Ok?}
          C["Hallo #quot;Welt#quot; (1)"]
          subgraph S1 [Gruppe 1]
              D
          end

          A -->|ja| B
          B -.-> C
      "
    `);
  });

  it('keeps layout in a comment', () => {
    const r = parse('flowchart TD\nA --> B');
    r.diagram.nodes[0].x = 10.4;
    const code = generateWithLayout(r.diagram);
    expect(code).toContain('%% @layout {"A":[10,0],"B":[0,0]}');
    expect(parse(code).layout).toEqual({ A: [10, 0], B: [0, 0] });
  });
});

describe('images', () => {
  it('parses and writes image nodes', () => {
    const r = parse('flowchart TD\n  L@{ img: "bilder/logo.png", label: "Logo", pos: "b", w: 60, h: 60, constraint: "on" } --> A');
    expect(r.errors).toEqual([]);
    const n = r.diagram.nodes.find((x) => x.id === 'L')!;
    expect(n).toMatchObject({ img: 'bilder/logo.png', label: 'Logo', w: 60, h: 88 });
    const code = generate(r.diagram);
    expect(code).toContain('L@{ img: "bilder/logo.png", label: "Logo", pos: "b", w: 60, h: 60, constraint: "on" }');
    expect(parse(code).diagram.nodes[0]).toMatchObject({ img: 'bilder/logo.png', w: 60, h: 88 });
  });
});
