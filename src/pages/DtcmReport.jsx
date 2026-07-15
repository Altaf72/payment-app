import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const STATUS_LABELS = {
  matched: 'Reconciled',
  low_confidence: 'Matched (review)',
  amount_mismatch: 'Amount mismatch',
  missing_internal: 'Missing internally',
  missing_dtcm: 'Missing from DTCM',
}

const ARCHIVE_WIDTHS_KEY = 'dtcm_archive_column_widths_v1'
const ARCHIVE_COLUMNS = [
  { key:'status', label:'Status', width:150 },
  { key:'unit', label:'Unit', width:90 },
  { key:'dtcmGuest', label:'Guest (DTCM)', width:180, side:'dtcm' },
  { key:'internalGuest', label:'Guest (Internal)', width:180, side:'internal' },
  { key:'dtcmCheckIn', label:'DTCM check in', width:125, side:'dtcm' },
  { key:'dtcmCheckOut', label:'DTCM check out', width:130, side:'dtcm' },
  { key:'internalCheckIn', label:'Internal check in', width:135, side:'internal' },
  { key:'internalCheckOut', label:'Internal check out', width:140, side:'internal' },
  { key:'dtcmFee', label:'DTCM fee', width:115, number:true, side:'dtcm' },
  { key:'internalAmount', label:'Internal amount', width:140, number:true, side:'internal' },
  { key:'remarks', label:'Remarks', width:220 },
]

function formatDate(value, includeTime = false) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return new Intl.DateTimeFormat('en-GB', includeTime
    ? { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }
    : { day:'2-digit', month:'short', year:'numeric' }).format(date)
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits:2, maximumFractionDigits:2 }).format(Number(value) || 0)
}

function archivePeriod(archive) {
  if (!archive?.period_start && !archive?.period_end) return 'Period unavailable'
  return `${formatDate(archive.period_start)} – ${formatDate(archive.period_end)}`
}

function unitNumber(row) {
  if (row?.dtcm?.unitNumber) return row.dtcm.unitNumber
  const className = row?.internal?.className || ''
  return className.match(/\d+/)?.[0] || '—'
}

function rowStatus(row) {
  if (row?._archiveReview?.label) return row._archiveReview.label
  if (row?._manualPair) return 'Manual match'
  if (row?._splitSide) return 'Unchecked'
  return STATUS_LABELS[row?.status] || row?.status || '—'
}

function archivedResultId(row) {
  const dtcm = row?.dtcm || {}
  const internal = row?.internal || {}
  let internalDate = ''
  if (internal.date) {
    const parsed = new Date(internal.date)
    internalDate = Number.isNaN(parsed.getTime()) ? String(internal.date).slice(0, 10) : parsed.toISOString().slice(0, 10)
  }
  return [
    row?.status || '',
    dtcm.transactionId || '',
    dtcm.unitNumber || '',
    dtcm.guestName || '',
    dtcm.checkIn || '',
    internal.rsvnCode || '',
    internal.className || '',
    internal.guestName || '',
    internalDate,
    internal.amount || '',
  ].join('|')
}

function resolveArchivedReview(row, reviewMap) {
  if (row?._archiveReview?.label) return row._archiveReview
  const id = archivedResultId(row)
  const manual = reviewMap?.[id]
  if (row?._manualPair) return { id, checked:true, label:'Manual match', statusClass:'manual-match' }
  if (row?._splitSide === 'dtcm') return { id, checked:false, label:'Unmatched DTCM', statusClass:'unchecked' }
  if (row?._splitSide === 'internal') return { id, checked:false, label:'Unmatched internal', statusClass:'unchecked' }
  if (manual === 'manual') return { id, checked:true, label:'Manual match', statusClass:'manual-match' }
  if (manual === 'override') return { id, checked:true, label:'Manual override', statusClass:'manual-override' }
  if (manual === 'none') return { id, checked:false, label:'Unmatched', statusClass:'unchecked' }
  const statusClass = {
    matched:'matched', low_confidence:'low-confidence', amount_mismatch:'amount-mismatch',
    missing_internal:'missing-internal', missing_dtcm:'missing-dtcm',
  }[row?.status] || row?.status || ''
  return {
    id,
    checked:row?.status === 'matched' || row?.status === 'low_confidence',
    label:STATUS_LABELS[row?.status] || row?.status || '—',
    statusClass,
  }
}

function archivedDtcmKey(dtcm) {
  return [dtcm?.transactionId || '', dtcm?.unitNumber || '', dtcm?.guestName || '', dtcm?.checkIn || '', dtcm?.fees || ''].join('|')
}

function archivedInternalKey(internal) {
  return [internal?.rsvnCode || '', internal?.className || '', internal?.guestName || '', internal?.checkIn ? formatDate(internal.checkIn) : '—', internal?.amount || ''].join('|')
}

function normalizeArchivedResults(snapshot) {
  const sourceRows = Array.isArray(snapshot?.results) ? snapshot.results : []
  if (sourceRows.some(row => row?._manualPair || row?._splitSide)) return sourceRows
  const pairs = Array.isArray(snapshot?.manualPairs) ? snapshot.manualPairs : []
  const reviewMap = snapshot?.review || {}
  const usedDtcm = new Set(pairs.map(pair => pair.dtcmKey))
  const usedInternal = new Set(pairs.map(pair => pair.internalKey))
  const output = pairs.map(pair => ({
    dtcm:pair.dtcm,
    internal:pair.internal,
    status:'matched',
    _manualPair:true,
    _manualPairId:pair.id,
  }))

  sourceRows.forEach(row => {
    const dtcmKey = row.dtcm ? archivedDtcmKey(row.dtcm) : ''
    const internalKey = row.internal ? archivedInternalKey(row.internal) : ''
    const dtcmUsed = dtcmKey && usedDtcm.has(dtcmKey)
    const internalUsed = internalKey && usedInternal.has(internalKey)
    if (dtcmUsed && internalUsed) return
    if (dtcmUsed && row.internal && !internalUsed) {
      output.push({ dtcm:null, internal:row.internal, status:'missing_dtcm', _splitSide:'internal' })
      return
    }
    if (internalUsed && row.dtcm && !dtcmUsed) {
      output.push({ dtcm:row.dtcm, internal:null, status:'missing_internal', _splitSide:'dtcm' })
      return
    }
    if (dtcmUsed || internalUsed) return
    if (reviewMap[archivedResultId(row)] === 'none' && row.dtcm && row.internal) {
      output.push({ dtcm:row.dtcm, internal:null, status:'missing_internal', _splitSide:'dtcm' })
      output.push({ dtcm:null, internal:row.internal, status:'missing_dtcm', _splitSide:'internal' })
      return
    }
    output.push(row)
  })
  return output
}

function rowColourClass(row) {
  const statusClass = row?._archiveReview?.statusClass
  if (statusClass === 'manual-match' || row?._manualPair) return 'row-manual-match'
  if (statusClass === 'manual-override') return 'row-manual-override'
  if (statusClass === 'unchecked' || row?._splitSide) return 'row-unchecked'
  if (statusClass === 'matched' || row?.status === 'matched') return 'row-matched'
  if (row?.status === 'missing_internal') return 'row-missing-internal'
  if (row?.status === 'missing_dtcm') return 'row-missing-dtcm'
  return ''
}

function archiveCellValue(row, key) {
  switch (key) {
    case 'status': return rowStatus(row)
    case 'unit': return unitNumber(row)
    case 'dtcmGuest': return row.dtcm?.guestName || ''
    case 'internalGuest': return row.internal?.guestName || ''
    case 'dtcmCheckIn': return new Date(row.dtcm?.checkIn || 0).getTime() || 0
    case 'dtcmCheckOut': return new Date(row.dtcm?.checkOut || 0).getTime() || 0
    case 'internalCheckIn': return new Date(row.internal?.checkIn || 0).getTime() || 0
    case 'internalCheckOut': return new Date(row.internal?.checkOut || 0).getTime() || 0
    case 'dtcmFee': return row.dtcm?.fees == null ? Number.NEGATIVE_INFINITY : Number(row.dtcm.fees)
    case 'internalAmount': return row.internal?.amount == null ? Number.NEGATIVE_INFINITY : Number(row.internal.amount)
    case 'remarks': return row._archiveRemark || ''
    default: return ''
  }
}

function archiveCellDisplay(row, key) {
  switch (key) {
    case 'status': return <span className="dtcm-status-pill">{rowStatus(row)}</span>
    case 'unit': return unitNumber(row)
    case 'dtcmGuest': return row.dtcm?.guestName || '—'
    case 'internalGuest': return row.internal?.guestName || '—'
    case 'dtcmCheckIn': return formatDate(row.dtcm?.checkIn)
    case 'dtcmCheckOut': return formatDate(row.dtcm?.checkOut)
    case 'internalCheckIn': return formatDate(row.internal?.checkIn)
    case 'internalCheckOut': return formatDate(row.internal?.checkOut)
    case 'dtcmFee': return row.dtcm?.fees == null ? '—' : formatMoney(row.dtcm.fees)
    case 'internalAmount': return row.internal?.amount == null ? '—' : formatMoney(row.internal.amount)
    case 'remarks': return row._archiveRemark || '—'
    default: return '—'
  }
}

function loadArchiveWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(ARCHIVE_WIDTHS_KEY) || '{}')
    return Object.fromEntries(ARCHIVE_COLUMNS.map(column => [column.key, Math.max(70, Number(saved[column.key]) || column.width)]))
  } catch {
    return Object.fromEntries(ARCHIVE_COLUMNS.map(column => [column.key, column.width]))
  }
}

function ArchiveDetail({ archive, onBack }) {
  const rawRows = normalizeArchivedResults(archive?.snapshot)
  const rows = rawRows.map(row => ({
    ...row,
    _archiveReview:resolveArchivedReview(row, archive?.snapshot?.review || {}),
  }))
  const summary = archive?.summary || {}
  const variance = (Number(summary.dtcmTotal) || 0) - (Number(summary.internalTotal) || 0)
  const [sort, setSort] = useState({ key:'', direction:'asc' })
  const [widths, setWidths] = useState(loadArchiveWidths)
  const sortedRows = [...rows].sort((a, b) => {
    if (!sort.key) return 0
    const av = archiveCellValue(a, sort.key)
    const bv = archiveCellValue(b, sort.key)
    const comparison = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av).localeCompare(String(bv), undefined, { numeric:true, sensitivity:'base' })
    return sort.direction === 'desc' ? -comparison : comparison
  })
  const tableWidth = ARCHIVE_COLUMNS.reduce((total, column) => total + widths[column.key], 0)
  const reviewCounts = rows.reduce((counts, row) => {
    const review = row._archiveReview
    if (review.checked) counts.checked += 1
    else counts.unchecked += 1
    counts[review.statusClass] = (counts[review.statusClass] || 0) + 1
    return counts
  }, { checked:0, unchecked:0 })

  function changeSort(key) {
    setSort(current => current.key === key
      ? { key, direction:current.direction === 'asc' ? 'desc' : 'asc' }
      : { key, direction:'asc' })
  }

  function startResize(event, key) {
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startWidth = widths[key]
    const move = moveEvent => setWidths(current => ({ ...current, [key]:Math.max(70, Math.min(520, startWidth + moveEvent.clientX - startX)) }))
    const up = upEvent => {
      const finalWidth = Math.max(70, Math.min(520, startWidth + upEvent.clientX - startX))
      setWidths(current => {
        const next = { ...current, [key]:finalWidth }
        localStorage.setItem(ARCHIVE_WIDTHS_KEY, JSON.stringify(next))
        return next
      })
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', up)
      document.body.classList.remove('dtcm-column-resizing')
    }
    document.body.classList.add('dtcm-column-resizing')
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', up)
  }

  return (
    <section className="dtcm-archive-detail">
      <div className="dtcm-archive-detail-head">
        <div>
          <button type="button" className="dtcm-back-link" onClick={onBack}>← Archived reports</button>
          <h1>{archive.company_name || 'DTCM Reconciliation'}</h1>
          <p>{archivePeriod(archive)} · Registration {archive.registration_id || '—'} · Archived {formatDate(archive.archived_at, true)}</p>
        </div>
        <span className="dtcm-readonly-badge">Read only</span>
      </div>

      <div className="dtcm-archive-stats">
        <div><span>DTCM total</span><strong>AED {formatMoney(summary.dtcmTotal)}</strong></div>
        <div><span>Internal total</span><strong>AED {formatMoney(summary.internalTotal)}</strong></div>
        <div><span>Variance</span><strong>AED {formatMoney(variance)}</strong></div>
        <div><span>Reviewed / checked</span><strong>{reviewCounts.checked} of {rows.length}</strong></div>
      </div>

      <div className="dtcm-review-summary" aria-label="Finance reconciliation work summary">
        <span><b>{reviewCounts.matched || 0}</b> reconciled</span>
        <span><b>{reviewCounts['low-confidence'] || 0}</b> matched (review)</span>
        <span className="manual-match"><b>{reviewCounts['manual-match'] || 0}</b> manual match</span>
        <span className="manual-override"><b>{reviewCounts['manual-override'] || 0}</b> manual override</span>
        <span className={reviewCounts.unchecked ? 'unchecked' : ''}><b>{reviewCounts.unchecked}</b> unchecked</span>
      </div>

      <div className="dtcm-archive-table-wrap">
        <table className="dtcm-archive-table" style={{ width:tableWidth, minWidth:'100%' }}>
          <colgroup>{ARCHIVE_COLUMNS.map(column => <col key={column.key} style={{ width:widths[column.key] }} />)}</colgroup>
          <thead>
            <tr>{ARCHIVE_COLUMNS.map(column => (
              <th key={column.key} className={column.number ? 'number' : ''}>
                <button type="button" className={`dtcm-archive-sort ${sort.key === column.key ? sort.direction : ''}`} onClick={() => changeSort(column.key)}>{column.label}</button>
                <span className="dtcm-archive-resizer" title="Drag to resize column" onMouseDown={event => startResize(event, column.key)} />
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan="11" className="dtcm-empty-cell">This older archive does not contain row-level reconciliation details.</td></tr>
            ) : sortedRows.map((row, index) => (
              <tr key={`${unitNumber(row)}-${index}`} className={rowColourClass(row)}>
                {ARCHIVE_COLUMNS.map(column => (
                  <td key={column.key} className={`${column.number ? 'number ' : ''}${column.side ? `${column.side}-cell` : ''}`}>{archiveCellDisplay(row, column.key)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function ArchiveBrowser() {
  const [archives, setArchives] = useState([])
  const [selected, setSelected] = useState(null)
  const [openingId, setOpeningId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function loadArchives() {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('dtcm_reconciliation_archives')
        .select('id,company_name,registration_id,period_start,period_end,summary,archived_at,version,note')
        .order('period_start', { ascending:false })
        .order('archived_at', { ascending:false })
      if (!active) return
      setArchives(data || [])
      setError(loadError?.message || '')
      setLoading(false)
    }
    loadArchives()
    return () => { active = false }
  }, [])

  async function openArchive(id) {
    setOpeningId(id)
    setError('')
    const { data, error: openError } = await supabase
      .from('dtcm_reconciliation_archives')
      .select('id,company_name,registration_id,period_start,period_end,summary,snapshot,archived_at,version,note')
      .eq('id', id)
      .single()
    setOpeningId('')
    if (openError) return setError(openError.message)
    setSelected(data)
  }

  if (selected) return <ArchiveDetail archive={selected} onBack={() => setSelected(null)} />

  return (
    <section className="dtcm-archive-browser">
      <div className="dtcm-archive-heading">
        <div><h1>DTCM Reconciliation Archive</h1><p>Finalized reconciliation reports available for management review.</p></div>
        <span className="dtcm-readonly-badge">Management view · Read only</span>
      </div>
      {loading && <div className="dtcm-archive-state">Loading archived reports…</div>}
      {error && <div className="alert alert-error">Unable to load DTCM archives: {error}</div>}
      {!loading && !error && archives.length === 0 && <div className="dtcm-archive-state">No finalized DTCM reconciliations have been archived yet.</div>}
      {!loading && archives.length > 0 && (
        <div className="dtcm-archive-list-wrap">
          <table className="dtcm-archive-list">
            <thead><tr><th>Period</th><th>Company</th><th>Registration ID</th><th>DTCM total</th><th>Internal total</th><th>Archived</th><th></th></tr></thead>
            <tbody>{archives.map(archive => (
              <tr key={archive.id}>
                <td><strong>{archivePeriod(archive)}</strong></td>
                <td>{archive.company_name || '—'}</td>
                <td>{archive.registration_id || '—'}</td>
                <td>AED {formatMoney(archive.summary?.dtcmTotal)}</td>
                <td>AED {formatMoney(archive.summary?.internalTotal)}</td>
                <td>{formatDate(archive.archived_at, true)}</td>
                <td><button type="button" className="btn btn-outline btn-sm" disabled={openingId === archive.id} onClick={() => openArchive(archive.id)}>{openingId === archive.id ? 'Opening…' : 'View reconciliation'}</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function DtcmReport() {
  const { user, profile } = useAuth()
  const [message, setMessage] = useState('')
  const isFinance = profile?.role === 'finance'

  useEffect(() => {
    if (!isFinance) return undefined
    const receiveArchive = async event => {
      if (event.origin !== window.location.origin || event.data?.type !== 'dtcm-finalize-archive') return
      const archive = event.data.archive
      const { error } = await supabase.from('dtcm_reconciliation_archives').insert({ ...archive, archived_by:user.id })
      setMessage(error ? error.message : 'Reconciliation archived to Supabase. It is now available for management review.')
    }
    window.addEventListener('message', receiveArchive)
    return () => window.removeEventListener('message', receiveArchive)
  }, [isFinance, user?.id])

  if (!profile?.role) return <div className="dtcm-archive-state">Loading DTCM access…</div>
  if (!isFinance) return <ArchiveBrowser />

  return (
    <div style={{ height:'calc(100vh - 64px)', position:'relative' }}>
      {message && <div className="alert" style={{position:'absolute',zIndex:2,top:8,right:8,background:'#ecfdf5',color:'#065f46',boxShadow:'var(--shadow)'}}>{message}</div>}
      <iframe
        title="DTCM Tourism Dirham Report"
        src="/dtcm-tourism-dirham-report.html"
        style={{ display:'block', width:'100%', height:'100%', border:0, background:'#FAF8F3' }}
      />
    </div>
  )
}
