import { startTransition, useEffect, useEffectEvent, useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowRight,
  BadgeCheck,
  Bell,
  Box,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  History,
  KeyRound,
  Laptop,
  LogOut,
  MapPin,
  PackageCheck,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserRound,
  X,
} from 'lucide-react'
import './App.css'

const API_ROOT = '/api'
const CATEGORIES = ['All items', 'Electronics', 'Bags', 'Keys', 'Cards', 'Clothing', 'Other']

function readSavedSession() {
  try {
    const session = JSON.parse(localStorage.getItem('campus-loop-session') || 'null')
    return ['student', 'admin'].includes(session?.role) ? session : null
  } catch {
    return null
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read that photo.'))
    reader.readAsDataURL(file)
  })
}

function App() {
  const [session, setSession] = useState(readSavedSession)
  const [view, setView] = useState(() => readSavedSession()?.role || 'student')
  const [items, setItems] = useState([])
  const [lostReports, setLostReports] = useState([])
  const [claims, setClaims] = useState([])
  const [studentHistory, setStudentHistory] = useState({ lostReports: [], claims: [], events: [] })
  const [adminHistory, setAdminHistory] = useState({ items: [], events: [] })
  const [studentTab, setStudentTab] = useState('feed')
  const [adminTab, setAdminTab] = useState('desk')
  const [category, setCategory] = useState('All items')
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedReport, setSelectedReport] = useState(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const [otpInputs, setOtpInputs] = useState({})
  const [otpResults, setOtpResults] = useState({})
  const [studentEmail, setStudentEmail] = useState(() => readSavedSession()?.email || '')
  const [photoPreview, setPhotoPreview] = useState('')

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
        const [deskItems, reports, pendingClaims, history] = await Promise.all([
          api('/admin/items?status=OPEN'),
          api('/admin/lost-reports?status=OPEN'),
          api('/admin/claims?status=PENDING'),
          api('/admin/history'),
        ])
        startTransition(() => {
          setItems(deskItems)
          setLostReports(reports)
          setClaims(pendingClaims)
          setAdminHistory(history)
        })
      } else {
        const historyUrl = studentEmail ? `/student/history?email=${encodeURIComponent(studentEmail)}` : null
        const [foundItems, history] = await Promise.all([
          api('/items?type=FOUND&status=OPEN'),
          historyUrl ? api(historyUrl) : Promise.resolve({ lostReports: [], claims: [], events: [] }),
        ])
        startTransition(() => {
          setItems(foundItems)
          setStudentHistory(history)
          setClaims(history.claims)
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

  async function refreshStudentHistory(email = studentEmail) {
    if (!email) return
    try {
      const history = await api(`/student/history?email=${encodeURIComponent(email)}`)
      setStudentHistory(history)
      setClaims(history.claims)
    } catch (error) {
      setNotice({ type: 'error', text: error.message })
    }
  }

  function signIn(role, profile) {
    const nextSession = { role, ...profile }
    localStorage.setItem('campus-loop-session', JSON.stringify(nextSession))
    setSession(nextSession)
    setView(role)
    setStudentEmail(role === 'student' ? profile.email : '')
    setStudentTab('feed')
    setAdminTab('desk')
  }

  function signOut() {
    localStorage.removeItem('campus-loop-session')
    setSession(null)
    setStudentEmail('')
    setClaims([])
    setStudentHistory({ lostReports: [], claims: [], events: [] })
    setItems([])
  }

  function handlePhotoSelection(event) {
    const file = event.target.files?.[0]
    if (!file) {
      setPhotoPreview('')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      event.target.value = ''
      setPhotoPreview('')
      reportNotice('error', 'The photo must be 5 MB or smaller.')
      return
    }
    fileToDataUrl(file).then(setPhotoPreview).catch((error) => reportNotice('error', error.message))
  }

  useEffect(() => {
    if (!session) return undefined
    const refreshTask = window.setTimeout(() => loadCurrentView(), 0)
    return () => window.clearTimeout(refreshTask)
  }, [view, session])

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
    const values = Object.fromEntries(form.entries())
    const photo = values.photo
    delete values.photo
    try {
      if (photo?.size) values.photoDataUrl = await fileToDataUrl(photo)
      values.operatorName = session?.name || 'Campus desk'
      await api('/admin/found-item', {
        method: 'POST',
        body: JSON.stringify(values),
      })
      event.currentTarget.reset()
      setPhotoPreview('')
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
      const nextSession = { ...session, name: values.name, email: values.email, rollNo: values.rollNo }
      setSession(nextSession)
      localStorage.setItem('campus-loop-session', JSON.stringify(nextSession))
      setModal(null)
      setStudentTab('history')
      await refreshStudentHistory(values.email)
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
      const nextSession = { ...session, name: values.studentName, email: values.email, rollNo: values.rollNo }
      setSession(nextSession)
      localStorage.setItem('campus-loop-session', JSON.stringify(nextSession))
      setClaims((current) => [claim, ...current.filter((existing) => existing.id !== claim.id)])
      setModal(null)
      setStudentTab('history')
      await refreshStudentHistory(values.email)
      reportNotice('success', 'Claim created. Bring this ticket and your OTP to the campus desk.')
    } catch (error) {
      reportNotice('error', error.message)
    } finally {
      setBusy(false)
    }
  }

  function openReportReview(report) {
    setSelectedReport(report)
    setModal('review-lost')
  }

  async function reviewLostReport(action, values = {}) {
    try {
      await api(`/admin/lost-reports/${encodeURIComponent(selectedReport.id)}/review`, {
        method: 'POST',
        body: JSON.stringify({ ...values, action, operatorName: session?.name || 'Campus desk' }),
      })
      setModal(null)
      setSelectedReport(null)
      await refreshData()
      reportNotice('success', action === 'APPROVE' ? 'Report approved and saved to the private campus review register.' : 'Report rejected and recorded in campus history.')
    } catch (error) {
      reportNotice('error', error.message)
    }
  }

  async function handleApproveLostReport(event) {
    event.preventDefault()
    setBusy(true)
    try {
      await reviewLostReport('APPROVE', Object.fromEntries(new FormData(event.currentTarget).entries()))
    } finally {
      setBusy(false)
    }
  }

  function rejectLostReport(report) {
    api(`/admin/lost-reports/${encodeURIComponent(report.id)}/review`, {
      method: 'POST',
      body: JSON.stringify({ action: 'REJECT', operatorName: session?.name || 'Campus desk' }),
    }).then(async () => {
      await refreshData()
      reportNotice('success', 'Report rejected and recorded in campus history.')
    }).catch((error) => reportNotice('error', error.message))
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

  if (!session) return <LoginPage onSignIn={signIn} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Campus Loop home">
          <span className="brand-mark"><ArrowDownLeft size={21} strokeWidth={2.6} /></span>
          <span>campus<span className="brand-light">loop</span></span>
        </a>
        <div className="topbar-right">
          <div className="service-status"><span className="status-dot" /> Desk network online</div>
          <nav className="workspace-nav" aria-label="Workspace navigation">
            {view === 'student' ? <>
              <button className={studentTab === 'feed' ? 'active' : ''} type="button" onClick={() => setStudentTab('feed')}><PackageCheck size={14} /> Found</button>
              <button className={studentTab === 'history' ? 'active' : ''} type="button" onClick={() => { setStudentTab('history'); refreshStudentHistory() }}><History size={14} /> My history</button>
              <button type="button" onClick={showMyClaims}><Ticket size={14} /> Claims</button>
            </> : <>
              <button className={adminTab === 'desk' ? 'active' : ''} type="button" onClick={() => setAdminTab('desk')}><ShieldCheck size={14} /> Desk</button>
              <button className={adminTab === 'history' ? 'active' : ''} type="button" onClick={() => { setAdminTab('history'); refreshData() }}><History size={14} /> Full history</button>
            </>}
          </nav>
          <div className="identity-chip"><UserRound size={14} /><span>{session.name}<small>{view === 'admin' ? 'Campus desk' : 'Student'}</small></span></div>
          <button className="logout-button" title="Sign out" aria-label="Sign out" type="button" onClick={signOut}><LogOut size={16} /></button>
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
            {studentTab === 'feed' && <section className="hero-band">
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
            </section>}

            {studentTab === 'feed' ? <section className="student-toolbar" id="found-items">
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
            </section> : <StudentHistoryPage history={studentHistory} session={session} onReportLost={() => setModal('lost')} />}
            <footer className="site-footer"><span><span className="footer-mark">CL</span> campusloop</span><span>Found by someone. Safe with campus staff.</span><button type="button" onClick={() => setModal('lost')}>Missing an item? Report it <ArrowRight size={14} /></button></footer>
          </>
        ) : (
          <>
            <section className="admin-heading">
              <div><div className="eyebrow"><span className="eyebrow-line" /> CAMPUS OPERATIONS</div><h1>Security desk<span className="heading-period">.</span></h1><p>Manage physical intake, review claims, and release items in person.</p></div>
              <div className="desk-badge"><span className="desk-badge-icon"><ShieldCheck size={19} /></span><span><b>Desk operator</b><small>Demo admin access</small></span><ChevronDown size={15} /></div>
            </section>
            {adminTab === 'desk' ? <>
            <section className="admin-stats">
              <StatTile icon={<Box size={17} />} label="In desk custody" value={items.length} tone="coral" />
              <StatTile icon={<Ticket size={17} />} label="Claims to review" value={claims.length} tone="blue" />
              <StatTile icon={<Sparkles size={17} />} label="Potential matches" value={potentialMatches} tone="green" />
              <div className="custody-note"><ShieldCheck size={17} /><span>Public listings are created only through this desk intake.</span></div>
            </section>
            <div className="admin-layout">
              <section className="intake-panel">
                <div className="panel-title-row"><div><div className="section-kicker">PHYSICAL INTAKE</div><h2>Log a found item</h2></div><span className="panel-icon coral"><Plus size={18} /></span></div>
                <p className="panel-description">Record the physical hand-off. New items are public by default; private items stay at the desk.</p>
                <form className="form-stack" onSubmit={handleFoundItem}>
                  <label>Item name<input name="title" required maxLength="100" placeholder="e.g. Navy wireless headphones" /></label>
                  <div className="form-two-col">
                    <label>Category<select name="category" required defaultValue="Electronics">{CATEGORIES.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label>
                    <label>Date found<input name="foundAt" type="datetime-local" /></label>
                  </div>
                  <label>Description<textarea name="description" required rows="3" maxLength="500" placeholder="Color, brand, distinguishing features..." /></label>
                  <label className="photo-picker"><span className="photo-picker-icon"><Camera size={18} /></span><span className="photo-picker-copy"><b>Take or attach an item photo</b><small>Camera-ready · JPEG, PNG, or WebP up to 5 MB</small></span><input name="photo" type="file" accept="image/*" capture="environment" onChange={handlePhotoSelection} /></label>
                  {photoPreview && <div className="photo-preview"><img src={photoPreview} alt="Selected found item" /><button type="button" className="icon-button" aria-label="Remove selected photo" onClick={() => { setPhotoPreview(''); const photoInput = document.querySelector('input[name="photo"]'); if (photoInput) photoInput.value = '' }}><X size={15} /></button></div>}
                  <label>Student feed visibility<select name="visibility" defaultValue="PUBLIC"><option value="PUBLIC">Public · visible to students</option><option value="PRIVATE">Private · desk staff only</option></select></label>
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
                    {lostReports.map((report) => <article className="lost-report review-report" key={report.id}><div className="report-icon"><Laptop size={17} /></div><div className="report-copy"><b>{report.title}</b><span>{report.reporter?.name} · {report.reporter?.email}</span><small>{report.description}</small><small className="report-last-seen">Last seen: {report.location}</small></div><div className="report-review-controls"><span className={`report-review-status ${report.reviewStatus === 'REJECTED' ? 'rejected' : report.reviewStatus === 'APPROVED' ? 'approved' : 'pending'}`}>{report.reviewStatus || 'PENDING'}</span>{(!report.reviewStatus || report.reviewStatus === 'PENDING') && <><button className="review-action approve" type="button" onClick={() => openReportReview(report)}>Review &amp; approve</button><button className="review-action reject" type="button" onClick={() => rejectLostReport(report)}>Reject</button></>}</div>{report.potentialMatches?.length > 0 && <span className="match-count"><Sparkles size={13} /> {report.potentialMatches.length} match</span>}</article>)}
                    {lostReports.length === 0 && <p className="muted-empty">No open lost reports right now.</p>}
                  </div>
                </section>
              </div>
            </div>
            </> : <AdminHistoryPage history={adminHistory} />}
          </>
        )}
      </main>

      {modal && <Modal title={modal === 'claim' ? 'Claim this item' : modal === 'review-lost' ? 'Review lost report' : 'Report a lost item'} subtitle={modal === 'claim' ? `Tell us how to verify your ${selectedItem?.title}.` : modal === 'review-lost' ? 'Review the student submission, update any details, then approve it for the private campus register.' : 'Give campus staff the details they need to identify a match.'} onClose={() => { setModal(null); setSelectedReport(null) }}>
        {modal === 'claim' ? (
          <form className="form-stack modal-form" onSubmit={handleClaim}>
            <label>Your name<input name="studentName" required maxLength="100" autoComplete="name" defaultValue={session.name} placeholder="Full name" /></label>
            <div className="form-two-col"><label>College email<input name="email" type="email" required defaultValue={studentEmail} autoComplete="email" placeholder="you@college.edu" /></label><label>Roll number<input name="rollNo" required maxLength="40" defaultValue={session.rollNo} placeholder="e.g. 24CS018" /></label></div>
            <label>Proof of ownership<textarea name="proofNote" required rows="3" maxLength="500" placeholder="Describe a detail only the owner would know..." /></label>
            <div className="privacy-hint"><KeyRound size={15} /> Keep unique details private. The desk will ask for them in person.</div>
            <button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? 'Creating claim...' : 'Create claim ticket'} <ArrowRight size={16} /></button>
          </form>
        ) : modal === 'review-lost' ? (
          <form className="form-stack modal-form" onSubmit={handleApproveLostReport}>
            <div className="review-requester"><UserRound size={15} /><span><b>{selectedReport?.reporter?.name}</b><small>{selectedReport?.reporter?.email} · Roll {selectedReport?.reporter?.rollNo}</small></span></div>
            <label>Item name<input name="title" required maxLength="100" defaultValue={selectedReport?.title || ''} /></label>
            <div className="form-two-col"><label>Category<select name="category" defaultValue={selectedReport?.category || 'Other'}>{CATEGORIES.slice(1).map((option) => <option key={option}>{option}</option>)}</select></label><label>Last seen near<input name="location" required defaultValue={selectedReport?.location || ''} /></label></div>
            <label>Description<textarea name="description" required rows="3" maxLength="500" defaultValue={selectedReport?.description || ''} /></label>
            <div className="privacy-hint"><ShieldCheck size={15} /> Approved reports remain private to campus staff and do not appear in the student found feed.</div>
            <button className="button button-dark submit-button" type="submit" disabled={busy}>{busy ? 'Saving review...' : 'Approve & save report'} <Check size={15} /></button>
          </form>
        ) : (
          <form className="form-stack modal-form" onSubmit={handleLostReport}>
            <div className="form-two-col"><label>Your name<input name="name" required maxLength="100" defaultValue={session.name} placeholder="Full name" /></label><label>College email<input name="email" type="email" required defaultValue={studentEmail} placeholder="you@college.edu" /></label></div>
            <label>Roll number<input name="rollNo" required maxLength="40" defaultValue={session.rollNo} placeholder="e.g. 24CS018" /></label>
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

function LoginPage({ onSignIn }) {
  const [role, setRole] = useState('student')

  function handleSubmit(event) {
    event.preventDefault()
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    if (role === 'student') {
      onSignIn('student', { name: values.name, email: values.email, rollNo: values.rollNo })
    } else {
      onSignIn('admin', { name: values.operatorName, station: values.station })
    }
  }

  return (
    <div className="login-shell">
      <header className="login-topbar"><a className="brand" href="#login"><span className="brand-mark"><ArrowDownLeft size={21} strokeWidth={2.6} /></span><span>campus<span className="brand-light">loop</span></span></a><span className="login-campus-label"><ShieldCheck size={15} /> CAMPUS LOST &amp; FOUND</span></header>
      <main className="login-layout" id="login">
        <section className="login-visual"><div className="eyebrow"><span className="eyebrow-line" /> RETURN TO RIGHTFUL OWNERS</div><h1>Good things<br />find their <em>way back.</em></h1><p>Verified campus finds, securely held at the desk until they’re home again.</p><div className="login-art" aria-hidden="true"><span className="login-art-ring ring-a" /><span className="login-art-ring ring-b" /><span className="login-art-sun" /><div className="login-art-tag"><PackageCheck size={32} /><span>SAFE AT THE DESK</span></div><span className="login-art-note">CAMPUS CUSTODY · 01</span></div></section>
        <section className="login-panel"><div className="section-kicker">WELCOME TO CAMPUS LOOP</div><h2>Sign in to continue</h2><p className="login-subtitle">Choose your campus role to open the right workspace.</p>
          <div className="login-role-options" role="group" aria-label="Choose a campus role">
            <button type="button" className={role === 'student' ? 'login-role selected' : 'login-role'} onClick={() => setRole('student')} aria-pressed={role === 'student'}><UserRound size={18} /><span><b>Student</b><small>Find items and track claims</small></span><span className="role-radio" /></button>
            <button type="button" className={role === 'admin' ? 'login-role selected' : 'login-role'} onClick={() => setRole('admin')} aria-pressed={role === 'admin'}><ShieldCheck size={18} /><span><b>Campus desk</b><small>Manage custody and hand-offs</small></span><span className="role-radio" /></button>
          </div>
          <form className="form-stack login-form" onSubmit={handleSubmit}>
            {role === 'student' ? <>
              <label>Full name<input name="name" required autoComplete="name" maxLength="100" placeholder="Your name" /></label>
              <label>College email<input name="email" required type="email" autoComplete="email" placeholder="you@college.edu" /></label>
              <label>Roll number<input name="rollNo" required maxLength="40" placeholder="e.g. 24CS018" /></label>
            </> : <>
              <label>Desk operator name<input name="operatorName" required autoComplete="name" maxLength="100" placeholder="Staff name" /></label>
              <label>Desk location<select name="station" defaultValue="Main campus security"><option>Main campus security</option><option>Student administration</option><option>Library security desk</option><option>Other campus desk</option></select></label>
            </>}
            <button className="button button-dark submit-button" type="submit">Continue as {role === 'student' ? 'student' : 'desk staff'} <ArrowRight size={16} /></button>
          </form>
          <p className="login-demo-note"><KeyRound size={14} /> Prototype role selection. Connect campus authentication before deployment.</p>
        </section>
      </main>
    </div>
  )
}

function StudentHistoryPage({ history, session, onReportLost }) {
  const activity = [
    ...history.lostReports.map((report) => ({ ...report, recordType: 'Lost report', recordId: report.id })),
    ...history.claims.map((claim) => ({ ...claim, recordType: 'Claim request', recordId: claim.id, title: claim.itemTitle })),
  ].sort((first, second) => (second.createdAt || '').localeCompare(first.createdAt || ''))

  return (
    <section className="history-page">
      <div className="history-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> YOUR CAMPUS ACTIVITY</div><h1>My history<span className="heading-period">.</span></h1><p>Lost reports and item claims linked to {session.email}.</p></div><button className="button button-dark" type="button" onClick={onReportLost}><Plus size={15} /> Report lost item</button></div>
      <div className="history-summary"><div><span>Lost reports</span><b>{history.lostReports.length}</b></div><div><span>Claim requests</span><b>{history.claims.length}</b></div><div><span>Items returned</span><b>{history.claims.filter((claim) => claim.status === 'VERIFIED').length}</b></div></div>
      <div className="history-record-list">
        {activity.map((record) => {
          const claimPending = record.recordType === 'Claim request' && record.status === 'PENDING'
          const label = record.recordType === 'Lost report'
            ? record.reviewStatus === 'APPROVED' ? 'Approved' : record.reviewStatus === 'REJECTED' ? 'Rejected' : 'Under review'
            : record.status === 'VERIFIED' ? 'Returned' : record.status === 'CLOSED' ? 'Closed' : 'At desk'
          return <article className="history-record" key={record.recordId}>
            <div className={`history-record-icon ${record.recordType === 'Lost report' ? 'blue' : 'green'}`}>{record.recordType === 'Lost report' ? <Search size={17} /> : <Ticket size={17} />}</div>
            <div className="history-record-main"><div className="history-record-meta"><span>{record.recordType}</span><span className="meta-dot" />{formatDate(record.createdAt)}</div><h3>{record.title || 'Found item claim'}</h3><p>{record.recordType === 'Lost report' ? record.description : `Claim submitted for ${record.itemTitle || record.title || 'a found item'}. ${record.proofNote ? `Proof: ${record.proofNote}` : ''}`}</p><small><MapPin size={12} /> {record.location || record.itemLocation || 'Campus desk'}</small>{claimPending && <div className="history-otp"><span>Active hand-off OTP</span><b>{record.otp}</b></div>}</div>
            <span className={`history-status ${statusTone(record.reviewStatus || record.status)}`}>{label}</span>
          </article>
        })}
        {activity.length === 0 && <EmptyState title="Your history starts here" text="When you report a lost item or claim a verified find, it will be saved to this list." icon={<History size={21} />} />}
      </div>
    </section>
  )
}

function AdminHistoryPage({ history }) {
  return (
    <section className="history-page admin-history-page">
      <div className="history-page-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> CUSTODY REGISTER</div><h1>Campus history<span className="heading-period">.</span></h1><p>Every reported, received, claimed, and released item in the local desk record.</p></div><div className="history-total"><b>{history.items.length}</b><span>total records</span></div></div>
      <div className="admin-history-layout"><div className="admin-history-items">
        {history.items.map((item) => <article className="admin-history-record" key={item.id}>
          <div className={`admin-history-thumb ${artTone(item.category)}`}>{item.photoUrl ? <img src={item.photoUrl} alt="" /> : <CategoryGlyph category={item.category} size={20} />}</div>
          <div className="admin-history-record-body"><div className="history-record-meta"><span>{item.type === 'FOUND' ? 'Desk intake' : 'Student lost report'}</span><span className="meta-dot" />{item.category}<span className="meta-dot" />{formatDate(item.createdAt)}</div><div className="admin-history-title"><h3>{item.title}</h3><span className={`visibility-label ${(item.visibility || 'PUBLIC') === 'PRIVATE' ? 'private' : 'public'}`}>{item.type === 'LOST' ? item.reviewStatus || 'PENDING' : item.visibility || 'PUBLIC'}</span><span className={`history-status ${statusTone(item.reviewStatus || item.status)}`}>{item.type === 'LOST' ? item.reviewStatus || 'PENDING' : item.status === 'RESOLVED' ? 'Resolved' : 'Open'}</span></div><p>{item.description}</p><div className="admin-history-details"><span><MapPin size={12} /> {item.location || 'Location not recorded'}</span>{item.shelf && <span><Box size={12} /> {item.shelf}</span>}{item.reporter && <span><UserRound size={12} /> Reported by {item.reporter.name} · {item.reporter.email}</span>}</div>
            {item.releasedTo && <div className="release-record"><CheckCircle2 size={15} /><span><b>Handed over to {item.releasedTo.name}</b><small>{item.releasedTo.email} · Roll {item.releasedTo.rollNo} · {formatDate(item.resolvedAt)}</small></span></div>}
            {item.type === 'FOUND' && item.claims?.length > 0 && <details className="claim-history"><summary><ClipboardList size={14} /> {item.claims.length} claim record{item.claims.length === 1 ? '' : 's'}</summary>{item.claims.map((claim) => <div className="claim-history-row" key={claim.id}><b>{claim.studentName}</b><span>{claim.email} · {claim.rollNo} · {claim.status}</span><small>Proof: {claim.proofNote}</small></div>)}</details>}
            {item.adminSecretNote && <div className="secret-note history-secret"><KeyRound size={13} /><span><b>Desk verification note</b>{item.adminSecretNote}</span></div>}
          </div>
        </article>)}
        {history.items.length === 0 && <EmptyState title="No campus records yet" text="Desk intakes and student reports will build this register." icon={<ClipboardList size={21} />} />}
      </div><aside className="audit-timeline"><div className="section-kicker">AUDIT TRAIL</div><h2>Recent activity</h2><div className="audit-event-list">{history.events.map((event) => <div className="audit-event" key={event.id}><span className="audit-event-dot" /><div><b>{auditLabel(event.type)}</b><p>{event.summary}</p><small>{event.actor} · {formatDate(event.timestamp)}</small></div></div>)}{history.events.length === 0 && <p className="muted-empty">Activity will appear here as the desk works cases.</p>}</div></aside></div>
    </section>
  )
}

function statusTone(status = '') {
  if (status === 'VERIFIED' || status === 'RESOLVED' || status === 'APPROVED') return 'status-done'
  if (status === 'CLOSED' || status === 'REJECTED') return 'status-closed'
  return 'status-open'
}

function auditLabel(type = '') {
  return ({ ITEM_INTAKED: 'Found item logged', LOST_REPORTED: 'Lost item reported', LOST_REPORT_APPROVED: 'Lost report approved', LOST_REPORT_REJECTED: 'Lost report rejected', CLAIM_CREATED: 'Claim requested', ITEM_RELEASED: 'Item released', CASE_CLOSED: 'Case closed' })[type] || 'Record updated'
}

function FoundItemCard({ item, onClaim }) {
  return (
    <article className="found-card">
      <div className={`item-art ${artTone(item.category)}`}>{item.photoUrl ? <img className="item-photo" src={item.photoUrl} alt={item.title} /> : <span className="item-category-icon"><CategoryGlyph category={item.category} size={25} strokeWidth={1.7} /></span>}<span className="verified-pill"><BadgeCheck size={13} /> Desk verified</span><span className="art-index">#{String(item.id).slice(-4).toUpperCase()}</span></div>
      <div className="found-card-body"><div className="item-meta"><span>{item.category}</span><span className="meta-dot" />{formatDate(item.foundAt || item.createdAt)}</div><h3>{item.title}</h3><p className="item-description">{item.description}</p><div className="item-location"><MapPin size={14} /><span>{item.location}</span></div><div className="found-card-footer"><span className="shelf-ref"><Box size={13} /> {item.shelf}</span><button className="claim-button" type="button" onClick={onClaim}>Claim item <ArrowRight size={14} /></button></div></div>
    </article>
  )
}

function DeskItem({ item, claims, otp, result, onOtpChange, onVerify, onClose }) {
  return (
    <article className="desk-item">
      <div className="desk-item-top"><div className={`desk-item-icon ${artTone(item.category)}`}>{item.photoUrl ? <img src={item.photoUrl} alt="" /> : <CategoryGlyph category={item.category} size={19} />}</div><div className="desk-item-summary"><h3>{item.title}</h3><span>{item.category} <span className="meta-dot" /> {item.location}</span></div><span className="desk-status"><span /> OPEN</span></div>
      <div className="desk-item-details"><span><Clock3 size={13} /> {formatDate(item.createdAt)}</span><span><Box size={13} /> {item.shelf}</span><span className={`visibility-label ${(item.visibility || 'PUBLIC') === 'PRIVATE' ? 'private' : 'public'}`}>{item.visibility || 'PUBLIC'}</span></div>
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
