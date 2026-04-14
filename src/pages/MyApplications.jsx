import { useState, useEffect } from 'react'
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
      const elapsed = minutesAgo(submittedAt)
      const remaining = Math.max(0, 30 - elapsed)
      setMins(remaining)
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [submittedAt])

  if (mins <= 0) return null
  return (
    <div style={{
      fontSize: '10px', color: 'var(--status-pending)',
      background: 'var(--status-pending-bg)',
      padding: '1px 6px', borderRadius: '20px', marginTop: '3px',
      display: 'inline-block'
    }}>
      ⏱ {Math.ceil(mins)}m to edit
    </div>
  )
}

export default function MyApplications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [withdrawing, setWithdrawing] = useState(null)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase
      .from('applications_full')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) console.error('Load error:', error)
    setApplications(data || [])
    setLoading(false)
  }

  async function withdraw(app) {
    if (!confirm('Withdraw this application? It will go back to Draft and you can resubmit later.')) return
    setWithdrawing(app.id)
    const { error } = await supabase
      .from('applications')
      .update({ status: 'draft', submitted_at: null, outcome_note: null })
      .eq('id', app.id)
    if (error) {
      alert('Could not withdraw: ' + error.message)
    } else {
      await supabase.from('audit_log').insert({
        application_id: app.id,
        action_by: user.id,
        action: 'edited',
        note: 'Withdrawn by applicant within edit window',
      })
      await load()
    }
    setWithdrawing(null)
  }

  const filtered = applications.filter(a =>
    !search ||
    a.ref_number?.toLowerCase().includes(search.toLowerCase()) ||
    a.payment_reason?.toLowerCase().includes(search.toLowerCase()) ||
    a.company_name?.toLowerCase().includes(search.toLowerCase())
  )

  const counts = {
    total:    applications.length,
    pending:  applications.filter(a => a.status === 'pending').length,
    approved: applications.filter(a => a.status === 'approved').length,
    returned: applications.filter(a => a.status === 'returned').length,
    draft:    applications.filter(a => a.status === 'draft').length,
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

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{counts.total}</div>
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
          <div className="stat-label">Draft / Returned</div>
          <div className="stat-value" style={{color:'var(--status-draft)'}}>
            {counts.draft + counts.returned}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="filter-bar">
        <input className="form-control search-input"
          placeholder="Search by ref, reason, company…"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : filtered.length === 0 ? (
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
                {filtered.map(app => {
                  const withinWindow = app.status === 'pending' && minutesAgo(app.submitted_at) < 30
                  const canEdit = app.status === 'draft' || app.status === 'returned' || withinWindow
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
                            onClick={() => navigate(`/application/${app.id}`)}>
                            View
                          </button>
                          {canEdit && (
                            <button className="btn btn-primary btn-sm"
                              onClick={() => navigate(`/new-application?edit=${app.id}`)}>
                              ✎ Edit
                            </button>
                          )}
                          {canWithdraw && (
                            <button
                              className="btn btn-sm"
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
      </div>
    </div>
  )
}
