import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency } from '../lib/utils'
import { COMPANY_PALETTE, buildFilename } from '../lib/companyColors'

function toProperCase(str) {
  if (!str) return ''
  return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
}

function fmtDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric'
  })
}

function AuditTimeline({ log }) {
  const cfg = {
    submitted:        { bg:'#dbeafe', border:'#3b82f6', text:'#1e40af', icon:'→' },
    approved:         { bg:'#d1fae5', border:'#10b981', text:'#065f46', icon:'✓' },
    rejected:         { bg:'#fee2e2', border:'#ef4444', text:'#991b1b', icon:'✕' },
    escalated:        { bg:'#fef3c7', border:'#f59e0b', text:'#92400e', icon:'↑' },
    returned:         { bg:'#ede9fe', border:'#8b5cf6', text:'#5b21b6', icon:'↩' },
    created:          { bg:'#f3f4f6', border:'#9ca3af', text:'#374151', icon:'○' },
    edited:           { bg:'#f3f4f6', border:'#9ca3af', text:'#374151', icon:'✎' },
    reverted:         { bg:'#fef3c7', border:'#f59e0b', text:'#92400e', icon:'↺' },
    deleted:          { bg:'#fee2e2', border:'#ef4444', text:'#991b1b', icon:'🗑' },
    attachment_added: { bg:'#e0f2fe', border:'#0ea5e9', text:'#0369a1', icon:'📎' },
  }
  return (
    <div className="timeline">
      {log.map((e, i) => {
        const c = cfg[e.action] || cfg.created
        return (
          <div key={e.id} className="timeline-item">
            <div className="timeline-left">
              <div className="timeline-dot" style={{ background: c.bg, borderColor: c.border, color: c.text }}>{c.icon}</div>
              {i < log.length - 1 && <div className="timeline-line" />}
            </div>
            <div className="timeline-body">
              <div className="timeline-action" style={{ color: c.text }}>
                {e.action.charAt(0).toUpperCase() + e.action.slice(1).replace(/_/g, ' ')}
              </div>
              <div className="timeline-meta">{e.actor} · {fmtDate(e.created_at)}</div>
              {e.note && <div className="timeline-note">{e.note}</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Print/PDF layout — original table format + colour strip ─
function PrintView({ app, companyColor }) {
  const date   = fmtDate(app.submitted_at || app.created_at)
  const accent = companyColor?.accent || '#8b6914'
  const pastel = companyColor?.pastel || '#fef3c7'

  const s = {
    wrap: {
      fontFamily: "Georgia, 'Times New Roman', serif",
      fontSize: '13px',
      color: '#111',
      background: '#fff',
      width: '750px',
      padding: '32px 40px',
      margin: '0',
      boxSizing: 'border-box',
      lineHeight: '1.4',
    },
    // Left label column
    lc: {
      background: '#f5f0e8',
      border: '1px solid #c8b99a',
      padding: '10px 12px',
      width: '125px',
      textAlign: 'center',
      verticalAlign: 'middle',
      fontWeight: '700',
      fontSize: '13px',
      color: '#1a0a00',
      fontFamily: "Georgia, 'Times New Roman', serif",
      WebkitPrintColorAdjust: 'exact',
      printColorAdjust: 'exact',
    },
    // Right value column
    vc: {
      border: '1px solid #c8b99a',
      padding: '8px 14px',
      textAlign: 'center',
      verticalAlign: 'middle',
      fontSize: '13px',
      color: '#111',
      background: '#fff',
      fontFamily: "Georgia, serif",
      wordBreak: 'break-word',
    },
    // Sub-label (English under Chinese)
    sub: {
      display: 'block',
      fontSize: '10px',
      fontWeight: 'normal',
      color: '#5a3800',
      marginTop: '2px',
      fontFamily: "Georgia, 'Times New Roman', serif",
    },
  }

  return (
    <div style={s.wrap}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'16px' }}>
        {/* Logo */}
        <div style={{ width:'80px', flexShrink:0 }}>
          {app.logo_url
            ? <img src={app.logo_url} alt="" style={{ maxHeight:'50px', maxWidth:'80px', objectFit:'contain', display:'block' }} />
            : <div style={{ width:'80px' }} />
          }
        </div>
        {/* Title */}
        <div style={{ textAlign:'center', flex:1 }}>
          <div style={{ fontSize:'26px', fontWeight:'bold', letterSpacing:'8px', color:'#1a0800', fontFamily:"Georgia, serif", lineHeight:'1.2' }}>
            付 款 申 请 单
          </div>
          <div style={{ fontSize:'12px', letterSpacing:'6px', color:'#3a1a00', fontWeight:'bold', fontFamily:"Georgia, serif", marginTop:'4px' }}>
            PAYMENT APPLICATION
          </div>
        </div>
        {/* Date + Ref */}
        <div style={{ textAlign:'right', width:'110px', flexShrink:0 }}>
          <div style={{ fontSize:'11px', color:'#555', fontFamily:"Georgia, serif" }}>DATE: {date}</div>
          <div style={{ fontSize:'10px', fontFamily:'Courier New, monospace', marginTop:'3px', fontWeight:'bold', color:'#222' }}>
            {app.ref_number}
          </div>
        </div>
      </div>

      {/* Gold divider */}
      <div style={{ borderTop:'1.5px solid #8b6914', marginBottom:'12px' }} />

      {/* ── MAIN TABLE ── */}
      <table style={{ width:'100%', borderCollapse:'collapse', border:'1.5px solid #8b6914' }}>
        <tbody>

          {/* Row 1: Company + Applicant — side by side */}
          <tr>
            <td style={s.lc}>
              申请部门
              <span style={s.sub}>Application<br/>Department</span>
            </td>
            <td style={{ ...s.vc, width:'28%', fontWeight:'bold' }}>
              {toProperCase(app.company_name)}
            </td>
            <td style={{ ...s.lc, borderLeft:'1.5px solid #8b6914' }}>
              申请人
              <span style={s.sub}>Applicant</span>
            </td>
            <td style={s.vc}>
              {toProperCase(app.submitted_by_name)}
            </td>
          </tr>

          {/* Row 2: Payment Reason — full width */}
          <tr>
            <td style={s.lc}>
              付款事由
              <span style={s.sub}>Payment<br/>Reason</span>
            </td>
            <td style={{ ...s.vc, textAlign:'left' }} colSpan={3}>
              {toProperCase(app.payment_reason)}
            </td>
          </tr>

          {/* Row 3: Payment Method — full width */}
          <tr>
            <td style={s.lc}>
              付款方式
              <span style={s.sub}>Payment<br/>Methods</span>
            </td>
            <td style={s.vc} colSpan={3}>
              {toProperCase(app.payment_method_name) || '—'}
            </td>
          </tr>

          {/* Row 4: Amount — full width, larger */}
          <tr>
            <td style={s.lc}>
              付款金额
              <span style={s.sub}>Payment<br/>Amount</span>
            </td>
            <td style={{ ...s.vc, fontWeight:'bold', fontSize:'15px' }} colSpan={3}>
              AED {formatCurrency(app.amount)}
            </td>
          </tr>

          {/* Row 5: Amount in Words */}
          <tr>
            <td style={s.lc}>
              大写金额
              <span style={s.sub}>Dirhams</span>
            </td>
            <td style={{ ...s.vc, fontStyle:'italic' }} colSpan={3}>
              {toProperCase(app.amount_words)}
            </td>
          </tr>

          {/* Row 6: Receiving Company */}
          <tr>
            <td style={s.lc}>
              收款单位
              <span style={s.sub}>Receiving<br/>Company</span>
            </td>
            <td style={s.vc} colSpan={3}>
              {toProperCase(app.payee_name) || '—'}
            </td>
          </tr>

          {/* Row 7: Bank */}
          <tr>
            <td style={s.lc}>
              开户银行
              <span style={s.sub}>Bank</span>
            </td>
            <td style={s.vc} colSpan={3}>
              {toProperCase(app.bank_name) || '—'}
            </td>
          </tr>

          {/* Row 8: Bank Account */}
          <tr>
            <td style={s.lc}>
              银行账号
              <span style={s.sub}>Bank Account</span>
            </td>
            <td style={{ ...s.vc, fontFamily:'Courier New, monospace', fontSize:'12px', letterSpacing:'0.5px' }} colSpan={3}>
              {app.bank_account || '—'}
            </td>
          </tr>

          {/* Row 9: Remarks */}
          <tr>
            <td style={{ ...s.lc, verticalAlign:'top', paddingTop:'10px' }}>
              备注说明
              <span style={s.sub}>Remarks</span>
            </td>
            <td style={{ ...s.vc, textAlign:'left', minHeight:'60px', whiteSpace:'pre-wrap', verticalAlign:'top' }} colSpan={3}>
              {app.remarks || '—'}
            </td>
          </tr>

          {/* Row 10: Signatures */}
          <tr>
            <td colSpan={4} style={{ border:'1px solid #c8b99a', padding:'0' }}>
              <div style={{ display:'flex' }}>
                {[
                  ['部门主管审批签字', 'Department Head Signature'],
                  ['财务部审批签字',   'Department Finance Signature'],
                  ['总经理审批签字',   'General Manager Signature'],
                ].map(([cn, en], i) => (
                  <div key={i} style={{
                    flex:1,
                    borderRight: i < 2 ? '1px solid #c8b99a' : 'none',
                    padding:'10px 10px 8px',
                    textAlign:'center',
                  }}>
                    <div style={{ fontSize:'11px', fontFamily:"Georgia, serif", fontWeight:'bold', color:'#2a1500', marginBottom:'2px' }}>{cn}</div>
                    <div style={{ fontSize:'10px', color:'#666', marginBottom:'12px', fontFamily:"Georgia, serif" }}>{en}</div>
                    <div style={{ height:'36px', borderBottom:'1px solid #aaa', margin:'0 10px' }} />
                    <div style={{ fontSize:'10px', color:'#555', marginTop:'6px', fontFamily:"Georgia, serif" }}>DATE: {date}</div>
                  </div>
                ))}
              </div>
            </td>
          </tr>

        </tbody>
      </table>

      {/* ── STATUS + GENERATED ── */}
      <div style={{ marginTop:'10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{
          fontSize:'11px', fontWeight:'bold', letterSpacing:'2px',
          color: app.status === 'approved' ? '#7f1d1d' : app.status === 'rejected' ? '#7f1d1d' : '#78350f',
          background: ['approved','rejected'].includes(app.status) ? '#fee2e2' : '#fef3c7',
          padding:'3px 12px', borderRadius:'3px',
          border:'1.5px solid currentColor',
          fontFamily:"Georgia, serif",
        }}>
          ◆ {app.status?.toUpperCase()}
        </span>
        <span style={{ fontSize:'10px', color:'#bbb', fontFamily:"Georgia, serif" }}>
          Generated: {fmtDate(new Date().toISOString())}
        </span>
      </div>

      {/* ── COMPANY COLOUR STRIP (bottom, pale, low ink) ── */}
      <div style={{
        marginTop:'8px',
        height:'8px',
        borderRadius:'2px',
        background: pastel,
        border: `1px solid ${accent}`,
        position:'relative',
        overflow:'hidden',
      }}>
        <div style={{
          position:'absolute', left:0, top:0, bottom:0,
          width:'24px', background:accent, opacity:0.2,
        }} />
        <div style={{
          position:'absolute', right:'8px', top:'50%',
          transform:'translateY(-50%)',
          fontSize:'7px', fontWeight:'bold', letterSpacing:'1px',
          color:accent, opacity:0.6, fontFamily:"Georgia, serif",
        }}>
          {app.company_name?.toUpperCase()}
        </div>
      </div>

    </div>
  )
}


export default function ApplicationDetail() {
  const { id }      = useParams()
  const navigate    = useNavigate()
  const { user, profile, isFinanceOrAbove, isSuperAdmin } = useAuth()
  const printRef    = useRef()

  const [app, setApp]               = useState(null)
  const [auditLog, setAuditLog]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [note, setNote]             = useState('')
  const [showEscalate, setShowEscalate]   = useState(false)
  const [escalateTo, setEscalateTo] = useState('')
  const [managers, setManagers]     = useState([])
  const [attachmentUrl, setAttachmentUrl] = useState(null)
  const [companyColor, setCompanyColor]   = useState(null)
  const [allCompanies, setAllCompanies]   = useState([])
  const [downloading, setDownloading]     = useState(false)
  const [showDuplicate,    setShowDuplicate]    = useState(false)
  const [showReturnInline, setShowReturnInline] = useState(false)
  const [showRejectInline, setShowRejectInline] = useState(false)
  const [showRevert,       setShowRevert]       = useState(false)
  const [showDelete,   setShowDelete]     = useState(false)
  const [deleteReason, setDeleteReason]   = useState('')
  const [actionNote2,  setActionNote2]    = useState('')

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: appData }, { data: logData }, { data: mgrs }, { data: cos }] = await Promise.all([
      supabase.from('applications_full').select('*').eq('id', id).single(),
      supabase.from('audit_log')
        .select('id, action, note, created_at, users!action_by(full_name)')
        .eq('application_id', id).order('created_at'),
      supabase.from('users').select('id,full_name,role').in('role', ['ceo','cfo']),
      supabase.from('companies').select('*').order('created_at'),
    ])

    let logoUrl = null
    if (appData?.company_id) {
      const { data: co } = await supabase.from('companies').select('logo_url').eq('id', appData.company_id).single()
      logoUrl = co?.logo_url || null
    }

    setApp(appData ? { ...appData, logo_url: logoUrl } : null)
    setAuditLog((logData || []).map(l => ({ ...l, actor: l.users?.full_name || 'System' })))
    setManagers(mgrs || [])
    setAllCompanies(cos || [])

    // Use admin-saved colour, fallback to auto-palette by creation order
    if (appData?.company_id && cos) {
      const sorted = [...cos].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
      const idx    = sorted.findIndex(c => c.id === appData.company_id)
      const co     = sorted[idx]
      if (co?.accent_color) {
        setCompanyColor({ accent: co.accent_color, pastel: co.pastel_color || co.accent_color + '22' })
      } else {
        setCompanyColor(COMPANY_PALETTE[Math.max(0, idx) % COMPANY_PALETTE.length])
      }
    }

    if (appData?.attachment_path) {
      const { data: signed } = await supabase.storage
        .from('attachments').createSignedUrl(appData.attachment_path, 3600)
      setAttachmentUrl(signed?.signedUrl || null)
    }
    setLoading(false)
  }

  // ── Print — direct system dialog ────────────────────────────
  function handlePrint() {
    const printWindow = window.open('', '_blank', 'width=900,height=700')
    const html = printRef.current?.innerHTML || ''
    printWindow.document.write(`
      <!DOCTYPE html><html><head>
      <meta charset="UTF-8"/>
      <link rel="preconnect" href="https://fonts.googleapis.com"/>
      <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600&family=Cormorant+Garamond:wght@400;600&display=swap" rel="stylesheet"/>
      <style>
        body { margin: 0; padding: 0; font-family: 'Cormorant Garamond', serif; }
        @media print { @page { margin: 10mm; } }
      </style>
      </head><body>${html}</body></html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 800)
  }

  // ── Download — silent PDF via html2pdf.js ───────────────────
  async function handleDownload() {
    setDownloading(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      const element  = printRef.current
      const filename = buildFilename(app.ref_number)
      const opt = {
        margin:       [10, 10, 10, 10],
        filename,
        image:        { type: 'jpeg', quality: 0.92 },
        html2canvas:  { scale: 2, useCORS: true, logging: false },
        jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }
      await html2pdf().set(opt).from(element).save()
    } catch (err) {
      alert('Download failed: ' + err.message)
    } finally {
      setDownloading(false)
    }
  }

  async function doAction(action, extra = {}) {
    setActionLoading(true)
    try {
      const statusMap = { approve:'approved', reject:'rejected', return:'returned', escalate:'escalated' }
      await supabase.from('applications').update({
        status: statusMap[action],
        outcome_note: ['reject','return'].includes(action) ? note : null,
        processed_at: new Date().toISOString(),
        ...extra,
      }).eq('id', id)
      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id,
        action: statusMap[action] || action,
        note: note || null,
      })
      setNote('')
      setShowEscalate(false)
      setShowReturnInline(false)
      setShowRejectInline(false)
      await load()
    } finally { setActionLoading(false) }
  }

  async function revertToPending() {
    setActionLoading(true)
    try {
      await supabase.from('applications').update({
        status: 'pending', outcome_note: null, processed_at: null,
      }).eq('id', id)
      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id, action: 'reverted',
        note: actionNote2 || 'Reverted to Pending by Finance Officer',
      })
      setShowRevert(false); setActionNote2('')
      await load()
    } finally { setActionLoading(false) }
  }

  async function softDelete() {
    if (!deleteReason.trim()) return alert('A reason is required.')
    setActionLoading(true)
    try {
      await supabase.from('deleted_applications_log').insert({
        application_id: id, ref_number: app.ref_number,
        company_name: app.company_name, submitted_by: app.submitted_by_name,
        amount: app.amount, payment_reason: app.payment_reason,
        status_at_delete: app.status, deleted_by: profile.full_name,
        delete_reason: deleteReason,
      })
      await supabase.from('applications').update({
        deleted_at: new Date().toISOString(),
        deleted_by: user.id, delete_reason: deleteReason,
      }).eq('id', id)
      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id, action: 'deleted',
        note: `Deleted by ${profile.full_name}. Reason: ${deleteReason}`,
      })
      navigate(isFinanceOrAbove ? '/dashboard' : '/my-applications')
    } finally { setActionLoading(false) }
  }

  function shareWhatsApp() {
    const msg = `Payment Application ${app.ref_number} — ${app.company_name}\nAmount: AED ${formatCurrency(app.amount)}\nReason: ${app.payment_reason}\nStatus: ${app.status?.toUpperCase()}\n\nView: ${window.location.href}`
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank')
  }

  function shareEmail() {
    const subject = `Payment Application ${app.ref_number} — ${app.company_name}`
    const body = [
      `Reference: ${app.ref_number}`, `Company: ${app.company_name}`,
      `Applicant: ${app.submitted_by_name}`, `Payment Reason: ${app.payment_reason}`,
      `Amount: AED ${formatCurrency(app.amount)}`, `Payment Method: ${app.payment_method_name || '—'}`,
      `Receiving Company: ${app.payee_name || '—'}`, `Bank: ${app.bank_name || '—'}`,
      `Account/IBAN: ${app.bank_account || '—'}`, `Status: ${app.status?.toUpperCase()}`,
      `Date: ${fmtDate(app.submitted_at || app.created_at)}`, ``,
      `View: ${window.location.href}`,
    ].join('\n')
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  if (loading) return <div className="empty-state"><p>Loading…</p></div>
  if (!app)    return <div className="empty-state"><h3>Application not found</h3></div>

  const canAct  = isFinanceOrAbove && ['pending','escalated'].includes(app.status)
  const isOwner = app.submitted_by === user?.id
  const canEdit = isOwner && ['draft','returned'].includes(app.status)
  const isMgr   = ['ceo','cfo'].includes(profile?.role)

  const accentColor = companyColor?.accent || '#1d4ed8'
  const pastelColor = companyColor?.pastel || '#dbeafe'

  return (
    <div>
      {/* Hidden print/download target */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, width: '800px' }}>
        <div ref={printRef}><PrintView app={app} companyColor={companyColor} /></div>
      </div>

      {/* Header */}
      <div className="no-print" style={{ marginBottom: '16px' }}>

        {/* Row 1: Back + title + utility buttons */}
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexWrap:'wrap', gap:'10px', marginBottom:'10px' }}>
          <div>
            <button className="btn btn-outline btn-sm" style={{ marginBottom: '6px' }} onClick={() => navigate(-1)}>← Back</button>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize:'20px' }}>
              <span style={{ width:'12px', height:'12px', borderRadius:'50%', background:accentColor, flexShrink:0, display:'inline-block' }} />
              {app.ref_number || 'Application'}
              <StatusBadge status={app.status} />
            </h1>
            <p style={{ fontSize:'13px', color:'var(--ink-3)', marginTop:'2px' }}>
              {toProperCase(app.submitted_by_name)} · {app.company_name} · {fmtDate(app.submitted_at || app.created_at)}
            </p>
          </div>
          <div style={{ display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'flex-start' }}>
            <button className="btn btn-outline btn-sm" onClick={shareWhatsApp}>💬 WhatsApp</button>
            <button className="btn btn-outline btn-sm" onClick={shareEmail}>✉ Email</button>
            <button className="btn btn-outline btn-sm" onClick={handlePrint}>🖨 Print</button>
            <button className="btn btn-gold btn-sm" onClick={handleDownload} disabled={downloading}>
              {downloading ? '⏳…' : '↓ PDF'}
            </button>
            {canEdit && <button className="btn btn-primary btn-sm" onClick={() => navigate(`/new-application?edit=${id}`)}>✎ Edit</button>}
            <button className="btn btn-outline btn-sm" onClick={() => setShowDuplicate(true)}>⧉ Duplicate</button>
            {isSuperAdmin && !app.deleted_at && (
              <button className="btn btn-danger btn-sm" onClick={() => setShowDelete(true)}>🗑</button>
            )}
          </div>
        </div>

        {/* Company colour accent bar */}
        <div style={{ height:'3px', borderRadius:'2px', background:pastelColor, border:`1px solid ${accentColor}`, opacity:0.8, marginBottom:'10px' }} />

        {/* Row 2: Quick action buttons — Finance only, shown when actionable */}
        {canAct && (
          <div style={{
            background: 'var(--cream-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexWrap: 'wrap',
          }}>
            <span style={{ fontSize:'12px', fontWeight:600, color:'var(--ink-3)', marginRight:'4px' }}>
              Quick actions:
            </span>

            {/* Approve */}
            <button className="btn btn-success btn-sm" disabled={actionLoading}
              onClick={() => doAction('approve')}>
              ✓ Approve
            </button>

            {/* Return — inline note */}
            {!showReturnInline && !showRejectInline && !showEscalate && (
              <button className="btn btn-warning btn-sm" disabled={actionLoading}
                onClick={() => { setShowReturnInline(true); setShowRejectInline(false) }}>
                ↩ Return for Edit
              </button>
            )}

            {/* Reject — inline note */}
            {!showReturnInline && !showRejectInline && !showEscalate && (
              <button className="btn btn-danger btn-sm" disabled={actionLoading}
                onClick={() => { setShowRejectInline(true); setShowReturnInline(false) }}>
                ✕ Reject
              </button>
            )}

            {/* Escalate */}
            {!showReturnInline && !showRejectInline && !showEscalate && (
              <button className="btn btn-outline btn-sm" disabled={actionLoading}
                onClick={() => setShowEscalate(true)}>
                ↑ Escalate
              </button>
            )}

            {/* Inline Return note */}
            {showReturnInline && (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', flex:1, minWidth:'280px' }}>
                <input className="form-control" style={{ fontSize:'12px', padding:'5px 10px' }}
                  placeholder="Note to applicant (optional)…"
                  value={note} onChange={e => setNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doAction('return')}
                  autoFocus />
                <button className="btn btn-warning btn-sm" disabled={actionLoading}
                  onClick={() => doAction('return')}>
                  {actionLoading ? '…' : '↩ Confirm Return'}
                </button>
                <button className="btn btn-outline btn-sm"
                  onClick={() => { setShowReturnInline(false); setNote('') }}>✕</button>
              </div>
            )}

            {/* Inline Reject note */}
            {showRejectInline && (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', flex:1, minWidth:'280px' }}>
                <input className="form-control" style={{ fontSize:'12px', padding:'5px 10px' }}
                  placeholder="Reason for rejection (optional)…"
                  value={note} onChange={e => setNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doAction('reject')}
                  autoFocus />
                <button className="btn btn-danger btn-sm" disabled={actionLoading}
                  onClick={() => doAction('reject')}>
                  {actionLoading ? '…' : '✕ Confirm Reject'}
                </button>
                <button className="btn btn-outline btn-sm"
                  onClick={() => { setShowRejectInline(false); setNote('') }}>✕</button>
              </div>
            )}

            {/* Inline Escalate */}
            {showEscalate && (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', flex:1, minWidth:'280px', flexWrap:'wrap' }}>
                <select className="form-control" style={{ fontSize:'12px', padding:'5px 10px', width:'auto' }}
                  value={escalateTo} onChange={e => setEscalateTo(e.target.value)}>
                  <option value="">Select CEO / CFO…</option>
                  {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.role.toUpperCase()})</option>)}
                </select>
                <button className="btn btn-warning btn-sm" disabled={actionLoading || !escalateTo}
                  onClick={() => doAction('escalate', { escalated_to: escalateTo })}>
                  {actionLoading ? '…' : '↑ Send'}
                </button>
                <button className="btn btn-outline btn-sm"
                  onClick={() => { setShowEscalate(false); setEscalateTo('') }}>✕</button>
              </div>
            )}
          </div>
        )}

        {/* CEO/CFO quick actions */}
        {isMgr && app.status === 'escalated' && app.escalated_to === user?.id && (
          <div style={{
            background:'#fef3c7', border:'1px solid #fcd34d',
            borderRadius:'var(--radius)', padding:'12px 16px',
            display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap',
          }}>
            <span style={{ fontSize:'12px', fontWeight:600, color:'#92400e' }}>
              ↑ Escalated to you for approval:
            </span>
            <button className="btn btn-success btn-sm" disabled={actionLoading}
              onClick={() => doAction('approve')}>✓ Approve</button>
            {!showRejectInline && (
              <button className="btn btn-danger btn-sm" disabled={actionLoading}
                onClick={() => setShowRejectInline(true)}>✕ Reject</button>
            )}
            {showRejectInline && (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', flex:1, minWidth:'260px' }}>
                <input className="form-control" style={{ fontSize:'12px', padding:'5px 10px' }}
                  placeholder="Reason for rejection…"
                  value={note} onChange={e => setNote(e.target.value)}
                  autoFocus />
                <button className="btn btn-danger btn-sm" disabled={actionLoading}
                  onClick={() => doAction('reject')}>Confirm</button>
                <button className="btn btn-outline btn-sm"
                  onClick={() => { setShowRejectInline(false); setNote('') }}>✕</button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Duplicate confirmation modal */}
      {showDuplicate && (
        <div style={{ position:'fixed',inset:0,zIndex:3000,background:'rgba(10,10,20,0.7)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }}>
          <div style={{ background:'#fff',borderRadius:'12px',width:'100%',maxWidth:'500px',
            boxShadow:'0 24px 64px rgba(0,0,0,0.3)',overflow:'hidden' }}>
            <div style={{ background:'var(--ink)',padding:'16px 20px',display:'flex',alignItems:'center',gap:'10px' }}>
              <span style={{ fontSize:'20px' }}>⧉</span>
              <h3 style={{ color:'#fff',fontSize:'16px',fontWeight:600 }}>Duplicate Application</h3>
            </div>
            <div style={{ padding:'24px' }}>
              <div style={{ background:'var(--cream-2)',borderRadius:'8px',padding:'12px 16px',
                marginBottom:'20px',fontSize:'13px',border:'1px solid var(--border)' }}>
                <div style={{ fontWeight:600,marginBottom:'4px' }}>Source: {app.ref_number}</div>
                <div style={{ color:'var(--ink-2)' }}>{app.company_name} · {app.payment_reason}</div>
                <div style={{ color:'var(--ink-3)',marginTop:'2px',fontSize:'12px' }}>
                  AED {new Intl.NumberFormat('en-AE',{minimumFractionDigits:2}).format(app.amount)} · {app.status?.toUpperCase()}
                </div>
              </div>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'20px' }}>
                <div style={{ background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:'8px',padding:'12px' }}>
                  <div style={{ fontSize:'12px',fontWeight:600,color:'#065f46',marginBottom:'8px' }}>✓ Will be copied</div>
                  {['Company','Payment Reason','Payment Method','Receiving Company','Bank Name','Account / IBAN','Remarks'].map(f => (
                    <div key={f} style={{ fontSize:'12px',color:'#047857',padding:'2px 0' }}>· {f}</div>
                  ))}
                </div>
                <div style={{ background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:'8px',padding:'12px' }}>
                  <div style={{ fontSize:'12px',fontWeight:600,color:'#9a3412',marginBottom:'8px' }}>✗ Will be reset</div>
                  {[
                    ['Amount','enter fresh'],
                    ['Attachment','upload new if needed'],
                    ['Reference No.','auto-generated'],
                    ['Date','today\'s date'],
                    ['Status','opens as Draft'],
                  ].map(([f,hint]) => (
                    <div key={f} style={{ fontSize:'12px',color:'#c2410c',padding:'2px 0' }}>
                      · {f} <span style={{ fontSize:'10px',color:'#9a3412' }}>({hint})</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="alert alert-warning" style={{ marginBottom:'20px',fontSize:'12px' }}>
                ⚠ Opens as a <strong>new draft</strong>. Nothing is submitted until you review and click Submit.
              </div>
              <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end' }}>
                <button className="btn btn-outline" onClick={() => setShowDuplicate(false)}>Cancel</button>
                <button className="btn btn-primary"
                  onClick={() => { setShowDuplicate(false); navigate(`/new-application?duplicate=${id}`) }}>
                  ⧉ Open Duplicate Form
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {showDelete && (
        <div style={{ position:'fixed',inset:0,zIndex:3000,background:'rgba(10,10,20,0.75)',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }}>
          <div style={{ background:'#fff',borderRadius:'12px',width:'100%',maxWidth:'480px',boxShadow:'0 24px 64px rgba(0,0,0,0.4)',overflow:'hidden' }}>
            <div style={{ background:'#dc2626',padding:'16px 20px',display:'flex',alignItems:'center',gap:'10px' }}>
              <span style={{ fontSize:'20px' }}>🗑</span>
              <h3 style={{ color:'#fff',fontSize:'16px',fontWeight:600 }}>Delete Application</h3>
            </div>
            <div style={{ padding:'24px' }}>
              <div className="alert alert-error" style={{ marginBottom:'16px' }}>
                <strong>This cannot be undone.</strong> A permanent record will be kept in the deleted log.
              </div>
              <div style={{ background:'#f9fafb',borderRadius:'8px',padding:'12px',marginBottom:'16px',fontSize:'13px' }}>
                <div><strong>Ref:</strong> {app.ref_number}</div>
                <div><strong>Amount:</strong> AED {formatCurrency(app.amount)}</div>
                <div><strong>Submitted by:</strong> {app.submitted_by_name}</div>
                <div><strong>Status:</strong> {app.status?.toUpperCase()}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Reason for deletion <span style={{ color:'#dc2626' }}>*</span></label>
                <textarea className="form-control" rows={3} placeholder="Required: explain why this is being deleted…"
                  value={deleteReason} onChange={e => setDeleteReason(e.target.value)} />
              </div>
              <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'8px' }}>
                <button className="btn btn-outline" onClick={() => { setShowDelete(false); setDeleteReason('') }}>Cancel</button>
                <button className="btn btn-danger" disabled={actionLoading || !deleteReason.trim()} onClick={softDelete}>
                  {actionLoading ? 'Deleting…' : '🗑 Confirm Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '20px' }}>
        <div>
          <div className="card" style={{ marginBottom: '20px' }}>
            <div className="card-header"><h2>Payment Details</h2></div>
            <div className="card-body">
              <div className="form-row">
                <div>
                  <div className="form-label">Company</div>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', fontWeight:500 }}>
                    <span style={{ width:'10px', height:'10px', borderRadius:'50%', background: accentColor, display:'inline-block', flexShrink:0 }} />
                    {app.company_name}
                  </div>
                </div>
                <div><div className="form-label">Applicant</div><div>{toProperCase(app.submitted_by_name)}</div></div>
              </div>
              <hr className="divider" />
              <div className="form-group"><div className="form-label">Payment Reason</div><div>{toProperCase(app.payment_reason)}</div></div>
              <div className="form-row">
                <div><div className="form-label">Payment Method</div><div>{toProperCase(app.payment_method_name) || '—'}</div></div>
                <div><div className="form-label">Amount</div><div style={{ fontWeight:600, fontSize:'17px' }}>AED {formatCurrency(app.amount)}</div></div>
              </div>
              <div className="form-group"><div className="form-label">Amount in Words</div><div className="text-muted">{app.amount_words}</div></div>
              <hr className="divider" />
              <div className="form-row">
                <div><div className="form-label">Receiving Company</div><div>{toProperCase(app.payee_name) || '—'}</div></div>
                <div><div className="form-label">Bank</div><div>{toProperCase(app.bank_name) || '—'}</div></div>
              </div>
              <div className="form-group">
                <div className="form-label">Account / IBAN</div>
                <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:'13px' }}>{app.bank_account || '—'}</div>
              </div>
              {app.remarks && <div className="form-group"><div className="form-label">Remarks</div><div style={{ whiteSpace:'pre-line' }}>{app.remarks}</div></div>}
              {attachmentUrl && (
                <div className="form-group">
                  <div className="form-label">📎 Attachment</div>
                  <a href={attachmentUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline btn-sm">
                    View / Download {app.attachment_name}
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions moved to top header bar */}

          {isFinanceOrAbove && ['approved','rejected'].includes(app.status) && (
            <div className="card" style={{ marginBottom:'20px' }}>
              <div className="card-header"><h2>⚠ Revert Decision</h2></div>
              <div className="card-body">
                <div className="alert alert-warning" style={{ marginBottom:'14px' }}>
                  Reverts the application back to <strong>Pending</strong> for re-review. Logged permanently.
                </div>
                {!showRevert ? (
                  <button className="btn btn-warning" onClick={() => setShowRevert(true)}>↺ Revert to Pending</button>
                ) : (
                  <div>
                    <div className="form-group">
                      <label className="form-label">Reason for reverting <span style={{ color:'#dc2626' }}>*</span></label>
                      <textarea className="form-control" placeholder="Explain why this is being reverted…"
                        value={actionNote2} onChange={e => setActionNote2(e.target.value)} />
                    </div>
                    <div style={{ display:'flex', gap:'10px' }}>
                      <button className="btn btn-warning" disabled={actionLoading || !actionNote2.trim()} onClick={revertToPending}>
                        {actionLoading ? 'Reverting…' : '↺ Confirm Revert'}
                      </button>
                      <button className="btn btn-outline" onClick={() => { setShowRevert(false); setActionNote2('') }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* CEO/CFO approval handled in top header bar */}

          {!isFinanceOrAbove && app.outcome_note && (
            <div className={`alert ${app.status==='approved'?'alert-success':app.status==='returned'?'alert-warning':'alert-error'}`}>
              <strong>{app.status==='returned'?'Please correct and resubmit:':app.status==='rejected'?'Rejection reason:':'Note:'}</strong>
              {' '}{app.outcome_note}
            </div>
          )}
        </div>

        <div>
          <div className="card">
            <div className="card-header"><h2>Activity</h2></div>
            <div className="card-body">
              {auditLog.length === 0
                ? <p className="text-muted text-sm">No activity yet</p>
                : <AuditTimeline log={auditLog} />
              }
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
