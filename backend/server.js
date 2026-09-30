const express = require('express')
const cors = require('cors')
const { randomInt, randomUUID } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const app = express()
const PORT = Number(process.env.PORT || 4000)
const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000'
const DATA_DIR = process.env.CAMPUS_LOOP_DATA_DIR || path.join(__dirname, 'data')
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads')
const STORE_PATH = path.join(DATA_DIR, 'store.json')

fs.mkdirSync(DATA_DIR, { recursive: true })
fs.mkdirSync(UPLOAD_DIR, { recursive: true })

function loadStore() {
  try {
    const saved = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8').replace(/^\uFEFF/, ''))
    return {
      items: Array.isArray(saved.items) ? saved.items : [],
      claims: Array.isArray(saved.claims) ? saved.claims : [],
      auditLog: Array.isArray(saved.auditLog) ? saved.auditLog : [],
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load local store:', error.message)
    return { items: [], claims: [], auditLog: [] }
  }
}

const savedStore = loadStore()
const items = savedStore.items
const claims = savedStore.claims
const auditLog = savedStore.auditLog

function persistStore() {
  const tempPath = `${STORE_PATH}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify({ items, claims, auditLog }, null, 2))
  fs.renameSync(tempPath, STORE_PATH)
}

function recordEvent(type, item, actor, claim = null) {
  auditLog.unshift({
    id: randomUUID(),
    itemId: item.id,
    claimId: claim?.id || null,
    type,
    timestamp: new Date().toISOString(),
    summary: item.title,
    actor,
    actorEmail: claim?.email || item.reporter?.email || '',
  })
}

app.use(cors())
app.use(express.json({ limit: '8mb' }))
app.use('/uploads', express.static(UPLOAD_DIR))

function requireAdmin(req, res, next) {
  if (req.header('x-campus-role') !== 'admin') {
    return res.status(403).json({ error: 'Campus desk access is required for this action.' })
  }
  next()
}

function publicItem(item) {
  const safeItem = { ...item }
  delete safeItem.adminSecretNote
  delete safeItem.reporter
  delete safeItem.potentialMatches
  delete safeItem.releasedTo
  return safeItem
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function itemText(item) {
  return [item.title, item.category, item.description].filter(Boolean).join('. ')
}

async function similarityScore(lost, found) {
  try {
    const response = await fetch(`${AI_SERVICE_URL}/api/match-score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lost_text: itemText(lost), found_text: itemText(found) }),
      signal: AbortSignal.timeout(3000),
    })
    if (!response.ok) return null
    const result = await response.json()
    return Number.isFinite(result.similarity_score) ? result.similarity_score : null
  } catch (error) {
    console.warn(`AI match service unavailable: ${error.message}`)
    return null
  }
}

async function matchItem(item, candidates) {
  const comparisons = await Promise.all(candidates.map(async (candidate) => ({
    candidate,
    score: await similarityScore(item.type === 'LOST' ? item : candidate, item.type === 'FOUND' ? item : candidate),
  })))
  const matches = comparisons
    .filter(({ score }) => score !== null && score > 65)
    .map(({ candidate, score }) => ({ itemId: candidate.id, title: candidate.title, score }))

  item.potentialMatches = matches
  for (const match of matches) {
    const candidate = candidates.find((entry) => entry.id === match.itemId)
    candidate.potentialMatches ||= []
    candidate.potentialMatches = candidate.potentialMatches.filter((entry) => entry.itemId !== item.id)
    candidate.potentialMatches.push({ itemId: item.id, title: item.title, score: match.score })
  }
  return matches
}

function findItem(id) {
  return items.find((item) => item.id === id)
}

function savePhoto(dataUrl) {
  if (!dataUrl) return ''
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl)
  if (!match) throw Object.assign(new Error('Choose a JPEG, PNG, or WebP image.'), { status: 400 })
  const image = Buffer.from(match[2], 'base64')
  if (image.length > 5 * 1024 * 1024) throw Object.assign(new Error('The photo must be 5 MB or smaller.'), { status: 413 })
  const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
  const fileName = `${randomUUID()}.${extension}`
  fs.writeFileSync(path.join(UPLOAD_DIR, fileName), image)
  return `/uploads/${fileName}`
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', items: items.length, claims: claims.length })
})

app.get('/api/items', (req, res) => {
  const type = (req.query.type || 'FOUND').toString().toUpperCase()
  const status = req.query.status?.toString().toUpperCase()
  if (!['FOUND', 'LOST'].includes(type)) return res.status(400).json({ error: 'type must be FOUND or LOST.' })
  if (type === 'LOST') return res.status(403).json({ error: 'Lost reports are visible only to campus staff.' })
  if (status && !['OPEN', 'RESOLVED'].includes(status)) return res.status(400).json({ error: 'status must be OPEN or RESOLVED.' })
  const result = items.filter((item) => item.type === type && item.visibility !== 'PRIVATE' && (!status || item.status === status))
  res.json(result.map(publicItem))
})

app.get('/api/admin/items', requireAdmin, (req, res) => {
  const status = req.query.status?.toString().toUpperCase()
  const result = items.filter((item) => item.type === 'FOUND' && (!status || item.status === status))
  res.json(result)
})

app.get('/api/admin/lost-reports', requireAdmin, (req, res) => {
  const status = req.query.status?.toString().toUpperCase()
  const result = items.filter((item) => item.type === 'LOST' && (!status || item.status === status))
  res.json(result)
})

app.post('/api/admin/lost-reports/:id/review', requireAdmin, (req, res) => {
  const report = findItem(cleanText(req.params.id))
  const action = cleanText(req.body.action).toUpperCase()
  if (!report || report.type !== 'LOST') return res.status(404).json({ error: 'Lost report not found.' })
  if (!['APPROVE', 'REJECT'].includes(action)) return res.status(400).json({ error: 'Choose approve or reject.' })
  if (report.reviewStatus && report.reviewStatus !== 'PENDING') return res.status(409).json({ error: 'This report has already been reviewed.' })

  if (action === 'APPROVE') {
    const title = cleanText(req.body.title)
    const category = cleanText(req.body.category)
    const description = cleanText(req.body.description)
    const location = cleanText(req.body.location)
    if (!title || !category || !description || !location) {
      return res.status(400).json({ error: 'Title, category, description, and last-seen location are required.' })
    }
    Object.assign(report, { title, category, description, location })
    report.reviewStatus = 'APPROVED'
  } else {
    report.reviewStatus = 'REJECTED'
    report.reviewNote = cleanText(req.body.reviewNote)
  }

  report.visibility = 'PRIVATE'
  report.reviewedAt = new Date().toISOString()
  report.reviewedBy = cleanText(req.body.operatorName) || 'Campus desk'
  recordEvent(action === 'APPROVE' ? 'LOST_REPORT_APPROVED' : 'LOST_REPORT_REJECTED', report, report.reviewedBy)
  persistStore()
  res.json({ success: true, report })
})

app.get('/api/admin/claims', requireAdmin, (req, res) => {
  const status = (req.query.status || 'PENDING').toString().toUpperCase()
  const result = claims
    .filter((claim) => !status || claim.status === status)
    .map((claim) => {
      const safeClaim = { ...claim }
      delete safeClaim.otp
      return { ...safeClaim, itemTitle: findItem(claim.itemId)?.title }
    })
  res.json(result)
})

app.get('/api/admin/history', requireAdmin, (_req, res) => {
  const historyItems = [...items]
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
    .map((item) => {
      const itemClaims = claims.filter((claim) => claim.itemId === item.id)
      const verifiedClaim = itemClaims.find((claim) => claim.status === 'VERIFIED')
      return {
        ...item,
        releasedTo: item.releasedTo || (verifiedClaim ? {
          name: verifiedClaim.studentName,
          email: verifiedClaim.email,
          rollNo: verifiedClaim.rollNo,
          claimId: verifiedClaim.id,
        } : undefined),
        claims: itemClaims.map((claim) => {
          const safeClaim = { ...claim }
          delete safeClaim.otp
          return safeClaim
        }),
      }
    })
  res.json({ items: historyItems, events: auditLog })
})

app.get('/api/student/history', (req, res) => {
  const email = cleanText(req.query.email).toLowerCase()
  if (!email) return res.status(400).json({ error: 'An email address is required.' })

  const lostReports = items
    .filter((item) => item.type === 'LOST' && item.reporter?.email.toLowerCase() === email)
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
  const studentClaims = claims
    .filter((claim) => claim.email.toLowerCase() === email)
    .map((claim) => ({
      ...claim,
      otp: claim.status === 'PENDING' ? claim.otp : undefined,
      itemTitle: findItem(claim.itemId)?.title || claim.itemTitle,
      itemLocation: findItem(claim.itemId)?.location || claim.itemLocation,
    }))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
  const studentEvents = auditLog.filter((event) => event.actorEmail?.toLowerCase() === email)
  res.json({ lostReports, claims: studentClaims, events: studentEvents })
})

app.get('/api/claims', (req, res) => {
  const email = cleanText(req.query.email).toLowerCase()
  if (!email) return res.status(400).json({ error: 'An email address is required.' })
  const result = claims
    .filter((claim) => claim.email.toLowerCase() === email)
    .map((claim) => ({ ...claim, itemTitle: findItem(claim.itemId)?.title, itemLocation: findItem(claim.itemId)?.location }))
    .sort((first, second) => second.createdAt.localeCompare(first.createdAt))
  res.json(result)
})

app.post('/api/admin/found-item', requireAdmin, async (req, res) => {
  const title = cleanText(req.body.title)
  const category = cleanText(req.body.category)
  const description = cleanText(req.body.description)
  const location = cleanText(req.body.location)
  const shelf = cleanText(req.body.shelf)
  const visibility = cleanText(req.body.visibility).toUpperCase() === 'PRIVATE' ? 'PRIVATE' : 'PUBLIC'
  if (!title || !category || !description || !location || !shelf) {
    return res.status(400).json({ error: 'Title, category, description, drop-off location, and shelf are required.' })
  }

  let photoUrl
  try {
    photoUrl = savePhoto(cleanText(req.body.photoDataUrl))
  } catch (error) {
    return res.status(error.status || 400).json({ error: error.message })
  }

  const item = {
    id: randomUUID(),
    type: 'FOUND',
    status: 'OPEN',
    title,
    category,
    description,
    location,
    shelf,
    foundAt: cleanText(req.body.foundAt) || new Date().toISOString(),
    createdAt: new Date().toISOString(),
    adminSecretNote: cleanText(req.body.adminSecretNote),
    potentialMatches: [],
    photoUrl,
    visibility,
  }
  items.unshift(item)
  const candidates = items.filter((entry) => entry.type === 'LOST' && entry.status === 'OPEN')
  await matchItem(item, candidates)
  recordEvent('ITEM_INTAKED', item, cleanText(req.body.operatorName) || 'Campus desk')
  persistStore()
  res.status(201).json(item)
})

app.post('/api/student/lost-report', async (req, res) => {
  const name = cleanText(req.body.name)
  const email = cleanText(req.body.email)
  const rollNo = cleanText(req.body.rollNo)
  const title = cleanText(req.body.title)
  const category = cleanText(req.body.category)
  const description = cleanText(req.body.description)
  const location = cleanText(req.body.location)
  if (!name || !email || !rollNo || !title || !category || !description || !location) {
    return res.status(400).json({ error: 'Please complete all lost report fields.' })
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid college email.' })

  const item = {
    id: randomUUID(),
    type: 'LOST',
    status: 'OPEN',
    title,
    category,
    description,
    location,
    shelf: '',
    createdAt: new Date().toISOString(),
    reporter: { name, email, rollNo },
    potentialMatches: [],
    visibility: 'PRIVATE',
    reviewStatus: 'PENDING',
  }
  items.unshift(item)
  const candidates = items.filter((entry) => entry.type === 'FOUND' && entry.status === 'OPEN')
  const potentialMatches = await matchItem(item, candidates)
  recordEvent('LOST_REPORTED', item, name)
  persistStore()
  res.status(201).json({ ...publicItem(item), potentialMatches })
})

app.post('/api/claims/create', (req, res) => {
  const itemId = cleanText(req.body.itemId)
  const studentName = cleanText(req.body.studentName)
  const email = cleanText(req.body.email)
  const rollNo = cleanText(req.body.rollNo)
  const proofNote = cleanText(req.body.proofNote)
  const item = findItem(itemId)
  if (!studentName || !email || !rollNo || !proofNote) return res.status(400).json({ error: 'Name, email, roll number, and proof note are required.' })
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid college email.' })
  if (!item || item.type !== 'FOUND' || item.status !== 'OPEN' || item.visibility === 'PRIVATE') return res.status(404).json({ error: 'That item is no longer available to claim.' })

  let otp
  do { otp = String(randomInt(1000, 10000)) } while (claims.some((claim) => claim.status === 'PENDING' && claim.otp === otp))
  const claim = {
    id: randomUUID(),
    itemId,
    studentName,
    email,
    rollNo,
    proofNote,
    otp,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    itemTitle: item.title,
    itemLocation: item.location,
  }
  claims.unshift(claim)
  recordEvent('CLAIM_CREATED', item, studentName, claim)
  persistStore()
  res.status(201).json(claim)
})

app.post('/api/admin/verify-otp', requireAdmin, (req, res) => {
  const itemId = cleanText(req.body.itemId)
  const otp = cleanText(req.body.otp)
  const item = findItem(itemId)
  if (!item || item.type !== 'FOUND' || item.status !== 'OPEN') return res.status(404).json({ error: 'Open found item not found.' })
  const claim = claims.find((entry) => entry.itemId === itemId && entry.otp === otp && entry.status === 'PENDING')
  if (!claim) return res.status(400).json({ error: 'OTP does not match an active claim for this item.' })

  claim.status = 'VERIFIED'
  claim.verifiedAt = new Date().toISOString()
  item.status = 'RESOLVED'
  item.resolvedAt = claim.verifiedAt
  item.releasedTo = { name: claim.studentName, email: claim.email, rollNo: claim.rollNo, claimId: claim.id }
  for (const otherClaim of claims) {
    if (otherClaim.itemId === itemId && otherClaim.id !== claim.id && otherClaim.status === 'PENDING') otherClaim.status = 'CLOSED'
  }
  recordEvent('ITEM_RELEASED', item, claim.studentName, claim)
  persistStore()
  res.json({ success: true, item: publicItem(item), claim: { id: claim.id, studentName: claim.studentName, status: claim.status } })
})

app.post('/api/admin/close-case', requireAdmin, (req, res) => {
  const item = findItem(cleanText(req.body.itemId))
  if (!item || item.type !== 'FOUND' || item.status !== 'OPEN') return res.status(404).json({ error: 'Open found item not found.' })
  item.status = 'RESOLVED'
  item.resolvedAt = new Date().toISOString()
  for (const claim of claims) if (claim.itemId === item.id && claim.status === 'PENDING') claim.status = 'CLOSED'
  recordEvent('CASE_CLOSED', item, 'Campus desk')
  persistStore()
  res.json({ success: true, item: publicItem(item) })
})

app.use((error, _req, res, _next) => {
  console.error(error)
  res.status(500).json({ error: 'Unexpected server error.' })
})

app.listen(PORT, () => console.log(`Campus Loop API listening on http://localhost:${PORT}`))