# E-Mail-Vorlagen

Deutsche Texte für die zwei Mails, die die App auslöst. Supabase schickt standardmäßig englische Texte.

| Datei | Wo einfügen (Supabase-Dashboard) | Betreff |
| --- | --- | --- |
| `magic-link.html` | Authentication → Emails → Templates → **Magic link** | Dein Anmelde-Link für den Mermaid Editor |
| `invite.html` | Authentication → Emails → Templates → **Invite user** | Du bist zum Mermaid Editor eingeladen |

Den Inhalt der Datei (ohne den Kommentar in der ersten Zeile) in das Feld **Message body** kopieren, den Betreff in **Subject**. Die Platzhalter `{{ .ConfirmationURL }}` bleiben so stehen, Supabase setzt dort den Link ein.

Die Vorlagen für „Confirm signup“, „Change email“, „Reset password“ und „Reauthentication“ werden nicht gebraucht: Neue Konten entstehen nur über Einladungen, ein Passwort gibt es nicht.
