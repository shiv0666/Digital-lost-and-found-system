import { startTransition, useEffect, useEffectEvent, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Box,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  KeyRound,
  Laptop,
  MapPin,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  X,
} from 'lucide-react'
import './App.css'

const API_ROOT = '/api'
const CATEGORIES = ['All items', 'Electronics', 'Bags', 'Keys', 'Cards', 'Clothing', 'Other']

function App() {
  const [view, setView] = useState('student')
  const [items, setItems] = useState([])
  const [lostReports, setLostReports] = useState([])
  const [claims, setClaims] = useState([])
  const [category, setCategory] = useState('All items')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [otpInputs, setOtpInputs] = useState({})
  const [otpResults, setOtpResults] = useState({})
  const [studentEmail, setStudentEmail] = useState(() => localStorage.getItem('hoora-email') || '')

  async function api(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Campus-Role': view === 'admin' ? 'admin' : 'student',
        ...options.headers,
      },
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(body.error || 'Something went wrong. Please try again.')
    return body
  }

  async function refreshData() {
    try {
      if (view === 'admin') {
        const [deskItems, reports, pendingClaims] = await Promise.all([
          api('/admin/items?status=OPEN'),
          api('/admin/lost-reports?status=OPEN'),
          api('/admin/claims?status=PENDING'),
        ])
        startTransition(() => {
          setItems(deskItems)
          setLostReports(reports)
          setClaims(pendingClaims)
        })
      } else {
        const [foundItems, studentClaims] = await Promise.all([
          api('/items?type=FOUND&status=OPEN'),
          studentEmail ? api(`/claims?email=${encodeURIComponent(studentEmail)}`) : Promise.resolve([]),
        ])
        startTransition(() => {
          setItems(foundItems)
          setClaims(studentClaims)
        })
      }
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    }
  }

  const loadCurrentView = useEffectEvent(() => {
    refreshData()
  })

  async function refreshStudentClaims(email = studentEmail) {
    if (!email) return
    try {
      const data = await api(`/claims?email=${encodeURIComponent(email)}`)
      setClaims(data)
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    }
  }

  useEffect(() => {
    const refreshTask = window.setTimeout(() => loadCurrentView(), 0)
    return () => window.clearTimeout(refreshTask)
  }, [view])

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    return items.filter((item) => {
      const categoryMatch = category === 'All items' || item.category === category
      const searchMatch = !query || `${item.title} ${item.description} ${item.location}`.toLowerCase().includes(query)
      return categoryMatch && searchMatch
    })
  }, [items, category, search])

  const potentialMatches = items.reduce((count, item) => count + (item.potentialMatches?.length || 0), 0)

  function reportNotice(type, text) {
    setNotice({ type, text })
    window.setTimeout(() => setNotice(null), 4200)
  }

  async function handleFoundItem(event) {
    event.preventDefault()
    setBusy(true)
    const form = new FormData(event.currentTarget)
    try {
      await api('/admin/found-item', {
        method: 'POST',
        body: JSON.stringify(Object.fromEntries(form.entries())),
      })
      event.currentTarget.reset()
      await refreshData()
      reportNotice('success', 'Item logged into campus custody and added to the found feed.')
    } catch (error) {
      reportNotice('error', error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleLostReport(event) {
    event.preventDefault()
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form.entries())
    try {
      const result = await api('/student/lost-report', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      setStudentEmail(values.email)
      localStorage.setItem('hoora-email', values.email)
      setModal(null)
      await refreshData()
      reportNotice('success', result.potentialMatches?.length
        ? `Report saved. ${result.potentialMatches.length} potential match${result.potentialMatches.length === 1 ? '' : 'es'} sent to the desk.`
        : 'Lost report sent to campus staff for matching.')
    } catch (error) {
      reportNotice('error', error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleClaim(event) {
    event.preventDefault()
    setBusy(true)
    const form = new FormData(event.currentTarget)
    const values = Object.fromEntries(form.entries())
    try {
      const claim = await api('/claims/create', {
        method: 'POST',
        body: JSON.stringify({ ...values, itemId: selectedItem.id }),
      })
      setStudentEmail(values.email)
      localStorage.setItem('hoora-email', values.email)
      setClaims((current) => [claim, ...current.filter((existing) => existing.id !== claim.id)])
      setModal(null)
      setDrawerOpen(true)
      reportNotice('success', 'Claim created. Bring this ticket and your OTP to the campus desk.')
    } catch (error) {
      reportNotice('error', error.message)
    } finally {
      setBusy(false)
    }
  }

  async function handleVerify(itemId) {
    const otp = (otpInputs[itemId] || '').trim()
    try {
      const result = await api('/admin/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ itemId, otp }),
      })
      setOtpResults((current) => ({ ...current, [itemId]: { ok: true, text: `${result.claim.studentName} verified. Item released.` } }))
      await refreshData()
      reportNotice('success', 'OTP verified. The case is now resolved.')
    } catch (error) {
      setOtpResults((current) => ({ ...current, [itemId]: { ok: false, text: error.message } }))
    }
  }

  async function closeCase(itemId) {
    try {
      await api('/admin/close-case', { method: 'POST', body: JSON.stringify({ itemId }) })
      await refreshData()
      reportNotice('success', 'Case closed and removed from the public feed.')
    } catch (error) {
      reportNotice('error', error.message)
    }
  }

  async function showMyClaims() {
    await refreshStudentClaims()
    setDrawerOpen(true)
  }

  function openClaim(item) {
    setSelectedItem(item)
    setModal('claim')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Campus Loop home">
          <span className="brand-mark"><ArrowDownLeft size={21} strokeWidth={2.6} /></span>
          <span>campus<span className="brand-light">loop</span></span>
        </a>
        <div className="topbar-right">
          <div className="service-status"><span className="status-dot" /> Desk network online</div>
          <div className="role-switch" aria-label="Choose dashboard view">
            <button className={view === 'student' ? 'selected' : ''} onClick={() => { setView('student'); setCategory('All items') }} type="button">
              Student view
            </button>
            <button className={view === 'admin' ? 'selected' : ''} onClick={() => { setView('admin'); setCategory('All items') }} type="button">
              <ShieldCheck size={15} /> Desk view
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {notice && (
          <div className={`toast ${notice.type}`} role="status">
            {notice.type === 'success' ? <CheckCircle2 size={18} /> : <Bell size={18} />}
            <span>{notice.text}</span>
            <button type="button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button>
          </div>
        )}

        {view === 'student' ? (
          <>
            <section className="hero-band">
              <div className="hero-copy">
                <div className="eyebrow"><span className="eyebrow-line" /> YOUR CAMPUS, RECONNECTED</div>
                <h1>Lost something?<br /><em>Let’s bring it home.</em></h1>
                <p>Every found item is checked in by campus staff. Browse the desk’s verified finds or tell us what you’re missing.</p>
                <div className="hero-actions">
                  <a className="button button-dark" href="#found-items">Browse found items <ArrowRight size={16} /></a>
                  <button className="button button-outline" type="button" onClick={() => setModal('lost')}><Plus size={16} /> Report something lost</button>
                </div>
              </div>
              <div className="hero-art" aria-hidden="true">
                <div className="art-sun" />
                <div className="art-orbit orbit-one" />
                <div className="art-orbit orbit-two" />
                <div className="art-ticket"><span className="ticket-stamp"><PackageCheck size={24} /></span><span className="ticket-lines"><i /><i /><i /></span><span className="ticket-seal"><Check size={14} /></span></div>
                <span className="art-caption">FOUND ON CAMPUS<br /><b>RETURNED WITH CARE</b></span>
              </div>
            </section>

            <section className="student-toolbar" id="found-items">
              <div className="section-kicker"><span className="kicker-icon"><PackageCheck size={15} /></span> VERIFIED BY CAMPUS DESK</div>
              <div className="feed-heading-row">
                <div><h2>Recently found</h2><p className="section-subtitle">Items currently held at Security &amp; Admin desks.</p></div>
                <button className="button button-soft" type="button" onClick={showMyClaims}><Ticket size={16} /> My claims <span className="claim-count">{claims.filter((claim) => claim.status === 'PENDING').length}</span></button>
              </div>
              <div className="filter-row">
                <div className="category-filters" role="group" aria-label="Filter by category">
                  {CATEGORIES.map((option) => <button key={option} type="button" className={category === option ? 'filter-chip active' : 'filter-chip'} onClick={() => setCategory(option)}>{option}</button>)}
                </div>
                <label className="search-box"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search found items" /></label>
              </div>
              <div className="item-grid">
                {visibleItems.map((item) => <FoundItemCard key={item.id} item={item} onClaim={() => openClaim(item)} />)}
                {visibleItems.length === 0 && <EmptyState title={items.length ? 'No items match those filters' : 'No finds logged just yet'} text={items.length ? 'Try another category or search term.' : 'Campus desk staff will list verified items here as they are handed in.'} icon={<Search size={21} />} />}
              </div>
            </section>
            <footer className="site-footer"><span><span className="footer-mark">CL</span> campusloop</span><span>Found by someone. Safe with campus staff.</span><button type="button" onClick={() => setModal('lost')}>Missing an item? Report it <ArrowRight size={14} /></button></footer>
          </>
        ) : (
          <>
            <section className="admin-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> CAMPUS OPERATIONS</div><h1>Security desk<span className="heading-period">.</span></h1><p>Manage physical intake, review claims, and release items in person.</p></div>
              <div className="desk-badge"><span className="desk-badge-icon"><ShieldCheck size={19} /></span><span><b>Desk operator</b><small>Demo admin access</small></span><ChevronDown size={15} /></div>
            </section>
            <section className="admin-stats">
              <StatTile icon={<Box size={17} />} label="In desk custody" value={items.length} tone="coral" />
              <StatTile icon={<Ticket size={17} />} label="Claims to review" value={claims.length} tone="blue" />
              <StatTile icon={<Sparkles size={17} />} label="Potential matches" value={potentialMatches} tone="green" />
              <div className="custody-note"><ShieldCheck size={17} /><span>Public listings are created only through this desk intake.</span></div>
            </section>
            <div className="admin-layout">
              <section className="intake-panel">
                <div className="panel-title-row"><div><div className="section-kicker">PHYSICAL INTAKE</div><h2>Log a found item</h2></div><span className="panel-icon coral"><Plus size={18} /></span></div>
                <p className="panel-description">Record the hand-off details. The item will appear on the student feed after saving.</p>
                <form className="form-stack" onSubmit={handleFoundItem}>
                  <label>Item name<input name="title" required maxLength="100" placeholder="e.g. Navy wireless headphones" /></label>
                  <div className="form-two-col">
                    <label>Category<select name="category" required defaultValue="Electronics">{CATEGORIES.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label>
                    <label>Date found<input name="foundAt" type="datetime-local" /></label>
                  </div>
                  <label>Description<textarea name="description" required rows="3" maxLength="500" placeholder="Color, brand, distinguishing features..." /></label>
                  <div className="form-two-col">
                    <label>Drop-off location<input name="location" required placeholder="e.g. Main library, east entrance" /></label>
                    <label>Shelf / desk reference<input name="shelf" required placeholder="e.g. Security A-14" /></label>
                  </div>
                  <label className="secret-field-label"><span>Private admin secret note <small>Not visible to students</small></span><textarea name="adminSecretNote" rows="2" maxLength="500" placeholder="A detail used to verify ownership in person" /></label>
                  <button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? 'Saving intake...' : 'Add to verified finds'} <ArrowRight size={16} /></button>
                </form>
              </section>

              <div className="desk-workspace">
                <section className="desk-section">
                  <div className="panel-title-row"><div><div className="section-kicker">OPEN CASES</div><h2>Items in custody <span className="inline-count">{items.length}</span></h2></div><button className="icon-button" title="Refresh desk list" aria-label="Refresh desk list" type="button" onClick={refreshData}><ArrowRight size={16} /></button></div>
                  <div className="desk-item-list">
                    {items.map((item) => <DeskItem key={item.id} item={item} claims={claims.filter((claim) => claim.itemId === item.id)} otp={otpInputs[item.id] || ''} result={otpResults[item.id]} onOtpChange={(value) => setOtpInputs((current) => ({ ...current, [item.id]: value }))} onVerify={() => handleVerify(item.id)} onClose={() => closeCase(item.id)} />)}
                    {items.length === 0 && <EmptyState title="Desk is clear" text="New physical hand-offs will appear here after intake." icon={<PackageCheck size={21} />} />}
                  </div>
                </section>
                <section className="desk-section lost-report-section">
                  <div className="panel-title-row"><div><div className="section-kicker">STUDENT REPORTS</div><h2>Lost item reports <span className="inline-count">{lostReports.length}</span></h2></div><span className="panel-icon blue"><ArrowDownLeft size={17} /></span></div>
                  <div className="report-list">
                    {lostReports.map((report) => <div className="lost-report" key={report.id}><div className="report-icon"><Laptop size={17} /></div><div className="report-copy"><b>{report.title}</b><span>{report.reporter?.name} · {report.reporter?.email}</span><small>{report.description}</small></div>{report.potentialMatches?.length > 0 && <span className="match-count"><Sparkles size={13} /> {report.potentialMatches.length} match</span>}</div>)}
                    {lostReports.length === 0 && <p className="muted-empty">No open lost reports right now.</p>}
                  </div>
                </section>
              </div>
            </div>
          </>
        )}
      </main>

      {modal && <Modal title={modal === 'claim' ? 'Claim this item' : 'Report a lost item'} subtitle={modal === 'claim' ? `Tell us how to verify your ${selectedItem?.title}.` : 'Give campus staff the details they need to identify a match.'} onClose={() => setModal(null)}>
        {modal === 'claim' ? (
          <form className="form-stack modal-form" onSubmit={handleClaim}>
            <label>Your name<input name="studentName" required maxLength="100" autoComplete="name" placeholder="Full name" /></label>
            <div className="form-two-col"><label>College email<input name="email" type="email" required defaultValue={studentEmail} autoComplete="email" placeholder="you@college.edu" /></label><label>Roll number<input name="rollNo" required maxLength="40" placeholder="e.g. 24CS018" /></label></div>
            <label>Proof of ownership<textarea name="proofNote" required rows="3" maxLength="500" placeholder="Describe a detail only the owner would know..." /></label>
            <div className="privacy-hint"><KeyRound size={15} /> Keep unique details private. The desk will ask for them in person.</div>
            <button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? 'Creating claim...' : 'Create claim ticket'} <ArrowRight size={16} /></button>
          </form>
        ) : (
          <form className="form-stack modal-form" onSubmit={handleLostReport}>
            <div className="form-two-col"><label>Your name<input name="name" required maxLength="100" placeholder="Full name" /></label><label>College email<input name="email" type="email" required defaultValue={studentEmail} placeholder="you@college.edu" /></label></div>
            <label>Roll number<input name="rollNo" required maxLength="40" placeholder="e.g. 24CS018" /></label>
            <label>What did you lose?<input name="title" required maxLength="100" placeholder="e.g. Silver water bottle" /></label>
            <div className="form-two-col"><label>Category<select name="category" required defaultValue="Electronics">{CATEGORIES.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label><label>Last seen near<input name="location" required placeholder="e.g. Arts building, room 204" /></label></div>
            <label>Description<textarea name="description" required rows="3" maxLength="500" placeholder="Color, brand, stickers, or other identifying details..." /></label>
            <button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? 'Sending report...' : 'Send to campus desk'} <ArrowRight size={16} /></button>
          </form>
        )}
      </Modal>}

      {drawerOpen && <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDrawerOpen(false) }}>
        <aside className="claims-drawer" aria-label="My claims">
          <div className="drawer-header"><div><div className="section-kicker">YOUR TICKETS</div><h2>My active claims</h2></div><button className="icon-button" aria-label="Close claims" onClick={() => setDrawerOpen(false)} type="button"><X size={18} /></button></div>
          {!studentEmail && <form className="lookup-form" onSubmit={(event) => { event.preventDefault(); const email = new FormData(event.currentTarget).get('email'); setStudentEmail(email); localStorage.setItem('hoora-email', email); refreshStudentClaims(email) }}><label>Look up claims by college email<input name="email" type="email" required placeholder="you@college.edu" /></label><button className="button button-dark" type="submit">Find claims</button></form>}
          {studentEmail && <p className="drawer-email">Tickets for <b>{studentEmail}</b></p>}
          <div className="claim-list">
            {claims.filter((claim) => claim.status === 'PENDING').map((claim) => <div className="claim-ticket" key={claim.id}><div className="claim-ticket-top"><span className="ticket-label"><Ticket size={14} /> DESK TICKET</span><span className="ticket-open"><span /> Active</span></div><h3>{claim.itemTitle || claim.item?.title || 'Found item claim'}</h3><p>Visit the campus desk with your student ID and share this one-time code.</p><div className="otp-display"><span>YOUR CLAIM OTP</span><strong>{claim.otp}</strong></div><div className="ticket-location"><MapPin size={15} /> {claim.itemLocation || claim.item?.location || 'Campus security desk'}</div><div className="ticket-cutout" /></div>)}
            {claims.filter((claim) => claim.status === 'PENDING').length === 0 && <EmptyState title="No active claims" text="Claim a found item to get a desk ticket and one-time code." icon={<Ticket size={21} />} />}
          </div>
          <div className="drawer-footnote"><ShieldCheck size={15} /> Your OTP is for the desk hand-off only. Don’t share it publicly.</div>
        </aside>
      </div>}
    </div>
  )
}

function FoundItemCard({ item, onClaim }) {
  return (
    <article className="found-card">
      <div className={`item-art ${artTone(item.category)}`}><span className="item-category-icon"><CategoryGlyph category={item.category} size={25} strokeWidth={1.7} /></span><span className="verified-pill"><BadgeCheck size={13} /> Desk verified</span><span className="art-index">#{String(item.id).slice(-4).toUpperCase()}</span></div>
      <div className="found-card-body"><div className="item-meta"><span>{item.category}</span><span className="meta-dot" />{formatDate(item.foundAt || item.createdAt)}</div><h3>{item.title}</h3><p className="item-description">{item.description}</p><div className="item-location"><MapPin size={14} /><span>{item.location}</span></div><div className="found-card-footer"><span className="shelf-ref"><Box size={13} /> {item.shelf}</span><button className="claim-button" type="button" onClick={onClaim}>Claim item <ArrowRight size={14} /></button></div></div>
    </article>
  )
}

function DeskItem({ item, claims, otp, result, onOtpChange, onVerify, onClose }) {
  return (
    <article className="desk-item">
      <div className="desk-item-top"><div className={`desk-item-icon ${artTone(item.category)}`}><CategoryGlyph category={item.category} size={19} /></div><div className="desk-item-summary"><h3>{item.title}</h3><span>{item.category} <span className="meta-dot" /> {item.location}</span></div><span className="desk-status"><span /> OPEN</span></div>
      <div className="desk-item-details"><span><Clock3 size={13} /> {formatDate(item.createdAt)}</span><span><Box size={13} /> {item.shelf}</span></div>
      {item.potentialMatches?.length > 0 && <div className="match-notice"><Sparkles size={14} /><span><b>Potential match found</b>{item.potentialMatches.map((match) => <small key={match.itemId}>{match.score}% with “{match.title}”</small>)}</span></div>}
      {item.adminSecretNote && <div className="secret-note"><KeyRound size={13} /><span><b>Private note</b>{item.adminSecretNote}</span></div>}
      {claims.length > 0 && <div className="claim-review"><div className="claim-review-title"><Ticket size={14} /> Pending claim{claims.length === 1 ? '' : 's'} <span>{claims.length}</span></div>{claims.map((claim) => <div className="claim-review-row" key={claim.id}><div><b>{claim.studentName}</b><span>{claim.email} · {claim.rollNo}</span><small>Proof: {claim.proofNote}</small></div><BadgeCheck size={16} /></div>)}</div>}
      <div className="otp-verify-row"><label className="otp-input-label"><span>Student’s 4-digit OTP</span><input inputMode="numeric" maxLength="4" value={otp} onChange={(event) => onOtpChange(event.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="0000" aria-label={`OTP for ${item.title}`} /></label><button className="verify-button" type="button" onClick={onVerify} disabled={otp.length !== 4}><Check size={15} /> Verify &amp; release</button></div>
      {result && <p className={result.ok ? 'otp-feedback success' : 'otp-feedback error'}>{result.ok ? <CheckCircle2 size={14} /> : <X size={14} />}{result.text}</p>}
      <button className="close-case-button" type="button" onClick={onClose}>Close case without claim</button>
    </article>
  )
}

function StatTile({ icon, label, value, tone }) {
  return <div className="stat-tile"><span className={`stat-icon ${tone}`}>{icon}</span><span className="stat-copy"><small>{label}</small><b>{value}</b></span></div>
}

function EmptyState({ title, text, icon }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><h3>{title}</h3><p>{text}</p></div>
}

function Modal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    function closeOnEscape(event) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="modal-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><div><div className="section-kicker">CAMPUS LOOP</div><h2 id="modal-title">{title}</h2><p>{subtitle}</p></div><button className="icon-button" onClick={onClose} type="button" aria-label="Close dialog"><X size={18} /></button></div>{children}</section></div>
}

function CategoryGlyph({ category, size = 24, strokeWidth = 1.8 }) {
  if (category === 'Electronics') return <Laptop size={size} strokeWidth={strokeWidth} />
  if (category === 'Keys') return <KeyRound size={size} strokeWidth={strokeWidth} />
  if (category === 'Cards') return <BadgeCheck size={size} strokeWidth={strokeWidth} />
  if (category === 'Bags') return <PackageCheck size={size} strokeWidth={strokeWidth} />
  return <Box size={size} strokeWidth={strokeWidth} />
}

function artTone(category = '') {
  if (category === 'Electronics') return 'tone-blue'
  if (category === 'Bags') return 'tone-coral'
  if (category === 'Keys') return 'tone-yellow'
  if (category === 'Cards') return 'tone-green'
  return 'tone-lilac'
}

function formatDate(value) {
  if (!value) return 'Just logged'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Just logged' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default App
