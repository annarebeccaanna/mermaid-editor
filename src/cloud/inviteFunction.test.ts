import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ORIGINS, handleInvite, normalizeEmail, type InviteDeps, type InviteRequest } from '../../supabase/functions/invite-user/handler';

const SITE = DEFAULT_ORIGINS[0];

function setup(over: Partial<InviteDeps> = {}) {
  const deps: InviteDeps = {
    origins: DEFAULT_ORIGINS,
    getUser: vi.fn(async (jwt: string) => (jwt === 'good' ? { id: 'admin1' } : jwt === 'plain' ? { id: 'user1' } : null)),
    isAdmin: vi.fn(async (id: string) => id === 'admin1'),
    invite: vi.fn(async () => ({ error: null })),
    ...over,
  };
  const call = (req: Partial<InviteRequest> = {}) =>
    handleInvite({ method: 'POST', origin: SITE, authorization: 'Bearer good', body: { email: 'neu@example.com' }, ...req }, deps);
  return { deps, call };
}

describe('normalizeEmail', () => {
  it('accepts normal addresses and lowercases them', () => {
    expect(normalizeEmail('  Anna.Muster@Example.COM ')).toBe('anna.muster@example.com');
    expect(normalizeEmail('a+tag@sub.example.org')).toBe('a+tag@sub.example.org');
  });

  it('rejects anything else', () => {
    for (const bad of [undefined, null, 42, '', 'kein-at', 'a@b', 'a@@b.de', 'a b@c.de', 'a@b.de, c@d.de', '<x@y.de>', 'a@b..de', 'a@b.de\nBcc: x@y.de', 'x'.repeat(250) + '@a.de']) {
      expect(normalizeEmail(bad), String(bad)).toBeNull();
    }
  });
});

describe('handleInvite', () => {
  it('lets an admin invite and sends the person back to the site', async () => {
    const { deps, call } = setup();
    const r = await call();
    expect(r).toEqual({ status: 200, json: { ok: true }, allowOrigin: SITE });
    expect(deps.invite).toHaveBeenCalledWith('neu@example.com', `${SITE}/`);
  });

  it('answers the browser preflight without checking anything', async () => {
    const { deps, call } = setup();
    const r = await call({ method: 'OPTIONS', authorization: null });
    expect(r.status).toBe(204);
    expect(r.allowOrigin).toBe(SITE);
    expect(deps.getUser).not.toHaveBeenCalled();
  });

  it('refuses callers who are not signed in', async () => {
    const { deps, call } = setup();
    expect((await call({ authorization: null })).status).toBe(401);
    expect((await call({ authorization: 'Bearer schlecht' })).status).toBe(401);
    expect((await call({ authorization: 'Basic abc' })).status).toBe(401);
    expect(deps.invite).not.toHaveBeenCalled();
  });

  it('refuses people who are not admins, and never sends a mail', async () => {
    const { deps, call } = setup();
    const r = await call({ authorization: 'Bearer plain' });
    expect(r.status).toBe(403);
    expect(deps.invite).not.toHaveBeenCalled();
  });

  it('does not serve other websites, even with a valid admin token', async () => {
    const { deps, call } = setup();
    const r = await call({ origin: 'https://boese.example' });
    expect(r.status).toBe(403);
    expect(r.allowOrigin).toBeNull();
    expect(deps.getUser).not.toHaveBeenCalled();
  });

  it('serves calls without an origin (curl, other servers) when the token is right', async () => {
    const { deps, call } = setup();
    const r = await call({ origin: null });
    expect(r.status).toBe(200);
    expect(r.allowOrigin).toBeNull();
    expect(deps.invite).toHaveBeenCalledWith('neu@example.com', `${SITE}/`);
  });

  it('only accepts POST', async () => {
    const { call } = setup();
    expect((await call({ method: 'GET' })).status).toBe(405);
  });

  it('asks for a valid address', async () => {
    const { deps, call } = setup();
    expect((await call({ body: { email: 'kaputt' } })).status).toBe(400);
    expect((await call({ body: null })).status).toBe(400);
    expect(deps.invite).not.toHaveBeenCalled();
  });

  it('explains when the person has an account already', async () => {
    const { call } = setup({ invite: async () => ({ error: { code: 'email_exists', status: 422, message: 'A user with this email address has already been registered' } }) });
    const r = await call();
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.json)).toContain('schon ein Konto');
  });

  it('passes on the mail rate limit', async () => {
    const { call } = setup({ invite: async () => ({ error: { code: 'over_email_send_rate_limit', status: 429, message: 'email rate limit exceeded' } }) });
    expect((await call()).status).toBe(429);
  });

  it('hides internal errors', async () => {
    const { call } = setup({ invite: async () => ({ error: { status: 500, message: 'connection to db at 10.0.0.1 failed' } }) });
    const r = await call();
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain('10.0.0.1');
  });
});
