/* Prüfungen der Kernlogik ohne Oberfläche. Start über: npm test */
import assert from 'node:assert/strict'
import { buildIndex, filterPrompts, highlight, sortPrompts, tokenize } from '../src/lib/search'
import { extractPlaceholders, fillTemplate, missingPlaceholders } from '../src/lib/template'
import { emptyPrompt, buildDefaultCategories } from '../src/lib/defaults'
import {
  buildJsonBackup,
  buildMarkdown,
  buildZipBackup,
  parseImportFile,
  safeUrl,
} from '../src/lib/exportImport'
import type { Filters, Prompt } from '../src/types'

const results: string[] = []
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn()
    results.push(`  ok   ${name}`)
  } catch (err) {
    results.push(`  FEHL ${name}\n       ${(err as Error).message}`)
    process.exitCode = 1
  }
}

const cats = buildDefaultCategories()

const prompts: Prompt[] = [
  emptyPrompt({
    id: 'a',
    title: 'Porträt im Studiolicht',
    body: 'Erstelle ein {{Stil}}-Porträt von {{Person}} in {{Ort}} mit {{Stil}}-Licht.',
    tags: ['Porträt', 'Vorlage'],
    tool: 'Midjourney',
    categoryId: 'cat-bilder',
    favorite: true,
    updatedAt: 300,
    createdAt: 100,
    copyCount: 5,
  }),
  emptyPrompt({
    id: 'b',
    title: 'E-Mail an Kunden',
    body: 'Formuliere eine sachliche Antwort.\n\nEmojis bleiben erhalten: 🚀',
    negative: 'keine Floskeln',
    tags: ['E-Mail'],
    tool: 'ChatGPT',
    categoryId: 'cat-texte-und-e-mails',
    updatedAt: 200,
    createdAt: 200,
    copyCount: 1,
  }),
  emptyPrompt({
    id: 'c',
    title: 'Archiviertes',
    body: 'Alter Prompt',
    status: 'archived',
    updatedAt: 400,
    createdAt: 50,
  }),
]

const index = buildIndex(prompts, cats)
const base: Filters = {
  query: '',
  categoryId: null,
  tags: [],
  tool: null,
  language: null,
  favoritesOnly: false,
  collectionId: null,
}

await test('Suche findet über mehrere Begriffe hinweg', () => {
  const r = filterPrompts({
    prompts,
    filters: { ...base, query: 'porträt studiolicht' },
    sort: 'updated',
    index,
    status: 'active',
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 'a')
})

await test('Suche ignoriert Groß- und Kleinschreibung und findet im negativen Prompt', () => {
  const r = filterPrompts({
    prompts,
    filters: { ...base, query: 'FLOSKELN' },
    sort: 'updated',
    index,
    status: 'active',
  })
  assert.equal(r.length, 1)
  assert.equal(r[0].id, 'b')
})

await test('Suche findet über die Kategorie', () => {
  const r = filterPrompts({
    prompts,
    filters: { ...base, query: 'Bilder' },
    sort: 'updated',
    index,
    status: 'active',
  })
  assert.equal(r[0].id, 'a')
})

await test('Archiv erscheint nicht in normalen Ergebnissen', () => {
  const r = filterPrompts({ prompts, filters: base, sort: 'updated', index, status: 'active' })
  assert.deepEqual(
    r.map((p) => p.id),
    ['a', 'b'],
  )
})

await test('Filter lassen sich kombinieren', () => {
  const r = filterPrompts({
    prompts,
    filters: { ...base, tool: 'Midjourney', tags: ['Vorlage'], favoritesOnly: true },
    sort: 'updated',
    index,
    status: 'active',
  })
  assert.equal(r.length, 1)
  const leer = filterPrompts({
    prompts,
    filters: { ...base, tool: 'Midjourney', tags: ['E-Mail'] },
    sort: 'updated',
    index,
    status: 'active',
  })
  assert.equal(leer.length, 0)
})

await test('Sortierungen greifen', () => {
  assert.equal(sortPrompts(prompts, 'alpha')[0].title, 'Archiviertes')
  assert.equal(sortPrompts(prompts, 'copied')[0].id, 'a')
  assert.equal(sortPrompts(prompts, 'created')[0].id, 'b')
})

await test('Treffer werden markiert, ohne HTML zu erzeugen', () => {
  const segs = highlight('Porträt im Studiolicht', tokenize('porträt licht'))
  assert.equal(segs.filter((s) => s.hit).length, 2)
  assert.equal(segs.map((s) => s.text).join(''), 'Porträt im Studiolicht')
})

await test('Platzhalter werden erkannt und nur einmal abgefragt', () => {
  const names = extractPlaceholders(prompts[0].body)
  assert.deepEqual(names, ['Stil', 'Person', 'Ort'])
})

await test('Vorlage füllen lässt das Original unverändert', () => {
  const original = prompts[0].body
  const filled = fillTemplate(original, { Stil: 'Schwarzweiß', Person: 'Ana', Ort: 'Lissabon' })
  assert.ok(filled.includes('Schwarzweiß-Porträt von Ana in Lissabon mit Schwarzweiß-Licht'))
  assert.equal(prompts[0].body, original)
  assert.deepEqual(missingPlaceholders(original, { Stil: 'x' }), ['Person', 'Ort'])
  assert.ok(fillTemplate(original, {}).includes('{{Person}}'))
})

await test('Gefährliche Links werden verworfen', () => {
  assert.equal(safeUrl('javascript:alert(1)'), '')
  assert.equal(safeUrl('data:text/html,<script>'), '')
  assert.equal(safeUrl('https://example.com/x'), 'https://example.com/x')
})

await test('JSON-Export und -Import ergeben denselben Bestand', async () => {
  const backup = buildJsonBackup({ prompts, categories: cats, collections: [] })
  const file = new File([JSON.stringify(backup)], 'export.json', { type: 'application/json' })
  const parsed = await parseImportFile(file)
  assert.equal(parsed.prompts.length, prompts.length)
  assert.equal(parsed.prompts[0].body, prompts[0].body)
  assert.ok(parsed.prompts[1].body.includes('🚀'), 'Emojis bleiben erhalten')
  assert.equal(parsed.categories.length, cats.length)
})

await test('ZIP-Sicherung enthält Bilder und lässt sich zurücklesen', async () => {
  const blob = new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'image/jpeg' })
  const withImage = emptyPrompt({ id: 'img', title: 'Mit Bild', body: 'Text', imageIds: ['i1'] })
  const zip = await buildZipBackup({
    prompts: [withImage],
    categories: cats,
    collections: [],
    images: [
      {
        id: 'i1',
        promptId: 'img',
        name: 'foto.jpg',
        type: 'image/jpeg',
        size: 4,
        blob,
        createdAt: 1,
        remotePath: null,
      },
    ],
  })
  const file = new File([zip], 'sicherung.zip', { type: 'application/zip' })
  const parsed = await parseImportFile(file)
  assert.equal(parsed.prompts.length, 1)
  assert.equal(parsed.images.length, 1)
  assert.equal(parsed.containsImages, true)
  assert.equal(parsed.images[0].blob.size, 4)
})

await test('Ungültige Dateien werden abgewiesen', async () => {
  await assert.rejects(() =>
    parseImportFile(new File(['kein json'], 'x.json', { type: 'application/json' })),
  )
  await assert.rejects(() =>
    parseImportFile(new File([JSON.stringify({ foo: 1 })], 'x.json', { type: 'application/json' })),
  )
})

await test('Markdown-Export enthält Titel und Text', () => {
  const md = buildMarkdown(prompts, cats)
  assert.ok(md.includes('## Porträt im Studiolicht'))
  assert.ok(md.includes('Formuliere eine sachliche Antwort.'))
})

console.log('Kernlogik:')
console.log(results.join('\n'))
