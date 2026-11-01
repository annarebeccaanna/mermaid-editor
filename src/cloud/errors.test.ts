import { describe, expect, it } from 'vitest';
import { cloudErrorMessage, linkErrorFromHash, loginLinkResult } from './errors';

describe('loginLinkResult', () => {
  it('reports success', () => {
    expect(loginLinkResult(null)).toEqual({ sent: true });
  });

  it('answers the same for unknown addresses as for invited ones', () => {
    expect(loginLinkResult({ code: 'otp_disabled', message: 'Signups not allowed for otp' })).toEqual({ sent: true });
    expect(loginLinkResult({ code: 'signup_disabled', message: 'Signups not allowed' })).toEqual({ sent: true });
  });

  it('explains rate limits', () => {
    const r = loginLinkResult({ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' });
    expect('error' in r && r.error).toMatch(/Zu viele Anfragen/);
  });

  it('passes other errors on', () => {
    const r = loginLinkResult({ code: 'unexpected_failure', message: 'boom' });
    expect('error' in r && r.error).toContain('boom');
  });
});

describe('cloudErrorMessage', () => {
  it('explains a lost connection', () => {
    expect(cloudErrorMessage({ message: 'TypeError: Failed to fetch' })).toMatch(/Keine Verbindung/);
    expect(cloudErrorMessage({ message: 'Load failed' })).toMatch(/Keine Verbindung/);
  });

  it('asks to sign in again when the session ran out', () => {
    expect(cloudErrorMessage({ code: 'PGRST303', message: 'JWT expired' })).toMatch(/abgelaufen/);
    expect(cloudErrorMessage({ message: 'JWT expired' })).toMatch(/abgelaufen/);
  });

  it('explains missing rows and missing rights', () => {
    expect(cloudErrorMessage({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' })).toMatch(/nicht mehr/);
    expect(cloudErrorMessage({ code: '42501', message: 'new row violates row-level security policy for table "diagrams"' })).toMatch(/Berechtigung/);
  });

  it('keeps our own database messages', () => {
    const m = 'Nur der Besitzer darf ein Diagramm verschieben';
    expect(cloudErrorMessage({ code: '42501', message: m })).toBe(m);
  });
});

describe('linkErrorFromHash', () => {
  it('ignores normal hashes', () => {
    expect(linkErrorFromHash('')).toBeNull();
    expect(linkErrorFromHash('#access_token=abc&type=invite')).toBeNull();
  });

  it('recognises an expired link', () => {
    const h = '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';
    expect(linkErrorFromHash(h)).toMatch(/abgelaufen/);
  });

  it('falls back to the description for other errors', () => {
    expect(linkErrorFromHash('#error=server_error&error_description=Something+broke')).toBe('Something broke');
  });
});
