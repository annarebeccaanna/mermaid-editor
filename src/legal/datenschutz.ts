// Datenschutzerklärung der Web-Version (Entwurf).
//
// Offene Angaben stehen als [[PLATZHALTER]] im Text. Sie erscheinen in der App markiert, solange welche
// übrig sind, und die Seite weist dann darauf hin, dass der Text ein Entwurf ist. Ersetze sie durch die
// echten Angaben und lasse den Text vor der Veröffentlichung rechtlich prüfen.

export interface PolicySection {
  title: string;
  /** text before the list (or the whole text when there is no list) */
  paragraphs?: string[];
  list?: string[];
  /** text after the list */
  after?: string[];
}

export const POLICY_TITLE = 'Datenschutzerklärung';

export const POLICY: PolicySection[] = [
  {
    title: 'Verantwortlich',
    paragraphs: [
      '[[NAME UND ANSCHRIFT DER VERANTWORTLICHEN PERSON]]',
      'Kontakt für alle Fragen zum Datenschutz: [[KONTAKT-E-MAIL]]',
    ],
  },
  {
    title: 'Wofür diese Erklärung gilt',
    paragraphs: [
      'Sie gilt für die Web-Version des Mermaid Editors unter [[ADRESSE DER SEITE, z. B. https://mermaid-editor-drab-mu.vercel.app]]. Die Desktop-App speichert Dateien nur auf deinem Rechner und sendet dabei keine Daten an uns.',
      'Ohne Anmeldung bleiben deine Diagramme in deinem Browser. Gespeichert wird auf unseren Servern erst, wenn du dich anmeldest und ein Diagramm in der Cloud speicherst.',
    ],
  },
  {
    title: 'Aufruf der Seite',
    paragraphs: [
      'Beim Aufruf verarbeitet unser Hosting-Anbieter technisch notwendige Verbindungsdaten: deine IP-Adresse, Datum und Uhrzeit, die angefragte Datei, die Browser-Kennung und die übertragene Datenmenge. Das ist nötig, um die Seite auszuliefern und missbräuchliche Zugriffe abzuwehren. Rechtsgrundlage ist unser berechtigtes Interesse an einem sicheren und funktionierenden Betrieb (Art. 6 Abs. 1 lit. f DSGVO).',
      'Einstellungen wie die Breite der Seitenleiste oder eigene Farben legt die Seite im lokalen Speicher deines Browsers ab. Sie verlassen deinen Rechner nicht. Cookies setzen wir nicht. Wir nutzen keine Analyse- und keine Werbedienste und verfolgen dein Verhalten nicht.',
    ],
  },
  {
    title: 'Konto und Anmeldung',
    paragraphs: [
      'Ein Konto gibt es nur auf Einladung. Dafür speichern wir deine E-Mail-Adresse und technische Angaben zum Konto, etwa den Zeitpunkt der letzten Anmeldung. Du meldest dich mit einem Link an, den wir dir per E-Mail schicken. Ein Passwort gibt es nicht.',
      'Nach der Anmeldung legt die Seite eine Sitzung im lokalen Speicher deines Browsers ab, damit du angemeldet bleibst. Mit dem Abmelden wird sie gelöscht. Rechtsgrundlage ist die Bereitstellung des gewünschten Dienstes (Art. 6 Abs. 1 lit. b DSGVO).',
    ],
  },
  {
    title: 'Was in der Cloud gespeichert wird',
    paragraphs: ['Wenn du in der Cloud speicherst, legen wir Folgendes an:'],
    list: [
      'deine Diagramme mit Name und Inhalt, deine Ordner und ihre Anordnung',
      'Freigaben: wer Zugriff auf welches Diagramm oder welchen Ordner hat, und mit welcher Berechtigung',
      'Zeitpunkte der Erstellung und der letzten Änderung sowie, wer ein Diagramm angelegt und zuletzt geändert hat',
    ],
    after: [
      'Teilst du ein Diagramm oder einen Ordner, sehen die Personen mit Zugriff den Inhalt und deine E-Mail-Adresse. Du siehst umgekehrt die E-Mail-Adressen der Personen, mit denen du teilst und die mit dir teilen. Das ist für die Zusammenarbeit nötig (Art. 6 Abs. 1 lit. b DSGVO).',
    ],
  },
  {
    title: 'Bilder von anderen Servern',
    paragraphs: [
      'Ein Diagramm kann Bilder einbinden, die auf fremden Servern liegen. Beim Laden erfährt der fremde Server deine IP-Adresse und den Zeitpunkt. Bei Diagrammen, die dir jemand geteilt hat, laden wir solche Bilder deshalb erst, wenn du auf „Laden“ klickst. In deinen eigenen Diagrammen werden sie sofort geladen.',
    ],
  },
  {
    title: 'Empfänger und Dienstleister',
    paragraphs: ['Wir setzen folgende Dienstleister ein, die Daten in unserem Auftrag verarbeiten:'],
    list: [
      'Hosting der Seite: Vercel Inc., USA. [[PRÜFEN: Auftragsverarbeitungsvertrag abgeschlossen?]]',
      'Datenbank und Anmeldung: Supabase, Rechenzentrum in [[EU-REGION, z. B. Frankfurt]]. [[PRÜFEN: Auftragsverarbeitungsvertrag abgeschlossen?]]',
      'Versand der Anmelde-E-Mails: [[MAILANBIETER]]',
    ],
  },
  {
    title: 'Übermittlung in Drittländer',
    paragraphs: [
      'Einige Dienstleister haben ihren Sitz in den USA. Die Übermittlung stützt sich auf [[RECHTSGRUNDLAGE, z. B. EU-US Data Privacy Framework und Standardvertragsklauseln]]. Die Daten deiner Cloud-Diagramme liegen in einem Rechenzentrum in der EU.',
    ],
  },
  {
    title: 'Wie lange wir Daten speichern',
    paragraphs: [
      'Dein Konto und deine Inhalte bleiben, bis du sie löschst oder die Löschung deines Kontos verlangst. Die Verbindungsdaten beim Hosting-Anbieter werden nach [[SPEICHERDAUER DER SERVER-PROTOKOLLE]] gelöscht.',
    ],
  },
  {
    title: 'Deine Rechte',
    paragraphs: [
      'Du kannst jederzeit Auskunft über deine gespeicherten Daten verlangen sowie Berichtigung, Löschung, Einschränkung der Verarbeitung und die Herausgabe deiner Daten in einem gängigen Format. Wo wir uns auf berechtigte Interessen stützen, kannst du der Verarbeitung widersprechen. Wende dich dafür an [[KONTAKT-E-MAIL]]; ein Konto löschen wir auf Anfrage samt allen Inhalten.',
      'Du hast außerdem das Recht, dich bei einer Datenschutz-Aufsichtsbehörde zu beschweren, zum Beispiel bei [[ZUSTÄNDIGE AUFSICHTSBEHÖRDE]].',
    ],
  },
  {
    title: 'Stand',
    paragraphs: ['[[DATUM DER LETZTEN ÄNDERUNG]]'],
  },
];

/** The whole text in one string (for counting open details). */
export const policyText = (): string =>
  POLICY.flatMap((s) => [s.title, ...(s.paragraphs ?? []), ...(s.list ?? []), ...(s.after ?? [])]).join('\n');
