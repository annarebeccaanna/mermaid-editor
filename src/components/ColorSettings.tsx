import { Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { SHAPES, type ColorPreset } from '../model';
import { usePrefs } from '../prefs';
import { ShapeIcon } from './shapes';

/** Manage color presets and default colors per shape. */
export function ColorSettings({ onClose }: { onClose: () => void }) {
  const colors = usePrefs((s) => s.colors);
  const shapeDefaults = usePrefs((s) => s.shapeDefaults);
  const { setColors, setShapeDefault, reset } = usePrefs.getState();

  const update = (i: number, patch: Partial<ColorPreset>) => setColors(colors.map((c, j) => (i === j ? { ...c, ...patch } : c)));
  const add = () => {
    let n = 1;
    while (colors.some((c) => c.name === `farbe${n}`)) n++;
    setColors([...colors, { name: `farbe${n}`, label: `Farbe ${n}`, fill: '#ffffff', stroke: '#333333' }]);
  };

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <header>
          <h2>Farben &amp; Standards</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="modal-body">
          <h3>Farbpalette</h3>
          <p className="hint">Jede Farbe wird im Code als <code>classDef</code> mit dem Klassennamen ausgegeben.</p>
          <table className="color-table">
            <thead>
              <tr>
                <th />
                <th>Name</th>
                <th>Klasse im Code</th>
                <th>Füllung</th>
                <th>Rahmen</th>
                <th>Text</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {colors.map((c, i) => (
                <tr key={i}>
                  <td>
                    <div className="swatch" style={{ background: c.fill, borderColor: c.stroke, color: c.color ?? '#333' }}>
                      Aa
                    </div>
                  </td>
                  <td>
                    <input value={c.label} onChange={(e) => update(i, { label: e.target.value })} />
                  </td>
                  <td>
                    <input
                      value={c.name}
                      onChange={(e) => update(i, { name: e.target.value.replace(/[^\p{L}\p{N}_-]/gu, '') })}
                    />
                  </td>
                  <td>
                    <input type="color" value={c.fill} onChange={(e) => update(i, { fill: e.target.value })} />
                  </td>
                  <td>
                    <input type="color" value={c.stroke} onChange={(e) => update(i, { stroke: e.target.value })} />
                  </td>
                  <td>
                    <input type="color" value={c.color ?? '#333333'} onChange={(e) => update(i, { color: e.target.value === '#333333' ? undefined : e.target.value })} />
                  </td>
                  <td>
                    <button className="icon-btn" title="Entfernen" onClick={() => setColors(colors.filter((_, j) => j !== i))}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button className="link-btn" onClick={add}>
            <Plus size={14} /> Farbe hinzufügen
          </button>

          <h3>Standardfarbe pro Form</h3>
          <p className="hint">Neue Elemente bekommen automatisch diese Farbe.</p>
          <div className="defaults-grid">
            {[...SHAPES.map((s) => ({ key: s.shape as string, name: s.name, icon: <ShapeIcon shape={s.shape} size={16} /> })), { key: 'group', name: 'Gruppe', icon: <span className="group-icon" /> }].map((s) => (
              <label key={s.key} className="default-row">
                {s.icon}
                <span>{s.name}</span>
                <select value={shapeDefaults[s.key as never] ?? ''} onChange={(e) => setShapeDefault(s.key as never, e.target.value || undefined)}>
                  <option value="">Mermaid-Standard</option>
                  {colors.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
        <footer>
          <button className="link-btn" onClick={() => confirm('Alle Farben und Standards zurücksetzen?') && reset()}>
            <RotateCcw size={14} /> Zurücksetzen
          </button>
          <button className="primary-btn" onClick={onClose}>
            Fertig
          </button>
        </footer>
      </div>
    </div>
  );
}
