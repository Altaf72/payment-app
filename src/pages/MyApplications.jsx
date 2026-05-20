import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDate } from '../lib/utils'

function minutesAgo(dateStr) {
  if (!dateStr) return Infinity
  return (Date.now() - new Date(dateStr).getTime()) / 1000 / 60
}

function CountdownTimer({ submittedAt }) {
  const [mins, setMins] = useState(0)
  useEffect(() => {
    function tick() {
      setMins(Math.max(0, 30 - minutesAgo(submittedAt)))
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [submittedAt])
  if (mins <= 0) return null
  return (
    <div style={{ fontSize:'10px', color:'var(--status-pending)', background:'var(--status-pending-bg)',
      padding:'1px 6px', borderRadius:'20px', marginTop:'3px', display:'inline-block' }}>
      ⏱ {Math.ceil(mins)}m to edit
    </div>
  )
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]

export default function MyApplications() {
  const { user }   = useAuth()
  const navigate   = useNavigate()

  const [applications, setApplications] = useState([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [withdrawing, setWithdrawing]   = useState(null)

  const STORAGE_KEY = 'my_applications_filters'
  function getSaved() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  }
  const saved = getSaved()

  const [search,   setSearch]   = useState(saved.search   || '')
  const [page,     setPage]     = useState(saved.page     || 1)
  const [pageSize, setPageSize] = useState(saved.pageSize || 20)

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ search, page, pageSize }))
  }, [search, page, pageSize])

  const isFirstRender = React.useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setPage(1)
  }, [search])

  useEffect(() => { load() }, [page, pageSize, search])

  async function load() {
    setLoading(true)
    const from = (page - 1) * pageSize
    const to   = from + pageSize - 1

    let query = supabase
      .from('applications_full')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (search) {
      query = query.or(
        `ref_number.ilike.%${search}%,payment_reason.ilike.%${search}%,company_name.ilike.%${search}%`
      )
    }

    const { data, count, error } = await query
    if (error) console.error(error)
    setApplications(data || [])
    setTotal(count || 0)
    setLoading(false)
  }

  async function withdraw(app) {
    if (!confirm('Withdraw this application? It will go back to Draft.')) return
    setWithdrawing(app.id)
    const { error } = await supabase
      .from('applications')
      .update({ status: 'draft', submitted_at: null, outcome_note: null })
      .eq('id', app.id)
    if (error) {
      alert('Could not withdraw: ' + error.message)
    } else {
      await supabase.from('audit_log').insert({
        application_id: app.id, action_by: user.id,
        action: 'edited', note: 'Withdrawn by applicant within edit window',
      })
      await load()
    }
    setWithdrawing(null)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const counts = {
    total:    total,
    pending:  applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    returned: applications.filter(a => a.status === 'returned').length,
  }

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>My Applications</h1>
          <p>Track and manage your payment requests</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/new-application')}>
          ＋ New Application
        </button>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending</div>
          <div className="stat-value" style={{color:'var(--status-pending)'}}>{counts.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved</div>
          <div className="stat-value" style={{color:'var(--status-approved)'}}>{counts.approved}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Returned</div>
          <div className="stat-value" style={{color:'var(--status-returned)'}}>{counts.returned}</div>
        </div>
      </div>

      <div className="filter-bar">
        <input className="form-control search-input"
          placeholder="Search by ref, reason, company…"
          value={search} onChange={e => setSearch(e.target.value)} />
        {search && (
          <button className="btn btn-outline btn-sm" onClick={() => {
            setSearch(''); setPage(1)
            sessionStorage.removeItem('my_applications_filters')
          }}>✕ Clear</button>
        )}
      </div>

      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : applications.length === 0 ? (
            <div className="empty-state">
              <div className="icon">📋</div>
              <h3>No applications yet</h3>
              <p>Click "New Application" to submit your first payment request</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Company</th>
                  <th>Payment Reason</th>
                  <th>Amount (AED)</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {applications.map(app => {
                  const withinWindow = app.status === 'pending' && minutesAgo(app.submitted_at) < 30
                  const canEdit   = app.status === 'draft' || app.status === 'returned' || withinWindow
                  const canWithdraw = withinWindow
                  return (
                    <tr key={app.id}>
                      <td>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',fontWeight:500}}>
                          {app.ref_number || '—'}
                        </span>
                      </td>
                      <td>{app.company_name}</td>
                      <td style={{maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {app.payment_reason}
                      </td>
                      <td style={{fontWeight:500}}>{formatCurrency(app.amount)}</td>
                      <td className="text-muted">{formatDate(app.created_at)}</td>
                      <td>
                        <StatusBadge status={app.status} />
                        {withinWindow && <CountdownTimer submittedAt={app.submitted_at} />}
                        {app.status === 'returned' && app.outcome_note && (
                          <div className="text-sm text-muted mt-1" style={{maxWidth:'180px'}}>
                            ↩ {app.outcome_note}
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          <button className="btn btn-outline btn-sm"
                            onClick={() => navigate(`/application/${app.id}`)}>View</button>
                          {canEdit && (
                            <button className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/new-application?edit=${app.id}`)}>✎ Edit</button>
                          )}
                          {canWithdraw && (
                            <button className="btn btn-sm"
                              style={{background:'#fee2e2',color:'#991b1b',border:'1px solid #fca5a5'}}
                              disabled={withdrawing === app.id}
                              onClick={() => withdraw(app)}>
                              {withdrawing === app.id ? '…' : '✕ Withdraw'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {!loading && total > 0 && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'12px 20px', borderTop:'1px solid var(--border-2)',
            flexWrap:'wrap', gap:'10px',
          }}>
            <div style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',color:'var(--ink-3)'}}>
              <span>Rows per page:</span>
              {PAGE_SIZE_OPTIONS.map(s => (
                <button key={s} onClick={() => { setPageSize(s); setPage(1) }}
                  style={{
                    padding:'3px 10px', borderRadius:'6px', cursor:'pointer',
                    fontSize:'12px', fontWeight: pageSize===s ? 600 : 400,
                    background: pageSize===s ? 'var(--ink)' : 'transparent',
                    color: pageSize===s ? '#fff' : 'var(--ink-3)',
                    border: pageSize===s ? 'none' : '1px solid var(--border)',
                  }}>{s}</button>
              ))}
            </div>

            <div style={{fontSize:'13px',color:'var(--ink-3)'}}>
              Showing <strong>{((page-1)*pageSize)+1}</strong> – <strong>{Math.min(page*pageSize,total)}</strong> of <strong>{total}</strong>
            </div>

            <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
              <button className="btn btn-outline btn-sm" disabled={page===1} onClick={() => setPage(1)}>«</button>
              <button className="btn btn-outline btn-sm" disabled={page===1} onClick={() => setPage(p=>p-1)}>‹ Prev</button>
              {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                let p
                if (totalPages <= 5)           p = i + 1
                else if (page <= 3)            p = i + 1
                else if (page >= totalPages-2) p = totalPages - 4 + i
                else                           p = page - 2 + i
                return (
                  <button key={p} onClick={() => setPage(p)}
                    style={{
                      padding:'4px 10px', borderRadius:'6px', cursor:'pointer',
                      fontSize:'12px', fontWeight: page===p ? 600 : 400,
                      background: page===p ? 'var(--ink)' : 'transparent',
                      color: page===p ? '#fff' : 'var(--ink-3)',
                      border: page===p ? 'none' : '1px solid var(--border)',
                    }}>{p}</button>
                )
              })}
              <button className="btn btn-outline btn-sm" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}>Next ›</button>
              <button className="btn btn-outline btn-sm" disabled={page===totalPages} onClick={() => setPage(totalPages)}>»</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
