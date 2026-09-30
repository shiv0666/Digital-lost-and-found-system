import React, { useEffect, useState } from 'react'
import { ArrowRight, LockKeyhole, PackagePlus, Search, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { api, message } from '../../services/api'
import './ItemPrivacy.css'

const today = () => new Date().toISOString().slice(0, 10)
const blankItem = () => ({ title: '', category: '', description: '', date: today(), location: '', additional_details: '', image_url: null, type: 'FOUND', visibility: 'PRIVATE', verification_details: '' })
const blankClaim = () => ({ student_id: '', proof_text: '', identifying_details: '', contents_details: '', additional_proof: '' })

export default function ItemPrivacy() {
  const [items, setItems] = useState([])
  const [users, setUsers] = useState([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(null)
  const [privacy, setPrivacy] = useState({ visibility: 'PUBLIC', verification_details: '' })
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(blankItem)
  const [file, setFile] = useState(null)
  const [claim, setClaim] = useState(blankClaim)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load(q = query) {
    try {
      const [itemResponse, userResponse] = await Promise.all([
        api.get('/admin/items', { params: { q } }),
        api.get('/admin/users'),
      ])
      setItems(itemResponse.data)
      setUsers(userResponse.data.filter(user => user.role === 'STUDENT'))
      if (selected) {
        const updated = itemResponse.data.find(item => item.id === selected.id)
        if (updated) setSelected(updated)
      }
      setError('')
    } catch (err) { setError(message(err)) }
  }

  useEffect(() => { load('') }, [])

  function choose(item) {
    setCreating(false)
    setSelected(item)
    setPrivacy({ visibility: item.visibility, verification_details: item.verification_details || '' })
    setClaim(blankClaim())
    setError('')
    setNotice('')
  }

  async function createItem(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      let image_url = form.image_url
      if (file) {
        const upload = new FormData()
        upload.append('file', file)
        image_url = (await api.post('/uploads', upload)).data.url
      }
      const response = await api.post('/admin/items', { ...form, image_url })
      setCreating(false)
      setForm(blankItem())
      setFile(null)
      await load('')
      choose(response.data)
      setNotice('Item created. Private items stay out of student browse and search.')
    } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }

  async function savePrivacy(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await api.put(`/admin/items/${selected.id}/privacy`, privacy)
      setSelected({ ...selected, ...response.data })
      await load()
      setNotice('Visibility and verification details saved.')
    } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }

  async function createPrivateClaim(event) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      await api.post(`/admin/items/${selected.id}/private-claims`, { ...claim, student_id: Number(claim.student_id) })
      setClaim(blankClaim())
      setNotice('Private verification recorded. Review the claim in Pending Claims.')
    } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }

  return <>
    <div className="page-heading"><div><span className="eyebrow">ADMIN ONLY</span><h1>Item privacy</h1><p>Create sensitive listings, search all items, and verify ownership privately.</p></div><button className="btn primary" onClick={() => { setCreating(true); setSelected(null); setError(''); setNotice('') }}><PackagePlus size={17}/> Create item</button></div>
    {error && <div className="error-box">{error}</div>}
    {notice && <div className="toast"><ShieldCheck size={18}/>{notice}<button onClick={() => setNotice('')}>×</button></div>}
    <div className="privacy-layout">
      <section className="panel privacy-list">
        <form className="search-field" onSubmit={event => { event.preventDefault(); load(query) }}><Search size={18}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search all items and private details"/><button className="mini-btn" type="submit">Search</button></form>
        <p className="results-caption">{items.length} items · Admin view includes private listings</p>
        {items.map(item => <button key={item.id} type="button" className={`privacy-item ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => choose(item)}><span className="privacy-item-icon">{item.visibility === 'PRIVATE' ? <LockKeyhole size={20}/> : <PackagePlus size={20}/>}</span><span className="privacy-item-text"><strong>{item.title}</strong><small>{item.type} · {item.location} · {item.reporter_name}</small></span><span className={`badge badge-${item.visibility.toLowerCase()}`}>{item.visibility}</span></button>)}
        {!items.length && <div className="empty"><h3>No matching items</h3><p>Try another title, location, or verification detail.</p></div>}
      </section>

      {creating ? <form className="panel form-panel" onSubmit={createItem}>
        <span className="eyebrow">NEW ADMIN ITEM</span><h2>Create an item</h2><p className="muted">Admin-created items are approved immediately. Choose private for valuables or sensitive details.</p>
        <div className="form-grid">
          <label>Item name<input required minLength="2" value={form.title} onChange={event => setForm({ ...form, title: event.target.value })}/></label>
          <label>Type<select value={form.type} onChange={event => setForm({ ...form, type: event.target.value })}><option value="FOUND">FOUND</option><option value="LOST">LOST</option></select></label>
          <label>Category<select required value={form.category} onChange={event => setForm({ ...form, category: event.target.value })}><option value="">Select a category</option>{['Electronics','Bags','Books','Documents','Accessories','Clothing','Personal','Other'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Date<input required type="date" max={today()} value={form.date} onChange={event => setForm({ ...form, date: event.target.value })}/></label>
          <label className="span-2">Location<input required value={form.location} onChange={event => setForm({ ...form, location: event.target.value })}/></label>
          <label className="span-2">Description<textarea required minLength="10" rows="3" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label>
          <label className="span-2">Additional details<textarea rows="2" value={form.additional_details} onChange={event => setForm({ ...form, additional_details: event.target.value })}/></label>
          <label>Visibility<select value={form.visibility} onChange={event => setForm({ ...form, visibility: event.target.value })}><option value="PUBLIC">PUBLIC</option><option value="PRIVATE">PRIVATE</option></select></label>
          <label>Item image <span className="optional">Optional</span><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => setFile(event.target.files[0])}/></label>
          <label className="span-2">Private verification information <span className="optional">Admin only</span><textarea rows="4" placeholder="Unique marks, engravings, design details..." value={form.verification_details} onChange={event => setForm({ ...form, verification_details: event.target.value })}/></label>
        </div><div className="form-actions"><button type="button" className="btn light" onClick={() => setCreating(false)}>Cancel</button><button className="btn primary" disabled={busy}>{busy ? 'Creating...' : 'Create item'}</button></div>
      </form> : selected ? <div className="privacy-manage">
        <form className="panel form-panel" onSubmit={savePrivacy}><span className="eyebrow">MANAGE ITEM #{selected.id}</span><h2>{selected.title}</h2><p className="muted">{selected.type} · {selected.status} · {selected.location}</p><label>Visibility<select value={privacy.visibility} onChange={event => setPrivacy({ ...privacy, visibility: event.target.value })}><option value="PUBLIC">PUBLIC</option><option value="PRIVATE">PRIVATE</option></select></label><label>Private verification information <span className="optional">Admin only</span><textarea rows="5" placeholder="Unique marks, engravings, design details..." value={privacy.verification_details} onChange={event => setPrivacy({ ...privacy, verification_details: event.target.value })}/></label><div className="form-actions"><button className="btn primary" disabled={busy}>{busy ? 'Saving...' : 'Save privacy'}</button></div></form>
        {selected.visibility === 'PRIVATE' && selected.status === 'APPROVED' && <form className="panel form-panel" onSubmit={createPrivateClaim}><span className="eyebrow">PRIVATE OWNERSHIP VERIFICATION</span><h2>Record a match</h2><p className="muted">Compare a student's lost report with this item. The resulting claim uses the existing admin approval workflow.</p><label>Student<select required value={claim.student_id} onChange={event => setClaim({ ...claim, student_id: event.target.value })}><option value="">Choose a student</option>{users.map(user => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}</select></label><label>Why this item belongs to the student<textarea required minLength="10" rows="3" value={claim.proof_text} onChange={event => setClaim({ ...claim, proof_text: event.target.value })}/></label><label>Matching identifying features<textarea required minLength="5" rows="3" value={claim.identifying_details} onChange={event => setClaim({ ...claim, identifying_details: event.target.value })}/></label><label>Contents or configuration<textarea rows="2" value={claim.contents_details} onChange={event => setClaim({ ...claim, contents_details: event.target.value })}/></label><label>Additional proof<textarea rows="2" value={claim.additional_proof} onChange={event => setClaim({ ...claim, additional_proof: event.target.value })}/></label><div className="form-actions"><Link className="btn light" to="/admin/claims">Pending Claims <ArrowRight size={16}/></Link><button className="btn primary" disabled={busy}>{busy ? 'Recording...' : 'Record verification'}</button></div></form>}
      </div> : <div className="panel privacy-placeholder"><LockKeyhole size={30}/><h2>Select an item</h2><p>Choose an item to view its privacy setting and admin-only verification information.</p></div>}
    </div>
  </>
}
