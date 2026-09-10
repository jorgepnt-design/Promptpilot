import type { Category, Prompt, Settings } from '../types'
import { newId } from './id'

export const DEFAULT_CATEGORY_NAMES = [
  'Bilder',
  'Videos',
  'Bildbearbeitung',
  'Texte und E-Mails',
  'Social Media',
  'Programmierung',
  'Arbeit und Business',
  'Sonstiges',
]

/** Feste ID für „Sonstiges“, damit Prompts beim Löschen einer Kategorie sicher umziehen können. */
export const FALLBACK_CATEGORY_ID = 'cat-sonstiges'

export function buildDefaultCategories(): Category[] {
  const now = Date.now()
  return DEFAULT_CATEGORY_NAMES.map((name, i) => ({
    id: name === 'Sonstiges' ? FALLBACK_CATEGORY_ID : `cat-${slug(name)}`,
    name,
    order: i,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }))
}

export const DEFAULT_TOOLS = [
  'ChatGPT',
  'Claude',
  'Higgsfield',
  'Midjourney',
  'Sora',
  'Runway',
  'Sonstige',
]

export const DEFAULT_LANGUAGES = ['Deutsch', 'Englisch', 'Portugiesisch', 'Spanisch', 'Französisch']

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  viewMode: 'cards',
  sort: 'updated',
  tools: DEFAULT_TOOLS,
  languages: DEFAULT_LANGUAGES,
  onboarded: false,
  examplesLoaded: false,
  accountId: '',
  syncEnabled: false,
  lastSyncAt: null,
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function emptyPrompt(partial: Partial<Prompt> = {}): Prompt {
  const now = Date.now()
  return {
    id: newId(),
    title: '',
    body: '',
    negative: '',
    description: '',
    notes: '',
    categoryId: null,
    collectionIds: [],
    tags: [],
    tool: '',
    language: 'Deutsch',
    link: '',
    imageIds: [],
    favorite: false,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    lastUsedAt: null,
    copyCount: 0,
    trashedAt: null,
    isExample: false,
    versions: [],
    deletedAt: null,
    ...partial,
  }
}

/** Beispiel-Prompts – werden nur auf ausdrücklichen Wunsch geladen und bleiben gekennzeichnet. */
export function buildExamplePrompts(): Prompt[] {
  const base: Partial<Prompt>[] = [
    {
      title: 'Porträt im Studiolicht',
      body: 'Erstelle ein {{Stil}}-Porträt von {{Person}} in {{Ort}} mit {{Lichtstimmung}}.\n\nKamera: 85 mm, Blende f/1.8, Fokus auf die Augen.\nStimmung: ruhig, konzentriert, leicht filmisch.',
      negative: 'verzerrte Hände, doppelte Gesichter, Text im Bild, Wasserzeichen',
      description: 'Vorlage mit Platzhaltern für schnelle Porträtvarianten.',
      categoryId: 'cat-bilder',
      tags: ['Porträt', 'Vorlage', 'Licht'],
      tool: 'Midjourney',
      favorite: true,
    },
    {
      title: 'Produktvideo in 8 Sekunden',
      body: 'Kurzes Produktvideo für {{Produkt}}.\n\nSzene 1 (2 s): Nahaufnahme, langsame Kamerafahrt von links.\nSzene 2 (3 s): Produkt in Anwendung, weiches Tageslicht.\nSzene 3 (3 s): Schriftzug erscheint, Kamera zieht zurück.\n\nStil: {{Stil}}, ruhige Schnitte, keine Musikhinweise.',
      description: 'Gerüst für kurze Werbeclips.',
      categoryId: 'cat-videos',
      tags: ['Werbung', 'Storyboard'],
      tool: 'Runway',
    },
    {
      title: 'Objekt im Bild austauschen',
      body: 'Ersetze im hochgeladenen Bild {{altes Objekt}} durch {{neues Objekt}}.\n\nErhalte Perspektive, Schattenwurf und Lichtrichtung exakt. Verändere den Rest des Bildes nicht.',
      negative: 'veränderter Hintergrund, neue Objekte, verschobene Kanten',
      categoryId: 'cat-bildbearbeitung',
      tags: ['Retusche', 'Vorlage'],
      tool: 'Higgsfield',
    },
    {
      title: 'Sachliche Antwort auf eine Kundenanfrage',
      body: 'Formuliere eine freundliche, sachliche Antwort auf die folgende Kundenanfrage.\n\nAnfrage:\n{{Anfrage}}\n\nVorgaben: höchstens 150 Wörter, klare Handlungsempfehlung am Schluss, keine Floskeln.',
      description: 'Für schnelle, gleichbleibend gute E-Mail-Antworten.',
      categoryId: 'cat-texte-und-e-mails',
      tags: ['E-Mail', 'Kundenkontakt'],
      tool: 'ChatGPT',
    },
    {
      title: 'Code-Review mit Begründung',
      body: 'Prüfe den folgenden Code auf Fehler, Sicherheitsrisiken und Lesbarkeit.\n\nGib pro Fund an: Zeile, Problem, konkreter Verbesserungsvorschlag, Begründung in einem Satz.\nSortiere nach Schweregrad.\n\nCode:\n{{Code}}',
      categoryId: 'cat-programmierung',
      tags: ['Review', 'Qualität'],
      tool: 'Claude',
      language: 'Deutsch',
    },
  ]
  const now = Date.now()
  return base.map((p, i) =>
    emptyPrompt({
      ...p,
      id: newId(),
      isExample: true,
      createdAt: now - i * 60000,
      updatedAt: now - i * 60000,
    }),
  )
}
