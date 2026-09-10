/* Integrationstest gegen eine echte PostgreSQL-Datenbank.
   Google wird durch einen Prüfer ersetzt, der Testtoken akzeptiert –
   alles andere (Datenbank, Sitzungstoken, Abgleich) ist der echte Code. */

import assert from 'node:assert/strict'
import { createPool, migrate, createApp } from '../src/server.js'

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-geheimnis-mindestens-32-zeichen-lang!!'
const DB = process.env.DATABASE_URL || 'postgresql://postgres@/promptpilot?host=/tmp&port=5433'

const results = []
async function test(name, fn) {
  try {
    await fn()
    results.push(`  ok   ${name}`)
  } catch (err) {
    results.push(`  FEHL ${name}\n       ${err.message}`)
    process.exitCode = 1
  }
}

/* Testprüfer: "google:<sub>:<mail>" gilt als gültiges Token. */
const verifyGoogle = async (credential) => {
  const [tag, sub, email] = credential.split(':')
  if (tag !== 'google' || !sub) throw new Error('ungültig')
  return { sub, email: email || `${sub}@example.com`, name: sub }
}

const pool = createPool(DB)
await pool.query(`drop table if exists pp_images, pp_prompts, pp_categories, pp_collections, pp_users cascade`)
await migrate(pool)

const app = createApp({ pool, verifyGoogle })
const server = app.listen(0)
const base = `http://127.0.0.1:${server.address().port}`

async function call(path, { method = 'GET', token, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try {
    json = await res.json()
  } catch {}
  return { status: res.status, body: json }
}

const prompt = (id, title, updatedAt, extra = {}) => ({
  id,
  title,
  body: `Text von ${title}`,
  updatedAt,
  deletedAt: null,
  status: 'active',
  tags: [],
  ...extra,
})

let tokenA = ''
let tokenB = ''

await test('Health meldet die Datenbank als erreichbar', async () => {
  const r = await call('/api/health')
  assert.equal(r.status, 200)
  assert.equal(r.body.ok, true)
})

await test('Anmeldung liefert ein Sitzungstoken', async () => {
  const r = await call('/api/auth/google', {
    method: 'POST',
    body: { credential: 'google:jorge:jorge@example.com' },
  })
  assert.equal(r.status, 200)
  assert.ok(r.body.token, 'Token fehlt')
  assert.equal(r.body.user.email, 'jorge@example.com')
  tokenA = r.body.token
})

await test('Erneute Anmeldung erzeugt kein zweites Konto', async () => {
  const r = await call('/api/auth/google', {
    method: 'POST',
    body: { credential: 'google:jorge:jorge@example.com' },
  })
  assert.equal(r.status, 200)
  const { rows } = await pool.query('select count(*)::int as n from pp_users')
  assert.equal(rows[0].n, 1, 'Es wurde ein zweites Konto angelegt')
})

await test('Gefälschtes Google-Token wird abgewiesen', async () => {
  const r = await call('/api/auth/google', { method: 'POST', body: { credential: 'quatsch' } })
  assert.equal(r.status, 401)
})

await test('Ohne Sitzungstoken kein Zugriff', async () => {
  const r = await call('/api/sync', { method: 'POST', body: {} })
  assert.equal(r.status, 401)
})

await test('Manipuliertes Sitzungstoken wird abgewiesen', async () => {
  const r = await call('/api/sync', { method: 'POST', token: tokenA.slice(0, -3) + 'xyz', body: {} })
  assert.equal(r.status, 401)
})

await test('Erster Abgleich lädt lokale Prompts hoch', async () => {
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: {
      lastSyncAt: null,
      prompts: [prompt('p1', 'Porträt', 1000), prompt('p2', 'Landschaft', 1000)],
      categories: [{ id: 'c1', name: 'Bilder', updatedAt: 1000, deletedAt: null }],
      collections: [],
    },
  })
  assert.equal(r.status, 200)
  assert.equal(r.body.pushed, 3, `erwartet 3 hochgeladen, war ${r.body.pushed}`)
  assert.equal(r.body.prompts.length, 0, 'nichts zurückzuholen beim Erstabgleich')
})

await test('Zweites Gerät holt alles herunter', async () => {
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: { lastSyncAt: null, prompts: [], categories: [], collections: [] },
  })
  assert.equal(r.body.prompts.length, 2, `erwartet 2 Prompts, war ${r.body.prompts.length}`)
  assert.equal(r.body.categories.length, 1)
  const titel = r.body.prompts.map((p) => p.title).sort()
  assert.deepEqual(titel, ['Landschaft', 'Porträt'])
  assert.ok(r.body.prompts[0].body.startsWith('Text von'), 'Inhalt ging verloren')
})

await test('Neuere Änderung gewinnt', async () => {
  await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: { lastSyncAt: 1000, prompts: [prompt('p1', 'Porträt überarbeitet', 2000)], categories: [], collections: [] },
  })
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: { lastSyncAt: 2000, prompts: [], categories: [], collections: [] },
  })
  const p1 = r.body.prompts.find((p) => p.id === 'p1')
  assert.equal(p1.title, 'Porträt überarbeitet')
})

await test('Gleichzeitige Änderung erhält beide Fassungen', async () => {
  // Server steht auf 2000. Gerät kennt Stand 1500 und hat seither geändert.
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: {
      lastSyncAt: 1500,
      prompts: [prompt('p1', 'Fassung vom Handy', 1800)],
      categories: [],
      collections: [],
    },
  })
  assert.equal(r.body.conflicts, 1, 'Konflikt wurde nicht gemeldet')
  // Die Liste der Konflikte muss eine Liste bleiben. Sie hieß einmal genauso
  // wie die Anzahl und wurde davon überschrieben – der Client lief auf die Nase.
  assert.ok(Array.isArray(r.body.conflictRecords), 'conflictRecords ist keine Liste')
  assert.equal(r.body.conflictRecords.length, 1)
  assert.equal(r.body.conflictRecords[0].title, 'Fassung vom Handy', 'lokale Fassung fehlt')
  assert.equal(r.body.prompts.find((p) => p.id === 'p1').title, 'Porträt überarbeitet')
})

await test('Löschung reist als Tombstone mit', async () => {
  await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: {
      lastSyncAt: 3000,
      prompts: [prompt('p2', 'Landschaft', 4000, { deletedAt: 4000 })],
      categories: [],
      collections: [],
    },
  })
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: { lastSyncAt: null, prompts: [], categories: [], collections: [] },
  })
  const p2 = r.body.prompts.find((p) => p.id === 'p2')
  assert.ok(p2, 'p2 fehlt ganz')
  assert.equal(p2.deletedAt, 4000, 'Tombstone ging verloren')
})

await test('Antwort enthält überall Listen, nie Zahlen', async () => {
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: { lastSyncAt: null, prompts: [], categories: [], collections: [] },
  })
  for (const feld of ['prompts', 'categories', 'collections', 'conflictRecords']) {
    assert.ok(Array.isArray(r.body[feld]), `${feld} ist keine Liste, sondern ${typeof r.body[feld]}`)
  }
  for (const feld of ['pushed', 'pulled', 'conflicts', 'at']) {
    assert.equal(typeof r.body[feld], 'number', `${feld} ist keine Zahl`)
  }
})

await test('Bild hochladen und zurückholen', async () => {
  const daten = Buffer.from('So tun als wäre ich ein JPEG').toString('base64')
  const up = await call('/api/images/img1', {
    method: 'POST',
    token: tokenA,
    body: { base64: daten, promptId: 'p1', name: 'foto.jpg', type: 'image/jpeg', createdAt: 5000 },
  })
  assert.equal(up.status, 200)
  const down = await call('/api/images/img1', { token: tokenA })
  assert.equal(down.status, 200)
  assert.equal(down.body.base64, daten, 'Bilddaten verändert')
  assert.equal(down.body.name, 'foto.jpg')
})

/* ------------------- Trennung zwischen zwei Konten ------------------- */

await test('Zweites Konto anmelden', async () => {
  const r = await call('/api/auth/google', {
    method: 'POST',
    body: { credential: 'google:fremde:fremde@example.com' },
  })
  assert.equal(r.status, 200)
  tokenB = r.body.token
})

await test('Fremdes Konto sieht keine fremden Prompts', async () => {
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenB,
    body: { lastSyncAt: null, prompts: [], categories: [], collections: [] },
  })
  assert.equal(r.body.prompts.length, 0, `Datenleck: ${r.body.prompts.length} fremde Prompts sichtbar`)
  assert.equal(r.body.categories.length, 0, 'Datenleck bei Kategorien')
})

await test('Fremdes Konto kann fremdes Bild nicht abrufen', async () => {
  const r = await call('/api/images/img1', { token: tokenB })
  assert.equal(r.status, 404, `Datenleck: Bild war mit Status ${r.status} abrufbar`)
})

await test('Gleiche Prompt-ID in zwei Konten kollidiert nicht', async () => {
  await call('/api/sync', {
    method: 'POST',
    token: tokenB,
    body: { lastSyncAt: null, prompts: [prompt('p1', 'Fremder Prompt', 9000)], categories: [], collections: [] },
  })
  const a = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: { lastSyncAt: null, prompts: [], categories: [], collections: [] },
  })
  const p1 = a.body.prompts.find((p) => p.id === 'p1')
  assert.equal(p1.title, 'Porträt überarbeitet', 'Fremdes Konto hat eigene Daten überschrieben')
})

await test('Fehlerhafte Eingaben stürzen den Dienst nicht ab', async () => {
  const r = await call('/api/sync', {
    method: 'POST',
    token: tokenA,
    body: { lastSyncAt: 'quatsch', prompts: [null, 'text', { ohneId: true }], categories: 'nein' },
  })
  assert.equal(r.status, 200, `Status war ${r.status}`)
  const h = await call('/api/health')
  assert.equal(h.body.ok, true, 'Dienst nicht mehr erreichbar')
})

console.log('PromptPilot-Dienst:')
results.forEach((r) => console.log(r))

server.close()
await pool.end()
