import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency, formatDate } from '../lib/utils'
import { COMPANY_PALETTE } from '../lib/companyColors'

// Attachment popup
function AttachmentPreview({ path, name, onClose }) {
  const [url, setUrl]         = useState(null)
  const [loading, setLoading] = useState(true)
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '')
  const isPDF   = /\.pdf$/i.test(name || '')

  useEffect(() => {
    supabase.storage.from('attachments').createSignedUrl(path, 3600)
      .then(({ data }) => { setUrl(data?.signedUrl); setLoading(false) })
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => window.removeEventListener('keydown', fn)
  }, [path])

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed',inset:0,zIndex:2000,background:'rgba(10,10,20,0.75)',
        display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }}>
      <div style={{ background:'#fff',borderRadius:'12px',boxShadow:'0 24px 64px rgba(0,0,0,0.4)',
        width:'100%',maxWidth:'780px',maxHeight:'90vh',display:'flex',flexDirection:'column',overflow:'hidden' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'14px 18px',borderBottom:'1px solid #e5e7eb',background:'#f9fafb',flexShrink:0 }}>
          <div style={{ display:'flex',alignItems:'center',gap:'8px' }}>
            <span>{isPDF ? '📄' : isImage ? '🖼' : '📎'}</span>
            <span style={{ fontSize:'13px',fontWeight:600 }}>{name}</span>
          </div>
          <div style={{ display:'flex',gap:'8px' }}>
            {url && <a href={url} download={name} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:'12px',padding:'5px 12px',background:'#1e40af',color:'#fff',
                borderRadius:'6px',textDecoration:'none',fontWeight:500 }}>↓ Download</a>}
            <button onClick={onClose} style={{ background:'#f3f4f6',border:'1px solid #d1d5db',
              borderRadius:'6px',padding:'5px 12px',cursor:'pointer',fontSize:'12px' }}>✕ Close</button>
          </div>
        </div>
        <div style={{ flex:1,overflow:'auto',display:'flex',alignItems:'center',
          justifyContent:'center',background:'#f3f4f6',minHeight:'300px' }}>
          {loading && <div style={{ textAlign:'center',color:'#6b7280' }}><div style={{ fontSize:'32px' }}>⏳</div><p>Loading…</p></div>}
          {!loading && url && isImage && <img src={url} alt={name} style={{ maxWidth:'100%',maxHeight:'70vh',objectFit:'contain' }} />}
          {!loading && url && isPDF && <iframe src={url} title={name} style={{ width:'100%',height:'70vh',border:'none' }} />}
          {!loading && url && !isImage && !isPDF && (
            <div style={{ textAlign:'center',padding:'40px' }}>
              <div style={{ fontSize:'48px',marginBottom:'12px' }}>📎</div>
              <a href={url} download={name} style={{ padding:'8px 20px',background:'#1e40af',color:'#fff',borderRadius:'6px',textDecoration:'none' }}>↓ Download {name}</a>
            </div>
          )}
        </div>
        <div style={{ padding:'8px 18px',background:'#f9fafb',borderTop:'1px solid #e5e7eb',flexShrink:0 }}>
          <p style={{ fontSize:'11px',color:'#9ca3af' }}>Click outside or press Escape to close</p>
        </div>
      </div>
    </div>
  )
}

function AttachmentPill({ path, name }) {
  const [show, setShow] = useState(false)
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '')
  const isPDF   = /\.pdf$/i.test(name || '')
  return (
    <>
      <button onClick={() => setShow(true)} title={`Preview: ${name}`}
        style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',
          borderRadius:'20px',cursor:'pointer',background:'#eff6ff',border:'1px solid #bfdbfe',
          color:'#1d4ed8',fontSize:'11px',fontWeight:500,whiteSpace:'nowrap',maxWidth:'160px' }}>
        {isPDF ? '📄' : isImage ? '🖼' : '📎'}
        <span style={{ overflow:'hidden',textOverflow:'ellipsis',maxWidth:'110px' }}>{name}</span>
        <span style={{ opacity:0.6,fontSize:'10px' }}>👁</span>
      </button>
      {show && <AttachmentPreview path={path} name={name} onClose={() => setShow(false)} />}
    </>
  )
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]

export default function FinanceDashboard() {
  const { profile }   = useAuth()
  const navigate      = useNavigate()

  const [applications, setApplications]       = useState([])
  const [total, setTotal]                     = useState(0)
  const [loading, setLoading]                 = useState(true)
  const [companies, setCompanies]             = useState([])
  const [companiesSorted, setCompaniesSorted] = useState([])

  // Filters
  const [search, setSearch]               = useState('')
  const [amountSearch, setAmountSearch]   = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterCompany, setFilterCompany] = useState('')
  const [filterAttachment, setFilterAttachment] = useState('')

  // Pagination
  const [page, setPage]         = useState(1)
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setPage(1)
  }, [search, amountSearch, filterStatus, filterCompany, filterAttachment])

  useEffect(() => {
    load()
  }, [page, pageSize, search, amountSearch, filterStatus, filterCompany, filterAttachment])

  useEffect(() => {
    supabase.from('companies').select('*').order('created_at').then(({ data }) => {
      setCompanies(data || [])
      setCompaniesSorted([...(data||[])].sort((a,b) => (a.created_at||'').localeCompare(b.created_at||'')))
    })
  }, [])

  async function load() {
    setLoading(true)
    const from = (page - 1) * pageSize
    const to   = from + pageSize - 1

    let query = supabase
      .from('applications_full')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (filterStatus)  query = query.eq('status', filterStatus)
    if (filterCompany) query = query.eq('company_name', filterCompany)
    if (filterAttachment === 'yes') query = query.not('attachment_path', 'is', null)
    if (filterAttachment === 'no')  query = query.is('attachment_path', null)

    // Text search (ref, reason, name, payee)
    if (search) {
      query = query.or(
        `ref_number.ilike.%${search}%,payment_reason.ilike.%${search}%,submitted_by_name.ilike.%${search}%,payee_name.ilike.%${search}%`
      )
    }

    const { data, count, error } = await query
    if (error) console.error(error)

    // Amount filter (client-side — partial match e.g. "105" matches 105, 1050, 2105)
    let rows = data || []
    if (amountSearch.trim()) {
      rows = rows.filter(a => String(a.amount).includes(amountSearch.trim()))
    }

    setApplications(rows)
    setTotal(count || 0)
    setLoading(false)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Summary counts (from current page only — full counts need separate queries)
  const pagePending   = applications.filter(a => a.status === 'pending').length
  const pageApproved  = applications.filter(a => a.status === 'approved').length
  const pageEscalated = applications.filter(a => a.status === 'escalated').length
  const pageAmount    = applications.filter(a => a.status === 'approved').reduce((s,a) => s + Number(a.amount), 0)

  async function exportCSV() {
    // Export ALL matching records (no pagination)
    let query = supabase.from('applications_full').select('*').order('created_at', { ascending: false })
    if (filterStatus)  query = query.eq('status', filterStatus)
    if (filterCompany) query = query.eq('company_name', filterCompany)
    if (search) query = query.or(`ref_number.ilike.%${search}%,payment_reason.ilike.%${search}%,submitted_by_name.ilike.%${search}%,payee_name.ilike.%${search}%`)
    const { data } = await query
    let rows = data || []
    if (amountSearch.trim()) rows = rows.filter(a => String(a.amount).includes(amountSearch.trim()))

    const csv = [
      ['Ref','Date','Company','Applicant','Payment Reason','Method','Amount','Payee','Bank','Account','Status','Attachment'],
      ...rows.map(a => [
        a.ref_number, a.created_at?.slice(0,10), a.company_name, a.submitted_by_name,
        a.payment_reason, a.payment_method_name, a.amount, a.payee_name,
        a.bank_name, a.bank_account, a.status, a.attachment_name||''
      ])
    ].map(r => r.map(v => `"${String(v||'').replace(/"/g,'""')}"`).join(',')).join('\n')

    const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const el   = document.createElement('a')
    el.href = url; el.download = `payments-${Date.now()}.csv`; el.click()
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

      {/* Stats — current page */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Total Records</div>
          <div className="stat-value">{total.toLocaleString()}</div>
          <div className="stat-sub">Page {page} of {totalPages}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending (page)</div>
          <div className="stat-value" style={{color:'var(--status-pending)'}}>{pagePending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Approved (page)</div>
          <div className="stat-value" style={{color:'var(--status-approved)'}}>{pageApproved}</div>
          <div className="stat-sub">AED {formatCurrency(pageAmount)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Escalated (page)</div>
          <div className="stat-value" style={{color:'var(--status-escalated)'}}>{pageEscalated}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'12px', flexWrap:'wrap', alignItems:'center' }}>
        <input className="form-control" style={{minWidth:'220px',flex:'2'}}
          placeholder="🔍 Search ref, reason, applicant, payee…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <input className="form-control" style={{width:'140px'}}
          placeholder="💰 Amount e.g. 105"
          type="number" step="0.01" min="0"
          value={amountSearch} onChange={e => setAmountSearch(e.target.value)} />
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
          <option value="">All (attach.)</option>
          <option value="yes">📎 Has attachment</option>
          <option value="no">No attachment</option>
        </select>
        {(search||amountSearch||filterStatus||filterCompany||filterAttachment) && (
          <button className="btn btn-outline btn-sm" onClick={() => {
            setSearch(''); setAmountSearch(''); setFilterStatus(''); setFilterCompany(''); setFilterAttachment('')
          }}>✕ Clear</button>
        )}
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : applications.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🔍</div>
              <h3>No results found</h3>
              <p>Try adjusting your filters</p>
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
                {applications.map(app => {
                  const idx = companiesSorted.findIndex(c => c.name === app.company_name)
                  const col = COMPANY_PALETTE[Math.max(0,idx) % COMPANY_PALETTE.length]
                  return (
                    <tr key={app.id}>
                      <td>
                        <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'12px',fontWeight:500}}>
                          {app.ref_number || '—'}
                        </span>
                      </td>
                      <td className="text-sm">
                        <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                          <span style={{width:'8px',height:'8px',borderRadius:'50%',background:col?.accent||'#999',flexShrink:0,display:'inline-block'}}/>
                          {app.company_name}
                        </div>
                      </td>
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
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination bar */}
        {!loading && total > 0 && (
          <div style={{
            display:'flex', alignItems:'center', justifyContent:'space-between',
            padding:'12px 20px', borderTop:'1px solid var(--border-2)',
            flexWrap:'wrap', gap:'10px',
          }}>
            {/* Left: rows per page */}
            <div style={{display:'flex',alignItems:'center',gap:'8px',fontSize:'13px',color:'var(--ink-3)'}}>
              <span>Rows per page:</span>
              {PAGE_SIZE_OPTIONS.map(s => (
                <button key={s}
                  onClick={() => { setPageSize(s); setPage(1) }}
                  style={{
                    padding:'3px 10px', borderRadius:'6px', cursor:'pointer',
                    fontSize:'12px', fontWeight: pageSize===s ? 600 : 400,
                    background: pageSize===s ? 'var(--ink)' : 'transparent',
                    color: pageSize===s ? '#fff' : 'var(--ink-3)',
                    border: pageSize===s ? 'none' : '1px solid var(--border)',
                  }}>
                  {s}
                </button>
              ))}
            </div>

            {/* Centre: record range */}
            <div style={{fontSize:'13px',color:'var(--ink-3)'}}>
              Showing <strong>{((page-1)*pageSize)+1}</strong> – <strong>{Math.min(page*pageSize, total)}</strong> of <strong>{total.toLocaleString()}</strong>
            </div>

            {/* Right: page nav */}
            <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
              <button className="btn btn-outline btn-sm" disabled={page===1} onClick={() => setPage(1)}>«</button>
              <button className="btn btn-outline btn-sm" disabled={page===1} onClick={() => setPage(p=>p-1)}>‹ Prev</button>
              {/* Page number pills */}
              {Array.from({length: Math.min(5, totalPages)}, (_, i) => {
                let p
                if (totalPages <= 5)       p = i + 1
                else if (page <= 3)        p = i + 1
                else if (page >= totalPages-2) p = totalPages - 4 + i
                else                       p = page - 2 + i
                return (
                  <button key={p}
                    onClick={() => setPage(p)}
                    style={{
                      padding:'4px 10px', borderRadius:'6px', cursor:'pointer',
                      fontSize:'12px', fontWeight: page===p ? 600 : 400,
                      background: page===p ? 'var(--ink)' : 'transparent',
                      color: page===p ? '#fff' : 'var(--ink-3)',
                      border: page===p ? 'none' : '1px solid var(--border)',
                    }}>
                    {p}
                  </button>
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
