/**
 * Lex Tigress Backend — API Proxy Server
 *
 * Hides secret API tokens from the browser bundle.
 * Adds server-side in-memory caching to reduce paid API consumption.
 *
 * Routes:
 *   /ecourts-api/*  → webapi.ecourtsindia.com  (adds Bearer token)
 *   /sci-wp/*       → www.sci.gov.in            (SC WordPress AJAX)
 *   /health         → status check
 */

import 'dotenv/config'
import express from 'express'

const app = express()
const PORT = process.env.BACKEND_PORT || 3001

const ECOURTS_BASE  = 'https://webapi.ecourtsindia.com'
const ECOURTS_TOKEN = process.env.ECOURTS_MCP_TOKEN
const SC_BASE       = 'https://www.sci.gov.in'

// ── IN-MEMORY TTL CACHE ───────────────────────────────────────────────────────
// Simple Map-based cache. Resets on server restart (that's fine for dev/MVP).

const memCache = new Map()

function getCached(key) {
  const entry = memCache.get(key)
  if (!entry) return null
  if (entry.expiresAt !== Infinity && Date.now() > entry.expiresAt) {
    memCache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key, data, ttlMs) {
  memCache.set(key, {
    data,
    expiresAt: ttlMs === 0 ? Infinity : Date.now() + ttlMs,
  })
}

function cacheStats() {
  return `${memCache.size} entries cached`
}

// ── ECOURTS PDF PROXY ─────────────────────────────────────────────────────────
// Separate route for binary PDF responses (order documents).
// Unlike /ecourts-api/*, this pipes the raw buffer with the correct content-type
// so an <iframe src="/ecourts-pdf/..."> can render the PDF directly in-browser.
// Order PDFs are immutable — cached forever in memory.

const pdfMemCache = new Map() // key → Buffer

app.get('/ecourts-pdf/*splat', async (req, res) => {
  if (!ECOURTS_TOKEN) {
    return res.status(500).json({ error: 'Server misconfigured: missing eCourts token' })
  }

  const stripPath = req.path.replace(/^\/ecourts-pdf/, '')
  const cacheKey  = `pdf_${stripPath}`

  const cachedBuf = pdfMemCache.get(cacheKey)
  if (cachedBuf) {
    console.log(`[pdf cache HIT] ${stripPath}`)
    res.set('Content-Type', 'application/pdf')
    res.set('Content-Disposition', 'inline')
    return res.send(cachedBuf)
  }

  const targetUrl = `${ECOURTS_BASE}${stripPath}`
  console.log(`[eCourts PDF →] ${targetUrl}`)

  try {
    const response = await fetch(targetUrl, {
      headers: { 'Authorization': `Bearer ${ECOURTS_TOKEN}` },
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: `eCourts returned ${response.status}` })
    }

    const contentType = response.headers.get('content-type') || 'application/pdf'
    const buf = Buffer.from(await response.arrayBuffer())

    pdfMemCache.set(cacheKey, buf) // immutable — cache forever
    res.set('Content-Type', contentType)
    res.set('Content-Disposition', 'inline')
    res.send(buf)
  } catch (err) {
    console.error('[eCourts PDF] proxy error:', err.message)
    res.status(502).json({ error: 'eCourts PDF proxy error', message: err.message })
  }
})

// ── ECOURTS PROXY ─────────────────────────────────────────────────────────────
// Vite forwards /ecourts-api/* here. We strip the prefix and forward to
// webapi.ecourtsindia.com with the server-side Bearer token.
//
// TTLs match the frontend localStorage TTLs:
//   order-document → forever (immutable)
//   everything else → 6 hours

app.all('/ecourts-api/*splat', async (req, res) => {
  if (!ECOURTS_TOKEN) {
    console.error('[eCourts] ECOURTS_MCP_TOKEN is not set in .env')
    return res.status(500).json({ error: 'Server misconfigured: missing eCourts token' })
  }

  const stripPath = req.path.replace(/^\/ecourts-api/, '')
  const queryStr  = new URLSearchParams(req.query).toString()
  const cacheKey  = `ec_${req.method}_${stripPath}_${queryStr}`

  // Serve from cache on GET
  if (req.method === 'GET') {
    const cached = getCached(cacheKey)
    if (cached) {
      console.log(`[cache HIT] ${stripPath} — ${cacheStats()}`)
      return res.json(cached)
    }
  }

  const targetUrl = `${ECOURTS_BASE}${stripPath}${queryStr ? '?' + queryStr : ''}`
  console.log(`[eCourts →] ${req.method} ${targetUrl}`)

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${ECOURTS_TOKEN}`,
        'Content-Type':  'application/json',
      },
    })

    const data = await response.json()

    if (req.method === 'GET' && response.ok) {
      // order-document paths are immutable — cache forever
      const isImmutable = stripPath.includes('order-document')
      const ttl = isImmutable ? 0 : 6 * 60 * 60 * 1000  // 0 = forever
      setCache(cacheKey, data, ttl)
    }

    res.status(response.status).json(data)
  } catch (err) {
    console.error('[eCourts] proxy error:', err.message)
    res.status(502).json({ error: 'eCourts proxy error', message: err.message })
  }
})

// ── SC WORDPRESS AJAX PROXY ───────────────────────────────────────────────────
// Vite forwards /sci-wp/* here. We strip the prefix and forward to sci.gov.in.
// Cached for 6 hours — SC AJAX data changes at most once per hearing day.

app.get('/sci-wp/*splat', async (req, res) => {
  const stripPath = req.path.replace(/^\/sci-wp/, '')
  const queryStr  = new URLSearchParams(req.query).toString()
  const cacheKey  = `sci_${stripPath}_${queryStr}`

  const cached = getCached(cacheKey)
  if (cached) {
    console.log(`[cache HIT] /sci-wp${stripPath} — ${cacheStats()}`)
    return res.json(cached)
  }

  const targetUrl = `${SC_BASE}${stripPath}${queryStr ? '?' + queryStr : ''}`
  console.log(`[SC-WP  →] ${targetUrl}`)

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'Accept':     'application/json, text/plain, */*',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    })

    // Read as text first — sci.gov.in sometimes returns "0", "-1", or plain HTML
    // for unregistered actions or missing diary numbers instead of valid JSON
    const text = await response.text()
    let data
    try {
      data = JSON.parse(text)
    } catch {
      // Not valid JSON — wrap in expected shape so frontend can handle gracefully
      console.warn(`[SC-WP] non-JSON response for ${stripPath}: ${text.slice(0, 80)}`)
      data = { status: false, data: text }
    }

    if (response.ok) setCache(cacheKey, data, 6 * 60 * 60 * 1000)  // 6 hours
    res.json(data)
  } catch (err) {
    console.error('[SC-WP] proxy error:', err.message)
    res.status(502).json({ error: 'SC proxy error', message: err.message })
  }
})

// ── HEALTH ────────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status:       'ok',
    uptime:       `${Math.floor(process.uptime())}s`,
    cache:        cacheStats(),
    ecourtsToken: ECOURTS_TOKEN ? '✓ set' : '✗ missing',
  })
})

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[backend] running on http://localhost:${PORT}`)
  if (!ECOURTS_TOKEN) {
    console.warn('[backend] WARNING: ECOURTS_MCP_TOKEN not set — eCourts calls will fail')
  }
})
