import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { amountToWords, formatDate } from '../lib/utils'

// ── Keyboard-navigable combobox ──────────────────────────────
function Combobox({ options, value, onChange, placeholder, allowNew }) {
  const [input, setInput]       = useState('')
  const [open, setOpen]         = useState(false)
  const [cursor, setCursor]     = useState(-1)
  const [adding, setAdding]     = useState(false)
  const [newVal, setNewVal]     = useState('')
  const listRef                 = useRef([])
  const inputRef                = useRef()
  const containerRef            = useRef()

  // Sync display when value changes externally
  useEffect(() => {
    const sel = options.find(o => o.id === value)
    if (sel) setInput(sel.name)
    else if (!value) setInput('')
  }, [value, options])

  const filtered = input
    ? options.filter(o => o.name.toLowerCase().includes(input.toLowerCase()))
    : options

  const totalItems = filtered.length + (allowNew ? 1 : 0)

  function openList() { setOpen(true); setCursor(-1) }

  function selectOption(opt) {
    onChange(opt.id, opt.name)
    setInput(opt.name)
    setOpen(false)
    setAdding(false)
    setCursor(-1)
    // Blur the input so no stale focus keeps dropdown open
    if (inputRef.current) inputRef.current.blur()
  }

  async function commitNew() {
    const name = newVal.trim() || input.trim()
    if (!name) return
    const id = await onChange('__new__', name)
    setInput(name)
    setAdding(false)
    setNewVal('')
    setOpen(false)
  }

  function handleKey(e) {
    if (!open) { if (e.key === 'ArrowDown' || e.key === 'Enter') openList(); return }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => Math.min(c + 1, totalItems - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => Math.max(c - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (cursor >= 0 && cursor < filtered.length) {
        selectOption(filtered[cursor])
      } else if (cursor === filtered.length && allowNew) {
        setAdding(true); setNewVal(input)
      }
    } else if (e.key === 'Escape') {
      setOpen(false); setCursor(-1)
    }
  }

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false); setCursor(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="autocomplete-wrap" ref={containerRef}>
      <input
        ref={inputRef}
        className="form-control"
        placeholder={placeholder}
        value={input}
        autoComplete="off"
        onChange={e => { setInput(e.target.value); setOpen(true); setCursor(-1); onChange('', e.target.value) }}
        onFocus={openList}
        onKeyDown={handleKey}
      />
      {open && (
        <div className="autocomplete-list" style={{zIndex:200}}>
          {filtered.length === 0 && !allowNew && (
            <div className="autocomplete-item" style={{color:'var(--ink-3)',pointerEvents:'none'}}>No matches</div>
          )}
          {filtered.map((o, i) => (
            <div
              key={o.id}
              className="autocomplete-item"
              style={{ background: cursor === i ? 'var(--cream-2)' : '', fontWeight: cursor === i ? 500 : 400 }}
              onMouseDown={e => { e.preventDefault(); selectOption(o) }}
            >
              {o.name}
            </div>
          ))}
          {allowNew && !adding && input.trim() && (
            <div
              className="autocomplete-item"
              style={{ color: 'var(--gold)', fontWeight: 500, background: cursor === filtered.length ? 'var(--cream-2)' : '' }}
              onMouseDown={e => { e.preventDefault(); setAdding(true); setNewVal(input.trim()) }}
            >
              ＋ Add "{input.trim()}"
            </div>
          )}
          {allowNew && adding && (
            <div style={{ padding: '8px 12px', display: 'flex', gap: '6px' }} onMouseDown={e => e.preventDefault()}>
              <input
                className="form-control"
                value={newVal}
                onChange={e => setNewVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitNew(); if (e.key === 'Escape') setAdding(false) }}
                autoFocus
                style={{ fontSize: '12px', padding: '4px 8px' }}
              />
              <button className="btn btn-primary btn-sm" onClick={commitNew}>Add</button>
              <button className="btn btn-outline btn-sm" onClick={() => setAdding(false)}>✕</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Payee autocomplete (free-text + suggestions) ─────────────
function PayeeInput({ payees, value, onChange, onSelect }) {
  const [open, setOpen]     = useState(false)
  const [cursor, setCursor] = useState(-1)
  const containerRef        = useRef()

  const matches = value.length > 0
    ? payees.filter(p => p.company_name.toLowerCase().includes(value.toLowerCase()))
    : []

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  function handleKey(e) {
    if (!open || matches.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setCursor(c => Math.min(c+1, matches.length-1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor(c => Math.max(c-1, 0)) }
    else if (e.key === 'Enter' && cursor >= 0) { e.preventDefault(); onSelect(matches[cursor]); setOpen(false) }
    else if (e.key === 'Escape') setOpen(false)
  }

  return (
    <div className="autocomplete-wrap" ref={containerRef}>
      <input
        className="form-control"
        placeholder="Search existing or type new company…"
        value={value}
        autoComplete="off"
        onChange={e => { onChange(e.target.value); setOpen(true); setCursor(-1) }}
        onFocus={() => value.length > 0 && setOpen(true)}
        onKeyDown={handleKey}
      />
      {open && matches.length > 0 && (
        <div className="autocomplete-list" style={{zIndex:200}}>
          {matches.map((p, i) => (
            <div
              key={p.id}
              className="autocomplete-item"
              style={{ background: cursor === i ? 'var(--cream-2)' : '' }}
              onMouseDown={e => { e.preventDefault(); onSelect(p); setOpen(false) }}
            >
              {p.company_name}
              {p.bank_name && <div className="sub">{p.bank_name} · {p.bank_account}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main form ─────────────────────────────────────────────────
export default function NewApplication() {
  const { user, profile } = useAuth()
  const navigate           = useNavigate()
  const [searchParams]     = useSearchParams()
  const editId             = searchParams.get('edit')
  const isEditing          = !!editId
  const submittingRef      = useRef(false)

  const [companies,       setCompanies]       = useState([])
  const [paymentMethods,  setPaymentMethods]  = useState([])
  const [paymentReasons,  setPaymentReasons]  = useState([])
  const [payees,          setPayees]          = useState([])
  const [banks,           setBanks]           = useState([])

  const emptyForm = {
    company_id: '', payment_reason_id: '', payment_reason_text: '',
    payment_method_id: '', payment_method_text: '',
    amount: '', amount_words: '',
    payee_name: '', bank_id: '', bank_name: '', bank_account: '', remarks: '',
  }
  const [form, setForm]               = useState(emptyForm)
  const [savedForm, setSavedForm]     = useState(null)   // for back-navigation restore
  const [existingAtt, setExistingAtt] = useState(null)
  const [attachment, setAttachment]   = useState(null)
  const [attLabel, setAttLabel]       = useState('')
  const [attError, setAttError]       = useState('')
  const [loading, setLoading]         = useState(false)
  const [savingDraft, setSavingDraft] = useState(false)
  const [pageLoading, setPageLoading] = useState(true)
  const [error, setError]             = useState('')
  const [outcomeNote, setOutcomeNote] = useState('')

  // Persist form to sessionStorage so back-navigation restores it
  useEffect(() => {
    const key = `pa_form_${editId||'new'}`
    const stored = sessionStorage.getItem(key)
    if (stored && !editId) {
      try { setForm(JSON.parse(stored)) } catch {}
    }
  }, [])

  useEffect(() => {
    const key = `pa_form_${editId||'new'}`
    sessionStorage.setItem(key, JSON.stringify(form))
  }, [form])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setPageLoading(true)
    const [{ data: co }, { data: pm }, { data: pr }, { data: py }, { data: bk }, appResult] =
      await Promise.all([
        supabase.from('companies').select('*').eq('active', true).order('name'),
        supabase.from('payment_methods').select('*').eq('active', true).order('name'),
        supabase.from('payment_reasons').select('*').eq('active', true).order('name'),
        supabase.from('payees').select('*').order('last_used_at', { ascending: false }),
        supabase.from('banks').select('*').eq('active', true).order('name'),
        editId
          ? supabase.from('applications_full').select('*').eq('id', editId).single()
          : Promise.resolve({ data: null }),
      ])

    // Filter companies to only ones assigned to this user
    const { data: myCompanyIds } = await supabase
      .from('user_companies')
      .select('company_id')
      .eq('user_id', user.id)
    const allowed = new Set((myCompanyIds || []).map(r => r.company_id))
    const filteredCo = (co || []).filter(c => allowed.has(c.id))

    setCompanies(filteredCo)
    setPaymentMethods(pm || [])
    setPaymentReasons(pr || [])
    setPayees(py || [])
    setBanks(bk || [])

    // Smart default payment method (most used by this user)
    if (!editId) {
      const { data: hist } = await supabase
        .from('applications')
        .select('payment_method_id')
        .eq('submitted_by', user.id)
        .not('payment_method_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20)
      if (hist && hist.length > 0) {
        const freq = {}
        hist.forEach(h => { freq[h.payment_method_id] = (freq[h.payment_method_id] || 0) + 1 })
        const topId = Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]
        const topMethod = (pm || []).find(m => m.id === topId)
        if (topMethod) {
          setForm(f => ({ ...f, payment_method_id: topId, payment_method_text: topMethod.name }))
        }
      }
      // Auto-select company if only one assigned
      if (filteredCo.length === 1) {
        setForm(f => ({ ...f, company_id: filteredCo[0].id }))
      }
    }

    const app = appResult?.data
    if (app) {
      const method = (pm || []).find(m => m.id === app.payment_method_id)
      const bank   = (bk || []).find(b => b.name === app.bank_name)
      // Match payment reason text back to its ID in the lookup list
      const reason = (pr || []).find(r =>
        r.name.toLowerCase() === (app.payment_reason || '').toLowerCase()
      )
      setForm({
        company_id:          app.company_id || '',
        payment_reason_id:   reason?.id || '',
        payment_reason_text: app.payment_reason || '',
        payment_method_id:   app.payment_method_id || '',
        payment_method_text: method?.name || app.payment_method_name || '',
        amount:              app.amount?.toString() || '',
        amount_words:        app.amount_words || '',
        payee_name:          app.payee_name || '',
        bank_id:             bank?.id || '',
        bank_name:           app.bank_name || '',
        bank_account:        app.bank_account || '',
        remarks:             app.remarks || '',
      })
      setOutcomeNote(app.outcome_note || '')
      if (app.attachment_name) setExistingAtt({ name: app.attachment_name, path: app.attachment_path })
    }
    setPageLoading(false)
  }

  function set(field, value) {
    setForm(f => {
      const u = { ...f, [field]: value }
      if (field === 'amount') u.amount_words = amountToWords(parseFloat(value))
      return u
    })
  }

  function handleFile(e) {
    const file = e.target.files[0]
    setAttError(''); setAttLabel('')
    if (!file) return
    if (!['application/pdf','image/jpeg','image/png'].includes(file.type)) {
      setAttError('Only PDF, JPG and PNG'); e.target.value = ''; return
    }
    if (file.size > 5*1024*1024) {
      setAttError('File must be under 5MB'); e.target.value = ''; return
    }
    setAttLabel(`${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`)
    setAttachment(file)
  }

  // Add-new handlers return the new ID
  async function addReason(name) {
    const { data } = await supabase.from('payment_reasons').insert({ name, added_by: user.id }).select().single()
    if (data) setPaymentReasons(r => [...r, data])
    return data?.id
  }
  async function addMethod(name) {
    const { data } = await supabase.from('payment_methods').insert({ name, added_by: user.id }).select().single()
    if (data) setPaymentMethods(m => [...m, data])
    return data?.id
  }
  async function addBank(name) {
    const { data } = await supabase.from('banks').insert({ name }).select().single()
    if (data) setBanks(b => [...b, data])
    return data?.id
  }

  async function upsertPayee(bankName) {
    if (!form.payee_name.trim()) return null
    const existing = payees.find(p => p.company_name.toLowerCase() === form.payee_name.trim().toLowerCase())
    if (existing) {
      await supabase.from('payees').update({ bank_name: bankName, bank_account: form.bank_account }).eq('id', existing.id)
      return existing.id
    }
    const { data } = await supabase.from('payees')
      .insert({ company_name: form.payee_name.trim(), bank_name: bankName, bank_account: form.bank_account })
      .select().single()
    return data?.id || null
  }

  async function uploadAttachment(appId) {
    if (!attachment) return { path: null, name: null }
    const ext = attachment.name.split('.').pop()
    const path = `${user.id}/${appId}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, attachment)
    if (error) throw error
    return { path, name: attachment.name }
  }

  async function submit(asDraft = false) {
    if (submittingRef.current) return
    setError('')
    if (!asDraft) {
      if (!form.company_id)               return setError('Please select a company')
      if (!form.payment_reason_text.trim()) return setError('Payment reason is required')
      if (!form.amount || parseFloat(form.amount) <= 0) return setError('Please enter a valid amount')
    }
    submittingRef.current = true
    asDraft ? setSavingDraft(true) : setLoading(true)
    try {
      const bankName = banks.find(b => b.id === form.bank_id)?.name || form.bank_name
      const payee_id = form.payee_name.trim() ? await upsertPayee(bankName) : null
      const payload = {
        company_id:        form.company_id || null,
        payment_method_id: form.payment_method_id || null,
        payee_id,
        payment_reason:    form.payment_reason_text,
        amount:            parseFloat(form.amount) || 0,
        amount_words:      form.amount_words,
        bank_name:         bankName,
        bank_account:      form.bank_account,
        remarks:           form.remarks,
        status:            asDraft ? 'draft' : 'pending',
        outcome_note:      null,
        submitted_at:      asDraft ? null : new Date().toISOString(),
      }
      let appId = editId
      if (isEditing) {
        const { error: e } = await supabase.from('applications').update(payload).eq('id', editId)
        if (e) throw e
      } else {
        payload.submitted_by = user.id
        const { data: app, error: e } = await supabase.from('applications').insert(payload).select().single()
        if (e) throw e
        appId = app.id
      }
      if (attachment) {
        const { path, name } = await uploadAttachment(appId)
        await supabase.from('applications').update({ attachment_path: path, attachment_name: name }).eq('id', appId)
      }
      await supabase.from('audit_log').insert({
        application_id: appId, action_by: user.id,
        action:  isEditing ? 'submitted' : (asDraft ? 'created' : 'submitted'),
        note:    isEditing && !asDraft ? 'Resubmitted after corrections' : asDraft ? 'Saved as draft' : 'Application submitted',
      })
      // Clear session storage on success
      sessionStorage.removeItem(`pa_form_${editId||'new'}`)
      navigate('/my-applications')
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      submittingRef.current = false
      setLoading(false); setSavingDraft(false)
    }
  }

  if (pageLoading) return <div className="empty-state"><p>Loading…</p></div>

  const today = formatDate(new Date().toISOString())

  return (
    <div>
      <div className="page-header">
        <h1>{isEditing ? 'Edit Application' : 'New Payment Application'}</h1>
        <p>付款申请单 · {today}</p>
      </div>

      {isEditing && outcomeNote && (
        <div className="alert alert-warning" style={{marginBottom:'20px'}}>
          <strong>↩ Returned with this note:</strong> {outcomeNote}
          <div style={{marginTop:'6px',fontSize:'12px'}}>Please make the necessary corrections and resubmit.</div>
        </div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="card-header">
          <h2>{isEditing ? 'Correct & Resubmit' : 'Application Details'}</h2>
          <span className="text-sm text-muted">Fields marked <span style={{color:'#dc2626'}}>*</span> are required</span>
        </div>
        <div className="card-body">

          {/* Company + Applicant */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">申请部门 <span className="cn">Company</span><span className="required">*</span></label>
              <select className="form-control" value={form.company_id} onChange={e => set('company_id', e.target.value)}>
                <option value="">Select company…</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">申请人 <span className="cn">Applicant</span></label>
              <input className="form-control" value={profile?.full_name || ''} readOnly />
            </div>
          </div>

          {/* Payment Reason */}
          <div className="form-group">
            <label className="form-label">付款事由 <span className="cn">Payment Reason</span><span className="required">*</span></label>
            <Combobox
              options={paymentReasons}
              value={form.payment_reason_id}
              placeholder="Type or select reason… (↑↓ to navigate, Enter to select)"
              allowNew
              onChange={async (id, name) => {
                if (id === '__new__') {
                  const newId = await addReason(name)
                  setForm(f => ({ ...f, payment_reason_id: newId || '', payment_reason_text: name }))
                  return newId
                }
                setForm(f => ({ ...f, payment_reason_id: id, payment_reason_text: name || f.payment_reason_text }))
              }}
            />
          </div>

          {/* Payment Method */}
          <div className="form-group">
            <label className="form-label">付款方式 <span className="cn">Payment Method</span></label>
            <Combobox
              options={paymentMethods}
              value={form.payment_method_id}
              placeholder="Type or select method… (↑↓ to navigate)"
              allowNew
              onChange={async (id, name) => {
                if (id === '__new__') {
                  const newId = await addMethod(name)
                  setForm(f => ({ ...f, payment_method_id: newId || '', payment_method_text: name }))
                  return newId
                }
                setForm(f => ({ ...f, payment_method_id: id, payment_method_text: name || f.payment_method_text }))
              }}
            />
            <p className="form-hint">💡 Pre-selected based on your most-used method</p>
          </div>

          {/* Amount */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">付款金额 <span className="cn">Amount (AED)</span><span className="required">*</span></label>
              <input className="form-control" type="number" step="0.01" min="0" placeholder="0.00"
                value={form.amount} onChange={e => set('amount', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">大写金额 <span className="cn">Amount in Words</span></label>
              <input className="form-control" value={form.amount_words} readOnly placeholder="Auto-filled" />
            </div>
          </div>

          {/* Receiving Company */}
          <div className="form-group">
            <label className="form-label">收款单位 <span className="cn">Receiving Company</span></label>
            <PayeeInput
              payees={payees}
              value={form.payee_name}
              onChange={val => set('payee_name', val)}
              onSelect={p => {
                const bk = banks.find(b => b.name === p.bank_name)
                setForm(f => ({
                  ...f,
                  payee_name:   p.company_name,
                  bank_id:      bk?.id || '',
                  bank_name:    p.bank_name || '',
                  bank_account: p.bank_account || '',
                }))
              }}
            />
          </div>

          {/* Bank + Account */}
          <div className="form-row">
            <div className="form-group">
              <label className="form-label">开户银行 <span className="cn">Bank</span></label>
              <Combobox
                options={banks}
                value={form.bank_id}
                placeholder="Type or select bank…"
                allowNew
                onChange={async (id, name) => {
                  if (id === '__new__') {
                    const newId = await addBank(name)
                    setForm(f => ({ ...f, bank_id: newId || '', bank_name: name }))
                    return newId
                  }
                  const bname = banks.find(b => b.id === id)?.name || name || ''
                  setForm(f => ({ ...f, bank_id: id, bank_name: bname }))
                }}
              />
            </div>
            <div className="form-group">
              <label className="form-label">银行账号 <span className="cn">Account / IBAN</span></label>
              <input className="form-control" placeholder="IBAN or account number"
                value={form.bank_account} onChange={e => set('bank_account', e.target.value)} />
            </div>
          </div>

          {/* Remarks */}
          <div className="form-group">
            <label className="form-label">备注说明 <span className="cn">Remarks</span></label>
            <textarea className="form-control" placeholder="Unit numbers, references, additional notes…"
              value={form.remarks} onChange={e => set('remarks', e.target.value)} />
          </div>

          {/* Attachment */}
          <div className="form-group">
            <label className="form-label">Supporting Document <span className="cn">附件</span></label>
            {existingAtt && (
              <div className="alert alert-info" style={{marginBottom:'8px'}}>
                Current: <strong>{existingAtt.name}</strong> — upload below to replace
              </div>
            )}
            <input type="file" className="form-control" accept=".pdf,.jpg,.jpeg,.png"
              onChange={handleFile} style={{padding:'7px'}} />
            {attLabel && <p className="form-hint" style={{color:'var(--status-approved)'}}>✓ {attLabel}</p>}
            {attError && <p className="form-error">{attError}</p>}
            <p className="form-hint">PDF, JPG or PNG · Max 5MB · Optional</p>
          </div>

          <hr className="divider" />

          <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
            <button className="btn btn-outline" onClick={() => { sessionStorage.removeItem(`pa_form_${editId||'new'}`); navigate('/my-applications') }}>
              Cancel
            </button>
            {!isEditing && (
              <button className="btn btn-outline" onClick={() => submit(true)} disabled={savingDraft || loading}>
                {savingDraft ? 'Saving…' : '💾 Save as Draft'}
              </button>
            )}
            <button className="btn btn-primary" onClick={() => submit(false)} disabled={loading || savingDraft}>
              {loading ? 'Submitting…' : isEditing ? '→ Resubmit' : '→ Submit Application'}
            </button>
          </div>

        </div>
      </div>
    </div>
  )
}
