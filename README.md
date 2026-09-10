# PromptPilot

Eine persönliche Bibliothek für KI-Prompts: speichern, ordnen, wiederfinden und mit einem Klick
verwenden. Läuft als installierbare Web-App (PWA) im Browser und auf dem iPhone-Home-Bildschirm,
funktioniert offline und speichert die Daten standardmäßig nur auf dem eigenen Gerät.

## Was drin ist

- **Bibliothek** mit Volltextsuche (alle Begriffe müssen vorkommen), Filtern nach Kategorie, Tags,
  Werkzeug und Sprache, fünf Sortierungen sowie Karten- oder Listenansicht
- **Editor** mit Prompt-Text, Negativ-Prompt, Beschreibung, Notizen, Tags, Bildern und
  automatischer Entwurfssicherung
- **Vorlagen**: Platzhalter in der Form `{{Name}}` werden vor dem Kopieren abgefragt; derselbe
  Name wird nur einmal erfragt
- **Versionsverlauf**, Favoriten, Sammlungen, Archiv und Papierkorb
- **Zusammenstellen-Modus**: mehrere Prompts in gewählter Reihenfolge zu einem Text verbinden
- **Sicherung** als JSON, als ZIP mit Bildern, als Markdown oder als Textdatei; Einlesen wahlweise
  ergänzend oder ersetzend
- **Optionaler Abgleich** zwischen Geräten über ein eigenes Supabase-Projekt

## Lokal starten

Voraussetzung ist Node.js 18 oder neuer.

```bash
npm install
npm run dev
```

Vite nennt die Adresse im Terminal, üblicherweise `http://localhost:5173/Promptpilot/`.

Weitere Befehle:

| Befehl                  | Zweck                                                          |
| ----------------------- | -------------------------------------------------------------- |
| `npm run build`         | Produktionsbuild nach `dist/`                                   |
| `npm run build:preview` | Einzeldatei nach `dist-preview/index.html`, ohne Server nutzbar |
| `npm run preview`       | Den gebauten Stand lokal ausliefern                             |
| `npm run typecheck`     | Nur die TypeScript-Prüfung                                      |
| `npm test`              | 22 Prüfungen: Kernlogik und Oberfläche in jsdom                 |

## Auf GitHub Pages veröffentlichen

Der Basispfad ist auf `/Promptpilot/` eingestellt, passend zu einem Repository namens
`Promptpilot`. Heißt das Repository anders, muss `BASE_PATH` im Workflow entsprechend geändert
werden (mit führendem und abschließendem Schrägstrich).

1. Projekt ins Repository hochladen:

   ```bash
   cd promptpilot
   git init
   git add .
   git commit -m "PromptPilot"
   git branch -M main
   git remote add origin https://github.com/DEIN-KONTO/Promptpilot.git
   git push -u origin main
   ```

2. Im Repository unter **Settings → Pages** als Quelle **GitHub Actions** wählen.

3. Der Workflow `.github/workflows/deploy.yml` baut und veröffentlicht bei jedem Push auf `main`.
   Die App liegt danach unter `https://DEIN-KONTO.github.io/Promptpilot/`.

## Auf dem iPhone installieren

1. Die veröffentlichte Adresse in **Safari** öffnen (nicht in Chrome – nur Safari darf zum
   Home-Bildschirm hinzufügen).
2. Teilen-Symbol → **Zum Home-Bildschirm**.
3. Die App startet danach ohne Browserleiste und funktioniert auch ohne Verbindung.

Erscheint später eine neue Fassung, meldet die App das mit einem Hinweisbalken; ein Tippen auf
„Aktualisieren“ übernimmt sie. Ohne diesen Tipp läuft die bisherige Fassung ungestört weiter.

## Abgleich zwischen Geräten (optional)

Ohne diese Einrichtung arbeitet PromptPilot vollständig lokal – alle übrigen Funktionen bleiben
unverändert nutzbar.

1. Ein kostenloses Projekt auf [supabase.com](https://supabase.com) anlegen.
2. Im SQL-Editor den Inhalt von `supabase/schema.sql` ausführen. Das legt die Tabellen, die
   Zugriffsregeln (Row Level Security) und den privaten Bilder-Bucket an.
3. `.env.example` nach `.env` kopieren und die beiden Werte aus **Project Settings → API**
   eintragen: `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`.
4. Für die Veröffentlichung dieselben zwei Werte als **Repository Secrets** hinterlegen.
5. In der App unter **Einstellungen → Abgleich zwischen Geräten** ein Konto anlegen und abgleichen.

> Der `service_role`-Key gehört niemals in das Frontend oder in ein Repository. Nur die beiden oben
> genannten, ausdrücklich öffentlichen Werte werden verwendet; der eigentliche Schutz liegt in den
> Row-Level-Security-Regeln der Datenbank.

Wurden dieselben Daten auf zwei Geräten gleichzeitig geändert, gewinnt keine Seite stillschweigend:
die abweichende Fassung bleibt als zusätzlicher Prompt mit dem Zusatz „(Konflikt, lokale Fassung)“
erhalten.

## Wo die Daten liegen

Alle Prompts, Bilder und Einstellungen liegen in der IndexedDB des Browsers. Das bedeutet:

- Sie sind an Browser und Gerät gebunden und werden nicht an Dritte übertragen.
- Löscht man die Websitedaten, sind sie weg – deshalb gelegentlich über **Einstellungen →
  Sicherung** eine Kopie herunterladen.
- Im privaten Modus mancher Browser steht kein dauerhafter Speicher zur Verfügung; die App weist
  in diesem Fall oben deutlich darauf hin.

## Aufbau

```
src/
  components/   Editor, Karten, Detailansicht, Vorlagen, Zusammenstellen, Sync-Bereich
  lib/          Datenbank, Suche, Import/Export, Vorlagen, Bilder, Routing, PWA, Supabase
  pages/        Sammlungen, Einstellungen
  state/        Zentraler Zustand (Prompts, Kategorien, Sammlungen, Einstellungen)
public/         Icons, Manifest, Service Worker
supabase/       Datenbankschema mit Zugriffsregeln
tests/          Prüfungen der Kernlogik und der Oberfläche
```
