import { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Frame, ImagePlus, Shapes } from 'lucide-react';
import { SHAPES, type Shape } from '../model';
import { useStore } from '../store';
import { insertImage } from '../files';
import { ShapeIcon } from './shapes';
import { SHAPE_MIME, groupAt } from './Canvas';

const QUICK: Shape[] = ['rect', 'round', 'stadium', 'diamond', 'circle', 'cylinder'];

/** Floating toolbar on the canvas: click to add in the middle, or drag onto the canvas. */
export function Toolbar() {
  const rf = useReactFlow();
  const [more, setMore] = useState(false);

  const center = () => {
    const el = document.querySelector('.canvas')!.getBoundingClientRect();
    const jitter = () => (Math.random() - 0.5) * 40;
    return rf.screenToFlowPosition({ x: el.left + el.width / 2 + jitter(), y: el.top + el.height / 2 + jitter() });
  };
  const add = (shape: Shape) => {
    const pos = center();
    const s = useStore.getState();
    const id = s.addNode(shape, pos, { parent: groupAt(s.diagram, pos.x, pos.y) });
    s.setEditing(id);
    setMore(false);
  };
  const drag = (shape: string) => (e: React.DragEvent) => {
    e.dataTransfer.setData(SHAPE_MIME, shape);
    e.dataTransfer.effectAllowed = 'copy';
  };
  const name = (s: Shape) => SHAPES.find((x) => x.shape === s)!.name;

  return (
    <div className="toolbar" onDoubleClick={(e) => e.stopPropagation()}>
      {QUICK.map((s) => (
        <button key={s} className="tool" title={`${name(s)} (klicken oder ziehen)`} draggable onDragStart={drag(s)} onClick={() => add(s)}>
          <ShapeIcon shape={s} />
        </button>
      ))}
      <div className="tool-wrap">
        <button className={`tool ${more ? 'active' : ''}`} title="Alle Formen" onClick={() => setMore(!more)}>
          <Shapes size={20} />
        </button>
        {more && (
          <div className="shape-popover">
            {SHAPES.map((s) => (
              <button key={s.shape} className="shape-choice" draggable onDragStart={drag(s.shape)} onClick={() => add(s.shape)}>
                <ShapeIcon shape={s.shape} />
                <span>{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="tool-sep" />
      <button
        className="tool"
        title="Gruppe / Subgraph (klicken oder ziehen)"
        draggable
        onDragStart={drag('group')}
        onClick={() => useStore.getState().addGroup(center())}
      >
        <Frame size={20} />
      </button>
      <button
        className="tool"
        title="Bild einfügen (auch per Drag & Drop aus dem Explorer)"
        onClick={() => {
          const pos = center();
          insertImage(pos, groupAt(useStore.getState().diagram, pos.x, pos.y));
        }}
      >
        <ImagePlus size={20} />
      </button>
    </div>
  );
}
