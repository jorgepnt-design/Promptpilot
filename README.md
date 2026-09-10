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

Der Abgleich läuft über einen eigenen kleinen Dienst im Ordner `server/` (Node + PostgreSQL,
ausgelegt für Render). Die Anmeldung erfolgt über „Über Google anmelden".

1. **Dienst bereitstellen.** Die `render.yaml` im Wurzelverzeichnis legt bei Render Web Service
   und Datenbank in einem Schritt an (Blueprint). Der Dienst braucht vier Umgebungsvariablen:
   `DATABASE_URL`, `JWT_SECRET` (mindestens 32 Zeichen), `GOOGLE_CLIENT_ID` und
   `ALLOWED_ORIGINS` (die Adresse des Frontends).

2. **Google-Kennung anlegen.** In der Google Cloud Console unter *Google Auth Platform*
   einen OAuth-Client vom Typ *Webanwendung* erstellen. Als autorisierte JavaScript-Quelle die
   Adresse des Frontends eintragen; Weiterleitungs-URIs werden nicht gebraucht. Solange die App
   im Testmodus steht, müssen sich anmeldende Konten unter *Zielgruppe → Testnutzer* stehen.

3. **Frontend verbinden.** `.env.example` nach `.env` kopieren und `VITE_API_URL` sowie
   `VITE_GOOGLE_CLIENT_ID` eintragen. Für die Veröffentlichung dieselben zwei Werte bei Vercel
   als Umgebungsvariablen hinterlegen.

> Es wird ausschließlich die Client-ID verwendet, die ohnehin öffentlich ist. Ein Client-Secret
> wird nicht benötigt: Der Browser holt das Token direkt bei Google, der Dienst prüft dessen
> Signatur gegen Googles öffentliche Schlüssel und stellt danach eine eigene Sitzung aus.

Wurden dieselben Daten auf zwei Geräten gleichzeitig geändert, gewinnt keine Seite stillschweigend:
die abweichende Fassung bleibt als zusätzlicher Prompt mit dem Zusatz „(Konflikt, lokale Fassung)"
erhalten.

Die Prüfungen des Dienstes laufen über `npm test` im Ordner `server/` und brauchen eine
erreichbare PostgreSQL (`DATABASE_URL`).

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
server/         Sync-Dienst (Node, PostgreSQL, Google-Anmeldung)
tests/          Prüfungen der Kernlogik und der Oberfläche
```
