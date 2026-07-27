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

function formatFileSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function AttachmentPill({ path, name, size, tabIndex }) {
  const [show, setShow] = useState(false)
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '')
  const isPDF   = /\.pdf$/i.test(name || '')
  const displayName = size ? `${name} (${formatFileSize(size)})` : name
  return (
    <>
      <button onClick={() => setShow(true)} title={`Preview: ${displayName}`} tabIndex={tabIndex}
        style={{ display:'inline-flex',alignItems:'center',gap:'4px',padding:'3px 8px',
          borderRadius:'20px',cursor:'pointer',background:'#eff6ff',border:'1px solid #bfdbfe',
          color:'#1d4ed8',fontSize:'11px',fontWeight:500,whiteSpace:'nowrap',maxWidth:'160px' }}>
        {isPDF ? '📄' : isImage ? '🖼' : '📎'}
        <span style={{ overflow:'hidden',textOverflow:'ellipsis',maxWidth:'60px',fontSize:'11px' }}>
          {displayName && displayName.length > 9 ? displayName.slice(0,8)+'…' : displayName}
        </span>
        <span style={{ opacity:0.6,fontSize:'10px' }}>👁</span>
      </button>
      {show && <AttachmentPreview path={path} name={name} onClose={() => setShow(false)} />}
    </>
  )
}

function parseFinanceAttachment(note) {
  if (!note) return null
  try {
    const data = JSON.parse(note)
    if (data?.type === 'finance_attachment' && data.path && data.name) return data
  } catch {}
  return null
}

function parseDeletedFinanceAttachment(note) {
  if (!note) return null
  try {
    const data = JSON.parse(note)
    if (data?.type === 'finance_attachment_deleted' && data.path) return data
  } catch {}
  return null
}

const PAGE_SIZE_OPTIONS = [20, 50, 100]
const USED_REFS_KEY = 'finance_dashboard_used_refs'
const QUERY_PAGE_SIZE = 1000

function loadUsedRefs() {
  try {
    const refs = JSON.parse(localStorage.getItem(USED_REFS_KEY) || '[]')
    return new Set(Array.isArray(refs) ? refs : [])
  } catch {
    return new Set()
  }
}

// Lets finance staff move through values with Tab and copy the focused value
// straight into another application with Ctrl/Cmd+C.
function CopyableField({ children, copyText, label, title, style, onCopy }) {
  const copy = async () => {
    const text = String(copyText ?? '')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      textarea.remove()
    }
    onCopy?.()
  }

  return <div className="dashboard-copy-field" tabIndex={0} role="textbox"
    aria-label={label || `Copy ${copyText || 'field'}`} title={title} style={style}
    onKeyDown={event => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        copy()
      }
    }}>
    {children}
  </div>
}

export default function FinanceDashboard() {
  const { user, profile } = useAuth()
  const navigate      = useNavigate()

  const [applications, setApplications]       = useState([])
  const [total, setTotal]                     = useState(0)
  const [loading, setLoading]                 = useState(true)
  const [loadError, setLoadError]             = useState('')
  const [companies, setCompanies]             = useState([])
  const [companiesSorted, setCompaniesSorted] = useState([])
  const [allowedCompanyIds, setAllowedCompanyIds] = useState(null)
  const [scopeReady, setScopeReady]           = useState(false)
  const [scopeError, setScopeError]           = useState('')
  const [selected, setSelected]         = useState(new Set())
  const [selectedRecords, setSelectedRecords] = useState(new Map())
  const [showBatchModal, setShowBatchModal] = useState(false)
  const [batchForm, setBatchForm]       = useState({ transfer_ref:'', transfer_date:'', note:'' })
  const [creatingBatch, setCreatingBatch] = useState(false)
  const [batchMsg, setBatchMsg]         = useState('')
  const [quickActionLoading, setQuickActionLoading] = useState(null)
  const [undoBatchLoading, setUndoBatchLoading] = useState(null)
  const [usedRefs, setUsedRefs] = useState(loadUsedRefs)
  const [reviewedIds, setReviewedIds] = useState(() => new Set())
  const [showUncheckedOnly, setShowUncheckedOnly] = useState(false)
  const loadRequestRef = useRef(0)

  // Restore filter state from sessionStorage on mount
  const STORAGE_KEY = 'finance_dashboard_filters'
  function getSaved() {
    try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
  }
  const saved = getSaved()
  const isManager = profile?.role === 'manager'

  // Filters — restored from session
  const [search,           setSearch]           = useState(saved.search           || '')
  const [amountSearch,     setAmountSearch]     = useState(saved.amountSearch     || '')
  const [filterStatus,     setFilterStatus]     = useState(saved.filterStatus     || (isManager ? 'pending' : ''))
  const [filterCompany,    setFilterCompany]    = useState(saved.filterCompany    || '')
  const [filterBatch,      setFilterBatch]      = useState(saved.filterBatch      || '')
  const [filterAttachment, setFilterAttachment] = useState(saved.filterAttachment || '')

  // Pagination — restored from session
  const [page,     setPage]     = useState(saved.page     || 1)
  const [pageSize, setPageSize] = useState(saved.pageSize || 20)

  // Persist filter state to sessionStorage whenever it changes
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      search, amountSearch, filterStatus, filterCompany, filterBatch, filterAttachment, page, pageSize
    }))
  }, [search, amountSearch, filterStatus, filterCompany, filterBatch, filterAttachment, page, pageSize])

  // Reset to page 1 when filters change (but not on page/size changes themselves)
  const isFirstRender = React.useRef(true)
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setPage(1)
  }, [search, amountSearch, filterStatus, filterCompany, filterBatch, filterAttachment])

  useEffect(() => {
    load()
  }, [page, pageSize, search, amountSearch, filterStatus, filterCompany, filterBatch, filterAttachment, scopeReady, scopeError, allowedCompanyIds])

  useEffect(() => {
    let active = true
    async function loadCompanyScope() {
      if (!user?.id || !profile?.role) return
      setScopeReady(false)
      setScopeError('')
      const { data: companyRows, error: companyError } = await supabase
        .from('companies')
        .select('*')
        .order('created_at')

      if (!active) return
      if (companyError) {
        setScopeError(`Could not load company access: ${companyError.message}`)
        setCompanies([])
        setCompaniesSorted([])
        setAllowedCompanyIds([])
        setScopeReady(true)
        return
      }

      let visibleCompanies = companyRows || []
      if (['manager', 'cfo'].includes(profile.role)) {
        const { data: assignments, error: assignmentError } = await supabase
          .from('user_companies')
          .select('company_id')
          .eq('user_id', user.id)

        if (!active) return
        if (assignmentError) {
          setScopeError(`Could not verify assigned companies: ${assignmentError.message}`)
          visibleCompanies = []
        } else {
          const ids = new Set((assignments || []).map(row => row.company_id))
          visibleCompanies = visibleCompanies.filter(company => ids.has(company.id))
        }
        setAllowedCompanyIds(visibleCompanies.map(company => company.id))
      } else {
        setAllowedCompanyIds(null)
      }

      setCompanies(visibleCompanies)
      setCompaniesSorted([...visibleCompanies].sort((a,b) => (a.created_at||'').localeCompare(b.created_at||'')))
      setScopeReady(true)
    }
    loadCompanyScope()
    return () => { active = false }
  }, [user?.id, profile?.role])

  function markReferenceUsed(refNumber) {
    const ref = String(refNumber || '').trim()
    if (!ref) return
    setUsedRefs(current => {
      const next = new Set(current)
      next.add(ref)
      localStorage.setItem(USED_REFS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  function toggleReviewed(applicationId) {
    setReviewedIds(current => {
      const next = new Set(current)
      if (next.has(applicationId)) next.delete(applicationId)
      else next.add(applicationId)
      return next
    })
  }

  async function load() {
    if (!scopeReady) return
    const requestId = ++loadRequestRef.current
    setLoading(true)
    if (scopeError) {
      setApplications([])
      setTotal(0)
      setLoadError(scopeError)
      setLoading(false)
      return
    }
    setLoadError('')

    // When searching/filtering: query ALL matching rows (no pagination limit)
    // When browsing: paginate to avoid loading unnecessary data
    const isSearching = !!(search.trim() || amountSearch.trim())
    if (Array.isArray(allowedCompanyIds) && allowedCompanyIds.length === 0) {
      if (requestId !== loadRequestRef.current) return
      setApplications([])
      setTotal(0)
      setLoading(false)
      return
    }

    const textTerm = search.trim().replace(/[,%()]/g, ' ').trim()
    const batchTerm = filterBatch.trim().replace(/[,%()]/g, ' ').trim()
    let commentMatchIds = []
    if (textTerm) {
      let commentOffset = 0
      while (true) {
        const commentResult = await supabase
          .from('audit_log')
          .select('application_id')
          .eq('action', 'edited')
          .like('note', 'Comment: %')
          .ilike('note', `%${textTerm}%`)
          .range(commentOffset, commentOffset + QUERY_PAGE_SIZE - 1)
        if (commentResult.error) {
          console.error('Finance comment search failed', commentResult.error)
          break
        }
        commentMatchIds.push(...(commentResult.data || []).map(row => row.application_id).filter(Boolean))
        if ((commentResult.data || []).length < QUERY_PAGE_SIZE) break
        commentOffset += QUERY_PAGE_SIZE
      }
      commentMatchIds = [...new Set(commentMatchIds)]
    }

    function buildQuery(from, to, includeCount = false, includeTextSearch = true) {
      let query = supabase
        .from('applications_full')
        .select('*', includeCount ? { count: 'exact' } : {})
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (Array.isArray(allowedCompanyIds)) query = query.in('company_id', allowedCompanyIds)
      if (filterStatus)  query = query.eq('status', filterStatus)
      if (filterCompany) query = query.eq('company_name', filterCompany)
      if (batchTerm) query = query.ilike('batch_number', `%${batchTerm}%`)
      if (filterAttachment === 'yes') query = query.not('attachment_path', 'is', null)
      if (filterAttachment === 'no')  query = query.is('attachment_path', null)
      if (includeTextSearch && textTerm) {
        query = query.or(
          `ref_number.ilike.%${textTerm}%,batch_number.ilike.%${textTerm}%,payment_reason.ilike.%${textTerm}%,submitted_by_name.ilike.%${textTerm}%,payee_name.ilike.%${textTerm}%,attachment_name.ilike.%${textTerm}%,remarks.ilike.%${textTerm}%`
        )
      }
      return query
    }

    let data = []
    let count = 0
    let error = null
    if (isSearching) {
      let offset = 0
      while (true) {
        const result = await buildQuery(offset, offset + QUERY_PAGE_SIZE - 1, offset === 0)
        if (result.error) {
          error = result.error
          break
        }
        data.push(...(result.data || []))
        if (offset === 0) count = result.count || 0
        if ((result.data || []).length < QUERY_PAGE_SIZE || data.length >= count) break
        offset += QUERY_PAGE_SIZE
      }

      for (let index = 0; index < commentMatchIds.length; index += 200) {
        const idChunk = commentMatchIds.slice(index, index + 200)
        const result = await buildQuery(0, idChunk.length - 1, false, false).in('id', idChunk)
        if (result.error) {
          error = result.error
          break
        }
        data.push(...(result.data || []))
      }
      data = [...new Map(data.map(row => [row.id, row])).values()]
        .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    } else {
      const from = (page - 1) * pageSize
      const result = await buildQuery(from, from + pageSize - 1, true)
      data = result.data || []
      count = result.count || 0
      error = result.error
    }

    if (requestId !== loadRequestRef.current) return
    if (error) {
      console.error(error)
      setApplications([])
      setTotal(0)
      setLoadError(`Could not load dashboard applications: ${error.message}`)
      setLoading(false)
      return
    }

    // Amount: server-side LIKE on cast — done client-side as postgres cant partial-match numerics
    let rows = data || []
    if (amountSearch.trim()) {
      rows = rows.filter(a => String(a.amount).includes(amountSearch.trim()))
    }

    if (rows.length > 0) {
      const ids = rows.map(a => a.id)
      const idChunks = []
      for (let index = 0; index < ids.length; index += 200) idChunks.push(ids.slice(index, index + 200))
      const logResults = await Promise.all(idChunks.map(chunk => supabase
        .from('audit_log')
        .select('application_id,action,note,created_at')
        .in('application_id', chunk)
        .in('action', ['attachment_added','attachment_deleted','edited'])
        .order('created_at', { ascending: true })))
      const logError = logResults.find(result => result.error)?.error
      const financeLogs = logResults.flatMap(result => result.data || [])

      if (logError) {
        console.error(logError)
      } else {
        const byApp = {}
        const deletedByApp = {}
        const commentsByApp = {}
        ;(financeLogs || []).forEach(log => {
          const deleted = parseDeletedFinanceAttachment(log.note)
          if (deleted) {
            if (!deletedByApp[log.application_id]) deletedByApp[log.application_id] = new Set()
            deletedByApp[log.application_id].add(deleted.path)
            return
          }
          const attachment = parseFinanceAttachment(log.note)
          if (attachment) {
            if (!byApp[log.application_id]) byApp[log.application_id] = []
            byApp[log.application_id].push(attachment)
          }
          if (log.note?.startsWith('Comment: ')) {
            if (!commentsByApp[log.application_id]) commentsByApp[log.application_id] = []
            commentsByApp[log.application_id].push(log.note.slice(9))
          }
        })
        rows = rows.map(app => ({
          ...app,
          finance_attachments: (byApp[app.id] || []).filter(att => !deletedByApp[app.id]?.has(att.path)),
          finance_comments: commentsByApp[app.id] || [],
        }))
      }
    }

    if (requestId !== loadRequestRef.current) return
    if (!isSearching) {
      const lastPage = Math.max(1, Math.ceil((count || 0) / pageSize))
      if (page > lastPage) {
        setPage(lastPage)
        return
      }
    }
    setApplications(rows)
    setSelectedRecords(current => {
      const updated = new Map(current)
      rows.forEach(app => {
        if (selected.has(app.id)) updated.set(app.id, app)
      })
      return updated
    })
    // When searching, show actual result count not paginated count
    setTotal(isSearching ? rows.length : count)
    setLoading(false)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Summary counts (from current page only — full counts need separate queries)
  const pagePending   = applications.filter(a => ['pending','mgr_approved','fin_approved'].includes(a.status)).length
  const pageApproved  = applications.filter(a => a.status === 'approved').length
  const pageEscalated = applications.filter(a => a.status === 'escalated').length
  const pageAmount    = applications.filter(a => a.status === 'approved').reduce((s,a) => s + Number(a.amount), 0)

  async function exportCSV() {
    // Export ALL matching records (no pagination)
    if (Array.isArray(allowedCompanyIds) && allowedCompanyIds.length === 0) return
    const exportSearch = search.trim().replace(/[,%()]/g, ' ').trim()
    let rows = exportSearch || amountSearch.trim() ? [...applications] : []
    if (!exportSearch && !amountSearch.trim()) {
      let offset = 0
      while (true) {
        let query = supabase
          .from('applications_full')
          .select('*')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + QUERY_PAGE_SIZE - 1)
        if (Array.isArray(allowedCompanyIds)) query = query.in('company_id', allowedCompanyIds)
        if (filterStatus)  query = query.eq('status', filterStatus)
        if (filterCompany) query = query.eq('company_name', filterCompany)
        if (filterBatch.trim()) query = query.ilike('batch_number', `%${filterBatch.trim()}%`)
        if (filterAttachment === 'yes') query = query.not('attachment_path', 'is', null)
        if (filterAttachment === 'no')  query = query.is('attachment_path', null)
        const { data, error } = await query
        if (error) {
          alert('Could not export applications: ' + error.message)
          return
        }
        rows.push(...(data || []))
        if ((data || []).length < QUERY_PAGE_SIZE) break
        offset += QUERY_PAGE_SIZE
      }
    }
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

  // Batch helpers
  function getSelected() {
    return Array.from(selected)
      .map(id => selectedRecords.get(id))
      .filter(Boolean)
  }

  function clearSelection() {
    setSelected(new Set())
    setSelectedRecords(new Map())
  }

  function setApplicationSelected(app, checked) {
    setSelected(current => {
      const updated = new Set(current)
      checked ? updated.add(app.id) : updated.delete(app.id)
      return updated
    })
    setSelectedRecords(current => {
      const updated = new Map(current)
      checked ? updated.set(app.id, app) : updated.delete(app.id)
      return updated
    })
  }

  function setCurrentPageSelected(checked, records = applications) {
    setSelected(current => {
      const updated = new Set(current)
      records.forEach(app => checked ? updated.add(app.id) : updated.delete(app.id))
      return updated
    })
    setSelectedRecords(current => {
      const updated = new Map(current)
      records.forEach(app => checked ? updated.set(app.id, app) : updated.delete(app.id))
      return updated
    })
  }

  function batchCompatible(apps) {
    if (apps.length < 2) return null
    const first = apps[0]
    const mismatch = apps.find(a => a.company_name !== first.company_name)
    if (mismatch) return 'Selected applications must belong to the same company.'
    return null
  }

  const selectedApps   = getSelected()
  const batchError     = batchCompatible(selectedApps)
  const batchTotal     = selectedApps.reduce((s,a) => s + Number(a.amount), 0)
  const selectedCompany = selectedApps[0]?.company_name || ''
  const hasMixedBatchDetails = selectedApps.length > 1 && selectedApps.some(a =>
    a.payee_name !== selectedApps[0].payee_name ||
    a.payment_method_name !== selectedApps[0].payment_method_name ||
    a.bank_account !== selectedApps[0].bank_account
  )
  const canCreateBatch = selectedApps.length >= 2 && !batchError
  const canUndoBatch = ['finance','superadmin'].includes(profile?.role)

  function safeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  function printBatchReport(batchNumber = 'Draft') {
    if (selectedApps.length === 0) return
    const win = window.open('', '_blank', 'width=1100,height=800')
    if (!win) {
      setBatchMsg('Could not open print window. Please allow popups for this site.')
      return
    }
    const rowsHtml = selectedApps.map((a, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${safeHtml(a.ref_number)}</td>
        <td>${safeHtml(a.submitted_by_name)}</td>
        <td>${safeHtml(a.payee_name)}</td>
        <td>${safeHtml(a.payment_method_name)}</td>
        <td>${safeHtml(a.bank_account)}</td>
        <td>${safeHtml(a.payment_reason)}</td>
        <td class="amount">AED ${safeHtml(formatCurrency(a.amount))}</td>
        <td>${safeHtml(a.status)}</td>
      </tr>
    `).join('')
    const html = `
      <!doctype html>
      <html>
        <head>
          <title>Batch Payment Report</title>
          <style>
            body { font-family: Arial, sans-serif; color:#111827; margin:24px; }
            h1 { font-size:22px; margin:0 0 4px; }
            .sub { color:#6b7280; font-size:12px; margin-bottom:18px; }
            .grid { display:grid; grid-template-columns: 160px 1fr 160px 1fr; gap:8px 14px; font-size:12px; margin-bottom:18px; }
            .label { color:#6b7280; font-weight:700; text-transform:uppercase; font-size:10px; letter-spacing:.05em; }
            table { width:100%; border-collapse:collapse; font-size:11px; }
            th { background:#f3f4f6; text-align:left; border:1px solid #d1d5db; padding:7px; }
            td { border:1px solid #d1d5db; padding:7px; vertical-align:top; }
            .amount { text-align:right; white-space:nowrap; font-weight:700; }
            .total { margin-top:14px; text-align:right; font-size:14px; font-weight:700; }
            .note { margin-top:8px; color:#4b5563; font-size:12px; white-space:pre-wrap; }
            @media print { body { margin:12mm; } button { display:none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()" style="float:right;padding:7px 14px;margin-bottom:12px;">Print</button>
          <h1>Batch Payment Report</h1>
          <div class="sub">Generated ${safeHtml(new Date().toLocaleString('en-GB'))}</div>
          <div class="grid">
            <div class="label">Company</div><div>${safeHtml(selectedCompany)}</div>
            <div class="label">Batch No.</div><div>${safeHtml(batchNumber)}</div>
            <div class="label">Payment Ref.</div><div>${safeHtml(batchForm.transfer_ref || '-')}</div>
            <div class="label">Payment Date</div><div>${safeHtml(batchForm.transfer_date || '-')}</div>
            <div class="label">Prepared By</div><div>${safeHtml(profile?.full_name || '')}</div>
            <div class="label">Applications</div><div>${selectedApps.length}</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Ref</th>
                <th>Applicant</th>
                <th>Payee</th>
                <th>Method</th>
                <th>Bank Account</th>
                <th>Reason</th>
                <th>Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
          </table>
          <div class="total">Total: AED ${safeHtml(formatCurrency(batchTotal))}</div>
          ${batchForm.note ? `<div class="note"><strong>Note:</strong> ${safeHtml(batchForm.note)}</div>` : ''}
        </body>
      </html>
    `
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
  }

  function getQuickActions(app) {
    if (!profile?.role) return null
    if (profile.role === 'manager' && app.status === 'pending') {
      return { approve:'mgr_approve', reject:'mgr_reject', label:'Manager' }
    }
    if (profile.role === 'finance' && ['pending','mgr_approved'].includes(app.status)) {
      return { approve:'fin_approve', reject:'reject', label:'Finance' }
    }
    if (['cfo','ceo'].includes(profile.role) && ['pending','mgr_approved','fin_approved','escalated'].includes(app.status)) {
      return { approve:'approve', reject:'reject', label:'CFO' }
    }
    if (profile.role === 'superadmin' && ['pending','mgr_approved','fin_approved','escalated'].includes(app.status)) {
      if (app.status === 'pending') return { approve:'mgr_approve', reject:'mgr_reject', label:'Admin' }
      if (app.status === 'mgr_approved') return { approve:'fin_approve', reject:'reject', label:'Admin' }
      return { approve:'approve', reject:'reject', label:'Admin' }
    }
    return null
  }

  async function doQuickAction(app, action) {
    const isReject = ['reject','mgr_reject'].includes(action)
    const note = isReject ? window.prompt('Reason for rejection (optional)') : ''
    if (isReject && note === null) return
    if (!isReject && !window.confirm(`Approve ${app.ref_number || 'this application'}?`)) return

    setQuickActionLoading(`${app.id}:${action}`)
    try {
      const now = new Date().toISOString()
      let newStatus, auditAction, extraFields = {}

      if (action === 'mgr_approve') {
        newStatus = 'mgr_approved'; auditAction = 'mgr_approved'
        extraFields = { manager_id: user.id, manager_note: null, manager_acted_at: now }
      } else if (action === 'mgr_reject') {
        newStatus = 'mgr_rejected'; auditAction = 'mgr_rejected'
        extraFields = { manager_id: user.id, manager_note: note || null, manager_acted_at: now }
      } else if (action === 'fin_approve') {
        newStatus = 'fin_approved'; auditAction = 'fin_approved'
        extraFields = {
          fin_approved_by: user.id,
          fin_approved_at: now,
        }
      } else if (action === 'approve') {
        newStatus = 'approved'; auditAction = 'approved'
        extraFields = { cfo_approved_by: user.id, cfo_approved_at: now, processed_at: now }
      } else {
        newStatus = 'rejected'; auditAction = 'rejected'
        extraFields = { processed_at: now }
      }

      const updatedFields = {
        status: newStatus,
        outcome_note: isReject ? note : app.outcome_note,
        ...extraFields,
      }
      const { error: updateError } = await supabase.from('applications')
        .update(updatedFields)
        .eq('id', app.id)
      if (updateError) throw updateError

      const { error: auditError } = await supabase.from('audit_log').insert({
        application_id: app.id,
        action_by: user.id,
        action: auditAction,
        note: note || null,
      })
      if (auditError) throw auditError

      setApplications(current => current.map(row =>
        row.id === app.id ? { ...row, ...updatedFields } : row
      ))
      setSelectedRecords(current => {
        if (!current.has(app.id)) return current
        const updated = new Map(current)
        updated.set(app.id, { ...current.get(app.id), ...updatedFields })
        return updated
      })
    } catch (error) {
      window.alert(error.message || 'Could not update application')
    } finally {
      setQuickActionLoading(null)
    }
  }

  async function createBatch() {
    if (!batchForm.transfer_ref.trim()) return setBatchMsg('Transfer reference is required')
    if (!batchForm.transfer_date)       return setBatchMsg('Transfer date is required')
    setCreatingBatch(true)
    setBatchMsg('')
    try {
      const { data: batchNum, error: rpcErr } = await supabase.rpc('generate_batch_number')
      if (rpcErr) throw new Error('Could not generate batch number: ' + rpcErr.message)
      const ids = selectedApps.map(a => a.id)
      const { data: batch, error: bErr } = await supabase
        .from('payment_batches')
        .insert({
          batch_number:      batchNum,
          transfer_ref:      batchForm.transfer_ref.trim(),
          transfer_date:     batchForm.transfer_date,
          note:              batchForm.note.trim() || null,
          force_reason:      null,
          total_amount:      batchTotal,
          application_count: ids.length,
          created_by:        (await supabase.auth.getUser()).data.user?.id,
        })
        .select().single()
      if (bErr) throw new Error('Batch insert failed: ' + bErr.message)
      const { error: lErr } = await supabase
        .from('applications')
        .update({ batch_id: batch.id })
        .in('id', ids)
      if (lErr) throw new Error('Linking applications failed: ' + lErr.message)
      setShowBatchModal(false)
      setBatchForm({ transfer_ref:'', transfer_date:'', note:'' })
      await load()
      clearSelection()
    } catch (err) {
      setBatchMsg(err.message || 'Failed to create batch')
    } finally {
      setCreatingBatch(false)
    }
  }

  // Derived — are we in search mode?
  async function undoBatch(app) {
    let batchId = app.batch_id
    if (!batchId && app.batch_number) {
      const { data: batch, error: batchErr } = await supabase
        .from('payment_batches')
        .select('id')
        .eq('batch_number', app.batch_number)
        .single()
      if (batchErr) {
        alert('Could not find batch: ' + batchErr.message)
        return
      }
      batchId = batch?.id
    }
    if (!batchId) {
      alert('This row does not have a batch available to undo.')
      return
    }

    const { data: linked, error: fetchErr } = await supabase
      .from('applications')
      .select('id')
      .eq('batch_id', batchId)
    if (fetchErr) {
      alert('Could not check batch applications: ' + fetchErr.message)
      return
    }

    const linkedIds = (linked || []).map(row => row.id)
    const count = linkedIds.length || 1
    if (!window.confirm(`Undo batch ${app.batch_number || ''} for ${count} application${count > 1 ? 's' : ''}?`)) return

    setUndoBatchLoading(batchId)
    try {
      const { error: updateErr } = await supabase
        .from('applications')
        .update({ batch_id: null })
        .eq('batch_id', batchId)
      if (updateErr) throw updateErr

      if (linkedIds.length > 0) {
        await supabase.from('audit_log').insert(linkedIds.map(id => ({
          application_id: id,
          action_by: user.id,
          action: 'edited',
          note: `Batch undone: ${app.batch_number || batchId}`,
        })))
      }

      await load()
      clearSelection()
    } catch (err) {
      alert(err.message || 'Failed to undo batch')
    } finally {
      setUndoBatchLoading(null)
    }
  }

  const isSearching = !!(search.trim() || amountSearch.trim())
  const visibleApplications = showUncheckedOnly
    ? applications.filter(app => !reviewedIds.has(app.id))
    : applications
  const reviewedVisibleCount = applications.filter(app => reviewedIds.has(app.id)).length

  return (
    <div>
      <div className="page-header flex justify-between items-center">
        <div>
          <h1>{profile?.role === 'manager' ? 'Manager Dashboard' : 'Finance Dashboard'}</h1>
          <p>
            {profile?.role === 'manager'
              ? 'Applications pending your approval · '
              : 'All payment applications · '
            }
            {profile?.full_name}
          </p>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <button className="btn btn-outline" onClick={exportCSV}>↓ Export CSV</button>
        </div>
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
          placeholder="🔍 Search ref, reason, applicant, payee, Finance comments…"
          value={search} onChange={e => setSearch(e.target.value)} />
        <input className="form-control" style={{width:'140px'}}
          placeholder="💰 Amount e.g. 105"
          type="number" step="0.01" min="0"
          value={amountSearch} onChange={e => setAmountSearch(e.target.value)} />
        <select className="form-control" style={{width:'auto'}} value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="pending">Pending (grandfathered)</option>
          <option value="mgr_approved">Mgr Approved — awaiting Finance</option>
          <option value="fin_approved">Fin Approved — awaiting CFO</option>
          <option value="escalated">Escalated</option>
          <option value="approved">Approved</option>
          <option value="mgr_rejected">Mgr Rejected</option>
          <option value="rejected">Rejected</option>
          <option value="returned">Returned</option>
          <option value="withdrawn">Withdrawn</option>
        </select>
        <select className="form-control" style={{width:'auto'}} value={filterCompany}
          onChange={e => setFilterCompany(e.target.value)}>
          <option value="">All companies</option>
          {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
        </select>
        <input className="form-control" style={{width:'175px'}}
          placeholder="Batch number"
          value={filterBatch} onChange={e => setFilterBatch(e.target.value)} />
        <select className="form-control" style={{width:'auto'}} value={filterAttachment}
          onChange={e => setFilterAttachment(e.target.value)}>
          <option value="">All (attach.)</option>
          <option value="yes">📎 Has attachment</option>
          <option value="no">No attachment</option>
        </select>
        {(search||amountSearch||filterStatus||filterCompany||filterBatch||filterAttachment) && (
          <button className="btn btn-outline btn-sm" onClick={() => {
            setSearch(''); setAmountSearch(''); setFilterStatus('');
            setFilterCompany(''); setFilterBatch(''); setFilterAttachment(''); setPage(1)
            sessionStorage.removeItem('finance_dashboard_filters')
          }}>✕ Clear all</button>
        )}
      </div>

      {/* Temporary review controls — memory only, never saved */}
      {applications.length > 0 && (
        <div style={{
          display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap',
          marginBottom:'10px', padding:'7px 10px',
          border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
          background:'var(--cream-2)', fontSize:'12px',
        }}>
          <span style={{fontWeight:600}}>
            Temporary review: {reviewedVisibleCount} / {applications.length} checked
          </span>
          <label style={{display:'inline-flex',alignItems:'center',gap:'5px',cursor:'pointer'}}>
            <input type="checkbox" checked={showUncheckedOnly}
              onChange={event => setShowUncheckedOnly(event.target.checked)} />
            Show unchecked only
          </label>
          {reviewedIds.size > 0 && (
            <button className="btn btn-outline btn-sm" type="button"
              onClick={() => setReviewedIds(new Set())}>
              Clear review ticks
            </button>
          )}
          <span style={{marginLeft:'auto',color:'var(--ink-3)'}}>Clears on refresh or logout</span>
        </div>
      )}

      {/* Batch selection bar */}
      {selected.size > 0 && (
        <div style={{
          display:'flex', alignItems:'center', gap:'12px', flexWrap:'wrap',
          padding:'10px 16px', marginBottom:'10px',
          background: canCreateBatch ? '#f0fdf4' : '#fff7ed',
          border: `1px solid ${canCreateBatch ? '#bbf7d0' : '#fed7aa'}`,
          borderRadius:'var(--radius-sm)', fontSize:'13px',
        }}>
          <span style={{fontWeight:600, color: canCreateBatch ? '#065f46' : '#9a3412'}}>
            {selected.size} application{selected.size>1?'s':''} selected
            {selectedCompany && ` · ${selectedCompany}`}
            {canCreateBatch && ` · Total: AED ${formatCurrency(batchTotal)}`}
          </span>
          {batchError && <span style={{color:'#c2410c',fontSize:'12px'}}>⚠ {batchError}</span>}
          {canCreateBatch && hasMixedBatchDetails && (
            <span style={{color:'#047857',fontSize:'12px'}}>
              Mixed payees/payment methods/bank accounts will be grouped under one company batch.
            </span>
          )}
          {canCreateBatch && (
            <button className="btn btn-success btn-sm" onClick={() => setShowBatchModal(true)}>
              ⧉ Create Payment Batch
            </button>
          )}
          <button className="btn btn-outline btn-sm" onClick={clearSelection}>
            ✕ Clear selection
          </button>
        </div>
      )}

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
          ) : loadError ? (
            <div className="empty-state">
              <div className="icon">⚠</div>
              <h3>Dashboard could not be loaded</h3>
              <p>{loadError}</p>
              <button className="btn btn-outline btn-sm" onClick={load}>Try again</button>
            </div>
          ) : visibleApplications.length === 0 ? (
            <div className="empty-state">
              <div className="icon">🔍</div>
              <h3>{showUncheckedOnly && applications.length > 0 ? 'All visible rows are checked' : 'No results found'}</h3>
              <p>
                {showUncheckedOnly && applications.length > 0
                  ? 'Clear review ticks or turn off “Show unchecked only” to display them again.'
                  : isSearching
                  ? 'No records match your search across the entire database.'
                  : 'Try adjusting your filters.'
                }
              </p>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th style={{width:'32px'}}>
                    <input type="checkbox"
                      style={{width:'13px',height:'13px',cursor:'pointer'}}
                      checked={visibleApplications.length > 0 && visibleApplications.every(app => selected.has(app.id))}
                      onChange={e => setCurrentPageSelected(e.target.checked, visibleApplications)}
                    />
                  </th>
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
                {visibleApplications.map(app => {
                  const idx = companiesSorted.findIndex(c => c.name === app.company_name)
                  const dbColor = companiesSorted[idx]?.accent_color
                  const col = COMPANY_PALETTE[Math.max(0,idx) % COMPANY_PALETTE.length]
                  const dotColor = dbColor || col?.accent || '#999'
                  const quickActions = getQuickActions(app)
                  const totalCols = 10
                  const refWasUsed = usedRefs.has(app.ref_number)
                  const isReviewed = reviewedIds.has(app.id)
                  const hasDetailRow = !!(app.remarks || app.finance_comments?.length)
                  return (
                    <React.Fragment key={app.id}>
                      <tr style={{
                        lineHeight:'1.3',
                        background:isReviewed ? '#ecfdf5' : undefined,
                        transition:'background-color .15s ease',
                      }}>
                        {/* Checkbox */}
                        <td style={{verticalAlign:'middle',paddingTop:'8px'}}>
                          <input type="checkbox"
                            style={{width:'13px',height:'13px',cursor:'pointer'}}
                            checked={selected.has(app.id)}
                            onChange={e => setApplicationSelected(app, e.target.checked)}
                          />
                        </td>
                        {/* Reference + copy button */}
                        <td style={{verticalAlign:'middle',paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                            <button type="button"
                              aria-label={isReviewed ? `Uncheck temporary review for ${app.ref_number}` : `Temporarily check ${app.ref_number}`}
                              aria-pressed={isReviewed}
                              title={isReviewed ? 'Remove temporary review tick' : 'Temporarily mark as reviewed'}
                              onClick={() => toggleReviewed(app.id)}
                              style={{
                                width:'18px',height:'18px',borderRadius:'50%',padding:0,flexShrink:0,
                                border:`1px solid ${isReviewed ? '#15803d' : 'var(--border)'}`,
                                background:isReviewed ? '#16a34a' : 'transparent',
                                color:isReviewed ? '#fff' : 'var(--ink-3)',
                                fontSize:'11px',lineHeight:'16px',cursor:'pointer',
                              }}>
                              {isReviewed ? '✓' : ''}
                            </button>
                            <CopyableField
                              copyText={app.ref_number || ''}
                              label="Reference number"
                              title={refWasUsed ? 'Reference copied/used on this computer' : ''}
                              onCopy={() => markReferenceUsed(app.ref_number)}
                              style={{
                                fontSize:'11px',
                                fontWeight:400,
                                whiteSpace:'nowrap',
                                letterSpacing:'.01em',
                                color: refWasUsed ? '#b45309' : 'var(--ink)',
                              }}
                            >
                              {app.ref_number || '—'}
                            </CopyableField>
                            <button
                              title="Copy reference number"
                              tabIndex={-1}
                              onClick={() => {
                                navigator.clipboard.writeText(app.ref_number || '')
                                markReferenceUsed(app.ref_number)
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
                          {app.batch_number && (
                            <div style={{marginTop:'3px',display:'flex',alignItems:'center',gap:'4px',flexWrap:'wrap'}}>
                              <button type="button"
                                title={`Show all transactions in ${app.batch_number}`}
                                onClick={() => setFilterBatch(app.batch_number)}
                                style={{
                                fontSize:'9px',fontWeight:600,padding:'1px 6px',
                                borderRadius:'20px',background:'#dbeafe',color:'#1e40af',
                                fontFamily:"'JetBrains Mono',monospace",whiteSpace:'nowrap',
                                border:'1px solid #bfdbfe',cursor:'pointer',
                              }}>Batch {app.batch_number}</button>
                              {canUndoBatch && (app.batch_id || app.batch_number) && (
                                <button
                                  title={`Undo batch ${app.batch_number}`}
                                  tabIndex={-1}
                                  disabled={undoBatchLoading === app.batch_id}
                                  onClick={() => undoBatch(app)}
                                  style={{
                                    border:'1px solid #fecaca', background:'#fee2e2', color:'#991b1b',
                                    borderRadius:'20px', padding:'1px 6px', fontSize:'9px',
                                    fontWeight:700, cursor: undoBatchLoading === app.batch_id ? 'not-allowed' : 'pointer',
                                    lineHeight:'14px',
                                  }}>
                                  {undoBatchLoading === app.batch_id ? 'Undoing' : 'Undo'}
                                </button>
                              )}
                            </div>
                          )}
                        </td>

                        {/* Company — 1 line ellipsis */}
                        <td style={{verticalAlign:'middle',paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px',maxWidth:'130px'}}>
                          <CopyableField copyText={app.company_name || ''} label="Company" style={{display:'flex',alignItems:'center',gap:'6px'}}>
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
                          </CopyableField>
                        </td>

                        {/* Applicant */}
                        <td style={{fontSize:'12px',verticalAlign:'middle',
                          maxWidth:'80px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <CopyableField copyText={app.submitted_by_name || ''} label="Applicant">{app.submitted_by_name}</CopyableField>
                        </td>

                        {/* Payment reason — 1 line ellipsis */}
                        <td style={{verticalAlign:'middle',maxWidth:'140px',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <CopyableField copyText={app.payment_reason || ''} label="Payment reason" style={{fontSize:'12px',overflow:'hidden',
                            textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {app.payment_reason}
                          </CopyableField>
                        </td>

                        {/* Payee — 1 line */}
                        <td style={{verticalAlign:'middle',maxWidth:'100px',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <CopyableField copyText={app.payee_name || ''} label="Payee" style={{fontSize:'12px',color:'var(--ink-3)',
                            overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                            {app.payee_name || '—'}
                          </CopyableField>
                        </td>

                        {/* Amount */}
                        <td style={{fontWeight:600,fontSize:'13px',verticalAlign:'middle',whiteSpace:'nowrap',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <CopyableField copyText={String(app.amount ?? '')} label="Amount">{formatCurrency(app.amount)}</CopyableField>
                        </td>

                        {/* Date */}
                        <td style={{fontSize:'11px',color:'var(--ink-3)',verticalAlign:'middle',whiteSpace:'nowrap',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <CopyableField copyText={formatDate(app.created_at)} label="Date">{formatDate(app.created_at)}</CopyableField>
                        </td>

                        {/* Attachment — icon + 8 char filename */}
                        <td style={{verticalAlign:'middle',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <CopyableField
                            copyText={[app.attachment_name, ...(app.finance_attachments || []).map(att => att.name)].filter(Boolean).join(', ')}
                            label="Attachment names"
                          >
                          {(app.attachment_path || app.finance_attachments?.length > 0) ? (
                            <div style={{ display:'flex', gap:'4px', flexWrap:'wrap', maxWidth:'170px' }}>
                              {app.attachment_path && (
                                <AttachmentPill path={app.attachment_path} name={app.attachment_name} tabIndex={-1} />
                              )}
                              {(app.finance_attachments || []).map((att, index) => (
                                <AttachmentPill key={`${att.path}-${index}`} path={att.path} name={att.name} size={att.size} tabIndex={-1} />
                              ))}
                            </div>
                          ) : (
                            <span style={{fontSize:'11px',color:'var(--ink-3)'}}>—</span>
                          )}
                          </CopyableField>
                        </td>

                        {/* Status */}
                        <td style={{verticalAlign:'middle',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <CopyableField copyText={app.status || ''} label="Status"><StatusBadge status={app.status} /></CopyableField>
                          {quickActions && (
                            <div style={{ display:'flex', gap:'3px', marginTop:'4px', flexWrap:'wrap', maxWidth:'86px' }}>
                              <button
                                title={`${quickActions.label} approve`}
                                tabIndex={-1}
                                disabled={!!quickActionLoading}
                                onClick={() => doQuickAction(app, quickActions.approve)}
                                style={{
                                  border:'1px solid #86efac', background:'#dcfce7', color:'#166534',
                                  borderRadius:'20px', padding:'1px 6px', fontSize:'10px',
                                  fontWeight:700, cursor: quickActionLoading ? 'not-allowed' : 'pointer',
                                  lineHeight:'16px',
                                }}>
                                OK
                              </button>
                              <button
                                title={`${quickActions.label} reject`}
                                tabIndex={-1}
                                disabled={!!quickActionLoading}
                                onClick={() => doQuickAction(app, quickActions.reject)}
                                style={{
                                  border:'1px solid #fecaca', background:'#fee2e2', color:'#991b1b',
                                  borderRadius:'20px', padding:'1px 6px', fontSize:'10px',
                                  fontWeight:700, cursor: quickActionLoading ? 'not-allowed' : 'pointer',
                                  lineHeight:'16px',
                                }}>
                                NO
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Action */}
                        <td style={{verticalAlign:'middle',
                          paddingTop:'8px',paddingBottom: app.remarks ? '2px' : '8px'}}>
                          <button className="btn btn-outline btn-sm"
                            tabIndex={-1}
                            onClick={() => navigate(`/application/${app.id}`)}>
                            Open →
                          </button>
                        </td>
                      </tr>

                      {/* Remarks and Finance comments — spans from company col to end */}
                      {hasDetailRow && (
                        <tr style={{
                          borderTop:'none',
                          background:isReviewed ? '#ecfdf5' : undefined,
                          transition:'background-color .15s ease',
                        }}>
                          <td style={{padding:'0 0 8px 0', borderTop:'none'}} />
                          <td style={{padding:'0 0 8px 0', borderTop:'none'}} />
                          <td colSpan={8} style={{
                            padding:'0 0 8px 6px',
                            borderTop:'none',
                            fontSize:'11px',
                            fontStyle:'italic',
                            overflow:'hidden',
                            textOverflow:'ellipsis',
                            whiteSpace:'nowrap',
                            maxWidth:0,
                          }}>
                            {app.remarks && (
                              <div style={{color:'#dc2626'}}>
                                <CopyableField copyText={app.remarks} label="Remarks">{app.remarks}</CopyableField>
                              </div>
                            )}
                            {(app.finance_comments || []).map((comment, index) => (
                              <div key={`${app.id}-finance-comment-${index}`}
                                style={{color:'#1d4ed8',marginTop:app.remarks || index > 0 ? '2px' : 0}}>
                                <CopyableField copyText={comment} label="Finance comment">
                                  Finance: {comment}
                                </CopyableField>
                              </div>
                            ))}
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
      {/* Batch creation modal */}
      {showBatchModal && (
        <div style={{position:'fixed',inset:0,zIndex:3000,background:'rgba(10,10,20,0.7)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:'20px'}}>
          <div style={{background:'#fff',borderRadius:'12px',width:'100%',maxWidth:'520px',
            boxShadow:'0 24px 64px rgba(0,0,0,0.3)',overflow:'hidden'}}>
            <div style={{background:'var(--ink)',padding:'16px 20px',display:'flex',alignItems:'center',gap:'10px'}}>
              <span style={{fontSize:'18px'}}>⧉</span>
              <h3 style={{color:'#fff',fontSize:'16px',fontWeight:600}}>Create Payment Batch</h3>
            </div>
            <div style={{padding:'24px'}}>
              {/* Summary */}
              <div style={{background:'var(--cream-2)',borderRadius:'8px',padding:'12px',marginBottom:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:600,color:'var(--ink-3)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'.05em'}}>
                  Included Applications
                </div>
                <div style={{fontSize:'12px',color:'var(--ink-3)',marginBottom:'8px'}}>
                  Company: {selectedCompany}
                </div>
                {selectedApps.map(a => (
                  <div key={a.id} style={{display:'flex',justifyContent:'space-between',fontSize:'12px',padding:'3px 0',borderBottom:'1px solid var(--border-2)'}}>
                    <span style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:500}}>{a.ref_number}</span>
                    <span style={{color:'var(--ink-2)'}}>{a.payment_reason}</span>
                    <span style={{fontWeight:600}}>AED {formatCurrency(a.amount)}</span>
                  </div>
                ))}
                <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',fontWeight:700,marginTop:'8px',paddingTop:'8px'}}>
                  <span>Total</span>
                  <span>AED {formatCurrency(batchTotal)}</span>
                </div>
                <div style={{fontSize:'12px',color:'var(--ink-3)',marginTop:'4px'}}>
                  {hasMixedBatchDetails
                    ? 'Mixed payees/payment methods/bank accounts selected. They will remain separate in the report.'
                    : `${selectedApps[0]?.payee_name} · ${selectedApps[0]?.payment_method_name} · ${selectedApps[0]?.bank_account}`}
                </div>
              </div>
              {/* Form */}
              <div className="form-group">
                <label className="form-label">Payment / Batch Reference <span style={{color:'#dc2626'}}>*</span></label>
                <input className="form-control" placeholder="e.g. TT2026051234 or CASH-JUN-01"
                  value={batchForm.transfer_ref}
                  onChange={e => setBatchForm(f => ({...f,transfer_ref:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Payment Date <span style={{color:'#dc2626'}}>*</span></label>
                <input type="date" className="form-control"
                  value={batchForm.transfer_date}
                  onChange={e => setBatchForm(f => ({...f,transfer_date:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">Note <span style={{color:'var(--ink-3)',fontWeight:400}}>(optional)</span></label>
                <input className="form-control" placeholder="e.g. May 2026 supplier payments"
                  value={batchForm.note}
                  onChange={e => setBatchForm(f => ({...f,note:e.target.value}))} />
              </div>
              {batchMsg && <div className="alert alert-error" style={{marginBottom:'12px'}}>{batchMsg}</div>}
              <div style={{display:'flex',gap:'10px',justifyContent:'flex-end'}}>
                <button className="btn btn-outline" onClick={() => {setShowBatchModal(false);setBatchMsg('')}}>Cancel</button>
                <button className="btn btn-outline" onClick={() => printBatchReport()}>
                  Print Report
                </button>
                <button className="btn btn-primary" disabled={creatingBatch} onClick={createBatch}>
                  {creatingBatch ? 'Creating…' : '⧉ Create Batch'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
