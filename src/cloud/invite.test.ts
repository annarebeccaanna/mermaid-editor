import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const invoke = vi.fn();
vi.mock('./client', () => ({ supabase: { rpc, functions: { invoke } } }));

const { checkIsAdmin, inviteByEmail, inviteErrorMessage } = await import('./invite');

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

const httpError = (status: number, body: unknown) => ({
  name: 'FunctionsHttpError',
  message: 'Edge Function returned a non-2xx status code',
  context: new Response(JSON.stringify(body), { status }),
});

describe('checkIsAdmin', () => {
  it('is true only when the database says so', async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await checkIsAdmin()).toBe(true);
    expect(rpc).toHaveBeenCalledWith('is_admin');
  });

  it('is false for everybody else and when the function does not exist yet', async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(await checkIsAdmin()).toBe(false);
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'function public.is_admin() does not exist' } });
    expect(await checkIsAdmin()).toBe(false);
  });
});

describe('inviteErrorMessage', () => {
  it('uses the message the function sent', async () => {
    expect(await inviteErrorMessage(httpError(409, { error: 'Für diese Adresse gibt es schon ein Konto.' }))).toBe('Für diese Adresse gibt es schon ein Konto.');
  });

  it('says when the function is not set up', async () => {
    expect(await inviteErrorMessage(httpError(404, { code: 'NOT_FOUND' }))).toMatch(/noch nicht eingerichtet/);
  });

  it('explains a lost connection and falls back for the rest', async () => {
    expect(await inviteErrorMessage({ name: 'FunctionsFetchError' })).toMatch(/Keine Verbindung/);
    expect(await inviteErrorMessage({ name: 'FunctionsRelayError' })).toMatch(/konnte nicht gesendet/);
    expect(await inviteErrorMessage({ name: 'FunctionsHttpError', context: new Response('kein json', { status: 500 }) })).toMatch(/konnte nicht gesendet/);
  });
});

describe('inviteByEmail', () => {
  it('calls the function with the address', async () => {
    invoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    await inviteByEmail('neu@example.com');
    expect(invoke).toHaveBeenCalledWith('invite-user', { body: { email: 'neu@example.com' } });
  });

  it('throws the readable message when the call fails', async () => {
    invoke.mockResolvedValueOnce({ data: null, error: httpError(403, { error: 'Dafür fehlt dir die Berechtigung.' }) });
    await expect(inviteByEmail('neu@example.com')).rejects.toThrow('Dafür fehlt dir die Berechtigung.');
  });
});
