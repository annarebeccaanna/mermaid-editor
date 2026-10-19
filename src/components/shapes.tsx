import type { Diagram, Shape } from '../model';
import { parseStyle } from '../model';

export interface Colors {
  fill: string;
  stroke: string;
  color: string;
  strokeWidth: number;
  dash?: string;
}

// Mermaid default theme
export const NODE_DEFAULT: Colors = { fill: '#ECECFF', stroke: '#9370DB', color: '#333333', strokeWidth: 1 };
export const GROUP_DEFAULT: Colors = { fill: '#ffffde', stroke: '#aaaa33', color: '#333333', strokeWidth: 1 };

export function colorsFor(
  d: Pick<Diagram, 'classDefs'>,
  item: { className?: string; style?: string },
  base: Colors = NODE_DEFAULT,
): Colors {
  const css = { ...parseStyle(item.className ? d.classDefs[item.className] : undefined), ...parseStyle(item.style) };
  return {
    fill: css.fill ?? base.fill,
    stroke: css.stroke ?? base.stroke,
    color: css.color ?? base.color,
    strokeWidth: parseFloat(css['stroke-width'] ?? '') || base.strokeWidth,
    dash: css['stroke-dasharray'],
  };
}

/** SVG outline of a shape in a w×h box. */
export function ShapeSvg({ shape, w, h, colors }: { shape: Shape; w: number; h: number; colors: Colors }) {
  const sw = colors.strokeWidth;
  const p = sw / 2 + 0.5;
  const W = w - p;
  const H = h - p;
  const props = { fill: colors.fill, stroke: colors.stroke, strokeWidth: sw, strokeDasharray: colors.dash };
  const poly = (pts: [number, number][]) => <polygon points={pts.map((x) => x.join(',')).join(' ')} {...props} />;
  const k = Math.min(18, w / 6);
  let el: React.ReactNode;
  switch (shape) {
    case 'round':
      el = <rect x={p} y={p} width={W - p} height={H - p} rx={10} {...props} />;
      break;
    case 'stadium':
      el = <rect x={p} y={p} width={W - p} height={H - p} rx={(H - p) / 2} {...props} />;
      break;
    case 'subroutine':
      el = (
        <>
          <rect x={p} y={p} width={W - p} height={H - p} {...props} />
          <line x1={p + 8} y1={p} x2={p + 8} y2={H} stroke={colors.stroke} strokeWidth={sw} />
          <line x1={W - 8} y1={p} x2={W - 8} y2={H} stroke={colors.stroke} strokeWidth={sw} />
        </>
      );
      break;
    case 'cylinder': {
      const ry = Math.min(12, h * 0.15);
      el = (
        <>
          <path d={`M${p},${p + ry} A${(W - p) / 2},${ry} 0 0 0 ${W},${p + ry} L${W},${H - ry} A${(W - p) / 2},${ry} 0 0 1 ${p},${H - ry} Z`} {...props} />
          <path d={`M${p},${p + ry} A${(W - p) / 2},${ry} 0 0 1 ${W},${p + ry} A${(W - p) / 2},${ry} 0 0 1 ${p},${p + ry}`} {...props} />
        </>
      );
      break;
    }
    case 'circle':
      el = <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - p} ry={h / 2 - p} {...props} />;
      break;
    case 'doublecircle':
      el = (
        <>
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - p} ry={h / 2 - p} {...props} />
          <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - p - 5} ry={h / 2 - p - 5} {...props} />
        </>
      );
      break;
    case 'asymmetric':
      el = poly([[p, p], [W, p], [W, H], [p, H], [p + k, h / 2]]);
      break;
    case 'diamond':
      el = poly([[w / 2, p], [W, h / 2], [w / 2, H], [p, h / 2]]);
      break;
    case 'hexagon':
      el = poly([[p + k, p], [W - k, p], [W, h / 2], [W - k, H], [p + k, H], [p, h / 2]]);
      break;
    case 'parallelogram':
      el = poly([[p + k, p], [W, p], [W - k, H], [p, H]]);
      break;
    case 'parallelogram-alt':
      el = poly([[p, p], [W - k, p], [W, H], [p + k, H]]);
      break;
    case 'trapezoid':
      el = poly([[p + k, p], [W - k, p], [W, H], [p, H]]);
      break;
    case 'trapezoid-alt':
      el = poly([[p, p], [W, p], [W - k, H], [p + k, H]]);
      break;
    default:
      el = <rect x={p} y={p} width={W - p} height={H - p} {...props} />;
  }
  return (
    <svg className="shape-svg" width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
      {el}
    </svg>
  );
}

/** Small icon version for toolbars */
export function ShapeIcon({ shape, size = 22 }: { shape: Shape; size?: number }) {
  const wide = !['circle', 'doublecircle', 'diamond', 'cylinder'].includes(shape);
  return (
    <ShapeSvg
      shape={shape}
      w={wide ? size * 1.4 : size}
      h={wide ? size * 0.85 : size}
      colors={{ fill: 'transparent', stroke: 'currentColor', color: 'currentColor', strokeWidth: 1.6 }}
    />
  );
}
