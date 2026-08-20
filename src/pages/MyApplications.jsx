import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDate } from '../lib/utils'

function AttachmentPreview({ path, name, onClose }) {
  const [url, setUrl] = useState(null)
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '')
  const isPdf = /\.pdf$/i.test(name || '')

  useEffect(() => {
    supabase.storage.from('attachments').createSignedUrl(path, 3600)
      .then(({ data }) => setUrl(data?.signedUrl || null))
  }, [path])

  return <div className="modal-overlay" style={{zIndex:2000}} onClick={event => event.target === event.currentTarget && onClose()}>
    <div className="modal" style={{maxWidth:'820px'}}>
      <div className="modal-header">
        <h3 style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</h3>
        <button className="modal-close" onClick={onClose}>×</button>
      </div>
      <div style={{minHeight:'380px',maxHeight:'70vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f3f4f6'}}>
        {!url ? <p className="text-muted">Loading document…</p>
          : isImage ? <img src={url} alt={name} style={{maxWidth:'100%',maxHeight:'70vh',objectFit:'contain'}} />
          : isPdf ? <iframe src={url} title={name} style={{width:'100%',height:'70vh',border:0}} />
          : <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer">Download document</a>}
      </div>
    </div>
  </div>
}

function AttachmentPill({ path, name }) {
  const [show, setShow] = useState(false)
  return <>
    <button type="button" className="btn btn-outline btn-sm" onClick={() => setShow(true)}
      title={`View ${name}`} style={{maxWidth:'130px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
      📎 {name}
    </button>
    {show && <AttachmentPreview path={path} name={name} onClose={() => setShow(false)} />}
  </>
}

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

export default function MyApplications({ supervisorDashboard = false }) {
  const { user, profile } = useAuth()
  const navigate   = useNavigate()

  const [applications, setApplications] = useState([])
  const [total, setTotal]               = useState(0)
  const [loading, setLoading]           = useState(true)
  const [loadError, setLoadError]       = useState('')
  const [withdrawing, setWithdrawing]   = useState(null)
  const [subordinates, setSubordinates] = useState([])
  const [selectedSubordinateId, setSelectedSubordinateId] = useState('')
  const loadRequestRef                  = React.useRef(0)

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

  useEffect(() => { load() }, [page, pageSize, search, user?.id, profile?.role, supervisorDashboard, selectedSubordinateId])

  async function load() {
    if (!user?.id) return
    const requestId = ++loadRequestRef.current
    setLoading(true)
    setLoadError('')
    const from = (page - 1) * pageSize
    const to   = from + pageSize - 1

    let visibleSubmitterIds = [user.id]
    if (profile?.role === 'supervisor') {
      const { data: assignments, error: assignmentError } = await supabase
        .from('staff_supervisors')
        .select('staff_id')
        .eq('supervisor_id', user.id)
      if (assignmentError) {
        setLoadError(`Could not load your supervised staff: ${assignmentError.message}`)
        setLoading(false)
        return
      }
      const staffIds = (assignments || []).map(row => row.staff_id)
      visibleSubmitterIds = supervisorDashboard
        ? (selectedSubordinateId ? staffIds.filter(staffId => staffId === selectedSubordinateId) : staffIds)
        : [...new Set([user.id, ...staffIds])]
      if (staffIds.length > 0) {
        const { data: staffRows, error: staffError } = await supabase
          .from('users')
          .select('id,full_name,email')
          .in('id', staffIds)
          .order('full_name')
        if (staffError) {
          setLoadError(`Could not load your subordinate list: ${staffError.message}`)
          setLoading(false)
          return
        }
        setSubordinates(staffRows || [])
      } else {
        setSubordinates([])
      }
    } else {
      setSubordinates([])
    }

    let query = supabase
      .from('applications_full')
      .select('*', { count: 'exact' })
      .in('submitted_by', visibleSubmitterIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to)

    const searchTerm = search.trim().replace(/[,%()]/g, ' ').trim()
    if (searchTerm) {
      query = query.or(
        `ref_number.ilike.%${searchTerm}%,payment_reason.ilike.%${searchTerm}%,company_name.ilike.%${searchTerm}%`
      )
    }

    const { data, count, error } = await query
    if (requestId !== loadRequestRef.current) return
    if (error) {
      console.error(error)
      setApplications([])
      setTotal(0)
      setLoadError(`Could not load your applications: ${error.message}`)
      setLoading(false)
      return
    }

    const lastPage = Math.max(1, Math.ceil((count || 0) / pageSize))
    if (page > lastPage) {
      setPage(lastPage)
      return
    }
    const rows = data || []
    if (rows.length > 0) {
      const { data: attachments, error: attachmentError } = await supabase
        .from('application_attachments')
        .select('application_id,storage_path,file_name,file_size,created_at')
        .in('application_id', rows.map(app => app.id))
        .order('created_at')
      if (attachmentError) console.error('Could not load application attachments', attachmentError)
      const attachmentsByApplication = (attachments || []).reduce((grouped, attachment) => {
        ;(grouped[attachment.application_id] ||= []).push(attachment)
        return grouped
      }, {})
      rows.forEach(app => { app.applicant_attachments = attachmentsByApplication[app.id] || [] })
    }
    setApplications(rows)
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
    pending:  applications.filter(a => ['pending','mgr_approved','fin_approved'].includes(a.status)).length,
    approved: applications.filter(a => a.status === 'approved').length,
    returned: applications.filter(a => ['returned','mgr_rejected'].includes(a.status)).length,
  }

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>{supervisorDashboard ? 'Supervisor Dashboard' : 'My Applications'}</h1>
          <p>{supervisorDashboard ? 'View your applications and read-only oversight of assigned staff requests' : 'Track and manage your payment requests'}</p>
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

      {supervisorDashboard && (
        <div className="card" style={{marginBottom:'18px'}}>
          <div className="card-header"><h2>My Subordinates</h2><span className="text-muted">{subordinates.length} assigned</span></div>
          <div className="card-body" style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
            {subordinates.length ? subordinates.map(staff => {
              const selected = selectedSubordinateId === staff.id
              return <button key={staff.id} type="button" onClick={() => { setSelectedSubordinateId(current => current === staff.id ? '' : staff.id); setPage(1) }} style={{padding:'7px 10px',border:`1px solid ${selected ? 'var(--gold)' : 'var(--border-2)'}`,borderRadius:'var(--radius-sm)',background:selected ? '#fef3c7' : 'var(--cream)',cursor:'pointer',textAlign:'left'}}>
                <strong style={{display:'block',fontSize:'12px'}}>{selected ? '✓ ' : ''}{staff.full_name}</strong><span className="text-muted text-sm">{staff.email}</span>
              </button>
            }) : <span className="text-muted">No staff are assigned to you yet. A Super Admin can assign staff in Settings.</span>}
          </div>
        </div>
      )}

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
        {supervisorDashboard && <div className="card-header"><h2>All Subordinate Applications</h2><span className="text-muted">All statuses and application types</span></div>}
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : loadError ? (
            <div className="empty-state">
              <div className="icon">⚠</div>
              <h3>Applications could not be loaded</h3>
              <p>{loadError}</p>
              <button className="btn btn-outline btn-sm" onClick={load}>Try again</button>
            </div>
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
                  {profile?.role === 'supervisor' && <th>Applicant</th>}
                  <th>Application Type</th>
                  <th>Amount (AED)</th>
                  <th>Date</th>
                  <th>Attachments</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {applications.map(app => {
                  const withinWindow = app.status === 'pending' && minutesAgo(app.submitted_at) < 30
                  const isOwner = app.submitted_by === user.id
                  const canEdit = isOwner && (app.status === 'draft' || app.status === 'returned' || app.status === 'mgr_rejected' || withinWindow)
                  const canWithdraw = isOwner && withinWindow
                  return (
                    <tr key={app.id}>
                      <td>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',fontWeight:500}}>
                          {app.ref_number || '—'}
                        </span>
                      </td>
                      <td>{app.company_name}</td>
                      {profile?.role === 'supervisor' && <td>{app.submitted_by_name || '—'}</td>}
                      <td style={{maxWidth:'200px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        <div>{app.payment_reason}</div>
                        <div className="text-muted text-sm">{app.payment_method_name || '—'}</div>
                      </td>
                      <td style={{fontWeight:500}}>{formatCurrency(app.amount)}</td>
                      <td className="text-muted">{formatDate(app.created_at)}</td>
                      <td>
                        {(app.attachment_path || app.applicant_attachments?.length > 0) ? (
                          <div style={{display:'flex',gap:'4px',flexWrap:'wrap',maxWidth:'180px'}}>
                            {app.attachment_path && <AttachmentPill path={app.attachment_path} name={app.attachment_name || 'Attachment'} />}
                            {(app.applicant_attachments || [])
                              .filter(attachment => attachment.storage_path !== app.attachment_path)
                              .map(attachment => <AttachmentPill key={attachment.storage_path}
                                path={attachment.storage_path} name={attachment.file_name || 'Attachment'} />)}
                          </div>
                        ) : <span className="text-muted">—</span>}
                      </td>
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
