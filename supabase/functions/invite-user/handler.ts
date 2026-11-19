// Entscheidungslogik der Funktion "invite-user": Wer darf wen einladen?
// Bewusst ohne Deno- und Supabase-Importe, damit sie sich mit Vitest testen lässt (src/cloud/inviteFunction.test.ts).

export const DEFAULT_ORIGINS = ['https://mermaid-editor-drab-mu.vercel.app', 'http://localhost:5173'];

export interface InviteRequest {
  method: string;
  /** Origin-Header des Browsers (fehlt bei Aufrufen von Servern oder curl) */
  origin: string | null;
  /** Authorization-Header: "Bearer <Token der angemeldeten Person>" */
  authorization: string | null;
  body: unknown;
}

export interface InviteDeps {
  /** Erlaubte Herkunftsadressen der Web-App */
  origins: string[];
  /** Die angemeldete Person zum Token, sonst null */
  getUser: (jwt: string) => Promise<{ id: string } | null>;
  isAdmin: (userId: string) => Promise<boolean>;
  invite: (email: string, redirectTo: string) => Promise<{ error?: { code?: string; status?: number; message: string } | null }>;
}

export interface InviteResponse {
  status: number;
  json?: { ok: true } | { error: string };
  /** Für den Header Access-Control-Allow-Origin (null: Header weglassen) */
  allowOrigin: string | null;
}

/** Gültige, kleingeschriebene Adresse oder null. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || /[\s\u0000-\u001f<>(),;:"\\]/.test(email)) return null;
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(email) ? email : null;
}

export async function handleInvite(req: InviteRequest, deps: InviteDeps): Promise<InviteResponse> {
  const allowOrigin = req.origin && deps.origins.includes(req.origin) ? req.origin : null;
  const reply = (status: number, json?: InviteResponse['json']): InviteResponse => ({ status, json, allowOrigin });

  if (req.method === 'OPTIONS') return reply(204);
  // Aufrufe von fremden Webseiten werden nicht bedient (ein Token allein genügt dort nicht).
  if (req.origin && !allowOrigin) return reply(403, { error: 'Dieser Aufruf ist von hier nicht erlaubt.' });
  if (req.method !== 'POST') return reply(405, { error: 'Nur POST ist erlaubt.' });

  const jwt = /^Bearer\s+(\S+)$/i.exec(req.authorization ?? '')?.[1];
  const user = jwt ? await deps.getUser(jwt) : null;
  if (!user) return reply(401, { error: 'Bitte melde dich neu an.' });

  // Wer kein Administrator ist, erfährt nichts weiter.
  if (!(await deps.isAdmin(user.id))) return reply(403, { error: 'Dafür fehlt dir die Berechtigung.' });

  const email = normalizeEmail((req.body as { email?: unknown } | null)?.email);
  if (!email) return reply(400, { error: 'Bitte eine gültige E-Mail-Adresse angeben.' });

  const { error } = await deps.invite(email, `${allowOrigin ?? deps.origins[0]}/`);
  if (!error) return reply(200, { ok: true });

  if (error.code === 'email_exists' || /already (been )?registered/i.test(error.message)) {
    return reply(409, { error: 'Für diese Adresse gibt es schon ein Konto.' });
  }
  if (error.status === 429 || /rate limit/i.test(`${error.code ?? ''} ${error.message}`)) {
    return reply(429, { error: 'Zu viele Einladungen in kurzer Zeit. Bitte in einigen Minuten noch einmal versuchen.' });
  }
  return reply(500, { error: 'Die Einladung konnte nicht gesendet werden.' });
}
