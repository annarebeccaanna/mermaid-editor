import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake query builder: every call returns the builder, awaiting it hands out the next prepared answer.
type Result = { data: unknown; error: { message: string; code?: string } | null };
const calls: Array<[string, unknown[]]> = [];
const queue: Result[] = [];

const builder: Record<string, unknown> = {
  then: (resolve: (v: unknown) => void) => resolve(queue.shift() ?? { data: [], error: null }),
};
for (const m of ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'not', 'order', 'rpc', 'single']) {
  builder[m] = (...args: unknown[]) => {
    calls.push([m, args]);
    return builder;
  };
}
vi.mock('./client', () => ({ supabase: builder }));

const { NO_ACCOUNT, addShare, describeShared, foldersAbove, leaveShared, listInheritedShares, listShares, removeShare, updateShareRole } = await import('./shares');

beforeEach(() => {
  calls.length = 0;
  queue.length = 0;
});

const ok = (data: unknown): Result => ({ data, error: null });

describe('listShares', () => {
  it('adds the e-mail address of each person', async () => {
    queue.push(ok([{ id: 's1', role: 'viewer', grantee_id: 'u1' }]), ok([{ id: 'u1', email: 'b@example.com' }]));
    await expect(listShares({ kind: 'diagram', id: 'd1' })).resolves.toEqual([{ id: 's1', role: 'viewer', grantee_id: 'u1', email: 'b@example.com' }]);
    expect(calls).toContainEqual(['eq', ['diagram_id', 'd1']]);
  });

  it('asks the folder column for a folder', async () => {
    queue.push(ok([]));
    await expect(listShares({ kind: 'folder', id: 'f1' })).resolves.toEqual([]);
    expect(calls).toContainEqual(['eq', ['folder_id', 'f1']]);
  });

  it('skips the second query when nobody has access', async () => {
    queue.push(ok([]));
    await listShares({ kind: 'diagram', id: 'd1' });
    expect(calls.filter(([m]) => m === 'from')).toHaveLength(1);
  });
});

describe('foldersAbove', () => {
  const folders = [
    { id: 'f1', name: 'Kunde', owner_id: 'me', parent_id: null },
    { id: 'f2', name: 'Entwürfe', owner_id: 'me', parent_id: 'f1' },
  ];

  it('lists the folders around a diagram, nearest first', async () => {
    queue.push(ok({ folder_id: 'f2' }), ok(folders));
    await expect(foldersAbove({ kind: 'diagram', id: 'd1' })).resolves.toEqual([{ id: 'f2', name: 'Entwürfe' }, { id: 'f1', name: 'Kunde' }]);
  });

  it('starts at the parent for a folder', async () => {
    queue.push(ok({ parent_id: 'f1' }), ok(folders));
    await expect(foldersAbove({ kind: 'folder', id: 'f2' })).resolves.toEqual([{ id: 'f1', name: 'Kunde' }]);
    expect(calls).toContainEqual(['select', ['parent_id']]);
  });

  it('is empty at the top level and skips the folder list', async () => {
    queue.push(ok({ folder_id: null }));
    await expect(foldersAbove({ kind: 'diagram', id: 'd1' })).resolves.toEqual([]);
    expect(calls.filter(([m]) => m === 'from')).toHaveLength(1);
  });
});

describe('listInheritedShares', () => {
  it('reads the shares on the folders above and names the people', async () => {
    queue.push(ok([{ id: 's1', role: 'editor', grantee_id: 'u1', folder_id: 'f1' }]), ok([{ id: 'u1', email: 'b@example.com' }]));
    await expect(listInheritedShares(['f1', 'f2'])).resolves.toEqual([{ id: 's1', role: 'editor', grantee_id: 'u1', folder_id: 'f1', email: 'b@example.com' }]);
    expect(calls).toContainEqual(['in', ['folder_id', ['f1', 'f2']]]);
  });

  it('asks nothing without folders', async () => {
    await expect(listInheritedShares([])).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});

describe('addShare', () => {
  it('shares a diagram with the person found by e-mail', async () => {
    queue.push(ok([{ id: 'u1', email: 'b@example.com' }]), ok(null));
    await addShare({ kind: 'diagram', id: 'd1' }, ' b@example.com ', 'editor');
    expect(calls).toContainEqual(['rpc', ['find_user_by_email', { p_email: ' b@example.com ' }]]);
    expect(calls).toContainEqual(['insert', [{ diagram_id: 'd1', grantee_id: 'u1', role: 'editor' }]]);
  });

  it('shares a folder through the folder column', async () => {
    queue.push(ok([{ id: 'u1', email: 'b@example.com' }]), ok(null));
    await addShare({ kind: 'folder', id: 'f1' }, 'b@example.com', 'viewer');
    expect(calls).toContainEqual(['insert', [{ folder_id: 'f1', grantee_id: 'u1', role: 'viewer' }]]);
  });

  it('says so when there is no account for the address', async () => {
    queue.push(ok([]));
    await expect(addShare({ kind: 'diagram', id: 'd1' }, 'x@example.com', 'viewer')).rejects.toThrow(NO_ACCOUNT);
    expect(calls.some(([m]) => m === 'insert')).toBe(false);
  });

  it('says so when the person has access already', async () => {
    queue.push(ok([{ id: 'u1', email: 'b@example.com' }]), { data: null, error: { message: 'duplicate key', code: '23505' } });
    await expect(addShare({ kind: 'diagram', id: 'd1' }, 'b@example.com', 'viewer')).rejects.toThrow('b@example.com hat schon Zugriff');
  });
});

describe('changing and removing', () => {
  it('changes a role by share id', async () => {
    queue.push(ok([{ id: 's1' }]));
    await updateShareRole('s1', 'viewer');
    expect(calls).toContainEqual(['update', [{ role: 'viewer' }]]);
    expect(calls).toContainEqual(['eq', ['id', 's1']]);
  });

  it('complains when the share is gone', async () => {
    queue.push(ok([]), ok([]));
    await expect(updateShareRole('s1', 'viewer')).rejects.toThrow('nicht mehr');
    await expect(removeShare('s1')).rejects.toThrow('nicht mehr');
  });

  it('leaves a folder by folder and person', async () => {
    queue.push(ok([{ id: 's1' }]));
    await leaveShared({ kind: 'folder', id: 'f1' }, 'me');
    expect(calls).toContainEqual(['eq', ['folder_id', 'f1']]);
    expect(calls).toContainEqual(['eq', ['grantee_id', 'me']]);
  });

  it('explains when access comes from a folder above', async () => {
    queue.push(ok([]));
    await expect(leaveShared({ kind: 'diagram', id: 'd1' }, 'me')).rejects.toThrow('übergeordneten');
  });
});

describe('describeShared', () => {
  const folder = (id: string, parent_id: string | null) => ({ id, name: id, owner_id: 'o1', parent_id });
  const diagram = (id: string, folder_id: string | null) => ({ id, name: id, owner_id: 'o1', folder_id, updated_at: '2026-11-01' });
  const owners = ok([{ id: 'o1', email: 'a@example.com' }]);

  it('gives diagrams the role of the shared folder above them', async () => {
    queue.push(ok([{ diagram_id: null, folder_id: 'f1', role: 'editor' }]), owners);
    const r = await describeShared([diagram('d1', 'f2'), diagram('d2', null)], [folder('f1', null), folder('f2', 'f1')], 'me');
    expect(r.folders.map((f) => [f.id, f.role, f.direct])).toEqual([['f1', 'editor', true], ['f2', 'editor', false]]);
    expect(r.diagrams.map((d) => [d.id, d.role, d.direct, d.ownerEmail])).toEqual([['d1', 'editor', false, 'a@example.com'], ['d2', null, false, 'a@example.com']]);
  });

  it('lets the stronger of diagram share and folder share win', async () => {
    queue.push(ok([{ diagram_id: 'd1', folder_id: null, role: 'editor' }, { diagram_id: null, folder_id: 'f1', role: 'viewer' }]), owners);
    const [d] = (await describeShared([diagram('d1', 'f1')], [folder('f1', null)], 'me')).diagrams;
    expect(d).toMatchObject({ role: 'editor', direct: true });
  });

  it('keeps a diagram share on a diagram in a folder I cannot see', async () => {
    queue.push(ok([{ diagram_id: 'd1', folder_id: null, role: 'viewer' }]), owners);
    const [d] = (await describeShared([diagram('d1', 'hidden')], [], 'me')).diagrams;
    expect(d).toMatchObject({ role: 'viewer', direct: true });
  });

  it('asks nothing without items', async () => {
    await expect(describeShared([], [], 'me')).resolves.toEqual({ diagrams: [], folders: [] });
    expect(calls).toHaveLength(0);
  });
});
