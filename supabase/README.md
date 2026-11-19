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
6. **Personen einladen:** **Authentication → Users → Invite user** (oder später in der App, siehe unten).

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

## Einladen aus der App

Neue Personen lassen sich statt im Dashboard auch in der App einladen: **Kontomenü → Person einladen …**. Der Menüpunkt erscheint nur für Administratoren. Dafür gibt es drei Teile, die einmal eingerichtet werden müssen.

**Wie es funktioniert:** Konten anzulegen braucht den geheimen Service-Schlüssel. Der darf nicht in den Browser. Deshalb ruft die App die Supabase-Funktion `invite-user` auf (`functions/invite-user/`). Sie prüft, ob die anrufende Person angemeldet ist **und** in der Tabelle `admins` steht, und lädt dann per E-Mail ein. Die Tabelle `admins` kann über die API niemand lesen oder ändern. Aufrufe von fremden Webseiten lehnt die Funktion ab.

1. **Datenbank:** Die Migration `20261117000000_admins.sql` legt die Tabelle und die Funktion `is_admin()` an. Sie wird wie die anderen Migrationen eingespielt (GitHub-Integration beim Merge nach `main`, oder im SQL Editor ausführen).
2. **Ersten Administrator eintragen** (einmalig, im **SQL Editor**; die Adresse muss schon ein Konto haben):

   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'deine@adresse.de';
   ```

   Weitere Administratoren auf dieselbe Weise. Entfernen: `delete from public.admins where user_id = (select id from auth.users where email = '…');`
3. **Funktion bereitstellen** (braucht die [Supabase-CLI](https://supabase.com/docs/guides/cli), einmal anmelden):

   ```bash
   brew install supabase/tap/supabase
   supabase login
   supabase functions deploy invite-user --project-ref <projekt-id>
   ```

   Die Funktion findet `SUPABASE_URL` und den Service-Schlüssel selbst. Meldet der Aufruf „Invalid JWT“, hängt `--no-verify-jwt` an den Befehl an: Die Funktion prüft das Token ohnehin selbst.
4. **Weitere Web-Adressen erlauben** (z. B. Vercel-Vorschauen): Standardmäßig sind die Live-Seite und `http://localhost:5173` erlaubt. Zusätzliche Adressen als Geheimnis setzen:

   ```bash
   supabase secrets set ALLOWED_ORIGINS=https://meine-vorschau.vercel.app --project-ref <projekt-id>
   ```

**Prüfen:** Als Administrator im Kontomenü „Person einladen …“ wählen und eine Adresse eingeben. Steht dort „noch nicht eingerichtet“, fehlt Schritt 3. Erscheint der Menüpunkt gar nicht, fehlt Schritt 1 oder 2.

**Hinweis zur Mail:** Die Einladung geht über denselben Mailversand wie die Anmelde-Links. Die eingebaute Mail von Supabase ist stark gedrosselt (siehe den Abschnitt zum eigenen Mailserver).

## Eigener Mailserver (SMTP)

Die eingebaute Mail von Supabase ist nur zum Ausprobieren gedacht: Sie verschickt nur sehr wenige Mails pro Stunde, kommt von einer fremden Absenderadresse und landet oft im Spam. Für den Alltag braucht das Projekt einen eigenen Mailversand. Betroffen sind **Anmelde-Links** und **Einladungen**.

**Voraussetzung:** eine **eigene Domain** (kostet ein paar Euro im Jahr), denn nur damit lassen sich Absenderadresse und Echtheitsnachweis (SPF/DKIM) einrichten. Von einer Gmail-Adresse aus kann man so nicht versenden.

1. **Anbieter wählen und Konto anlegen.** Brauchbar sind alle Dienste, die SMTP anbieten. Für ein kleines Team in der EU bieten sich Anbieter mit Sitz oder Rechenzentrum in der EU an, siehe den Vergleich in der Review-Datei.
2. **Absender-Domain beim Anbieter eintragen** (z. B. `mail.deine-domain.de` oder die Hauptdomain). Der Anbieter zeigt danach DNS-Einträge an, die du bei deinem Domain-Anbieter anlegst:
   - **SPF** (TXT-Eintrag): erlaubt dem Anbieter, in deinem Namen zu senden.
   - **DKIM** (TXT- oder CNAME-Eintrag): signiert die Mails.
   - **DMARC** (TXT-Eintrag auf `_dmarc.deine-domain.de`): zum Start `v=DMARC1; p=none; rua=mailto:deine@adresse.de`, später strenger.
   Der Anbieter zeigt an, wenn die Einträge erkannt sind (kann einige Minuten bis Stunden dauern).
3. **SMTP-Zugang beim Anbieter anlegen:** Server, Port (587 mit STARTTLS oder 465), Benutzername und Passwort bzw. SMTP-Schlüssel.
4. **In Supabase eintragen:** **Authentication → Emails → SMTP Settings** (je nach Dashboard-Version auch unter *Project Settings → Authentication*): „Enable custom SMTP“, *Sender email* (z. B. `anmeldung@deine-domain.de`), *Sender name* (`Mermaid Editor`), Server, Port, Benutzer, Passwort speichern.
5. **Vorlagen einfügen:** die deutschen Texte aus `templates/` (siehe dort die Tabelle): **Magic link** und **Invite user**.
6. **Mail-Limit anpassen:** Mit eigenem SMTP gilt ein höheres Limit. Es lässt sich unter **Authentication → Rate Limits** einstellen.
7. **Testen:** Einen Anmelde-Link anfordern. Kommt die Mail an, nicht im Spam, und zeigt der Mail-Header `spf=pass` und `dkim=pass`? Ein zusätzlicher Test geht mit einem Dienst wie mail-tester.com.
8. **Datenschutzerklärung anpassen:** den Mailanbieter bei den Dienstleistern eintragen und, falls nötig, einen Auftragsverarbeitungsvertrag abschließen.

## Tests

Die Rechte sind per SQL-Test abgedeckt. Er läuft lokal in einem kurzlebigen Postgres in Docker (Image `postgres:16`) und räumt nach sich auf:

```bash
./supabase/tests/run-local.sh
```

`tests/local_stub.sql` bildet dafür die Supabase-Teile nach (Rollen, `auth.users`, `auth.uid()`) und gehört nur in diese lokale Umgebung. Die Tests laufen gegen diesen Nachbau, nicht gegen ein echtes Supabase-Projekt.
