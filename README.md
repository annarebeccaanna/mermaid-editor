# Mermaid Editor

Desktop-App zum Zeichnen von Diagrammen im Miro-Stil – das Ergebnis ist sauberer, gut lesbarer **Mermaid-Flowchart-Code**.
Leinwand und Code sind in beide Richtungen verbunden: Änderungen im Diagramm aktualisieren den Code, Änderungen im Code aktualisieren das Diagramm.

## Funktionen

- **Leinwand**: Formen per Klick oder Drag & Drop einfügen, verschieben, Größe ändern, zoomen (Mausrad), Ansicht verschieben (Ziehen auf freier Fläche), Gitter als Orientierung
- **14 Formen**: Rechteck, abgerundet, Stadion, Entscheidung (Raute), Kreis, Doppelkreis, Sechseck, Datenbank, Unterprozess, Ein-/Ausgabe, Trapeze, Fahne
- **Verbindungen**: vom Rand einer Form ziehen; ins Leere ziehen erzeugt direkt eine neue, verbundene Form. Linie (durchgezogen, gepunktet, dick), Spitzen (Pfeil, keine, Kreis, Kreuz, beidseitig), Beschriftung
- **Subgraphs (Gruppen)**: anlegen, Formen hinein- und herausziehen, verschachteln, eigene Richtung pro Gruppe
- **Farben**: Farbpalette (als `classDef` im Code), eigene Farben anlegen, **Standardfarbe pro Form** festlegen (🎨 in der Kopfleiste)
- **Bilder**: Bildknoten über die Werkzeugleiste oder per Drag & Drop aus dem Explorer (Mermaid-Syntax `@{ img: … }`); Pfade werden relativ zur Diagrammdatei gespeichert
- **Code-Panel** mit Syntaxhervorhebung, Fehleranzeige mit Zeilennummer, Auto-Update-Schalter, Hervorhebung der ausgewählten Elemente, **Vorschau** mit echtem Mermaid-Rendering
- **Arbeitsordner**: frei wählbarer Ordner mit Dateibaum, neue Diagramme/Ordner direkt anlegen. Dateien von überall lassen sich zusätzlich über „Öffnen“, Drag & Drop oder Doppelklick im Explorer (`.mmd`-Dateizuordnung) öffnen
- **Mehrere Diagramme parallel** – jedes in einem eigenen Fenster
- **Export** als PNG oder SVG mit **transparentem Hintergrund**, Code kopieren
- Rückgängig/Wiederholen, automatisches Anordnen, Warnung bei ungespeicherten Änderungen

## Dateiformat

Gespeichert wird reiner Mermaid-Code als `.mmd`. Damit die Anordnung auf der Leinwand erhalten bleibt, steht am Dateiende eine einzelne Kommentarzeile:

```
%% @layout {"A":[40,40],"B":[45,170]}
```

Mermaid ignoriert diese Zeile. Beim Kopieren/Exportieren des Codes wird sie weggelassen. Dateien ohne diese Zeile werden automatisch angeordnet.

## Tastenkürzel

| Kürzel | Aktion |
| --- | --- |
| Doppelklick auf Leinwand | neue Form |
| Doppelklick auf Form/Pfeil, `Enter`, `F2` | Text bearbeiten (`Shift+Enter` = neue Zeile) |
| `Tab` / `Shift+Tab` | verbundene Folge-Form / Geschwister-Form |
| `Entf` | Auswahl löschen |
| `Strg+D` | duplizieren |
| `Strg+Z` / `Strg+Y` | rückgängig / wiederholen |
| `Strg+L` | automatisch anordnen |
| `Shift+1` | alles einpassen |
| `Shift` + Ziehen | Mehrfachauswahl |
| `Strg+S` / `Strg+Shift+S` | speichern / speichern unter |
| `Strg+O` / `Strg+N` | öffnen / neues Fenster |
| `Strg+B` / `Strg+J` | Seitenleiste / Code-Panel |
| `Strg+E` | PNG-Export |

## Entwicklung

Voraussetzung: [Node.js](https://nodejs.org) 20 oder neuer.

```bash
npm install
npm run dev        # Desktop-App mit Hot Reload starten
npm run dev:web    # nur die Oberfläche im Browser (ohne Ordnerzugriff)
npm test           # Parser-/Generator-Tests
```

## Installationsdatei bauen

```bash
npm run dist:win     # Windows: Installer + portable .exe in release/
npm run dist:mac     # macOS: .dmg
npm run dist:linux   # Linux: AppImage
```

Alternativ baut der GitHub-Workflow **„Desktop-App bauen“** (Actions → Run workflow, oder ein Tag `v*`) die Installer für alle drei Systeme und stellt sie als Artefakte bereit.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `electron/main.cjs` | Fenster (eins pro Diagramm), Dateizugriff, Arbeitsordner, Menü |
| `electron/preload.cjs` | sichere Brücke zwischen Oberfläche und Hauptprozess |
| `src/model.ts` | Datenmodell, Formen, Farbpalette |
| `src/mermaid/parse.ts` | Mermaid-Code → Modell |
| `src/mermaid/generate.ts` | Modell → sauberer Mermaid-Code |
| `src/layout.ts` | automatisches Anordnen (dagre) |
| `src/store.ts` | Zustand, Rückgängig/Wiederholen, Synchronisierung Code ↔ Leinwand |
| `src/components/` | Leinwand, Werkzeugleiste, Eigenschaften, Code-Panel, Seitenleiste |
