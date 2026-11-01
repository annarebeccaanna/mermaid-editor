// Turns the result of "send login link" into something we show the user.
// Kept free of the Supabase client so it can be unit-tested.

export interface LoginLinkError {
  code?: string;
  message: string;
}

export type LoginLinkResult = { sent: true } | { error: string };

export function loginLinkResult(error: LoginLinkError | null): LoginLinkResult {
  if (!error) return { sent: true };
  // Unknown address while sign-ups are closed: answer exactly like for a known one,
  // so nobody can find out who has an account.
  if (error.code === 'otp_disabled' || error.code === 'signup_disabled') return { sent: true };
  if (error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit') {
    return { error: 'Zu viele Anfragen. Bitte in einigen Minuten noch einmal versuchen.' };
  }
  return { error: `Der Link konnte nicht gesendet werden: ${error.message}` };
}

export interface CloudError {
  code?: string;
  message: string;
}

/** Plain-language text for what went wrong when talking to the database. */
export function cloudErrorMessage(e: CloudError): string {
  const msg = e.message ?? '';
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(msg)) {
    return 'Keine Verbindung zum Server. Bitte die Internetverbindung prüfen.';
  }
  if (e.code === 'PGRST301' || e.code === 'PGRST303' || /\bjwt\b/i.test(msg)) {
    return 'Die Anmeldung ist abgelaufen. Bitte melde dich neu an.';
  }
  if (e.code === 'PGRST116') return 'Das gibt es nicht mehr, oder du hast keinen Zugriff darauf.';
  if (/row-level security|permission denied/i.test(msg)) return 'Dafür fehlt dir die Berechtigung.';
  return msg;
}

/** Error info Supabase puts into the URL hash when a login/invite link is expired or used up. */
export function linkErrorFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('error_code') && !params.has('error')) return null;
  if (params.get('error_code') === 'otp_expired') {
    return 'Der Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen anfordern.';
  }
  return params.get('error_description')?.replace(/\+/g, ' ') ?? 'Die Anmeldung über den Link hat nicht geklappt.';
}
