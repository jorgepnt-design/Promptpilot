/* Oberflächen-Test: startet die echte App in einer DOM-Umgebung (jsdom)
   mit simulierter IndexedDB und bedient sie wie ein Nutzer. */
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import 'fake-indexeddb/auto'

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'https://example.com/Promptpilot/',
  pretendToBeVisual: true,
})

const w = dom.window as unknown as Window & typeof globalThis
Object.defineProperty(globalThis, 'navigator', { value: w.navigator, configurable: true })
Object.assign(globalThis, {
  window: w,
  document: w.document,
  HTMLElement: w.HTMLElement,
  HTMLInputElement: w.HTMLInputElement,
  HTMLTextAreaElement: w.HTMLTextAreaElement,
  Event: w.Event,
  MouseEvent: w.MouseEvent,
  KeyboardEvent: w.KeyboardEvent,
  Node: w.Node,
  getComputedStyle: w.getComputedStyle,
  requestAnimationFrame: (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0),
  cancelAnimationFrame: (id: number) => clearTimeout(id),
  IS_REACT_ACT_ENVIRONMENT: true,
})

w.matchMedia = ((q: string) => ({
  matches: false,
  media: q,
  addEventListener() {},
  removeEventListener() {},
  addListener() {},
  removeListener() {},
  onchange: null,
  dispatchEvent: () => false,
})) as unknown as typeof w.matchMedia
;(globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
  observe() {}
  disconnect() {}
  unobserve() {}
}
w.URL.createObjectURL = () => 'blob:test'
w.URL.revokeObjectURL = () => undefined
Object.defineProperty(w.navigator, 'onLine', { value: true, configurable: true })

let clipboard = ''
Object.defineProperty(w.navigator, 'clipboard', {
  value: { writeText: async (t: string) => void (clipboard = t) },
  configurable: true,
})
Object.defineProperty(w, 'isSecureContext', { value: true, configurable: true })
w.document.execCommand = () => true

/* Konstanten, die sonst der Vite-Build einsetzt. Ohne sie bricht die App beim
   Start ab, weil pwa.ts und die Einstellungsseite sie unmittelbar auslesen. */
Object.assign(globalThis, {
  __SINGLE_FILE__: false,
  __BASE_PATH__: '/Promptpilot/',
  __APP_VERSION__: '1.0.0',
})

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = await import('react')
const { AppProvider } = await import('../src/state/store')
const App = (await import('../src/App')).default

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

const tick = () => new Promise((r) => setTimeout(r, 30))

function setValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el.tagName === 'TEXTAREA' ? w.HTMLTextAreaElement.prototype : w.HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!
  setter.call(el, value)
  // React erkennt Änderungen über einen internen Wert-Tracker; er wird hier
  // gezielt veraltet gemacht, damit onChange wie bei echter Eingabe feuert.
  const tracker = (el as unknown as { _valueTracker?: { setValue: (v: string) => void } })._valueTracker
  tracker?.setValue(`${value}__alt`)
  el.dispatchEvent(new w.Event('input', { bubbles: true }))
}

function byText(text: string): HTMLElement | undefined {
  const treffer = Array.from(
    w.document.querySelectorAll<HTMLElement>('button, a, h3, div, span'),
  ).filter((el) => el.textContent?.trim() === text)
  // Ein Container hat denselben Text wie sein einziges Kind. Anklickbar ist aber
  // nur das innerste Element, deshalb den tiefsten Treffer wählen.
  return treffer.find((el) => !treffer.some((other) => other !== el && el.contains(other)))
}
function textOf(): string {
  return w.document.body.textContent ?? ''
}

let root: ReturnType<typeof createRoot>

async function mount() {
  const container = w.document.getElementById('root')!
  root = createRoot(container)
  await act(async () => {
    root.render(
      React.createElement(AppProvider, null, React.createElement(App)) as React.ReactElement,
    )
  })
  await act(async () => {
    await tick()
  })
}

async function unmount() {
  await act(async () => root.unmount())
}

async function click(el: Element | undefined, label = 'Element') {
  assert.ok(el, `${label} nicht gefunden`)
  await act(async () => {
    ;(el as HTMLElement).dispatchEvent(new w.MouseEvent('click', { bubbles: true }))
    await tick()
  })
}

/* ------------------------------- Ablauf ------------------------------- */

await mount()

await test('App startet und zeigt den Leerzustand', () => {
  assert.ok(textOf().includes('Bibliothek'))
  assert.ok(textOf().includes('Ihre Bibliothek ist noch leer'))
})

await test('Neuen Prompt erstellen und speichern', async () => {
  await click(byText('Ersten Prompt erstellen'), 'Button „Ersten Prompt erstellen“')
  const title = w.document.getElementById('pp-title') as HTMLInputElement
  const body = w.document.getElementById('pp-body') as HTMLTextAreaElement
  assert.ok(title && body, 'Editor geöffnet')
  await act(async () => {
    setValue(title, 'Porträt im Studiolicht')
    setValue(body, 'Erstelle ein {{Stil}}-Porträt von {{Person}}.\n\nZeilenumbrüche bleiben 🚀')
    await tick()
  })
  if (process.env.DEBUG) {
    const cancel = byText('Abbrechen')
    await click(cancel, 'Abbrechen')
    console.log('Sheet nach Abbrechen-Klick:', w.document.querySelectorAll('.sheet').length)
    await click(byText('Ersten Prompt erstellen'), 'erneut öffnen')
    console.log('Sheet erneut offen:', w.document.querySelectorAll('.sheet').length)
    const t2 = w.document.getElementById('pp-title') as HTMLInputElement
    await act(async () => { setValue(t2, 'ABC'); await tick() })
    console.log('React-Wert nach setValue:', (w.document.getElementById('pp-title') as HTMLInputElement)?.value,
      '| Zeichenanzeige:', (w.document.querySelector('.sheet .counter') as HTMLElement)?.textContent)
  }
  const saveBtn = byText('Speichern')
  if (process.env.DEBUG) {
    console.log('SHEET-TEXT:', (w.document.querySelector('.sheet') as HTMLElement)?.textContent?.slice(0, 300))
    console.log('Save-Element:', saveBtn?.tagName, saveBtn?.className)
    console.log('Titelwert:', title.value, '| Textlänge:', body.value.length)
    console.log('Sheets vorhanden:', w.document.querySelectorAll('.sheet').length)
  }
  await click(saveBtn, 'Speichern-Button')
  if (process.env.DEBUG) {
    const { getAll, STORES, isMemoryMode } = await import('../src/lib/db')
    console.log('DB-Einträge:', (await getAll(STORES.prompts)).length, 'Speichermodus:', isMemoryMode())
    console.log('Fehlertext im Dialog:', textOf().includes('Bitte einen Titel'))
  }
  assert.ok(textOf().includes('Porträt im Studiolicht'), 'Prompt erscheint in der Liste')
  assert.ok(textOf().includes('Vorlage'), 'Platzhalter werden als Vorlage erkannt')
})

await test('Suche filtert und meldet Treffer', async () => {
  const search = w.document.querySelector('input[type="search"]') as HTMLInputElement
  await act(async () => {
    setValue(search, 'studiolicht')
    await tick()
  })
  assert.ok(textOf().includes('1 Prompt'), 'Trefferanzahl wird angezeigt')
  await act(async () => {
    setValue(search, 'gibtesnicht')
    await tick()
  })
  assert.ok(textOf().includes('Keine Treffer'))
  await act(async () => {
    setValue(search, '')
    await tick()
  })
  assert.ok(textOf().includes('Porträt im Studiolicht'))
})

await test('Kopieren legt den Text in die Zwischenablage', async () => {
  const copyBtn = w.document.querySelector('[aria-label^="Prompt „Porträt"]')
  await click(copyBtn, 'Kopier-Button')
  assert.ok(clipboard.includes('{{Stil}}-Porträt'), 'Zwischenablage enthält den Prompt')
  assert.ok(clipboard.includes('🚀'), 'Emojis bleiben erhalten')
})

await test('Favorit setzen und in der Favoritenansicht wiederfinden', async () => {
  await click(w.document.querySelector('[aria-label="Als Favorit markieren"]'), 'Favoriten-Stern')
  await act(async () => {
    w.location.hash = '#/favoriten'
    await tick()
  })
  assert.ok(textOf().includes('Porträt im Studiolicht'), 'Prompt steht in den Favoriten')
  await act(async () => {
    w.location.hash = '#/bibliothek'
    await tick()
  })
})

await test('Daten überstehen einen Neustart der App', async () => {
  await unmount()
  await mount()
  assert.ok(textOf().includes('Porträt im Studiolicht'), 'Prompt nach Neuladen wieder da')
  assert.ok(!textOf().includes('Ihre Bibliothek ist noch leer'))
})

await test('Prompt öffnen, Vorlage ausfüllen und kopieren', async () => {
  await click(byText('Porträt im Studiolicht'), 'Prompt-Karte')
  assert.ok(textOf().includes('Vorlage verwenden'), 'Detailansicht bietet die Vorlage an')
  await click(byText('Vorlage verwenden'), 'Vorlage verwenden')
  const feldStil = w.document.getElementById('ph-Stil') as HTMLInputElement
  const feldPerson = w.document.getElementById('ph-Person') as HTMLInputElement
  assert.ok(feldStil && feldPerson, 'Für jeden Platzhalter gibt es ein Feld')
  await act(async () => {
    setValue(feldStil, 'Schwarzweiß')
    setValue(feldPerson, 'Ana')
    await tick()
  })
  await click(byText('Kopieren'), 'Kopieren im Vorlagen-Dialog')
  assert.ok(
    clipboard.includes('Schwarzweiß-Porträt von Ana'),
    `Ausgefüllter Text kopiert, war: ${clipboard.slice(0, 60)}`,
  )
})

await test('Papierkorb: löschen, wiederfinden, wiederherstellen', async () => {
  const { getAll, STORES } = await import('../src/lib/db')
  await act(async () => {
    w.location.hash = '#/bibliothek'
    await tick()
  })
  const menuBtn = w.document.querySelector('.card [aria-label="Weitere Aktionen"]')
  await click(menuBtn, 'Kartenmenü')
  await click(byText('In den Papierkorb'), 'Papierkorb-Eintrag')
  assert.ok(textOf().includes('Ihre Bibliothek ist noch leer'), 'Bibliothek ist wieder leer')
  await act(async () => {
    w.location.hash = '#/papierkorb'
    await tick()
  })
  assert.ok(textOf().includes('Porträt im Studiolicht'), 'Prompt liegt im Papierkorb')
  const stored = await getAll<{ status: string }>(STORES.prompts)
  assert.equal(stored.filter((p) => p.status === 'trashed').length, 1)
})

console.log('Oberfläche:')
console.log(results.join('\n'))
await unmount()
process.exit(process.exitCode ?? 0)
