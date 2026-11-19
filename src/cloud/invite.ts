// Invite new people from the app. Needs the Edge Function `invite-user` (supabase/functions/invite-user):
// creating accounts takes the service key, which never reaches the browser.
import { supabase } from './client';

/** Is the signed-in person an administrator? False when unsure, e.g. when the database part is not set up yet. */
export async function checkIsAdmin(): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('is_admin');
  return !error && data === true;
}

interface FunctionError {
  name?: string;
  message?: string;
  context?: unknown;
}

const FALLBACK = 'Die Einladung konnte nicht gesendet werden.';

/** The text to show for a failed call: the function's own message, or a plain reason. */
export async function inviteErrorMessage(error: FunctionError): Promise<string> {
  if (error.name === 'FunctionsFetchError') return 'Keine Verbindung zum Server. Bitte die Internetverbindung prüfen.';
  const res = error.context as Response | undefined;
  if (res && typeof res.json === 'function') {
    if (res.status === 404) return 'Die Einladungsfunktion ist noch nicht eingerichtet (siehe supabase/README.md).';
    try {
      const body = (await res.json()) as { error?: unknown };
      if (typeof body.error === 'string') return body.error;
    } catch {
      /* kein lesbarer Inhalt */
    }
  }
  return FALLBACK;
}

export async function inviteByEmail(email: string): Promise<void> {
  if (!supabase) throw new Error('Die Cloud ist nicht eingerichtet.');
  const { error } = await supabase.functions.invoke('invite-user', { body: { email } });
  if (error) throw new Error(await inviteErrorMessage(error));
}
