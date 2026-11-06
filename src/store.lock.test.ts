import { describe, expect, it, vi } from 'vitest';

// The store reads a few browser globals while it is created.
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', { getItem: (k: string) => memory.get(k) ?? null, setItem: (k: string, v: string) => void memory.set(k, v), removeItem: (k: string) => void memory.delete(k) });
vi.stubGlobal('location', { search: '', hash: '', origin: 'http://localhost' });
vi.stubGlobal('window', { addEventListener: () => {}, removeEventListener: () => {} });

const { useStore } = await import('./store');

const content = 'flowchart TD\n    A --> B\n';

describe('viewer role', () => {
  it('cannot change the diagram, the code or undo history', () => {
    useStore.getState().openCloud({ id: 'd1', name: 'Plan', content, version: 1, role: 'viewer' });
    const before = useStore.getState().diagram;
    useStore.getState().addNode('rect', { x: 0, y: 0 });
    useStore.getState().deleteIds(['A']);
    useStore.getState().setCode('flowchart TD\n    X');
    const applied = useStore.getState().applyCode();
    useStore.getState().setEditing('A');
    const s = useStore.getState();
    expect(s.diagram).toBe(before);
    expect(s.dirty).toBe(false);
    expect(s.codeDirty).toBe(false);
    expect(applied).toBe(false);
    expect(s.editing).toBeNull();
    expect(s.past).toHaveLength(0);
  });

  it('is not locked as editor or owner', () => {
    for (const role of ['editor', 'owner'] as const) {
      useStore.getState().openCloud({ id: 'd1', name: 'Plan', content, version: 1, role });
      useStore.getState().addNode('rect', { x: 0, y: 0 });
      expect(useStore.getState().dirty).toBe(true);
    }
  });

  it('is lifted when a different diagram is opened', () => {
    useStore.getState().openCloud({ id: 'd1', name: 'Plan', content, version: 1, role: 'viewer' });
    useStore.getState().newDiagram();
    useStore.getState().addNode('rect', { x: 0, y: 0 });
    expect(useStore.getState().cloudRole).toBeNull();
    expect(useStore.getState().dirty).toBe(true);
  });
});
