import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal stand-in for the Supabase query builder: every method returns the builder,
// awaiting it yields the prepared result.
const calls: Array<[string, unknown[]]> = [];
type Result = { data: unknown; error: { message: string } | null };
let result: Result;
// answers handed out first, one per query (for code that runs several queries at once)
const queue: Result[] = [];

const builder: Record<string, unknown> = {
  then: (resolve: (v: unknown) => void) => resolve(queue.shift() ?? result),
};
for (const m of ['from', 'select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'rpc']) {
  builder[m] = (...args: unknown[]) => {
    calls.push([m, args]);
    return builder;
  };
}

vi.mock('./client', () => ({ supabase: builder }));

const { ConflictError, createDiagram, deleteDiagram, loadDiagram, saveDiagram, updateDiagram } = await import('./diagrams');

beforeEach(() => {
  calls.length = 0;
  queue.length = 0;
});

describe('saveDiagram', () => {
  it('writes only when the version still matches and returns the new version', async () => {
    result = { data: [{ version: 5 }], error: null };
    await expect(saveDiagram('d1', 4, { content: 'x' })).resolves.toBe(5);
    expect(calls).toContainEqual(['eq', ['id', 'd1']]);
    expect(calls).toContainEqual(['eq', ['version', 4]]);
  });

  it('reports a conflict when no row was updated', async () => {
    result = { data: [], error: null };
    await expect(saveDiagram('d1', 4, { content: 'x' })).rejects.toBeInstanceOf(ConflictError);
  });

  it('passes database errors on', async () => {
    result = { data: null, error: { message: 'network down' } };
    await expect(saveDiagram('d1', 4, { content: 'x' })).rejects.toThrow('network down');
  });
});

describe('createDiagram / loadDiagram', () => {
  it('returns the created row', async () => {
    const row = { id: 'n1', name: 'Neu', content: 'flowchart TD', version: 1 };
    result = { data: row, error: null };
    await expect(createDiagram('Neu', 'flowchart TD')).resolves.toEqual(row);
  });

  it('adds the role of the signed-in person', async () => {
    const row = { id: 'd1', name: 'Ablauf', content: 'flowchart TD', version: 3, folder_id: null };
    queue.push({ data: row, error: null }, { data: 'editor', error: null });
    await expect(loadDiagram('d1')).resolves.toEqual({ ...row, role: 'editor' });
  });

  it('refuses a diagram the person has no role for', async () => {
    queue.push({ data: { id: 'd1', name: 'x', content: '', version: 1, folder_id: null }, error: null }, { data: null, error: null });
    await expect(loadDiagram('d1')).rejects.toThrow('keinen Zugriff');
  });

  it('explains database errors in plain language', async () => {
    result = { data: null, error: { message: 'row-level security' } };
    await expect(loadDiagram('x')).rejects.toThrow('Berechtigung');
  });
});

describe('updateDiagram / deleteDiagram', () => {
  it('changes name or folder by id only', async () => {
    result = { data: [{ id: 'd1' }], error: null };
    await expect(updateDiagram('d1', { folder_id: 'f1' })).resolves.toBeUndefined();
    expect(calls).toContainEqual(['update', [{ folder_id: 'f1' }]]);
    expect(calls).not.toContainEqual(['eq', ['version', expect.anything()]]);
  });

  it('complains when nothing was changed or deleted', async () => {
    result = { data: [], error: null };
    await expect(updateDiagram('d1', { name: 'x' })).rejects.toThrow();
    await expect(deleteDiagram('d1')).rejects.toThrow();
  });

  it('deletes by id', async () => {
    result = { data: [{ id: 'd1' }], error: null };
    await deleteDiagram('d1');
    expect(calls).toContainEqual(['delete', []]);
    expect(calls).toContainEqual(['eq', ['id', 'd1']]);
  });
});
