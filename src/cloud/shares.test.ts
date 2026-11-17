import { beforeEach, describe, expect, it, vi } from 'vitest';

// Fake query builder: every call returns the builder, awaiting it hands out the next prepared answer.
type Result = { data: unknown; error: { message: string; code?: string } | null };
const calls: Array<[string, unknown[]]> = [];
const queue: Result[] = [];

const builder: Record<string, unknown> = {
  then: (resolve: (v: unknown) => void) => resolve(queue.shift() ?? { data: [], error: null }),
};
for (const m of ['from', 'select', 'insert', 'update', 'delete', 'eq', 'in', 'not', 'order', 'rpc']) {
  builder[m] = (...args: unknown[]) => {
    calls.push([m, args]);
    return builder;
  };
}
vi.mock('./client', () => ({ supabase: builder }));

const { NO_ACCOUNT, addShare, describeShared, leaveDiagram, listShares, removeShare, updateShareRole } = await import('./shares');

beforeEach(() => {
  calls.length = 0;
  queue.length = 0;
});

const ok = (data: unknown): Result => ({ data, error: null });

describe('listShares', () => {
  it('adds the e-mail address of each person', async () => {
    queue.push(ok([{ id: 's1', role: 'viewer', grantee_id: 'u1' }]), ok([{ id: 'u1', email: 'b@example.com' }]));
    await expect(listShares('d1')).resolves.toEqual([{ id: 's1', role: 'viewer', grantee_id: 'u1', email: 'b@example.com' }]);
    expect(calls).toContainEqual(['eq', ['diagram_id', 'd1']]);
  });

  it('skips the second query when nobody has access', async () => {
    queue.push(ok([]));
    await expect(listShares('d1')).resolves.toEqual([]);
    expect(calls.filter(([m]) => m === 'from')).toHaveLength(1);
  });
});

describe('addShare', () => {
  it('shares with the person found by e-mail', async () => {
    queue.push(ok([{ id: 'u1', email: 'b@example.com' }]), ok(null));
    await addShare('d1', ' b@example.com ', 'editor');
    expect(calls).toContainEqual(['rpc', ['find_user_by_email', { p_email: ' b@example.com ' }]]);
    expect(calls).toContainEqual(['insert', [{ diagram_id: 'd1', grantee_id: 'u1', role: 'editor' }]]);
  });

  it('says so when there is no account for the address', async () => {
    queue.push(ok([]));
    await expect(addShare('d1', 'x@example.com', 'viewer')).rejects.toThrow(NO_ACCOUNT);
    expect(calls.some(([m]) => m === 'insert')).toBe(false);
  });

  it('says so when the person has access already', async () => {
    queue.push(ok([{ id: 'u1', email: 'b@example.com' }]), { data: null, error: { message: 'duplicate key', code: '23505' } });
    await expect(addShare('d1', 'b@example.com', 'viewer')).rejects.toThrow('b@example.com hat schon Zugriff');
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

  it('leaves a diagram by diagram and person', async () => {
    queue.push(ok([{ id: 's1' }]));
    await leaveDiagram('d1', 'me');
    expect(calls).toContainEqual(['eq', ['diagram_id', 'd1']]);
    expect(calls).toContainEqual(['eq', ['grantee_id', 'me']]);
  });

  it('explains when access comes through a folder', async () => {
    queue.push(ok([]));
    await expect(leaveDiagram('d1', 'me')).rejects.toThrow('geteilten Ordner');
  });
});

describe('describeShared', () => {
  const item = { id: 'd1', name: 'Plan', owner_id: 'o1', folder_id: null, updated_at: '2026-11-01' };

  it('adds my role and the owner address', async () => {
    queue.push(ok([{ diagram_id: 'd1', role: 'editor' }]), ok([{ id: 'o1', email: 'a@example.com' }]));
    await expect(describeShared([item], 'me')).resolves.toEqual([{ ...item, role: 'editor', ownerEmail: 'a@example.com' }]);
  });

  it('leaves the role empty for access through a folder', async () => {
    queue.push(ok([]), ok([{ id: 'o1', email: 'a@example.com' }]));
    const [r] = await describeShared([item], 'me');
    expect(r.role).toBeNull();
  });

  it('asks nothing without items', async () => {
    await expect(describeShared([], 'me')).resolves.toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
