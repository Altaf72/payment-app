import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDate } from '../lib/utils'

// ── Attachment popup preview ─────────────────────────────────
function AttachmentPreview({ path, name, onClose }) {
  const [url, setUrl]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const overlayRef        = useRef()
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '')
  const isPDF   = /\.pdf$/i.test(name || '')

  useEffect(() => {
    async function fetch() {
      const { data, error } = await supabase.storage
        .from('attachments')
        .createSignedUrl(path, 3600)
      if (error) setError(error.message)
      else setUrl(data?.signedUrl)
      setLoading(false)
    }
    fetch()
    // Close on Escape
    function onKey(e) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [path])

  function handleOverlayClick(e) {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(10,10,20,0.75)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: '12px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        width: '100%', maxWidth: '780px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 18px', borderBottom: '1px solid #e5e7eb',
          background: '#f9fafb', flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>{isPDF ? '📄' : isImage ? '🖼' : '📎'}</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#111' }}>{name}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            {url && (
              <a
                href={url}
                download={name}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '12px', padding: '5px 12px',
                  background: '#1e40af', color: '#fff',
                  borderRadius: '6px', textDecoration: 'none',
                  fontWeight: 500,
                }}
              >
                ↓ Download
              </a>
            )}
            <button
              onClick={onClose}
              style={{
                background: '#f3f4f6', border: '1px solid #d1d5db',
                borderRadius: '6px', padding: '5px 12px',
                cursor: 'pointer', fontSize: '12px', fontWeight: 500,
              }}
            >
              ✕ Close
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{
          flex: 1, overflow: 'auto',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#f3f4f6', minHeight: '300px',
        }}>
          {loading && (
            <div style={{ textAlign: 'center', color: '#6b7280' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>⏳</div>
              <p style={{ fontSize: '13px' }}>Loading preview…</p>
            </div>
          )}
          {error && (
            <div style={{ textAlign: 'center', color: '#dc2626' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>⚠️</div>
              <p style={{ fontSize: '13px' }}>Could not load file: {error}</p>
            </div>
          )}
          {!loading && !error && url && isImage && (
            <img
              src={url}
              alt={name}
              style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', display: 'block' }}
            />
          )}
          {!loading && !error && url && isPDF && (
            <iframe
              src={url}
              title={name}
              style={{ width: '100%', height: '70vh', border: 'none', display: 'block' }}
            />
          )}
          {!loading && !error && url && !isImage && !isPDF && (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>📎</div>
              <p style={{ fontSize: '14px', marginBottom: '16px' }}>Preview not available for this file type.</p>
              <a href={url} download={name} style={{
                padding: '8px 20px', background: '#1e40af', color: '#fff',
                borderRadius: '6px', textDecoration: 'none', fontSize: '13px',
              }}>↓ Download {name}</a>
            </div>
          )}
        </div>

        <div style={{
          padding: '8px 18px', background: '#f9fafb',
          borderTop: '1px solid #e5e7eb', flexShrink: 0,
        }}>
          <p style={{ fontSize: '11px', color: '#9ca3af' }}>
            Click outside or press Escape to close
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Attachment pill button ───────────────────────────────────
function AttachmentPill({ path, name }) {
  const [showPreview, setShowPreview] = useState(false)
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '')
  const isPDF   = /\.pdf$/i.test(name || '')
  const icon    = isPDF ? '📄' : isImage ? '🖼' : '📎'

  return (
    <>
      <button
        onClick={() => setShowPreview(true)}
        title={`Preview: ${name}`}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '4px',
          padding: '3px 8px', borderRadius: '20px', cursor: 'pointer',
          background: '#eff6ff', border: '1px solid #bfdbfe',
          color: '#1d4ed8', fontSize: '11px', fontWeight: 500,
          whiteSpace: 'nowrap', maxWidth: '160px',
        }}
      >
        {icon}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '110px' }}>
          {name}
        </span>
        <span style={{ opacity: 0.6, fontSize: '10px' }}>👁</span>
      </button>

      {showPreview && (
        <AttachmentPreview
          path={path}
          name={name}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  )
}

// ── Main dashboard ───────────────────────────────────────────
export default function FinanceDashboard() {
  const { profile } = useAuth()
  const navigate    = useNavigate()
  const [applications, setApplications]     = useState([])
  const [loading, setLoading]               = useState(true)
  const [search, setSearch]                 = useState('')
  const [filterStatus, setFilterStatus]     = useState('')
  const [filterCompany, setFilterCompany]   = useState('')
  const [filterAttachment, setFilterAttachment] = useState('')
  const [companies, setCompanies]           = useState([])

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const [{ data: apps }, { data: cos }] = await Promise.all([
      supabase.from('applications_full').select('*').order('created_at', { ascending: false }),
      supabase.from('companies').select('*').eq('active', true),
    ])
    setApplications(apps || [])
    setCompanies(cos || [])
    setLoading(false)
  }

  const filtered = applications.filter(a => {
    const matchSearch = !search ||
      a.ref_number?.toLowerCase().includes(search.toLowerCase()) ||
      a.payment_reason?.toLowerCase().includes(search.toLowerCase()) ||
      a.submitted_by_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.payee_name?.toLowerCase().includes(search.toLowerCase()) ||
      a.attachment_name?.toLowerCase().includes(search.toLowerCase())
    const matchStatus     = !filterStatus     || a.status === filterStatus
    const matchCompany    = !filterCompany    || a.company_name === filterCompany
    const matchAttachment = !filterAttachment
      || (filterAttachment === 'yes' && a.attachment_path)
      || (filterAttachment === 'no'  && !a.attachment_path)
    return matchSearch && matchStatus && matchCompany && matchAttachment
  })

  const counts = {
    total:      applications.length,
    pending:    applications.filter(a => a.status === 'pending').length,
    escalated:  applications.filter(a => a.status === 'escalated').length,
    approved:   applications.filter(a => a.status === 'approved').length,
    withAttach: applications.filter(a => a.attachment_path).length,
    totalAmount: applications.filter(a => a.status === 'approved')
                             .reduce((s, a) => s + Number(a.amount), 0),
  }

  async function exportCSV() {
    const rows = [
      ['Ref','Company','Submitted By','Payment Reason','Method','Amount',
       'Payee','Bank','Account','Status','Date','Attachment'],
      ...filtered.map(a => [
        a.ref_number, a.company_name, a.submitted_by_name, a.payment_reason,
        a.payment_method_name, a.amount, a.payee_name, a.bank_name, a.bank_account,
        a.status, formatDate(a.created_at), a.attachment_name || ''
      ])
    ]
    const csv  = rows.map(r => r.map(v => `"${v || ''}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const el   = document.createElement('a')
    el.href = url; el.download = `applications-${Date.now()}.csv`; el.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>Finance Dashboard</h1>
          <p>All payment applications · {profile?.full_name}</p>
        </div>
        <button className="btn btn-outline" onClick={exportCSV}>↓ Export CSV</button>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total</div>
          <div className="stat-value">{counts.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Review</div>
          <div className="stat-value" style={{color:'var(--status-pending)'}}>{counts.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved Total</div>
          <div className="stat-value" style={{fontSize:'18px'}}>AED {formatCurrency(counts.totalAmount)}</div>
          <div className="stat-sub">{counts.approved} applications</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">With Attachments</div>
          <div className="stat-value" style={{color:'#1d4ed8'}}>{counts.withAttach}</div>
          <div className="stat-sub">of {counts.total} total</div>
        </div>
      </div>

      {/* Filters */}
      <div className="filter-bar">
        <input className="form-control search-input"
          placeholder="Search ref, reason, applicant, payee, filename…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="form-control" style={{width:'auto'}} value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending</option>
          <option value="escalated">Escalated</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="returned">Returned</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <select className="form-control" style={{width:'auto'}} value={filterCompany}
          onChange={e => setFilterCompany(e.target.value)}>
          <option value="">All companies</option>
          {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <select className="form-control" style={{width:'auto'}} value={filterAttachment}
          onChange={e => setFilterAttachment(e.target.value)}>
          <option value="">All (attachment)</option>
          <option value="yes">📎 Has attachment</option>
          <option value="no">No attachment</option>
        </select>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🔍</div>
              <h3>No results found</h3>
              <p>Try adjusting your filters or search term</p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Company</th>
                  <th>Applicant</th>
                  <th>Payment Reason</th>
                  <th>Payee</th>
                  <th>Amount (AED)</th>
                  <th>Date</th>
                  <th>Attachment</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(app => (
                  <tr key={app.id}>
                    <td>
                      <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',fontWeight:500}}>
                        {app.ref_number || '—'}
                      </span>
                    </td>
                    <td className="text-sm">{app.company_name}</td>
                    <td className="text-sm">{app.submitted_by_name}</td>
                    <td style={{maxWidth:'180px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                      {app.payment_reason}
                    </td>
                    <td className="text-sm text-muted">{app.payee_name || '—'}</td>
                    <td style={{fontWeight:500}}>{formatCurrency(app.amount)}</td>
                    <td className="text-muted text-sm">{formatDate(app.created_at)}</td>
                    <td>
                      {app.attachment_path
                        ? <AttachmentPill path={app.attachment_path} name={app.attachment_name} />
                        : <span className="text-muted text-sm">—</span>
                      }
                    </td>
                    <td><StatusBadge status={app.status} /></td>
                    <td>
                      <button className="btn btn-outline btn-sm"
                        onClick={() => navigate(`/application/${app.id}`)}>
                        Open →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
