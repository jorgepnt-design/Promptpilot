/**
 * PromptPilot – Sync-Dienst
 *
 * Anmeldung über „Sign in with Google" (Google Identity Services). Der Browser
 * holt sich bei Google ein ID-Token; dieser Dienst prüft dessen Signatur gegen
 * Googles öffentliche Schlüssel und stellt danach ein eigenes, langlebigeres
 * Sitzungstoken aus. Ein Client-Secret wird dafür nicht gebraucht.
 *
 * Abgleichregeln (identisch zur lokalen Logik der App):
 *  - Neuere Änderung gewinnt (updated_at, Millisekunden seit 1970).
 *  - Wurden beide Seiten seit dem letzten Abgleich geändert, bleibt die lokale
 *    Fassung als zusätzlicher Prompt erhalten – es geht nichts still verloren.
 *  - Löschungen reisen als Tombstone (deleted_at) mit.
 *  - Jeder Datensatz hängt am Konto; ein Zugriff über Kontogrenzen hinweg ist
 *    schon durch den zusammengesetzten Primärschlüssel ausgeschlossen.
 */

import express from 'express'
import cors from 'cors'
import pg from 'pg'
import jwt from 'jsonwebtoken'
import { OAuth2Client } from 'google-auth-library'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const PORT = process.env.PORT || 10000
const DATABASE_URL = process.env.DATABASE_URL
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ''
const jwtSecret = () => process.env.JWT_SECRET || ''
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const TOKEN_DAYS = 30
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

/* ----------------------------- Datenbank ----------------------------- */

export function createPool(url = DATABASE_URL) {
  if (!url) throw new Error('DATABASE_URL fehlt.')
  // Render verlangt TLS, erlaubt aber kein öffentliches Zertifikat zu prüfen.
  const local = /localhost|127\.0\.0\.1|\/tmp/.test(url)
  return new pg.Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 10,
  })
}

export async function migrate(pool) {
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8')
  await pool.query(sql)
}

/* ------------------------------ Anmeldung ------------------------------ */

/** Prüft ein Google-ID-Token. In Tests durch eine eigene Funktion ersetzbar. */
export function googleVerifier(clientId = GOOGLE_CLIENT_ID) {
  const client = new OAuth2Client(clientId)
  return async (credential) => {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
    const p = ticket.getPayload()
    if (!p?.sub) throw new Error('Ungültiges Token.')
    if (!p.email_verified) throw new Error('Die E-Mail-Adresse ist bei Google nicht bestätigt.')
    return { sub: p.sub, email: p.email || '', name: p.name || '' }
  }
}

function issueToken(userId) {
  return jwt.sign({ uid: userId }, jwtSecret(), { expiresIn: `${TOKEN_DAYS}d` })
}

function auth(req, res, next) {
  const header = req.get('authorization') || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' })
  try {
    const payload = jwt.verify(token, jwtSecret())
    req.userId = payload.uid
    next()
  } catch {
    res.status(401).json({ error: 'Die Sitzung ist abgelaufen. Bitte neu anmelden.' })
  }
}

/* ------------------------------ Abgleich ------------------------------ */

const KINDS = { prompts: 'pp_prompts', categories: 'pp_categories', collections: 'pp_collections' }

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

/**
 * Führt eine Sorte Datensätze zusammen und liefert zurück, was der Client
 * übernehmen soll. Läuft vollständig in einer Transaktion.
 */
async function mergeKind(client, userId, table, incoming, lastSyncAt) {
  const { rows } = await client.query(
    `select id, data, updated_at, deleted_at from ${table} where user_id = $1`,
    [userId],
  )
  const remote = new Map(rows.map((r) => [r.id, r]))
  const toClient = []
  const conflicts = []
  let pushed = 0

  for (const rec of incoming) {
    if (!rec || typeof rec.id !== 'string' || !rec.id) continue
    const localTs = num(rec.updatedAt)
    const localDel = rec.deletedAt ? num(rec.deletedAt) : null
    const rem = remote.get(rec.id)

    if (!rem || localTs > Number(rem.updated_at)) {
      await client.query(
        `insert into ${table} (user_id, id, data, updated_at, deleted_at)
         values ($1, $2, $3, $4, $5)
         on conflict (user_id, id) do update
           set data = excluded.data,
               updated_at = excluded.updated_at,
               deleted_at = excluded.deleted_at`,
        [userId, rec.id, rec, localTs, localDel],
      )
      pushed++
      remote.delete(rec.id)
      continue
    }

    if (Number(rem.updated_at) > localTs) {
      const changedSinceSync = lastSyncAt != null && localTs > lastSyncAt
      if (changedSinceSync && !localDel && !rem.deleted_at) {
        // Beide Seiten geändert: die lokale Fassung als Kopie bewahren.
        conflicts.push(rec)
      }
      toClient.push({ ...rem.data, updatedAt: Number(rem.updated_at), deletedAt: rem.deleted_at ? Number(rem.deleted_at) : null })
    }
    remote.delete(rec.id)
  }

  // Alles, was der Client noch gar nicht kennt.
  for (const rem of remote.values()) {
    toClient.push({ ...rem.data, updatedAt: Number(rem.updated_at), deletedAt: rem.deleted_at ? Number(rem.deleted_at) : null })
  }

  return { toClient, conflicts, pushed }
}

/* ------------------------------- Server ------------------------------- */

export function createApp({ pool, verifyGoogle }) {
  const app = express()
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '25mb' }))
  app.use(
    cors({
      origin(origin, cb) {
        // Anfragen ohne Origin (curl, Health-Checks) sind unkritisch, da jede
        // geschützte Route ohnehin ein gültiges Sitzungstoken verlangt.
        if (!origin) return cb(null, true)
        if (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin)) return cb(null, true)
        cb(new Error('Diese Herkunft ist nicht freigegeben.'))
      },
      methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('select 1')
      res.json({ ok: true, time: Date.now() })
    } catch {
      res.status(503).json({ ok: false })
    }
  })

  /** Anmeldung: Google-ID-Token rein, eigenes Sitzungstoken raus. */
  app.post('/api/auth/google', async (req, res) => {
    const credential = req.body?.credential
    if (typeof credential !== 'string' || !credential) {
      return res.status(400).json({ error: 'Es wurde kein Google-Token übergeben.' })
    }
    let profile
    try {
      profile = await verifyGoogle(credential)
    } catch (e) {
      return res.status(401).json({ error: 'Die Google-Anmeldung konnte nicht bestätigt werden.' })
    }
    try {
      const { rows } = await pool.query(
        `insert into pp_users (google_sub, email, name)
         values ($1, $2, $3)
         on conflict (google_sub) do update
           set email = excluded.email, name = excluded.name, last_seen = now()
         returning id, email, name`,
        [profile.sub, profile.email, profile.name],
      )
      const user = rows[0]
      res.json({
        token: issueToken(user.id),
        expiresInDays: TOKEN_DAYS,
        user: { email: user.email, name: user.name },
      })
    } catch {
      res.status(500).json({ error: 'Die Anmeldung ist fehlgeschlagen.' })
    }
  })

  app.get('/api/me', auth, async (req, res) => {
    const { rows } = await pool.query('select email, name from pp_users where id = $1', [req.userId])
    if (!rows.length) return res.status(401).json({ error: 'Konto nicht gefunden.' })
    res.json({ user: rows[0] })
  })

  /** Voller Zwei-Wege-Abgleich. */
  app.post('/api/sync', auth, async (req, res) => {
    const body = req.body || {}
    const lastSyncAt = typeof body.lastSyncAt === 'number' ? body.lastSyncAt : null
    const client = await pool.connect()
    try {
      await client.query('begin')
      const result = {}
      let pushed = 0
      let pulled = 0
      let conflicts = 0

      for (const [kind, table] of Object.entries(KINDS)) {
        const incoming = Array.isArray(body[kind]) ? body[kind] : []
        const merged = await mergeKind(client, req.userId, table, incoming, lastSyncAt)
        result[kind] = merged.toClient
        if (kind === 'prompts') {
          result.conflicts = merged.conflicts
          conflicts = merged.conflicts.length
        }
        pushed += merged.pushed
        pulled += merged.toClient.length
      }

      await client.query('commit')
      res.json({ ...result, pushed, pulled, conflicts, at: Date.now() })
    } catch (e) {
      await client.query('rollback').catch(() => {})
      res.status(500).json({ error: 'Der Abgleich ist fehlgeschlagen.' })
    } finally {
      client.release()
    }
  })

  /** Welche Bilder liegen bereits auf dem Server? */
  app.get('/api/images', auth, async (req, res) => {
    const { rows } = await pool.query('select id from pp_images where user_id = $1', [req.userId])
    res.json({ ids: rows.map((r) => r.id) })
  })

  app.post('/api/images/:id', auth, async (req, res) => {
    const { id } = req.params
    const b = req.body || {}
    if (typeof b.base64 !== 'string' || !b.base64) {
      return res.status(400).json({ error: 'Es wurden keine Bilddaten übergeben.' })
    }
    const bytes = Buffer.from(b.base64, 'base64')
    if (bytes.length > MAX_IMAGE_BYTES) {
      return res.status(413).json({ error: 'Das Bild ist zu groß.' })
    }
    await pool.query(
      `insert into pp_images (user_id, id, prompt_id, name, type, size, bytes, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (user_id, id) do update set bytes = excluded.bytes, size = excluded.size`,
      [
        req.userId,
        id,
        String(b.promptId || ''),
        String(b.name || ''),
        String(b.type || 'image/jpeg'),
        bytes.length,
        bytes,
        num(b.createdAt) || Date.now(),
      ],
    )
    res.json({ ok: true, size: bytes.length })
  })

  app.get('/api/images/:id', auth, async (req, res) => {
    const { rows } = await pool.query(
      'select prompt_id, name, type, bytes, created_at from pp_images where user_id = $1 and id = $2',
      [req.userId, req.params.id],
    )
    if (!rows.length) return res.status(404).json({ error: 'Bild nicht gefunden.' })
    const r = rows[0]
    res.json({
      id: req.params.id,
      promptId: r.prompt_id,
      name: r.name,
      type: r.type,
      createdAt: Number(r.created_at),
      base64: r.bytes.toString('base64'),
    })
  })

  app.use((_req, res) => res.status(404).json({ error: 'Unbekannter Endpunkt.' }))

  return app
}

/* --------------------------------- Start --------------------------------- */

const isMain = process.argv[1] && process.argv[1].endsWith('server.js')

if (isMain) {
  if (jwtSecret().length < 32) {
    console.error('JWT_SECRET fehlt oder ist zu kurz (mindestens 32 Zeichen).')
    process.exit(1)
  }
  if (!GOOGLE_CLIENT_ID) {
    console.error('GOOGLE_CLIENT_ID fehlt.')
    process.exit(1)
  }
  const pool = createPool()
  migrate(pool)
    .then(() => {
      const app = createApp({ pool, verifyGoogle: googleVerifier() })
      app.listen(PORT, () => console.log(`PromptPilot-Dienst läuft auf Port ${PORT}`))
    })
    .catch((e) => {
      console.error('Start fehlgeschlagen:', e.message)
      process.exit(1)
    })
}
