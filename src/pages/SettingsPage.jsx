import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

// ── Usage bar component ──────────────────────────────────────
function UsageBar({ label, used, limit, unit }) {
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0
  const color = pct >= 90 ? '#991b1b' : pct >= 80 ? '#dc2626' : pct >= 60 ? '#d97706' : '#059669'
  const bg    = pct >= 90 ? '#fee2e2' : pct >= 80 ? '#fef2f2' : pct >= 60 ? '#fef3c7' : '#d1fae5'
  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 18px', marginBottom: '10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '12px', fontWeight: 600, color, background: bg, padding: '2px 10px', borderRadius: '20px' }}>
          {pct}% used
        </span>
      </div>
      <div style={{ height: '8px', background: 'var(--cream-3)', borderRadius: '20px', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: '20px', transition: 'width .5s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px', fontSize: '11px', color: 'var(--ink-3)' }}>
        <span>{typeof used === 'number' ? used.toLocaleString() : used} {unit} used</span>
        <span>{typeof limit === 'number' ? limit.toLocaleString() : limit} {unit} limit</span>
      </div>
    </div>
  )
}

// ── Company Colour Picker ────────────────────────────────────
const PALETTE = [
  ['#1d4ed8','#dbeafe','Blue'],
  ['#065f46','#d1fae5','Green'],
  ['#92400e','#fef3c7','Amber'],
  ['#7c3aed','#ede9fe','Purple'],
  ['#be123c','#ffe4e6','Rose'],
  ['#0e7490','#cffafe','Cyan'],
  ['#c2410c','#ffedd5','Orange'],
  ['#4d7c0f','#ecfccb','Lime'],
  ['#1f2937','#f3f4f6','Slate'],
  ['#831843','#fdf2f8','Pink'],
]

function CompanyColorPicker({ companyId, currentAccent, saving, onSave }) {
  const [open, setOpen] = useState(false)
  const current = PALETTE.find(p => p[0] === currentAccent)

  return (
    <div style={{position:'relative'}}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display:'flex', alignItems:'center', gap:'8px',
          padding:'4px 10px', borderRadius:'6px', cursor:'pointer',
          border:'1px solid var(--border)', background:'#fff',
          fontSize:'12px', fontWeight:500,
        }}
      >
        <span style={{
          width:'16px', height:'16px', borderRadius:'50%',
          background: currentAccent || '#999',
          border:'2px solid #fff', boxShadow:'0 0 0 1px #ccc',
          display:'inline-block', flexShrink:0,
        }}/>
        <span>{current ? current[2] : 'Set colour'}</span>
        <span style={{fontSize:'10px', opacity:0.5}}>▾</span>
      </button>

      {open && (
        <div style={{
          position:'absolute', top:'110%', left:0, zIndex:200,
          background:'#fff', border:'1px solid var(--border)',
          borderRadius:'10px', padding:'12px', width:'220px',
          boxShadow:'0 8px 24px rgba(0,0,0,0.12)',
        }}>
          <div style={{fontSize:'11px', fontWeight:600, color:'var(--ink-3)',
            marginBottom:'8px', textTransform:'uppercase', letterSpacing:'.07em'}}>
            Select company colour
          </div>
          <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:'6px', marginBottom:'12px'}}>
            {PALETTE.map(([accent, pastel, name]) => (
              <button key={accent}
                title={name}
                onClick={() => { onSave(companyId, accent, pastel); setOpen(false) }}
                style={{
                  width:'32px', height:'32px', borderRadius:'50%',
                  background: accent,
                  border: accent === currentAccent ? '3px solid var(--ink)' : '2px solid #fff',
                  boxShadow: accent === currentAccent ? '0 0 0 2px var(--ink)' : '0 0 0 1px #ddd',
                  cursor:'pointer',
                }}
              />
            ))}
          </div>
          <div style={{fontSize:'11px', color:'var(--ink-3)', marginBottom:'6px'}}>Or pick custom:</div>
          <div style={{display:'flex', gap:'8px', alignItems:'center'}}>
            <input type="color"
              defaultValue={currentAccent || '#1d4ed8'}
              onChange={e => {
                const hex = e.target.value
                onSave(companyId, hex, hex + '22')
              }}
              style={{width:'36px', height:'28px', border:'none', cursor:'pointer', borderRadius:'4px', padding:'2px'}}
            />
            <span style={{fontSize:'11px', color:'var(--ink-3)'}}>Custom colour</span>
          </div>
          {saving && <div style={{fontSize:'11px', color:'var(--gold)', marginTop:'8px'}}>Saving…</div>}
          <button onClick={() => setOpen(false)}
            style={{marginTop:'10px', fontSize:'11px', color:'var(--ink-3)',
              background:'none', border:'none', cursor:'pointer', padding:0}}>
            Close ✕
          </button>
        </div>
      )}
    </div>
  )
}


export default function SettingsPage() {
  const [tab, setTab]                   = useState('companies')
  const [companies, setCompanies]       = useState([])
  const [users, setUsers]               = useState([])
  const [methods, setMethods]           = useState([])
  const [userCompanies, setUserCompanies] = useState([])
  const [moduleAssignments, setModuleAssignments] = useState([])
  const [deletedLog, setDeletedLog]     = useState([])
  const [loading, setLoading]           = useState(true)
  const [msg, setMsg]                   = useState({ type: '', text: '' })
  const [newCompany, setNewCompany]     = useState({ name: '', prefix: '' })
  const [logoUploading, setLogoUploading] = useState(null)
  const [receiptHeaderUploading, setReceiptHeaderUploading] = useState(null)
  const [savingColor, setSavingColor]     = useState(null)
  const [editingCompanyName, setEditingCompanyName] = useState(null)
  const [companyNameDraft, setCompanyNameDraft] = useState('')
  const [editingUserName, setEditingUserName] = useState(null)
  const [userNameDraft, setUserNameDraft] = useState('')
  const [userAppCounts, setUserAppCounts] = useState({})
  const [mergeSource, setMergeSource]     = useState(null)
  const [mergeTarget, setMergeTarget]     = useState('')
  const [mergingUser, setMergingUser]     = useState(false)

  // System health
  const [dbStats, setDbStats]           = useState(null)
  const [dbLoading, setDbLoading]       = useState(false)

  // Self-approval setting
  const [selfApproval, setSelfApproval] = useState(true)
  const [savingPref, setSavingPref]     = useState(false)

  // Export
  const [exportFrom, setExportFrom]     = useState('')
  const [exportTo, setExportTo]         = useState('')
  const [exportStatus, setExportStatus] = useState('')
  const [exportCompany, setExportCompany] = useState('')
  const [exporting, setExporting]       = useState(false)

  useEffect(() => { load(true) }, [])

  async function load(initial = false) {
    if (initial) setLoading(true)
    const [{ data: co }, { data: us }, { data: me }, { data: uc }, { data: dl }, { data: ma }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('users').select('*').order('full_name'),
      supabase.from('payment_methods').select('*').order('name'),
      supabase.from('user_companies').select('*'),
      supabase.from('deleted_applications_log').select('*').order('deleted_at', { ascending: false }),
      supabase.from('user_module_access').select('*'),
    ])
    setCompanies(co || [])
    setUsers(us || [])
    setMethods(me || [])
    setUserCompanies(uc || [])
    setModuleAssignments(ma || [])
    setDeletedLog(dl || [])

    // Load transaction counts per user per company
    if (us && co) {
      const counts = {}
      await Promise.all((us || []).map(async u => {
        counts[u.id] = {}
        await Promise.all((co || []).map(async c => {
          const { count } = await supabase
            .from('applications')
            .select('id', { count: 'exact', head: true })
            .eq('submitted_by', u.id)
            .eq('company_id', c.id)
            .is('deleted_at', null)
          counts[u.id][c.id] = count || 0
        }))
      }))
      setUserAppCounts(counts)
    }

    // Load self-approval preference
    const { data: pref } = await supabase.from('system_settings').select('value').eq('key','finance_self_approval').single()
    if (pref) setSelfApproval(pref.value === 'true')

    if (initial) setLoading(false)
  }

  async function loadDbStats() {
    setDbLoading(true)
    try {
      const { data: appCount }  = await supabase.from('applications').select('id', { count: 'exact', head: true })
      const { data: userCount } = await supabase.from('users').select('id', { count: 'exact', head: true })
      const { data: auditCount }= await supabase.from('audit_log').select('id', { count: 'exact', head: true })
      const { count: apps }     = await supabase.from('applications').select('*', { count: 'exact', head: true })
      const { count: auditRows }= await supabase.from('audit_log').select('*', { count: 'exact', head: true })
      const { count: userRows } = await supabase.from('users').select('*', { count: 'exact', head: true })
      const { count: payeeRows }= await supabase.from('payees').select('*', { count: 'exact', head: true })

      // Estimate DB size: ~2KB per application row, ~0.5KB others
      const estMB = Math.round(((apps||0)*2 + (auditRows||0)*0.5 + (userRows||0)*0.5 + (payeeRows||0)*0.5) / 1024 * 10) / 10

      setDbStats({
        applications: apps || 0,
        auditRows:    auditRows || 0,
        users:        userRows || 0,
        payees:       payeeRows || 0,
        estDbMB:      estMB || 1,
      })
    } finally {
      setDbLoading(false)
    }
  }

  function flash(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg({ type: '', text: '' }), 3500)
  }

  function userHasCompany(userId, companyId) {
    return userCompanies.some(uc => uc.user_id === userId && uc.company_id === companyId)
  }

  async function toggleUserCompany(userId, companyId, currently) {
    if (currently) {
      await supabase.from('user_companies').delete().eq('user_id', userId).eq('company_id', companyId)
    } else {
      await supabase.from('user_companies').insert({ user_id: userId, company_id: companyId })
    }
    await load()
  }

  async function addCompany() {
    if (!newCompany.name.trim() || !newCompany.prefix.trim()) return flash('error', 'Name and prefix required')
    const { error } = await supabase.from('companies').insert(newCompany)
    if (error) return flash('error', error.message)
    setNewCompany({ name: '', prefix: '' })
    flash('success', 'Company added')
    load()
  }

  async function uploadLogo(companyId, file) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return flash('error', 'Logo must be under 2MB')
    if (!['image/png','image/jpeg','image/svg+xml','image/webp'].includes(file.type))
      return flash('error', 'Use PNG, JPG, SVG or WebP')
    setLogoUploading(companyId)
    const ext = file.name.split('.').pop()
    const path = `logos/${companyId}.${ext}`
    const { error: upErr } = await supabase.storage.from('attachments').upload(path, file, { upsert: true })
    if (upErr) { flash('error', upErr.message); setLogoUploading(null); return }
    const { data: pub } = supabase.storage.from('attachments').getPublicUrl(path)
    // The version changes on every upload, so browsers fetch the new logo once
    // and do not reuse an older locally cached copy.
    await supabase.from('companies').update({ logo_url: `${pub.publicUrl}?v=${Date.now()}` }).eq('id', companyId)
    flash('success', 'Logo uploaded')
    setLogoUploading(null)
    load()
  }

  async function uploadReceiptHeader(companyId, file) {
    if (!file) return
    if (file.size > 3 * 1024 * 1024 || file.type !== 'image/png') return flash('error', 'Receipt header must be a PNG under 3MB')
    setReceiptHeaderUploading(companyId)
    const path = `receipt-headers/${companyId}.png`
    const { error } = await supabase.storage.from('attachments').upload(path, file, { upsert:true })
    if (error) { flash('error', error.message); setReceiptHeaderUploading(null); return }
    const { data } = supabase.storage.from('attachments').getPublicUrl(path)
    await supabase.from('companies').update({ holiday_receipt_header_url:`${data.publicUrl}?v=${Date.now()}` }).eq('id', companyId)
    setReceiptHeaderUploading(null); flash('success','Holiday receipt header uploaded'); load()
  }

  async function previewReceiptHeader(companyId) {
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(`receipt-headers/${companyId}.png`, 3600)
    if (error || !data?.signedUrl) return flash('error', error?.message || 'Receipt header was not found')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function previewCompanyLogo(logoUrl) {
    const marker = '/attachments/'
    const path = logoUrl?.split(marker)[1]?.split('?')[0]
    if (!path) return flash('error', 'Company logo path was not found')
    const { data, error } = await supabase.storage.from('attachments').createSignedUrl(decodeURIComponent(path), 3600)
    if (error || !data?.signedUrl) return flash('error', error?.message || 'Company logo was not found')
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function toggleUserActive(userId, currentlyActive) {
    const action = currentlyActive ? 'deactivate' : 'activate'
    if (!confirm(`${action.charAt(0).toUpperCase()+action.slice(1)} this user? ${currentlyActive ? 'They will not be able to log in.' : 'They will be able to log in again.'}`)) return
    await supabase.from('users').update({ is_active: !currentlyActive }).eq('id', userId)
    flash('success', `User ${action}d successfully`)
    load()
  }

  async function toggleHolidayHomeReceipts(userId, enabled) {
    const { error } = await supabase.from('users').update({ holiday_home_receipts_enabled: enabled }).eq('id', userId)
    if (error) return flash('error', error.message)
    await load()
  }

  async function toggleModuleAccess(userId, moduleKey, granted) {
    const { error } = await supabase.from('user_module_access').upsert({ user_id:userId, module_key:moduleKey, granted }, { onConflict:'user_id,module_key' })
    if (error) return flash('error', error.message)
    setModuleAssignments(current => [...current.filter(row => !(row.user_id === userId && row.module_key === moduleKey)), { user_id:userId, module_key:moduleKey, granted }])
  }

  async function mergeUsers(sourceId, targetId) {
    if (!targetId) return
    setMergingUser(true)
    try {
      // 1. Reassign all applications from source to target
      await supabase.from('applications')
        .update({ submitted_by: targetId })
        .eq('submitted_by', sourceId)

      // 2. Mark source as merged and deactivate
      await supabase.from('users').update({
        merged_into: targetId,
        is_active: false,
      }).eq('id', sourceId)

      // 3. Log in audit
      await supabase.from('audit_log').insert({
        application_id: '00000000-0000-0000-0000-000000000000',
        action_by: (await supabase.auth.getUser()).data.user.id,
        action: 'edited',
        note: `User merged: ${sourceId} → ${targetId}. All applications reassigned.`,
      }).catch(() => {}) // audit log may fail due to FK — that's ok

      flash('success', 'Users merged successfully. All applications reassigned.')
      setMergeSource(null)
      setMergeTarget('')
      load()
    } catch (err) {
      flash('error', err.message || 'Merge failed')
    } finally {
      setMergingUser(false)
    }
  }

  async function resetUserPassword(email) {
    if (!confirm(`Send password reset email to ${email}?`)) return
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) flash('error', error.message)
    else flash('success', `Reset email sent to ${email}`)
  }

  async function saveCompanyColor(id, accent, pastel) {
    setSavingColor(id)
    await supabase.from('companies').update({ accent_color: accent, pastel_color: pastel }).eq('id', id)
    setSavingColor(null)
    flash('success', 'Company colour saved')
    load()
  }

  function startEditCompanyName(company) {
    setEditingCompanyName(company.id)
    setCompanyNameDraft(company.name || '')
  }

  async function saveCompanyName(id) {
    const name = companyNameDraft.trim()
    if (!name) return flash('error', 'Company name is required')
    const { error } = await supabase.from('companies').update({ name }).eq('id', id)
    if (error) return flash('error', error.message)
    setEditingCompanyName(null)
    setCompanyNameDraft('')
    flash('success', 'Company name updated')
    load()
  }

  async function toggleCompany(id, active) {
    await supabase.from('companies').update({ active: !active }).eq('id', id)
    load()
  }

  function startEditUserName(user) {
    setEditingUserName(user.id)
    setUserNameDraft(user.full_name || '')
  }

  async function saveUserName(id) {
    const fullName = userNameDraft.trim()
    if (!fullName) return flash('error', 'Display name is required')
    const { error } = await supabase.from('users').update({ full_name: fullName }).eq('id', id)
    if (error) return flash('error', error.message)
    setEditingUserName(null)
    setUserNameDraft('')
    flash('success', 'Display name updated')
    load()
  }

  async function updateUserRole(id, role) {
    const { error } = await supabase.from('users').update({ role }).eq('id', id)
    if (error) return flash('error', error.message)
    flash('success', 'Role updated')
    load()
  }

  async function toggleMethod(id, active) {
    await supabase.from('payment_methods').update({ active: !active }).eq('id', id)
    load()
  }

  async function saveSelfApproval(val) {
    setSavingPref(true)
    await supabase.from('system_settings').upsert({ key: 'finance_self_approval', value: String(val) })
    setSelfApproval(val)
    setSavingPref(false)
    flash('success', val ? 'Finance Officers can now approve their own applications' : 'Self-approval disabled — Finance Officers cannot approve their own submissions')
  }

  async function exportCSV() {
    setExporting(true)
    let query = supabase.from('applications_full').select('*').order('created_at', { ascending: false })
    if (exportFrom)    query = query.gte('created_at', exportFrom)
    if (exportTo)      query = query.lte('created_at', exportTo + 'T23:59:59')
    if (exportStatus)  query = query.eq('status', exportStatus)
    if (exportCompany) query = query.eq('company_name', exportCompany)
    const { data, error } = await query
    if (error) { flash('error', error.message); setExporting(false); return }
    if (!data || data.length === 0) { flash('error', 'No records found for selected filters'); setExporting(false); return }
    const rows = [
      ['Ref','Date','Company','Applicant','Payment Reason','Method','Amount AED',
       'Amount Words','Payee','Bank','Account/IBAN','Remarks','Status','Attachment'],
      ...data.map(a => [
        a.ref_number, a.created_at?.slice(0,10), a.company_name, a.submitted_by_name,
        a.payment_reason, a.payment_method_name, a.amount, a.amount_words,
        a.payee_name, a.bank_name, a.bank_account, a.remarks, a.status, a.attachment_name||''
      ])
    ]
    const csv  = rows.map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const el   = document.createElement('a')
    const fname = `payments-export-${exportFrom||'all'}-to-${exportTo||'now'}-${Date.now()}.csv`
    el.href = url; el.download = fname; el.click()
    URL.revokeObjectURL(url)
    flash('success', `Exported ${data.length} records`)
    setExporting(false)
  }

  async function archiveOldData() {
    if (!confirm('This will mark all Approved/Rejected applications older than 12 months as "archived". They will be hidden from the main dashboard but remain in the database. Continue?')) return
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 1)
    const { data, error } = await supabase
      .from('applications')
      .update({ status: 'archived' })
      .in('status', ['approved','rejected'])
      .lt('created_at', cutoff.toISOString())
      .select('id')
    if (error) return flash('error', error.message)
    flash('success', `Archived ${data?.length || 0} old applications. Database freed up.`)
  }

  const tabs = [
    { id: 'companies', label: '🏢 Companies' },
    { id: 'users',     label: '👥 Users & Access' },
    { id: 'modules',   label: '🔐 Module Access' },
    { id: 'methods',   label: '💳 Payment Methods' },
    { id: 'rules',     label: '⚙ Rules' },
    { id: 'health',    label: '📊 System Health' },
    { id: 'export',    label: '↓ Export & Archive' },
    { id: 'deleted',   label: '🗑 Deleted Log' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>System configuration · Super Admin only</p>
      </div>

      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Tabs */}
      <div style={{ display:'flex', gap:'2px', marginBottom:'20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap', position:'sticky', top:0, zIndex:20, background:'var(--cream)', paddingTop:'6px' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding:'10px 16px', background:'none', border:'none', cursor:'pointer',
            fontSize:'12px', fontWeight:500,
            color: tab===t.id ? 'var(--ink)' : 'var(--ink-3)',
            borderBottom: tab===t.id ? '2px solid var(--gold)' : '2px solid transparent',
            marginBottom:'-1px', whiteSpace:'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="empty-state"><p>Loading…</p></div> : <>

        {/* ── COMPANIES ── */}
        {tab === 'companies' && (
          <div>
            <div className="card" style={{marginBottom:'16px'}}>
              <div className="card-header"><h2>Add Company</h2></div>
              <div className="card-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Company Name</label>
                    <input className="form-control" placeholder="e.g. Homesvip LLC"
                      value={newCompany.name} onChange={e => setNewCompany(c=>({...c,name:e.target.value}))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prefix</label>
                    <input className="form-control" placeholder="e.g. CO3" maxLength={4}
                      value={newCompany.prefix} onChange={e => setNewCompany(c=>({...c,prefix:e.target.value.toUpperCase()}))} />
                    <p className="form-hint">CO3 → CO3-2026-0001</p>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={addCompany}>Add Company</button>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2>All Companies</h2></div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Name</th><th>Prefix</th><th>Colour</th><th>Logo</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {companies.map(c => (
                      <tr key={c.id}>
                        <td style={{fontWeight:500,minWidth:'260px'}}>
                          {editingCompanyName === c.id ? (
                            <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                              <input
                                className="form-control"
                                value={companyNameDraft}
                                onChange={e => setCompanyNameDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveCompanyName(c.id)
                                  if (e.key === 'Escape') setEditingCompanyName(null)
                                }}
                                autoFocus
                                style={{minWidth:'220px'}}
                              />
                              <button className="btn btn-primary btn-sm" onClick={() => saveCompanyName(c.id)}>Save</button>
                              <button className="btn btn-outline btn-sm" onClick={() => setEditingCompanyName(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div style={{display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}}>
                              <span>{c.name}</span>
                              <button className="btn btn-outline btn-sm" onClick={() => startEditCompanyName(c)}>Edit Name</button>
                            </div>
                          )}
                        </td>
                        <td><span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px'}}>{c.prefix}</span></td>
                        <td>
                          <CompanyColorPicker
                            companyId={c.id}
                            currentAccent={c.accent_color}
                            saving={savingColor === c.id}
                            onSave={saveCompanyColor}
                          />
                        </td>
                        <td>
                          <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                            <label className="btn btn-outline btn-sm" style={{cursor:'pointer',marginBottom:0}}>
                              {logoUploading===c.id ? 'Uploading…' : 'Logo PNG'}
                              <input type="file" accept="image/png" style={{display:'none'}} onChange={e=>uploadLogo(c.id,e.target.files[0])} />
                            </label>
                            <label className="btn btn-outline btn-sm" style={{cursor:'pointer',marginBottom:0}}>
                              {receiptHeaderUploading===c.id ? 'Uploading…' : 'Receipt Header PNG'}
                              <input type="file" accept="image/png" style={{display:'none'}} onChange={e=>uploadReceiptHeader(c.id,e.target.files[0])} />
                            </label>
                            {c.logo_url && <button className="btn btn-outline btn-sm" title="View company logo" aria-label="View company logo" onClick={() => previewCompanyLogo(c.logo_url)}>👁</button>}
                            {c.holiday_receipt_header_url && <button className="btn btn-outline btn-sm" title="View receipt header" aria-label="View receipt header" onClick={() => previewReceiptHeader(c.id)}>👁</button>}
                          </div>
                        </td>
                        <td><span className={`badge badge-${c.active?'approved':'rejected'}`}>{c.active?'Active':'Inactive'}</span></td>
                        <td><button className="btn btn-outline btn-sm" onClick={()=>toggleCompany(c.id,c.active)}>{c.active?'Deactivate':'Activate'}</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── USERS ── */}
        {tab === 'users' && (
          <div>
            <div className="alert alert-info" style={{marginBottom:'16px'}}>
              Invite new users via <strong>Supabase → Authentication → Users → Invite</strong>. They appear here once they accept.
            </div>

            {/* User cards */}
            {users.map(u => {
              const myCompanies = companies.filter(c => c.active && userHasCompany(u.id, c.id))
              const isMerged = !!u.merged_into
              return (
                <div key={u.id} className="card" style={{marginBottom:'12px',opacity: (!u.is_active || isMerged) ? 0.7 : 1}}>
                  <div className="card-body" style={{padding:'16px 20px'}}>
                    <div style={{display:'flex',alignItems:'flex-start',gap:'16px',flexWrap:'wrap'}}>

                      {/* Status dot + Name */}
                      <div style={{flex:'0 0 220px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}>
                          <span style={{
                            width:'10px',height:'10px',borderRadius:'50%',flexShrink:0,
                            background: isMerged ? '#9ca3af' : u.is_active ? '#059669' : '#dc2626',
                          }} title={isMerged ? 'Merged' : u.is_active ? 'Active' : 'Deactivated'} />
                          {editingUserName === u.id ? (
                            <div style={{display:'flex',gap:'6px',alignItems:'center',flexWrap:'wrap'}}>
                              <input
                                className="form-control"
                                value={userNameDraft}
                                onChange={e => setUserNameDraft(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') saveUserName(u.id)
                                  if (e.key === 'Escape') setEditingUserName(null)
                                }}
                                autoFocus
                                style={{width:'170px',padding:'5px 8px',fontSize:'12px'}}
                              />
                              <button className="btn btn-primary btn-sm" onClick={() => saveUserName(u.id)}>Save</button>
                              <button className="btn btn-outline btn-sm" onClick={() => setEditingUserName(null)}>Cancel</button>
                            </div>
                          ) : (
                            <>
                              <span style={{fontWeight:600,fontSize:'14px'}}>{u.full_name}</span>
                              {!isMerged && (
                                <button className="btn btn-outline btn-sm" onClick={() => startEditUserName(u)}>
                                  Edit Name
                                </button>
                              )}
                            </>
                          )}
                          {isMerged && <span className="badge badge-draft" style={{fontSize:'10px'}}>Merged</span>}
                          {!u.is_active && !isMerged && <span className="badge badge-rejected" style={{fontSize:'10px'}}>Inactive</span>}
                        </div>
                        <div style={{fontSize:'12px',color:'var(--ink-3)',marginLeft:'18px'}}>{u.email}</div>
                        <div style={{marginLeft:'18px',marginTop:'6px'}}>
                          <select className="form-control" style={{width:'auto',padding:'4px 8px',fontSize:'12px'}}
                            value={u.role} onChange={e=>updateUserRole(u.id,e.target.value)}
                            disabled={isMerged}>
                            <option value="staff">Staff</option>
                            <option value="gro">GRO</option>
                            <option value="manager">Manager</option>
                            <option value="finance">Finance Officer</option>
                            <option value="ceo">CEO</option>
                            <option value="cfo">CFO</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        </div>
                      </div>

                      <label style={{display:'flex',alignItems:'center',gap:'7px',fontSize:'12px',paddingTop:'4px'}}>
                        <input type="checkbox" checked={Boolean(u.holiday_home_receipts_enabled)} disabled={isMerged || u.role === 'superadmin'}
                          onChange={event => toggleHolidayHomeReceipts(u.id, event.target.checked)} />
                        Holiday Home Receipts
                      </label>

                      {/* Company assignments + tx counts */}
                      <div style={{flex:1,minWidth:'200px'}}>
                        <div style={{fontSize:'11px',fontWeight:600,color:'var(--ink-3)',
                          textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>
                          Company Access & Transactions
                        </div>
                        <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
                          {companies.filter(c=>c.active).map(c => {
                            const has = userHasCompany(u.id, c.id)
                            const count = userAppCounts[u.id]?.[c.id] ?? '…'
                            return (
                              <label key={c.id} style={{
                                display:'flex',alignItems:'center',gap:'6px',
                                padding:'5px 10px',borderRadius:'6px',cursor:'pointer',
                                background: has ? 'var(--cream-2)' : 'var(--cream-3)',
                                border: has ? '1px solid var(--border)' : '1px dashed var(--border-2)',
                                fontSize:'12px',
                              }}>
                                <input type="checkbox" checked={has}
                                  onChange={()=>toggleUserCompany(u.id,c.id,has)}
                                  disabled={isMerged}
                                  style={{width:'13px',height:'13px',cursor:'pointer'}} />
                                <span style={{fontWeight:500}}>{c.name}</span>
                                {has && (
                                  <span style={{
                                    background:'var(--ink)',color:'#fff',
                                    borderRadius:'20px',padding:'1px 7px',
                                    fontSize:'10px',fontWeight:600,
                                  }}>{count}</span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{display:'flex',flexDirection:'column',gap:'6px',flexShrink:0}}>
                        {!isMerged && (
                          <button
                            className={`btn btn-sm ${u.is_active ? 'btn-danger' : 'btn-success'}`}
                            onClick={() => toggleUserActive(u.id, u.is_active)}
                            style={{whiteSpace:'nowrap'}}>
                            {u.is_active ? '⊘ Deactivate' : '✓ Activate'}
                          </button>
                        )}
                        {!isMerged && (
                          <button className="btn btn-outline btn-sm"
                            onClick={() => setMergeSource(u)}
                            style={{whiteSpace:'nowrap'}}>
                            ⇄ Merge into…
                          </button>
                        )}
                        <button className="btn btn-outline btn-sm"
                          onClick={() => resetUserPassword(u.email)}
                          style={{whiteSpace:'nowrap',fontSize:'11px'}}
                          title="Send password reset email — you cannot see their password">
                          🔑 Reset Password
                        </button>
                      </div>

                    </div>
                  </div>
                </div>
              )
            })}

            {/* Merge modal */}
            {mergeSource && (
              <div style={{position:'fixed',inset:0,zIndex:3000,background:'rgba(10,10,20,0.7)',
                display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
                <div style={{background:'#fff',borderRadius:'12px',width:'100%',maxWidth:'500px',
                  boxShadow:'0 24px 64px rgba(0,0,0,0.3)',overflow:'hidden'}}>
                  <div style={{background:'var(--ink)',padding:'16px 20px',display:'flex',alignItems:'center',gap:'10px'}}>
                    <span style={{fontSize:'18px'}}>⇄</span>
                    <h3 style={{color:'#fff',fontSize:'16px',fontWeight:600}}>Merge User Account</h3>
                  </div>
                  <div style={{padding:'24px'}}>
                    <div style={{background:'var(--cream-2)',borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'13px'}}>
                      <div style={{fontWeight:600,marginBottom:'2px'}}>Source (will be deactivated):</div>
                      <div style={{color:'var(--ink-2)'}}>{mergeSource.full_name} — {mergeSource.email}</div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Merge into (surviving account) <span style={{color:'#dc2626'}}>*</span></label>
                      <select className="form-control" value={mergeTarget} onChange={e=>setMergeTarget(e.target.value)}>
                        <option value="">Select target user…</option>
                        {users.filter(u=>u.id!==mergeSource.id&&!u.merged_into).map(u=>(
                          <option key={u.id} value={u.id}>{u.full_name} — {u.email}</option>
                        ))}
                      </select>
                    </div>
                    <div className="alert alert-warning" style={{marginBottom:'16px',fontSize:'12px'}}>
                      ⚠ All applications from <strong>{mergeSource.full_name}</strong> will be reassigned to the target account.
                      The source account will be deactivated and flagged as merged. This cannot be undone.
                    </div>
                    <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
                      <button className="btn btn-outline" onClick={()=>{setMergeSource(null);setMergeTarget('')}}>Cancel</button>
                      <button className="btn btn-primary" disabled={!mergeTarget||mergingUser}
                        onClick={()=>mergeUsers(mergeSource.id,mergeTarget)}>
                        {mergingUser ? 'Merging…' : '⇄ Confirm Merge'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'modules' && (
          <div className="card"><div className="card-header"><h2>User · Role · Module Access</h2><span className="text-sm text-muted">Roles do not grant modules automatically.</span></div>
            <div className="table-wrap"><table><thead><tr><th>User</th><th>Role</th><th>Payment Applications</th><th>Vouchers</th><th>Holiday Home Receipts</th></tr></thead><tbody>
              {users.filter(u => !u.merged_into).map(u => <tr key={u.id}><td>{u.full_name}<div className="text-sm text-muted">{u.email}</div></td><td>{u.role}</td>
                {['payment_applications','vouchers','holiday_home_receipts'].map(key => { const granted = u.role === 'superadmin' || moduleAssignments.some(row => row.user_id===u.id && row.module_key===key && row.granted); return <td key={key}><input type="checkbox" checked={granted} disabled={u.role==='superadmin'} onChange={e => toggleModuleAccess(u.id,key,e.target.checked)} /></td> })}
              </tr>)}
            </tbody></table></div>
          </div>
        )}

        {/* ── PAYMENT METHODS ── */}
        {tab === 'methods' && (
          <div className="card">
            <div className="card-header"><h2>Payment Methods</h2></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Method</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {methods.map(m=>(
                    <tr key={m.id}>
                      <td style={{fontWeight:500}}>{m.name}</td>
                      <td><span className={`badge badge-${m.active?'approved':'rejected'}`}>{m.active?'Active':'Inactive'}</span></td>
                      <td><button className="btn btn-outline btn-sm" onClick={()=>toggleMethod(m.id,m.active)}>{m.active?'Deactivate':'Activate'}</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RULES ── */}
        {tab === 'rules' && (
          <div>
            <div className="card">
              <div className="card-header"><h2>Workflow Rules</h2></div>
              <div className="card-body">
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'20px',padding:'16px',background:'var(--cream-2)',borderRadius:'var(--radius-sm)',border:'1px solid var(--border)'}}>
                  <div>
                    <div style={{fontWeight:600,fontSize:'14px',marginBottom:'4px'}}>Finance Officer Self-Approval</div>
                    <div style={{fontSize:'13px',color:'var(--ink-2)',maxWidth:'480px',lineHeight:'1.6'}}>
                      When <strong>ON</strong>: Finance Officers can approve any application including their own.<br/>
                      When <strong>OFF</strong>: Finance Officers cannot approve their own submissions — must be reviewed by another Finance Officer or escalated to Super Admin.
                    </div>
                    <div className="mt-2">
                      <span className={`badge ${selfApproval ? 'badge-approved' : 'badge-returned'}`}>
                        Currently: {selfApproval ? 'ON — Self-approval allowed' : 'OFF — Self-approval blocked'}
                      </span>
                    </div>
                  </div>
                  <div style={{display:'flex',gap:'8px',flexShrink:0}}>
                    <button
                      className={`btn ${selfApproval ? 'btn-outline' : 'btn-success'}`}
                      disabled={savingPref || !selfApproval}
                      onClick={() => saveSelfApproval(true)}>
                      Enable
                    </button>
                    <button
                      className={`btn ${!selfApproval ? 'btn-outline' : 'btn-danger'}`}
                      disabled={savingPref || selfApproval}
                      onClick={() => saveSelfApproval(false)}>
                      Disable
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SYSTEM HEALTH ── */}
        {tab === 'health' && (
          <div>
            <div className="card" style={{marginBottom:'16px'}}>
              <div className="card-header">
                <h2>📊 Database Usage</h2>
                <button className="btn btn-outline btn-sm" onClick={loadDbStats} disabled={dbLoading}>
                  {dbLoading ? 'Checking…' : '↻ Check Now'}
                </button>
              </div>
              <div className="card-body">
                {!dbStats ? (
                  <div style={{textAlign:'center',padding:'30px',color:'var(--ink-3)'}}>
                    <p style={{marginBottom:'12px'}}>Click "Check Now" to load live database statistics</p>
                    <button className="btn btn-primary" onClick={loadDbStats} disabled={dbLoading}>
                      {dbLoading ? 'Loading…' : '📊 Load Stats'}
                    </button>
                  </div>
                ) : (
                  <div>
                    {dbStats.estDbMB >= 400 && (
                      <div className="alert alert-error" style={{marginBottom:'16px'}}>
                        ⚠️ <strong>Database above 80%.</strong> Please export and archive old data immediately.
                      </div>
                    )}
                    {dbStats.estDbMB >= 300 && dbStats.estDbMB < 400 && (
                      <div className="alert alert-warning" style={{marginBottom:'16px'}}>
                        ⚠️ Database above 60%. Consider archiving applications older than 12 months.
                      </div>
                    )}
                    <UsageBar label="Database storage (estimated)" used={dbStats.estDbMB} limit={500} unit="MB" />
                    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'12px',marginTop:'16px'}}>
                      {[
                        { label:'Applications', value: dbStats.applications },
                        { label:'Audit log entries', value: dbStats.auditRows },
                        { label:'Users', value: dbStats.users },
                        { label:'Payees / suppliers', value: dbStats.payees },
                      ].map(s => (
                        <div key={s.label} style={{background:'var(--cream)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'12px 14px'}}>
                          <div style={{fontSize:'11px',color:'var(--ink-3)',marginBottom:'4px'}}>{s.label}</div>
                          <div style={{fontSize:'22px',fontWeight:600}}>{s.value.toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{marginTop:'16px',padding:'12px 16px',background:'var(--cream-2)',borderRadius:'var(--radius-sm)',fontSize:'12px',color:'var(--ink-3)'}}>
                      💡 Supabase free tier: 500MB database · 1GB file storage · 50,000 auth users · 500k API requests/month.<br/>
                      DB size is estimated based on row counts. For exact size, check Supabase dashboard → Settings → Database.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── EXPORT & ARCHIVE ── */}
        {tab === 'export' && (
          <div>
            <div className="card" style={{marginBottom:'16px'}}>
              <div className="card-header"><h2>↓ Export Data to CSV</h2></div>
              <div className="card-body">
                <p style={{fontSize:'13px',color:'var(--ink-2)',marginBottom:'16px'}}>
                  Export any slice of your data as a CSV file. Leave filters blank to export everything.
                  The file opens in Excel, Google Sheets, or any spreadsheet app.
                </p>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Date from</label>
                    <input type="date" className="form-control" value={exportFrom} onChange={e=>setExportFrom(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Date to</label>
                    <input type="date" className="form-control" value={exportTo} onChange={e=>setExportTo(e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select className="form-control" value={exportStatus} onChange={e=>setExportStatus(e.target.value)}>
                      <option value="">All statuses</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="pending">Pending</option>
                      <option value="draft">Draft</option>
                      <option value="returned">Returned</option>
                      <option value="escalated">Escalated</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Company</label>
                    <select className="form-control" value={exportCompany} onChange={e=>setExportCompany(e.target.value)}>
                      <option value="">All companies</option>
                      {companies.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={exportCSV} disabled={exporting}>
                  {exporting ? 'Exporting…' : '↓ Download CSV'}
                </button>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h2>📦 Archive Old Data</h2></div>
              <div className="card-body">
                <p style={{fontSize:'13px',color:'var(--ink-2)',marginBottom:'16px',lineHeight:'1.6'}}>
                  Archive all <strong>Approved</strong> and <strong>Rejected</strong> applications older than <strong>12 months</strong>.
                  Archived records are hidden from the Finance Dashboard but remain in the database permanently.
                  This reduces active query load and keeps your free tier healthy.
                </p>
                <div className="alert alert-info" style={{marginBottom:'16px'}}>
                  💡 <strong>Best practice:</strong> Export the data first using the CSV export above, then archive. This gives you a local backup before hiding records from the dashboard.
                </div>
                <button className="btn btn-warning" onClick={archiveOldData}>
                  📦 Archive Applications Older Than 12 Months
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── DELETED LOG ── */}
        {tab === 'deleted' && (
          <div>
            <div className="alert alert-info" style={{marginBottom:'16px'}}>
              Permanent record of all deleted applications. This log cannot be modified or cleared.
            </div>
            <div className="card">
              <div className="card-header">
                <h2>Deleted Applications Log</h2>
                <span className="text-sm text-muted">{deletedLog.length} records</span>
              </div>
              <div className="table-wrap">
                {deletedLog.length === 0 ? (
                  <div className="empty-state" style={{padding:'40px'}}>
                    <div className="icon">✅</div>
                    <h3>No deleted applications</h3>
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr><th>Ref</th><th>Company</th><th>Submitted By</th><th>Amount (AED)</th><th>Status</th><th>Deleted By</th><th>Reason</th><th>When</th></tr>
                    </thead>
                    <tbody>
                      {deletedLog.map(d=>(
                        <tr key={d.id}>
                          <td style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',fontWeight:500}}>{d.ref_number||'—'}</td>
                          <td className="text-sm">{d.company_name}</td>
                          <td className="text-sm">{d.submitted_by}</td>
                          <td style={{fontWeight:500}}>{new Intl.NumberFormat('en-AE',{minimumFractionDigits:2}).format(d.amount)}</td>
                          <td><span className={`badge badge-${d.status_at_delete}`}>{d.status_at_delete?.toUpperCase()}</span></td>
                          <td className="text-sm">{d.deleted_by}</td>
                          <td className="text-sm" style={{maxWidth:'200px',whiteSpace:'pre-wrap',color:'#dc2626'}}>{d.delete_reason}</td>
                          <td className="text-muted text-sm">{new Date(d.deleted_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </>}
    </div>
  )
}
