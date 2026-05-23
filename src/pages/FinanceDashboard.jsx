import React, { useState, useEffect, useRef } from 'react'
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
        <span style={{ overflow:'hidden',textOverflow:'ellipsis',maxWidth:'60px',fontSize:'11px' }}>
          {name && name.length > 9 ? name.slice(0,8)+'…' : name}
        </span>
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

  // Restore filter state from sessionStorage on mount
  const STORAGE_KEY = 'finance_dashboard_filters'
  function getSaved() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  }
  const saved = getSaved()

  // Filters — restored from session
  const [search,           setSearch]           = useState(saved.search           || '')
  const [amountSearch,     setAmountSearch]     = useState(saved.amountSearch     || '')
  const [filterStatus,     setFilterStatus]     = useState(saved.filterStatus     || '')
  const [filterCompany,    setFilterCompany]    = useState(saved.filterCompany    || '')
  const [filterAttachment, setFilterAttachment] = useState(saved.filterAttachment || '')

  // Pagination — restored from session
  const [page,     setPage]     = useState(saved.page     || 1)
  const [pageSize, setPageSize] = useState(saved.pageSize || 20)

  // Persist filter state to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      search, amountSearch, filterStatus, filterCompany, filterAttachment, page, pageSize
    }))
  }, [search, amountSearch, filterStatus, filterCompany, filterAttachment, page, pageSize])

  // Reset to page 1 when filters change (but not on page/size changes themselves)
  const isFirstRender = React.useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
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

    // When searching/filtering: query ALL matching rows (no pagination limit)
    // When browsing: paginate to avoid loading unnecessary data
    const isSearching = !!(search.trim() || amountSearch.trim())
    const from = isSearching ? 0 : (page - 1) * pageSize
    const to   = isSearching ? 9999 : from + pageSize - 1

    let query = supabase
      .from('applications_full')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to)

    if (filterStatus)  query = query.eq('status', filterStatus)
    if (filterCompany) query = query.eq('company_name', filterCompany)
    if (filterAttachment === 'yes') query = query.not('attachment_path', 'is', null)
    if (filterAttachment === 'no')  query = query.is('attachment_path', null)

    // Server-side text search across all records
    if (search.trim()) {
      query = query.or(
        `ref_number.ilike.%${search.trim()}%,payment_reason.ilike.%${search.trim()}%,submitted_by_name.ilike.%${search.trim()}%,payee_name.ilike.%${search.trim()}%,attachment_name.ilike.%${search.trim()}%,remarks.ilike.%${search.trim()}%`
      )
    }

    const { data, count, error } = await query
    if (error) console.error(error)

    // Amount: server-side LIKE on cast — done client-side as postgres cant partial-match numerics
    let rows = data || []
    if (amountSearch.trim()) {
      rows = rows.filter(a => String(a.amount).includes(amountSearch.trim()))
    }

    setApplications(rows)
    // When searching, show actual result count not paginated count
    setTotal(isSearching ? rows.length : (count || 0))
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
    if (search) query = query.or(`ref_number.ilike.%${search}%,payment_reason.ilike.%${search}%,submitted_by_name.ilike.%${search}%,payee_name.ilike.%${search}%,remarks.ilike.%${search}%`)
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

  // Derived — are we in search mode?
  const isSearching = !!(search.trim() || amountSearch.trim())

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
          <div className="stat-label">{isSearching ? 'Search Results' : 'Total Records'}</div>
          <div className="stat-value">{total.toLocaleString()}</div>
          <div className="stat-sub">
            {isSearching
              ? <span style={{color:'var(--gold)',fontWeight:500}}>🔍 Searching all records</span>
              : `Page ${page} of ${totalPages}`
            }
          </div>
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
            setSearch(''); setAmountSearch(''); setFilterStatus('');
            setFilterCompany(''); setFilterAttachment(''); setPage(1)
            sessionStorage.removeItem('finance_dashboard_filters')
          }}>✕ Clear all</button>
        )}
      </div>

      {/* Search mode banner */}
      {isSearching && (
        <div style={{
          display:'flex', alignItems:'center', gap:'10px',
          padding:'10px 16px', marginBottom:'10px',
          background:'#fef3c7', border:'1px solid #fcd34d',
          borderRadius:'var(--radius-sm)', fontSize:'13px', color:'#92400e',
        }}>
          <span>🔍</span>
          <span>
            Searching <strong>all {total} matching records</strong> across the entire database
            {amountSearch && ` · Amount contains "${amountSearch}"`}
            {search && ` · Text: "${search}"`}
          </span>
          <span style={{marginLeft:'auto',fontSize:'11px',color:'#b45309'}}>
            Pagination hidden during search
          </span>
        </div>
      )}

      {/* Table */}
      <div className="card">
        <div className="table-wrap">
          {loading ? (
            <div className="empty-state"><p>Loading…</p></div>
          ) : applications.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🔍</div>
              <h3>No results found</h3>
              <p>
                {isSearching
                  ? 'No records match your search across the entire database.'
                  : 'Try adjusting your filters.'
                }
              </p>
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
                  const dbColor = companiesSorted[idx]?.accent_color
                  const col = COMPANY_PALETTE[Math.max(0,idx) % COMPANY_PALETTE.length]
                  const dotColor = dbColor || col?.accent || '#999'
                  const totalCols = 10
                  return (
                    <React.Fragment key={app.id}>
                      <tr style={{lineHeight:'1.3'}}>

                        {/* Reference + copy button */}
                        <td style={{verticalAlign:'middle',paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                            <span style={{fontFamily:"'JetBrains Mono',monospace",fontSize:'11px',fontWeight:600,whiteSpace:'nowrap'}}>
                              {app.ref_number || '—'}
                            </span>
                            <button
                              title="Copy reference number"
                              onClick={() => {
                                navigator.clipboard.writeText(app.ref_number || '')
                                const el = document.getElementById(`copied-${app.id}`)
                                if (el) { el.style.opacity=1; setTimeout(()=>el.style.opacity=0,1200) }
                              }}
                              style={{
                                background:'none', border:'1px solid var(--border)',
                                borderRadius:'3px', padding:'1px 4px', cursor:'pointer',
                                fontSize:'9px', color:'var(--ink-3)', lineHeight:1, flexShrink:0,
                              }}>
                              ⧉
                            </button>
                            <span id={`copied-${app.id}`} style={{
                              fontSize:'9px', color:'var(--status-approved)',
                              opacity:0, transition:'opacity 0.2s', whiteSpace:'nowrap',
                            }}>✓</span>
                          </div>
                        </td>

                        {/* Company — 1 line ellipsis */}
                        <td style={{verticalAlign:'middle',paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px',maxWidth:'130px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                            <span style={{
                              width:'8px',height:'8px',borderRadius:'50%',
                              background:dotColor,flexShrink:0,display:'inline-block',
                            }}/>
                            <span style={{
                              fontSize:'12px',fontWeight:500,
                              overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                              maxWidth:'110px',
                            }} title={app.company_name}>
                              {app.company_name}
                            </span>
                          </div>
                        </td>

                        {/* Applicant */}
                        <td style={{fontSize:'12px',verticalAlign:'middle',
                          maxWidth:'80px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          {app.submitted_by_name}
                        </td>

                        {/* Payment reason — 1 line ellipsis */}
                        <td style={{verticalAlign:'middle',maxWidth:'140px',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <div style={{fontSize:'12px',overflow:'hidden',
                            textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {app.payment_reason}
                          </div>
                        </td>

                        {/* Payee — 1 line */}
                        <td style={{verticalAlign:'middle',maxWidth:'100px',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <div style={{fontSize:'12px',color:'var(--ink-3)',
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {app.payee_name || '—'}
                          </div>
                        </td>

                        {/* Amount */}
                        <td style={{fontWeight:600,fontSize:'13px',verticalAlign:'middle',whiteSpace:'nowrap',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          {formatCurrency(app.amount)}
                        </td>

                        {/* Date */}
                        <td style={{fontSize:'11px',color:'var(--ink-3)',verticalAlign:'middle',whiteSpace:'nowrap',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          {formatDate(app.created_at)}
                        </td>

                        {/* Attachment — icon + 8 char filename */}
                        <td style={{verticalAlign:'middle',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          {app.attachment_path
                            ? <AttachmentPill path={app.attachment_path} name={app.attachment_name} />
                            : <span style={{fontSize:'11px',color:'var(--ink-3)'}}>—</span>
                          }
                        </td>

                        {/* Status */}
                        <td style={{verticalAlign:'middle',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <StatusBadge status={app.status} />
                        </td>

                        {/* Action */}
                        <td style={{verticalAlign:'middle',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <button className="btn btn-outline btn-sm"
                            onClick={() => navigate(`/application/${app.id}`)}>
                            Open →
                          </button>
                        </td>
                      </tr>

                      {/* Remarks sub-row — spans from company col to end */}
                      {app.remarks && (
                        <tr style={{borderTop:'none'}}>
                          <td style={{padding:'0 0 8px 0', borderTop:'none'}} />
                          <td colSpan={8} style={{
                            padding:'0 0 8px 6px',
                            borderTop:'none',
                            fontSize:'11px',
                            color:'#dc2626',
                            fontStyle:'italic',
                            overflow:'hidden',
                            textOverflow:'ellipsis',
                            whiteSpace:'nowrap',
                            maxWidth:0,
                          }}>
                            {app.remarks}
                          </td>
                          <td style={{padding:'0 0 8px 0', borderTop:'none'}} />
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination bar — hidden during search */}
        {!loading && total > 0 && !isSearching && (
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
