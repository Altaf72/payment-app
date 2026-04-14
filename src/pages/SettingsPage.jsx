import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function SettingsPage() {
  const [tab, setTab] = useState('companies')
  const [companies, setCompanies] = useState([])
  const [users, setUsers] = useState([])
  const [methods, setMethods] = useState([])
  const [userCompanies, setUserCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState({ type: '', text: '' })
  const [newCompany, setNewCompany] = useState({ name: '', prefix: '' })
  const [logoUploading, setLogoUploading] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: co }, { data: us }, { data: me }, { data: uc }] = await Promise.all([
      supabase.from('companies').select('*').order('name'),
      supabase.from('users').select('*').order('full_name'),
      supabase.from('payment_methods').select('*').order('name'),
      supabase.from('user_companies').select('*'),
    ])
    setCompanies(co || [])
    setUsers(us || [])
    setMethods(me || [])
    setUserCompanies(uc || [])
    setLoading(false)
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
      await supabase.from('user_companies').delete()
        .eq('user_id', userId).eq('company_id', companyId)
    } else {
      await supabase.from('user_companies').insert({ user_id: userId, company_id: companyId })
    }
    await load()
  }

  async function addCompany() {
    if (!newCompany.name.trim() || !newCompany.prefix.trim())
      return flash('error', 'Name and prefix required')
    const { error } = await supabase.from('companies').insert(newCompany)
    if (error) return flash('error', error.message)
    setNewCompany({ name: '', prefix: '' })
    flash('success', 'Company added')
    load()
  }

  async function uploadLogo(companyId, file) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) return flash('error', 'Logo must be under 2MB')
    if (!['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'].includes(file.type))
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

  const tabs = [
    { id: 'companies', label: '🏢 Companies' },
    { id: 'users', label: '👥 Users & Access' },
    { id: 'methods', label: '💳 Payment Methods' },
  ]

  return (
    <div>
      <div className="page-header">
        <h1>Settings</h1>
        <p>Manage system configuration · Super Admin only</p>
      </div>

      {msg.text && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '10px 18px', background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '13px', fontWeight: 500,
            color: tab === t.id ? 'var(--ink)' : 'var(--ink-3)',
            borderBottom: tab === t.id ? '2px solid var(--gold)' : '2px solid transparent',
            marginBottom: '-1px',
          }}>{t.label}</button>
        ))}
      </div>

      {loading ? <div className="empty-state"><p>Loading…</p></div> : <>

        {/* COMPANIES */}
        {tab === 'companies' && (
          <div>
            <div className="card" style={{ marginBottom: '16px' }}>
              <div className="card-header"><h2>Add Company</h2></div>
              <div className="card-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Company Name</label>
                    <input className="form-control" placeholder="e.g. Homesvip LLC"
                      value={newCompany.name} onChange={e => setNewCompany(c => ({ ...c, name: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Prefix (for ref numbers)</label>
                    <input className="form-control" placeholder="e.g. CO3" maxLength={4}
                      value={newCompany.prefix} onChange={e => setNewCompany(c => ({ ...c, prefix: e.target.value.toUpperCase() }))} />
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
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Prefix</th>
                      <th>Logo</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {companies.map(c => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.name}</td>
                        <td><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '12px' }}>{c.prefix}</span></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {c.logo_url && (
                              <img src={c.logo_url} alt="logo" style={{ height: '28px', objectFit: 'contain', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px' }} />
                            )}
                            <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', marginBottom: 0 }}>
                              {logoUploading === c.id ? 'Uploading…' : c.logo_url ? '↑ Replace' : '↑ Upload'}
                              <input type="file" accept="image/*" style={{ display: 'none' }}
                                onChange={e => uploadLogo(c.id, e.target.files[0])} />
                            </label>
                          </div>
                        </td>
                        <td><span className={`badge badge-${c.active ? 'approved' : 'rejected'}`}>{c.active ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <button className="btn btn-outline btn-sm" onClick={() => toggleCompany(c.id, c.active)}>
                            {c.active ? 'Deactivate' : 'Activate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* USERS & ACCESS */}
        {tab === 'users' && (
          <div>
            <div className="alert alert-info" style={{ marginBottom: '16px' }}>
              To invite a new user: <strong>Supabase dashboard → Authentication → Users → Invite user</strong>. They will appear here once they accept. Then set their role and assign companies below.
            </div>

            <div className="card">
              <div className="card-header">
                <h2>Users & Company Access</h2>
                <span className="text-sm text-muted">Check boxes to grant company access</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      {companies.filter(c => c.active).map(c => (
                        <th key={c.id} style={{ textAlign: 'center', fontSize: '11px' }}>{c.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id}>
                        <td style={{ fontWeight: 500, whiteSpace: 'nowrap' }}>{u.full_name}</td>
                        <td className="text-muted text-sm">{u.email}</td>
                        <td>
                          <select className="form-control"
                            style={{ width: 'auto', padding: '4px 8px', fontSize: '12px' }}
                            value={u.role}
                            onChange={e => updateUserRole(u.id, e.target.value)}>
                            <option value="staff">Staff</option>
                            <option value="finance">Finance Officer</option>
                            <option value="ceo">CEO</option>
                            <option value="cfo">CFO</option>
                            <option value="superadmin">Super Admin</option>
                          </select>
                        </td>
                        {companies.filter(c => c.active).map(c => {
                          const has = userHasCompany(u.id, c.id)
                          return (
                            <td key={c.id} style={{ textAlign: 'center' }}>
                              <input type="checkbox" checked={has}
                                onChange={() => toggleUserCompany(u.id, c.id, has)}
                                style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
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

        {/* PAYMENT METHODS */}
        {tab === 'methods' && (
          <div className="card">
            <div className="card-header"><h2>Payment Methods</h2></div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Method</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {methods.map(m => (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 500 }}>{m.name}</td>
                      <td><span className={`badge badge-${m.active ? 'approved' : 'rejected'}`}>{m.active ? 'Active' : 'Inactive'}</span></td>
                      <td>
                        <button className="btn btn-outline btn-sm" onClick={() => toggleMethod(m.id, m.active)}>
                          {m.active ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>}
    </div>
  )
}
