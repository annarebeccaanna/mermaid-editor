// Supabase Edge Function "invite-user": lädt per E-Mail eine neue Person ein.
// Läuft mit dem Service-Schlüssel (der nie in den Browser darf). Wer aufrufen darf, entscheidet handler.ts:
// nur angemeldete Personen, die in der Tabelle public.admins stehen.
//
// Bereitstellen und einrichten: siehe supabase/README.md, Abschnitt "Einladen aus der App".

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { DEFAULT_ORIGINS, handleInvite } from './handler.ts';

// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase der Funktion selbst bereit.
const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Weitere erlaubte Adressen der Web-App (z. B. Vercel-Vorschauen): Geheimnis ALLOWED_ORIGINS, kommagetrennt.
const extra = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const origins = [...DEFAULT_ORIGINS, ...extra];

Deno.serve(async (req) => {
  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    /* kein oder kaputter Inhalt: handler.ts meldet die fehlende Adresse */
  }

  const res = await handleInvite(
    { method: req.method, origin: req.headers.get('origin'), authorization: req.headers.get('authorization'), body },
    {
      origins,
      getUser: async (jwt) => {
        const { data, error } = await admin.auth.getUser(jwt);
        return error || !data.user ? null : { id: data.user.id };
      },
      isAdmin: async (userId) => {
        const { data } = await admin.from('admins').select('user_id').eq('user_id', userId).maybeSingle();
        return !!data;
      },
      invite: async (email, redirectTo) => {
        const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo });
        return { error };
      },
    },
  );

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Vary: 'Origin' };
  if (res.allowOrigin) {
    headers['Access-Control-Allow-Origin'] = res.allowOrigin;
    headers['Access-Control-Allow-Headers'] = 'authorization, content-type, apikey, x-client-info';
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
  }
  return new Response(res.json ? JSON.stringify(res.json) : null, { status: res.status, headers });
});
