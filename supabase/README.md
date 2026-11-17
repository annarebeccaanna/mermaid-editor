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

Unter **Project Settings → API** stehen zwei Werte. Für das gemeinsame Projekt liegen sie in der eingecheckten `.env` (Vite liest sie beim Build ein, auf Vercel muss nichts eingestellt werden). Wer ein eigenes Projekt nutzt, legt eine `.env.local` an (Vorlage: `.env.example`), die `.env` überschreibt:

```
VITE_SUPABASE_URL=https://<projekt>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable key, beginnt mit sb_publishable_>
```

Der Publishable-Key (früher „Anon-Key“) ist öffentlich gedacht und gehört in den Browser. Der **Service-Role-Key** darf nie in den Client, nie ins Repo und nie in eine `VITE_`-Variable.

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

## Bilder in der Cloud (Speicher)

Bilder liegen im privaten Bucket `diagram-images` von Supabase Storage. Die Migration `20261117010000_diagram_images.sql` legt ihn an und setzt die Regeln, das Anlegen im Dashboard ist nicht nötig.

- **Pfad:** `<diagramm-id>/<zufälliger-name>.<endung>`. Im Diagramm steht `cloud:<diagramm-id>/<name>`.
- **Zugriff folgt dem Diagramm:** Ansehen darf, wer das Diagramm sehen darf (auch über Ordnerfreigaben). Hochladen und Löschen dürfen Besitzer und Bearbeiter. Betrachter und Fremde nicht. Überschreiben gibt es nicht.
- **Grenzen:** PNG, JPEG, GIF, WebP, höchstens 5 MB pro Datei. SVG ist ausgeschlossen, weil es Skripte tragen kann. Die Grenzen stehen im Bucket und prüft Supabase beim Hochladen.
- **Anzeige:** Die App holt für jedes Bild eine kurzlebige signierte Adresse (eine Stunde) und erneuert sie bei Bedarf.
- **Aufräumen:** Beim Löschen eines Diagramms oder Ordners entfernt die App zuerst die Bilder. Ein Bild, dessen Knoten du löschst, bleibt als Datei liegen, bis das Diagramm gelöscht wird (so funktioniert „Rückgängig“ weiter).

Der Speicher wird in `tests/local_stub.sql` nachgebildet. Die Zugriffsregeln sind damit getestet. Ob Supabase die Grenzen (Größe, Typ) durchsetzt, prüft nur ein echter Test im Projekt.

## Tests

Die Rechte sind per SQL-Test abgedeckt. Er läuft lokal in einem kurzlebigen Postgres in Docker (Image `postgres:16`) und räumt nach sich auf:

```bash
./supabase/tests/run-local.sh
```

`tests/local_stub.sql` bildet dafür die Supabase-Teile nach (Rollen, `auth.users`, `auth.uid()`) und gehört nur in diese lokale Umgebung. Die Tests laufen gegen diesen Nachbau, nicht gegen ein echtes Supabase-Projekt.
