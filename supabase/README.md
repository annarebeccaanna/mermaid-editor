# Supabase-Einrichtung

Datenbank für Anmeldung, Ordner, Diagramme und Freigaben. Der Editor spricht später direkt mit Supabase; alle Zugriffsregeln erzwingt die Datenbank selbst (Row-Level-Security).

## Projekt anlegen

1. Auf [supabase.com](https://supabase.com) ein Projekt anlegen, **Region in der EU** (z. B. Frankfurt).
2. **Authentication → Sign In / Providers → Email:** aktiv lassen.
3. **Authentication → Sign In / Providers → „Allow new users to sign up“ ausschalten.** Damit entstehen Konten nur über Einladungen.
4. **Authentication → URL Configuration:**
   - *Site URL:* `https://mermaid-editor-drab-mu.vercel.app`
   - *Redirect URLs:* `http://localhost:5173/**` und `https://mermaid-editor-drab-mu.vercel.app/**` (für Vercel-Vorschauen zusätzlich z. B. `https://*-<dein-vercel-team>.vercel.app/**`)
5. **Datenbank anlegen:** den Inhalt von `migrations/20261031000000_cloud_storage.sql` im **SQL Editor** ausführen. (Alternativ mit der Supabase-CLI: `supabase link` und `supabase db push`.)
6. **Personen einladen:** **Authentication → Users → Invite user**.

## Was die App später braucht

Unter **Project Settings → API** stehen zwei Werte für Vercel und für `.env.local`:

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon / publishable key>
```

Der Anon-Key ist öffentlich gedacht und gehört in den Browser. Der **Service-Role-Key** darf nie in den Client, nie ins Repo und nie in eine `VITE_`-Variable.

## Rechte im Überblick

| Rolle  | Ansehen | Inhalt/Name ändern | Verschieben, Löschen, Teilen |
|--------|:-------:|:------------------:|:----------------------------:|
| Besitzer | ✓ | ✓ | ✓ |
| Bearbeiter | ✓ | ✓ (in Ordnern auch neue Diagramme anlegen) | – |
| Betrachter | ✓ | – | – |

- Eine Freigabe auf einen Ordner gilt für alles darin. Bei mehreren Wegen zählt die höchste Rolle.
- Ordner legen nur Besitzer an. **Bearbeiter eines geteilten Ordners dürfen darin neue Diagramme anlegen.** Diese gehören dem Besitzer des Ordners; `created_by` hält fest, wer sie angelegt hat. Löschen kann sie nur der Besitzer.
- Teilen geht nur mit bestehenden Konten (Suche per exakter E-Mail). Neue Personen lädst du zuerst ein.
- Speichern mit Versionsprüfung: der Client schreibt `update … where id = … and version = <gelesen>`. Trifft das 0 Zeilen, hat jemand anderes zwischenzeitlich gespeichert.

## Tests

Die Rechte sind per SQL-Test abgedeckt. Er läuft lokal in einem kurzlebigen Postgres in Docker (Image `postgres:16`) und räumt nach sich auf:

```bash
./supabase/tests/run-local.sh
```

`tests/local_stub.sql` bildet dafür die Supabase-Teile nach (Rollen, `auth.users`, `auth.uid()`) und gehört nur in diese lokale Umgebung. Die Tests laufen gegen diesen Nachbau, nicht gegen ein echtes Supabase-Projekt.
