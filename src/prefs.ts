import { create } from 'zustand';
import { COLOR_PRESETS, type ColorPreset, type Shape, presetStyle } from './model';

const KEY = 'mermaid-editor:prefs';

export interface Prefs {
  colors: ColorPreset[];
  /** Default color class per shape (applied to new nodes) */
  shapeDefaults: Partial<Record<Shape | 'group', string>>;
}

const defaults = (): Prefs => ({
  colors: structuredClone(COLOR_PRESETS),
  shapeDefaults: { diamond: 'yellow' },
});

function load(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (p?.colors) return { ...defaults(), ...p };
  } catch {
    /* ignore */
  }
  return defaults();
}

interface PrefsState extends Prefs {
  setColors: (colors: ColorPreset[]) => void;
  setShapeDefault: (shape: Shape | 'group', className: string | undefined) => void;
  reset: () => void;
}

export const usePrefs = create<PrefsState>((set, get) => {
  const save = () => {
    const { colors, shapeDefaults } = get();
    try {
      localStorage.setItem(KEY, JSON.stringify({ colors, shapeDefaults }));
    } catch {
      /* ignore */
    }
  };
  return {
    ...load(),
    setColors: (colors) => {
      set({ colors });
      save();
    },
    setShapeDefault: (shape, className) => {
      set({ shapeDefaults: { ...get().shapeDefaults, [shape]: className } });
      save();
    },
    reset: () => {
      set(defaults());
      save();
    },
  };
});

// Keep all open windows in sync
window.addEventListener('storage', (e) => {
  if (e.key === KEY) usePrefs.setState(load());
});

export const colorStyle = (name: string) => {
  const c = usePrefs.getState().colors.find((p) => p.name === name);
  return c ? presetStyle(c) : undefined;
};
