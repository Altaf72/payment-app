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
  const [deletedLog, setDeletedLog]     = useState([])
  const [loading, setLoading]           = useState(true)
  const [msg, setMsg]                   = useState({ type: '', text: '' })
  const [newCompany, setNewCompany]     = useState({ name: '', prefix: '' })
  const [logoUploading, setLogoUploading] = useState(null)
  const [savingColor, setSavingColor]     = useState(null)

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

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: co }, { data: us }, { data: me }, { data: uc }, { data: dl }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('users').select('*').order('full_name'),
      supabase.from('payment_methods').select('*').order('name'),
      supabase.from('user_companies').select('*'),
      supabase.from('deleted_applications_log').select('*').order('deleted_at', { ascending: false }),
    ])
    setCompanies(co || [])
    setUsers(us || [])
    setMethods(me || [])
    setUserCompanies(uc || [])
    setDeletedLog(dl || [])

    // Load self-approval preference
    const { data: pref } = await supabase.from('system_settings').select('value').eq('key','finance_self_approval').single()
    if (pref) setSelfApproval(pref.value === 'true')

    setLoading(false)
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
    await supabase.from('companies').update({ logo_url: pub.publicUrl }).eq('id', companyId)
    flash('success', 'Logo uploaded')
    setLogoUploading(null)
    load()
  }

  async function saveCompanyColor(id, accent, pastel) {
    setSavingColor(id)
    await supabase.from('companies').update({ accent_color: accent, pastel_color: pastel }).eq('id', id)
    setSavingColor(null)
    flash('success', 'Company colour saved')
    load()
  }

  async function toggleCompany(id, active) {
    await supabase.from('companies').update({ active: !active }).eq('id', id)
    load()
  }

  async function updateUserRole(id, role) {
    await supabase.from('users').update({ role }).eq('id', id)
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
      <div style={{ display:'flex', gap:'2px', marginBottom:'20px', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
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
                        <td style={{fontWeight:500}}>{c.name}</td>
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
                            {c.logo_url && <img src={c.logo_url} alt="logo" style={{height:'28px',objectFit:'contain',border:'1px solid var(--border)',borderRadius:'4px',padding:'2px'}} />}
                            <label className="btn btn-outline btn-sm" style={{cursor:'pointer',marginBottom:0}}>
                              {logoUploading===c.id ? 'Uploading…' : c.logo_url ? '↑ Replace' : '↑ Upload'}
                              <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>uploadLogo(c.id,e.target.files[0])} />
                            </label>
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
              Invite new users via <strong>Supabase → Authentication → Users → Invite</strong>. They appear here once they accept. Set role and assign companies below.
            </div>
            <div className="card">
              <div className="card-header">
                <h2>Users & Company Access</h2>
                <span className="text-sm text-muted">Tick to grant company access per user</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th><th>Email</th><th>Role</th>
                      {companies.filter(c=>c.active).map(c=>(
                        <th key={c.id} style={{textAlign:'center',fontSize:'11px'}}>{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u=>(
                      <tr key={u.id}>
                        <td style={{fontWeight:500,whiteSpace:'nowrap'}}>{u.full_name}</td>
                        <td className="text-muted text-sm">{u.email}</td>
                        <td>
                          <select className="form-control" style={{width:'auto',padding:'4px 8px',fontSize:'12px'}}
                            value={u.role} onChange={e=>updateUserRole(u.id,e.target.value)}>
                            <option value="staff">Staff</option>
                            <option value="finance">Finance Officer</option>
                            <option value="ceo">CEO</option>
                            <option value="cfo">CFO</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        </td>
                        {companies.filter(c=>c.active).map(c=>{
                          const has = userHasCompany(u.id,c.id)
                          return (
                            <td key={c.id} style={{textAlign:'center'}}>
                              <input type="checkbox" checked={has}
                                onChange={()=>toggleUserCompany(u.id,c.id,has)}
                                style={{width:'16px',height:'16px',cursor:'pointer'}} />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
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
