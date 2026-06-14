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

function parseAttachmentNote(note) {
  if (!note) return null
  try {
    const data = JSON.parse(note)
    if (data?.type === 'finance_attachment' && data.path && data.name) return data
  } catch {}
  return null
}

function parseDeletedAttachmentNote(note) {
  if (!note) return null
  try {
    const data = JSON.parse(note)
    if (data?.type === 'finance_attachment_deleted' && data.path) return data
  } catch {}
  return null
}

function formatFileSize(bytes) {
  if (!bytes) return ''
  const mb = bytes / 1024 / 1024
  if (mb >= 1) return `${mb.toFixed(2)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function getRoleColor(role) {
  const colors = {
    manager:    { bg:'#e0f2fe', border:'#7dd3fc', text:'#0369a1', label:'Manager' },
    finance:    { bg:'#dcfce7', border:'#86efac', text:'#166534', label:'Finance' },
    cfo:        { bg:'#fef9c3', border:'#fde047', text:'#854d0e', label:'CFO' },
    ceo:        { bg:'#fef3c7', border:'#fbbf24', text:'#92400e', label:'CEO' },
    superadmin: { bg:'#ede9fe', border:'#c4b5fd', text:'#5b21b6', label:'Admin' },
  }
  return colors[role] || { bg:'#f3f4f6', border:'#d1d5db', text:'#374151', label: role || 'User' }
}

function AttachmentPreview({ path, name, onClose }) {
  const [url, setUrl]         = useState(null)
  const [loading, setLoading] = useState(true)
  const isImage = /\.(jpg|jpeg|png|webp)$/i.test(name || '')
  const isPDF   = /\.pdf$/i.test(name || '')

  useEffect(() => {
    let active = true
    supabase.storage.from('attachments').createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (active) {
          setUrl(data?.signedUrl || null)
          setLoading(false)
        }
      })
    const fn = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', fn)
    return () => {
      active = false
      window.removeEventListener('keydown', fn)
    }
  }, [path])

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position:'fixed', inset:0, zIndex:2000, background:'rgba(10,10,20,0.75)',
        display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
      <div style={{ background:'#fff', borderRadius:'12px', boxShadow:'0 24px 64px rgba(0,0,0,0.4)',
        width:'100%', maxWidth:'780px', maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'14px 18px', borderBottom:'1px solid #e5e7eb', background:'#f9fafb', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px', minWidth:0 }}>
            <span>{isPDF ? 'PDF' : isImage ? 'IMG' : 'DOC'}</span>
            <span style={{ fontSize:'13px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</span>
          </div>
          <div style={{ display:'flex', gap:'8px', flexShrink:0 }}>
            {url && <a href={url} download={name} target="_blank" rel="noopener noreferrer"
              style={{ fontSize:'12px', padding:'5px 12px', background:'#1e40af', color:'#fff',
                borderRadius:'6px', textDecoration:'none', fontWeight:500 }}>Download</a>}
            <button onClick={onClose} style={{ background:'#f3f4f6', border:'1px solid #d1d5db',
              borderRadius:'6px', padding:'5px 12px', cursor:'pointer', fontSize:'12px' }}>Close</button>
          </div>
        </div>
        <div style={{ flex:1, overflow:'auto', display:'flex', alignItems:'center',
          justifyContent:'center', background:'#f3f4f6', minHeight:'300px' }}>
          {loading && <div style={{ textAlign:'center', color:'#6b7280' }}><p>Loading...</p></div>}
          {!loading && url && isImage && <img src={url} alt={name} style={{ maxWidth:'100%', maxHeight:'70vh', objectFit:'contain' }} />}
          {!loading && url && isPDF && <iframe src={url} title={name} style={{ width:'100%', height:'70vh', border:'none' }} />}
          {!loading && url && !isImage && !isPDF && (
            <div style={{ textAlign:'center', padding:'40px' }}>
              <div style={{ fontSize:'13px', color:'#4b5563', marginBottom:'14px' }}>Preview is not available for this file type.</div>
              <a href={url} download={name} style={{ padding:'8px 20px', background:'#1e40af', color:'#fff', borderRadius:'6px', textDecoration:'none' }}>
                Download {name}
              </a>
            </div>
          )}
          {!loading && !url && <div style={{ textAlign:'center', color:'#991b1b', padding:'40px' }}>Could not open this attachment.</div>}
        </div>
        <div style={{ padding:'8px 18px', background:'#f9fafb', borderTop:'1px solid #e5e7eb', flexShrink:0 }}>
          <p style={{ fontSize:'11px', color:'#9ca3af' }}>Click outside or press Escape to close</p>
        </div>
      </div>
    </div>
  )
}

function DetailAttachmentLink({ path, name }) {
  const [show, setShow] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setShow(true)}
        className="btn btn-outline btn-sm"
        style={{ maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis' }}>
        View / Download {name}
      </button>
      {show && <AttachmentPreview path={path} name={name} onClose={() => setShow(false)} />}
    </>
  )
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
              {e.note && <div className="timeline-note">
                {parseAttachmentNote(e.note)?.name
                  ? `Added document: ${parseAttachmentNote(e.note).name}`
                  : e.note
                }
              </div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Print/PDF layout — original table format + colour strip ─
function PrintView({ app, companyColor, auditLog = [], sigFile = { manager:null, finance:null, cfo:null } }) {
  const date   = fmtDate(app.submitted_at || app.created_at)
  const accent = companyColor?.accent || '#8b6914'
  const pastel = companyColor?.pastel || '#fef3c7'

  const mgrEntry = auditLog.find(l => l.action === 'mgr_approved')
  const finEntry = auditLog.find(l => l.action === 'fin_approved')
  const cfoEntry = auditLog.find(l => l.action === 'approved')
  const mgrBy    = mgrEntry?.actor || app.manager_name || null
  const mgrDate  = mgrEntry ? fmtDate(mgrEntry.created_at) : date
  const finBy    = finEntry?.actor || app.fin_approved_by_name || null
  const finDate  = finEntry ? fmtDate(finEntry.created_at) : date
  const cfoBy    = cfoEntry?.actor || app.cfo_approved_by_name || null
  const cfoDate  = cfoEntry ? fmtDate(cfoEntry.created_at) : date

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

          {/* Row 10: Signatures — 4-stage approval chain */}
          <tr>
            <td colSpan={4} style={{ border:'1px solid #c8b99a', padding:'0' }}>
              <div style={{ display:'flex' }}>
                {[
                  { cn:'申请部门主管签字', en:'Dept Head / Manager',    by: mgrBy, dt: mgrDate, sigKey: 'manager', showSig: ['mgr_approved','fin_approved','approved'].includes(app.status) },
                  { cn:'财务部审批签字',   en:'Finance Officer',        by: finBy, dt: finDate, sigKey: 'finance', showSig: ['fin_approved','approved'].includes(app.status) },
                  { cn:'CFO / 总经理签字', en:'CFO / General Manager',  by: cfoBy, dt: cfoDate, sigKey: 'cfo',     showSig: app.status === 'approved' },
                ].map((sig, i) => (
                  <div key={i} style={{
                    flex:1, borderRight: i < 2 ? '1px solid #c8b99a' : 'none',
                    padding:'8px 8px 6px', textAlign:'center',
                  }}>
                    <div style={{ fontSize:'10px', fontFamily:"Georgia, serif", fontWeight:'bold', color:'#2a1500', marginBottom:'1px' }}>{sig.cn}</div>
                    <div style={{ fontSize:'9px', color:'#888', marginBottom:'4px', fontFamily:"Georgia, serif" }}>{sig.en}</div>
                    {/* Signature image — per slot */}
                    {sig.sigKey && sigFile?.[sig.sigKey] && sig.showSig ? (
                      <div style={{ margin:'0 6px', height:'40px', borderBottom:'1px solid #aaa', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <img
                          data-sig={sig.sigKey}
                          src={sigFile[sig.sigKey]}
                          alt="signature"
                          style={{ maxHeight:'36px', maxWidth:'100%', objectFit:'contain', display:'block' }}
                        />
                      </div>
                    ) : (
                      <div style={{ height:'40px', borderBottom:'1px solid #aaa', margin:'0 6px', position:'relative' }}>
                        {/* Placeholder img with data-sig so DOM injection can find it */}
                        <img
                          data-sig={sig.sigKey}
                          src=""
                          alt=""
                          style={{ display:'none', maxHeight:'36px', maxWidth:'100%', objectFit:'contain', position:'absolute', bottom:'4px', left:'6px' }}
                        />
                        {sig.by && sig.showSig && (
                          <div style={{ position:'absolute', bottom:'4px', left:0, right:0, fontSize:'10px', fontWeight:'bold', color:'#1a0800', fontFamily:"Georgia, serif", overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', padding:'0 4px' }}>
                            {sig.by}
                          </div>
                        )}
                      </div>
                    )}
                    <div style={{ fontSize:'9px', color:'#555', marginTop:'4px', fontFamily:"Georgia, serif" }}>
                      DATE: {sig.by ? sig.dt : date}
                    </div>
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
  const isManager = profile?.role === 'manager'
  const isCFO     = profile?.role === 'cfo'
  const printRef    = useRef()
  const financeFileRef = useRef()
  const cameraVideoRef = useRef()
  const cameraCanvasRef = useRef()
  const lastSavedFinanceCommentRef = useRef('')
  const savedFinanceCommentIdRef = useRef(null)

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
  const [sigFile,     setSigFile]         = useState({ manager:null, finance:null, cfo:null })
  const [showDuplicate,    setShowDuplicate]    = useState(false)
  const [showReturnInline, setShowReturnInline] = useState(false)
  const [showRejectInline, setShowRejectInline] = useState(false)
  const [showRevert,       setShowRevert]       = useState(false)
  const [showDelete,   setShowDelete]     = useState(false)
  const [deleteReason, setDeleteReason]   = useState('')
  const [actionNote2,  setActionNote2]    = useState('')
  const [financeAttachment, setFinanceAttachment] = useState(null)
  const [financeAttLabel, setFinanceAttLabel]     = useState('')
  const [financeAttError, setFinanceAttError]     = useState('')
  const [uploadingFinanceAtt, setUploadingFinanceAtt] = useState(false)
  const [hasClipboardImage, setHasClipboardImage] = useState(false)
  const [financeComment, setFinanceComment]       = useState('')
  const [financeCommentStatus, setFinanceCommentStatus] = useState('')
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const [cameraError, setCameraError] = useState('')

  useEffect(() => { load() }, [id])

  useEffect(() => {
    const key = `finance_comment_draft_${id}`
    setFinanceComment(localStorage.getItem(key) || '')
    lastSavedFinanceCommentRef.current = ''
  }, [id])

  useEffect(() => {
    if (!id) return
    const key = `finance_comment_draft_${id}`
    if (financeComment) localStorage.setItem(key, financeComment)
    else localStorage.removeItem(key)
  }, [id, financeComment])

  useEffect(() => {
    if (!['finance','superadmin'].includes(profile?.role)) return

    async function checkClipboardForImage() {
      if (!navigator.clipboard?.read) {
        setHasClipboardImage(false)
        return
      }
      try {
        const items = await navigator.clipboard.read()
        setHasClipboardImage(items.some(item => item.types.some(type => type.startsWith('image/'))))
      } catch {
        setHasClipboardImage(false)
      }
    }

    checkClipboardForImage()
    window.addEventListener('focus', checkClipboardForImage)
    window.addEventListener('paste', checkClipboardForImage)
    window.addEventListener('copy', checkClipboardForImage)
    return () => {
      window.removeEventListener('focus', checkClipboardForImage)
      window.removeEventListener('paste', checkClipboardForImage)
      window.removeEventListener('copy', checkClipboardForImage)
    }
  }, [profile?.role])

  useEffect(() => {
    return () => {
      cameraStream?.getTracks().forEach(track => track.stop())
    }
  }, [cameraStream])

  useEffect(() => {
    if (!showCameraModal || !cameraStream || !cameraVideoRef.current) return
    cameraVideoRef.current.srcObject = cameraStream
    cameraVideoRef.current.play?.().catch(() => {
      setCameraError('Camera opened, but preview could not start. Try closing and reopening camera.')
    })
  }, [showCameraModal, cameraStream])

  async function load() {
    setLoading(true)
    const [{ data: appData }, { data: logData }, { data: mgrs }, { data: cos }] = await Promise.all([
      supabase.from('applications_full').select('*').eq('id', id).single(),
      supabase.from('audit_log')
        .select('id, action, note, created_at, action_by, users!action_by(full_name,role)')
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
    const mappedLog = (logData || []).map(l => ({
      ...l,
      actor: l.users?.full_name || 'System',
      actorRole: l.users?.role || '',
    }))
    setAuditLog(mappedLog)
    const myLatestComment = [...mappedLog]
      .reverse()
      .find(l => l.action_by === user?.id && l.note?.startsWith('Comment: '))
    const localDraft = localStorage.getItem(`finance_comment_draft_${id}`)
    if (myLatestComment && (!localDraft || localDraft === myLatestComment.note.slice(9))) {
      savedFinanceCommentIdRef.current = myLatestComment.id
      lastSavedFinanceCommentRef.current = myLatestComment.note.slice(9)
      setFinanceComment(myLatestComment.note.slice(9))
    }
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
  // Unified: load sig, inject into state, wait for render, then act
  async function prepareAndAct(action) {
    // Fetch ALL approver signatures dynamically using stored user IDs on the application
    // Each signature is fetched from the approver's private Supabase folder
    let sigs = { manager: null, finance: null, cfo: null }

    const sigStatuses = ['mgr_approved','fin_approved','approved']
    if (sigStatuses.includes(app.status)) {
      // Fetch in parallel for speed
      const [mgrSig, finSig, cfoSig] = await Promise.all([
        app.manager_id      ? loadSigForUser(app.manager_id)      : Promise.resolve(null),
        app.fin_approved_by ? loadSigForUser(app.fin_approved_by) : Promise.resolve(null),
        app.cfo_approved_by ? loadSigForUser(app.cfo_approved_by) : Promise.resolve(null),
      ])
      sigs.manager = mgrSig
      sigs.finance = finSig
      sigs.cfo     = cfoSig
    }

    // Set sigFile state so PrintView re-renders with signature
    setSigFile(sigs)

    // Wait for React to commit the re-render — use a longer reliable timeout
    // requestAnimationFrame is not enough; React batches and may not flush immediately
    await new Promise(r => setTimeout(r, 600))

    // Double-check: manually inject signature images into the hidden div as fallback
    // This guarantees the image is in the DOM regardless of React timing
    if (printRef.current) {
      const sigSlots = {
        manager: printRef.current.querySelector('[data-sig="manager"]'),
        finance: printRef.current.querySelector('[data-sig="finance"]'),
        cfo:     printRef.current.querySelector('[data-sig="cfo"]'),
      }
      Object.entries(sigs).forEach(([key, dataUrl]) => {
        if (dataUrl && sigSlots[key]) {
          sigSlots[key].src = dataUrl
          sigSlots[key].style.display = 'block'
        }
      })
      // Wait a bit more for images to paint
      await new Promise(r => setTimeout(r, 200))
    }

    if (action === 'print') {
      const html = printRef.current?.innerHTML || ''
      const printWindow = window.open('', '_blank', 'width=900,height=700')
      printWindow.document.write(`<!DOCTYPE html><html><head>
        <meta charset="UTF-8"/>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600&family=Cormorant+Garamond:wght@400;600&display=swap" rel="stylesheet"/>
        <style>
          body { margin:0; padding:0; font-family:'Cormorant Garamond',serif; }
          @media print { @page { margin:10mm; } }
          img { display:block !important; max-height:36px; }
        </style>
        </head><body>${html}</body></html>`)
      printWindow.document.close()
      printWindow.focus()
      setTimeout(() => { printWindow.print() }, 1500)
    }

    if (action === 'pdf') {
      try {
        const html2pdf = (await import('html2pdf.js')).default
        const element  = printRef.current
        const filename = buildFilename(app.ref_number)
        const opt = {
          margin:      [10, 10, 10, 10],
          filename,
          image:       { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
          jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        }
        await html2pdf().set(opt).from(element).save()
      } catch (err) {
        alert('Download failed: ' + err.message)
      }
    }

    // Reset sigFile after action
    setTimeout(() => setSigFile({ manager: null, finance: null, cfo: null }), 500)
  }

  function handlePrint() {
    prepareAndAct('print')
  }

  // ── Download — silent PDF via html2pdf.js ───────────────────
  // Load signature for a specific user by their ID
  // Checks localStorage first (fast), then Supabase (cross-device)
  async function loadSigForUser(userId) {
    if (!userId) return null
    // Check localStorage cache first
    const localKey = `sig_${userId}`
    const local = localStorage.getItem(localKey)
    if (local) return local
    // Fetch from Supabase — any authenticated user can read any signature
    try {
      const { data, error } = await supabase.storage
        .from('signatures')
        .createSignedUrl(`${userId}/signature.png`, 300)
      if (error || !data?.signedUrl) return null
      const res  = await fetch(data.signedUrl)
      if (!res.ok) return null
      const blob = await res.blob()
      return await new Promise(r => {
        const reader = new FileReader()
        reader.onload = e => r(e.target.result)
        reader.readAsDataURL(blob)
      })
    } catch { return null }
  }

  // Keep loadMySig for profile page compatibility
  async function loadMySig() {
    return loadSigForUser(user.id)
  }

  async function handleDownload() {
    setDownloading(true)
    await prepareAndAct('pdf')
    setDownloading(false)
  }

  async function doAction(action, extra = {}) {
    setActionLoading(true)
    try {
      const now = new Date().toISOString()
      // Determine new status and extra fields based on role + action
      let newStatus, auditAction, extraFields = {}

      if (action === 'mgr_approve') {
        newStatus = 'mgr_approved'; auditAction = 'mgr_approved'
        extraFields = { manager_id: user.id, manager_note: note || null, manager_acted_at: now }
      } else if (action === 'mgr_reject') {
        newStatus = 'mgr_rejected'; auditAction = 'mgr_rejected'
        extraFields = { manager_id: user.id, manager_note: note || null, manager_acted_at: now }
      } else if (action === 'fin_approve') {
        newStatus = 'fin_approved'; auditAction = 'fin_approved'
        extraFields = { fin_approved_by: user.id, fin_approved_at: now }
      } else if (action === 'approve') {
        newStatus = 'approved'; auditAction = 'approved'
        extraFields = { cfo_approved_by: user.id, cfo_approved_at: now, processed_at: now }
      } else if (action === 'reject') {
        newStatus = 'rejected'; auditAction = 'rejected'
        extraFields = { processed_at: now }
      } else if (action === 'return') {
        newStatus = 'returned'; auditAction = 'returned'
      } else if (action === 'escalate') {
        newStatus = 'escalated'; auditAction = 'escalated'
      } else {
        newStatus = action; auditAction = action
      }

      await supabase.from('applications').update({
        status: newStatus,
        outcome_note: ['reject','return','mgr_reject'].includes(action) ? note : app.outcome_note,
        ...extraFields,
        ...extra,
      }).eq('id', id)

      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id,
        action: auditAction,
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

  async function reverseHierarchyApproval(targetStatus, fieldsToClear, defaultNote) {
    const reason = window.prompt('Reason for reversing this approval?')
    if (reason === null) return
    setActionLoading(true)
    try {
      const cleared = Object.fromEntries(fieldsToClear.map(f => [f, null]))
      await supabase.from('applications').update({
        status: targetStatus,
        processed_at: null,
        outcome_note: null,
        ...cleared,
      }).eq('id', id)
      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id, action: 'reverted',
        note: reason.trim() || defaultNote,
      })
      await load()
    } finally { setActionLoading(false) }
  }

  function handleFinanceAttachmentFile(e) {
    const file = e.target.files[0]
    setFinanceAttError('')
    setFinanceAttLabel('')
    if (!file) { setFinanceAttachment(null); return }
    if (!['application/pdf','image/jpeg','image/png'].includes(file.type)) {
      setFinanceAttError('Only PDF, JPG and PNG')
      e.target.value = ''
      return
    }
    if (file.size > 5*1024*1024) {
      setFinanceAttError('File must be under 5MB')
      e.target.value = ''
      return
    }
    setFinanceAttachment(file)
    setFinanceAttLabel(`${file.name} (${(file.size/1024/1024).toFixed(2)} MB)`)
  }

  async function openCameraCapture() {
    setCameraError('')
    setShowCameraModal(true)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera capture is not supported in this browser.')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
      setCameraStream(stream)
    } catch (err) {
      setCameraError('Could not access camera. Allow camera permission, then try again.')
    }
  }

  function closeCameraCapture() {
    cameraStream?.getTracks().forEach(track => track.stop())
    setCameraStream(null)
    setShowCameraModal(false)
    setCameraError('')
  }

  async function captureCameraPhoto() {
    const video = cameraVideoRef.current
    const canvas = cameraCanvasRef.current
    if (!video || !canvas || !video.videoWidth) {
      setCameraError('Camera preview is not ready yet.')
      return
    }
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) {
      setCameraError('Could not capture photo.')
      return
    }
    if (blob.size > 5*1024*1024) {
      setCameraError('Photo must be under 5MB.')
      return
    }
    const file = new File([blob], `camera-document-${Date.now()}.jpg`, { type: 'image/jpeg' })
    closeCameraCapture()
    await uploadFinanceAttachment(file)
  }

  async function pasteFinanceScreenshot() {
    setFinanceAttError('')
    setFinanceAttLabel('')
    try {
      if (!navigator.clipboard?.read) {
        setFinanceAttError('Clipboard image paste is not supported in this browser')
        return
      }

      const items = await navigator.clipboard.read()
      for (const item of items) {
        const imageType = item.types.find(type => type.startsWith('image/'))
        if (!imageType) continue

        const blob = await item.getType(imageType)
        if (blob.size > 5*1024*1024) {
          setFinanceAttError('Screenshot must be under 5MB')
          return
        }

        const ext = imageType === 'image/jpeg' ? 'jpg' : 'png'
        const file = new File([blob], `screenshot-${Date.now()}.${ext}`, { type: imageType })
        await uploadFinanceAttachment(file)
        return
      }

      setFinanceAttError('No screenshot image found in clipboard. Press PrtSc or copy an image first.')
    } catch (err) {
      setFinanceAttError('Could not read clipboard. Allow clipboard access, then try again.')
    }
  }

  async function uploadFinanceAttachment(fileOverride = null) {
    const fileToUpload = fileOverride?.name ? fileOverride : financeAttachment
    if (!fileToUpload) return
    setUploadingFinanceAtt(true)
    setFinanceAttError('')
    try {
      const ext = fileToUpload.name.split('.').pop()
      const path = `${user.id}/${id}/finance-${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('attachments').upload(path, fileToUpload)
      if (error) throw error
      await supabase.from('audit_log').insert({
        application_id: id,
        action_by: user.id,
        action: 'attachment_added',
        note: JSON.stringify({
          type: 'finance_attachment',
          path,
          name: fileToUpload.name,
          size: fileToUpload.size,
        }),
      })
      setFinanceAttachment(null)
      setFinanceAttLabel('')
      await load()
    } catch (err) {
      setFinanceAttError(err.message || 'Could not upload document')
    } finally {
      setUploadingFinanceAtt(false)
    }
  }

  async function deleteFinanceAttachment(att) {
    if (!window.confirm(`Remove ${att.name}?`)) return
    setActionLoading(true)
    try {
      const { error } = await supabase.storage.from('attachments').remove([att.path])
      if (error) throw error
      await supabase.from('audit_log').insert({
        application_id: id,
        action_by: user.id,
        action: 'attachment_deleted',
        note: JSON.stringify({
          type: 'finance_attachment_deleted',
          path: att.path,
          name: att.name,
        }),
      })
      await load()
    } catch (err) {
      alert(err.message || 'Could not delete attachment')
    } finally {
      setActionLoading(false)
    }
  }

  async function addFinanceComment() {
    const text = financeComment.trim()
    if (!text && savedFinanceCommentIdRef.current) {
      await deleteFinanceCommentById(savedFinanceCommentIdRef.current, lastSavedFinanceCommentRef.current)
      return
    }
    if (!text || text === lastSavedFinanceCommentRef.current) return
    setActionLoading(true)
    try {
      setFinanceCommentStatus('Saving...')
      let error
      if (savedFinanceCommentIdRef.current) {
        ;({ error } = await supabase.from('audit_log')
          .update({ note: `Comment: ${text}` })
          .eq('id', savedFinanceCommentIdRef.current)
          .eq('action_by', user.id))
      } else {
        const result = await supabase.from('audit_log').insert({
          application_id: id,
          action_by: user.id,
          action: 'edited',
          note: `Comment: ${text}`,
        }).select('id').single()
        error = result.error
        if (result.data?.id) savedFinanceCommentIdRef.current = result.data.id
      }
      if (error) throw error
      lastSavedFinanceCommentRef.current = text
      setFinanceCommentStatus('Saved to Activity')
      if (savedFinanceCommentIdRef.current) {
        setAuditLog(log => {
          const existing = log.find(e => e.id === savedFinanceCommentIdRef.current)
          if (existing) {
            return log.map(e => e.id === savedFinanceCommentIdRef.current
              ? { ...e, note: `Comment: ${text}` }
              : e
            )
          }
          return [
            ...log,
            {
              id: savedFinanceCommentIdRef.current,
              action: 'edited',
              note: `Comment: ${text}`,
              created_at: new Date().toISOString(),
              action_by: user.id,
              actor: profile?.full_name || 'You',
              actorRole: profile?.role || '',
            },
          ]
        })
      }
    } catch (err) {
      setFinanceCommentStatus(err.message || 'Could not save comment')
    } finally {
      setActionLoading(false)
    }
  }

  async function deleteFinanceCommentById(commentId, commentText = '') {
    setActionLoading(true)
    try {
      const { error } = await supabase.from('audit_log')
        .update({ note: `CommentDeleted: ${commentText}` })
        .eq('id', commentId)
        .eq('action_by', user.id)
      if (error) throw error
      if (savedFinanceCommentIdRef.current === commentId) {
        savedFinanceCommentIdRef.current = null
        lastSavedFinanceCommentRef.current = ''
        setFinanceComment('')
        localStorage.removeItem(`finance_comment_draft_${id}`)
      }
      setFinanceCommentStatus('Comment deleted')
      setAuditLog(log => log.map(e => e.id === commentId
        ? { ...e, note: `CommentDeleted: ${commentText}` }
        : e
      ))
    } catch (err) {
      setFinanceCommentStatus(err.message || 'Could not delete comment')
    } finally {
      setActionLoading(false)
    }
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

  // Each role acts on specific statuses
  const canActManager = isManager && app.status === 'pending'
  const canActFinance = profile?.role === 'finance' && ['pending','mgr_approved'].includes(app.status)
  // CFO and CEO can override at ANY stage
  const canActCFO     = ['cfo','ceo'].includes(profile?.role) &&
    ['pending','mgr_approved','fin_approved','escalated'].includes(app.status)
  const canAct        = canActManager || canActFinance || canActCFO ||
    (isSuperAdmin && ['pending','mgr_approved','fin_approved','escalated'].includes(app.status))
  const isOwner = app.submitted_by === user?.id
  const canEdit = isOwner && ['draft','returned'].includes(app.status)
  const isMgr   = ['ceo','cfo'].includes(profile?.role)
  const canAddFinanceAttachment = ['finance','superadmin'].includes(profile?.role) &&
    ['pending','mgr_approved','fin_approved','approved'].includes(app.status)
  const canAddFinancePostApprovalComment = ['finance','superadmin'].includes(profile?.role) && app.status !== 'draft'
  const deletedFinanceAttachmentPaths = new Set(
    auditLog.map(e => parseDeletedAttachmentNote(e.note)?.path).filter(Boolean)
  )
  const additionalAttachments = auditLog
    .map(e => ({ ...parseAttachmentNote(e.note), id: e.id, created_at: e.created_at, actor: e.actor }))
    .filter(a => a.path && a.name && !deletedFinanceAttachmentPaths.has(a.path))
  const roleComments = auditLog.filter(e =>
    e.note &&
    !e.note.startsWith('CommentDeleted: ') &&
    !(e.note.startsWith('Comment: ') && e.action_by === user?.id) &&
    (
      e.note.startsWith('Comment: ') ||
      ['mgr_approved','mgr_rejected','fin_approved','approved','rejected','returned','escalated'].includes(e.action)
    )
  )
  const canReverseManager = (isManager || isSuperAdmin) && app.status === 'mgr_approved' &&
    (isSuperAdmin || app.manager_id === user?.id)
  const canReverseFinance = (profile?.role === 'finance' || isSuperAdmin) && app.status === 'fin_approved' &&
    (isSuperAdmin || app.fin_approved_by === user?.id)
  const canReverseCFO = (['cfo','ceo'].includes(profile?.role) || isSuperAdmin) && app.status === 'approved' &&
    (isSuperAdmin || app.cfo_approved_by === user?.id)

  const accentColor = companyColor?.accent || '#1d4ed8'
  const pastelColor = companyColor?.pastel || '#dbeafe'

  return (
    <div>
      {/* Hidden print/download target */}
      <div style={{ position: 'fixed', left: '-9999px', top: 0, width: '800px' }}>
        <div ref={printRef}><PrintView app={app} companyColor={companyColor} auditLog={auditLog} sigFile={sigFile} /></div>
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

        {/* Quick action bar — role and status aware */}
        {canAct && (
          <div style={{
            background:'var(--cream-2)', border:'1px solid var(--border)',
            borderRadius:'var(--radius)', padding:'12px 16px',
            display:'flex', alignItems:'center', gap:'10px', flexWrap:'wrap',
          }}>
            {/* Stage indicator */}
            <span style={{ fontSize:'11px', fontWeight:600, color:'var(--ink-3)', marginRight:'4px' }}>
              {canActManager && '👔 Manager review:'}
              {canActFinance && '💼 Finance review:'}
              {canActCFO     && '🏦 CFO final approval:'}
              {isSuperAdmin && !canActManager && !canActFinance && !canActCFO && '⚙ Admin action:'}
            </span>

            {!showReturnInline && !showRejectInline && !showEscalate && (
              <input className="form-control"
                style={{ fontSize:'12px', padding:'5px 10px', minWidth:'240px', maxWidth:'340px', flex:'1 1 240px' }}
                placeholder="Optional approval note / comment..."
                value={note}
                onChange={e => setNote(e.target.value)}
              />
            )}

            {/* Manager actions */}
            {(canActManager || isSuperAdmin) && app.status === 'pending' && !showReturnInline && !showRejectInline && (
              <>
                <button className="btn btn-success btn-sm" disabled={actionLoading}
                  onClick={() => doAction('mgr_approve')}>✓ Approve → Finance</button>
                <button className="btn btn-warning btn-sm" disabled={actionLoading}
                  onClick={() => { setShowReturnInline(true); setShowRejectInline(false) }}>↩ Return for Edit</button>
                <button className="btn btn-danger btn-sm" disabled={actionLoading}
                  onClick={() => { setShowRejectInline(true); setShowReturnInline(false) }}>✕ Reject</button>
              </>
            )}

            {/* Finance actions */}
            {(canActFinance || isSuperAdmin) && ['pending','mgr_approved'].includes(app.status) && !showReturnInline && !showRejectInline && (
              <>
                <button className="btn btn-success btn-sm" disabled={actionLoading}
                  onClick={() => doAction('fin_approve')}>✓ Approve → CFO</button>
                <button className="btn btn-warning btn-sm" disabled={actionLoading}
                  onClick={() => { setShowReturnInline(true); setShowRejectInline(false) }}>↩ Return for Edit</button>
                <button className="btn btn-danger btn-sm" disabled={actionLoading}
                  onClick={() => { setShowRejectInline(true); setShowReturnInline(false) }}>✕ Reject</button>
                {!showEscalate && (
                  <button className="btn btn-outline btn-sm" disabled={actionLoading}
                    onClick={() => setShowEscalate(true)}>↑ Escalate</button>
                )}
              </>
            )}

            {/* CFO/CEO — can override at ANY stage */}
            {canActCFO && !showRejectInline && !showReturnInline && (
              <>
                <button className="btn btn-success btn-sm" disabled={actionLoading}
                  onClick={() => doAction('approve')}>
                  ✓ {app.status === 'fin_approved' ? 'Final Approve' : 'Override & Approve'}
                </button>
                <button className="btn btn-danger btn-sm" disabled={actionLoading}
                  onClick={() => { setShowRejectInline(true); setShowReturnInline(false) }}>✕ Reject</button>
                <button className="btn btn-warning btn-sm" disabled={actionLoading}
                  onClick={() => { setShowReturnInline(true); setShowRejectInline(false) }}>↩ Return</button>
                {app.status !== 'fin_approved' && (
                  <span style={{fontSize:'10px',color:'#c2410c',background:'#fff7ed',
                    padding:'2px 8px',borderRadius:'20px',border:'1px solid #fed7aa'}}>
                    ⚡ Override — skipping pending stages
                  </span>
                )}
              </>
            )}

            {/* Inline Return note */}
            {showReturnInline && (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', flex:1, minWidth:'280px' }}>
                <input className="form-control" style={{ fontSize:'12px', padding:'5px 10px' }}
                  placeholder="Note to applicant (optional)…"
                  value={note} onChange={e => setNote(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doAction('return')} autoFocus />
                <button className="btn btn-warning btn-sm" disabled={actionLoading}
                  onClick={() => doAction('return')}>{actionLoading ? '…' : '↩ Confirm'}</button>
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
                  onKeyDown={e => e.key === 'Enter' && doAction('reject')} autoFocus />
                <button className="btn btn-danger btn-sm" disabled={actionLoading}
                  onClick={() => doAction('reject')}>{actionLoading ? '…' : '✕ Confirm'}</button>
                <button className="btn btn-outline btn-sm"
                  onClick={() => { setShowRejectInline(false); setNote('') }}>✕</button>
              </div>
            )}

            {/* Inline Escalate */}
            {showEscalate && (
              <div style={{ display:'flex', gap:'8px', alignItems:'center', flex:1, minWidth:'280px', flexWrap:'wrap' }}>
                <select className="form-control" style={{ fontSize:'12px', padding:'5px 10px', width:'auto' }}
                  value={escalateTo} onChange={e => setEscalateTo(e.target.value)}>
                  <option value="">Select CFO…</option>
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

        {/* Approval chain status — visible to all */}
        {['mgr_approved','fin_approved','approved'].includes(app.status) && (
          <div style={{
            display:'flex', gap:'6px', flexWrap:'wrap', alignItems:'center',
            padding:'8px 12px', background:'var(--cream-2)',
            border:'1px solid var(--border)', borderRadius:'var(--radius-sm)',
          }}>
            <span style={{fontSize:'11px',color:'var(--ink-3)',fontWeight:600}}>Approvals:</span>
            {app.manager_name && (
              <span style={{fontSize:'11px',background:'#e0f2fe',color:'#0369a1',padding:'2px 8px',borderRadius:'20px'}}>
                👔 {app.manager_name}
              </span>
            )}
            {app.fin_approved_by_name && (
              <span style={{fontSize:'11px',background:'#dcfce7',color:'#166534',padding:'2px 8px',borderRadius:'20px'}}>
                💼 {app.fin_approved_by_name}
              </span>
            )}
            {app.cfo_approved_by_name && (
              <span style={{fontSize:'11px',background:'#fef9c3',color:'#854d0e',padding:'2px 8px',borderRadius:'20px'}}>
                🏦 {app.cfo_approved_by_name}
              </span>
            )}
            {canReverseManager && (
              <button className="btn btn-outline btn-sm" disabled={actionLoading}
                onClick={() => reverseHierarchyApproval(
                  'pending',
                  ['manager_id','manager_note','manager_acted_at'],
                  'Manager approval reversed'
                )}>Reverse Manager</button>
            )}
            {canReverseFinance && (
              <button className="btn btn-outline btn-sm" disabled={actionLoading}
                onClick={() => reverseHierarchyApproval(
                  'mgr_approved',
                  ['fin_approved_by','fin_approved_at'],
                  'Finance approval reversed'
                )}>Reverse Finance</button>
            )}
            {canReverseCFO && (
              <button className="btn btn-outline btn-sm" disabled={actionLoading}
                onClick={() => reverseHierarchyApproval(
                  'fin_approved',
                  ['cfo_approved_by','cfo_approved_at'],
                  'CFO approval reversed'
                )}>Reverse CFO</button>
            )}
          </div>
        )}
      </div>

      {showCameraModal && (
        <div style={{ position:'fixed',inset:0,zIndex:3000,background:'rgba(10,10,20,0.75)',
          display:'flex',alignItems:'center',justifyContent:'center',padding:'20px' }}>
          <div style={{ background:'#fff',borderRadius:'12px',width:'100%',maxWidth:'620px',
            boxShadow:'0 24px 64px rgba(0,0,0,0.4)',overflow:'hidden' }}>
            <div style={{ background:'var(--ink)',padding:'14px 18px',display:'flex',
              alignItems:'center',justifyContent:'space-between',gap:'10px' }}>
              <h3 style={{ color:'#fff',fontSize:'15px',fontWeight:600 }}>Capture Document Photo</h3>
              <button className="btn btn-outline btn-sm" onClick={closeCameraCapture}>Close</button>
            </div>
            <div style={{ padding:'18px' }}>
              {cameraError && <div className="alert alert-error">{cameraError}</div>}
              <div style={{ background:'#111',borderRadius:'8px',overflow:'hidden',
                minHeight:'260px',display:'flex',alignItems:'center',justifyContent:'center' }}>
                <video ref={cameraVideoRef} autoPlay playsInline muted
                  style={{ width:'100%',maxHeight:'420px',objectFit:'contain',display:cameraStream ? 'block' : 'none' }} />
                {!cameraStream && !cameraError && (
                  <div style={{ color:'#fff',fontSize:'13px',padding:'40px' }}>Starting camera...</div>
                )}
              </div>
              <canvas ref={cameraCanvasRef} style={{ display:'none' }} />
              <div style={{ display:'flex',gap:'10px',justifyContent:'flex-end',marginTop:'14px' }}>
                <button className="btn btn-outline" onClick={closeCameraCapture}>Cancel</button>
                <button className="btn btn-primary" disabled={!cameraStream || uploadingFinanceAtt}
                  onClick={captureCameraPhoto}>
                  Capture & Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
              {app.attachment_path && (
                <div className="form-group">
                  <div className="form-label">📎 Attachment</div>
                  <DetailAttachmentLink path={app.attachment_path} name={app.attachment_name} />
                </div>
              )}
              {(canAddFinanceAttachment || additionalAttachments.length > 0) && (
                <div className="form-group">
                  <div className="form-label">Finance Documents</div>
                  {additionalAttachments.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'8px', marginBottom: canAddFinanceAttachment ? '12px' : 0 }}>
                      {additionalAttachments.map((att, index) => (
                        <div key={`${att.path}-${index}`} style={{
                          display:'flex', alignItems:'center', justifyContent:'space-between',
                          gap:'10px', padding:'8px 10px', border:'1px solid var(--border-2)',
                          borderRadius:'var(--radius-sm)', background:'var(--cream)',
                        }}>
                          <div style={{ minWidth:0 }}>
                            <div style={{ fontSize:'12px', fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                              {att.name}{att.size ? ` (${formatFileSize(att.size)})` : ''}
                            </div>
                            <div style={{ fontSize:'11px', color:'var(--ink-3)' }}>
                              {att.actor} · {fmtDate(att.created_at)}
                            </div>
                          </div>
                          <div style={{ display:'flex', gap:'6px', flexShrink:0 }}>
                            <DetailAttachmentLink path={att.path} name={att.name} />
                            {canAddFinanceAttachment && (
                              <button className="btn btn-danger btn-sm" disabled={actionLoading}
                                onClick={() => deleteFinanceAttachment(att)}>
                                Delete
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {canAddFinanceAttachment && (
                    <div style={{ display:'flex', gap:'8px', alignItems:'flex-start', flexWrap:'wrap' }}>
                      <input ref={financeFileRef} type="file" accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleFinanceAttachmentFile} style={{ display:'none' }} />
                      <button className="btn btn-outline btn-sm" type="button" title="Choose document"
                        disabled={uploadingFinanceAtt}
                        onClick={() => financeFileRef.current?.click()}>
                        📎
                      </button>
                      <button className="btn btn-outline btn-sm" type="button" title="Capture document photo"
                        disabled={uploadingFinanceAtt}
                        onClick={openCameraCapture}>
                        📷
                      </button>
                      <button className="btn btn-outline btn-sm" type="button" title="Save screenshot from clipboard"
                        disabled={uploadingFinanceAtt || !hasClipboardImage}
                        onClick={pasteFinanceScreenshot}>
                        ▣
                      </button>
                      <button className="btn btn-primary btn-sm" title="Upload selected document"
                        disabled={!financeAttachment || uploadingFinanceAtt}
                        onClick={() => uploadFinanceAttachment()}>
                        {uploadingFinanceAtt ? '…' : '↑'}
                      </button>
                      {financeAttLabel && <p className="form-hint" style={{color:'var(--status-approved)',width:'100%'}}>✓ {financeAttLabel}</p>}
                      {financeAttError && <p className="form-error" style={{width:'100%'}}>{financeAttError}</p>}
                      <p className="form-hint" style={{width:'100%'}}>Icons: attach file, camera photo, clipboard screenshot, then upload selected file. Camera and screenshot save immediately.</p>
                    </div>
                  )}
                </div>
              )}
              {canAddFinancePostApprovalComment && (
                <div className="form-group">
                  <div className="form-label">Comments</div>
                  {roleComments.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'8px' }}>
                      {roleComments.map(c => {
                        const roleColor = getRoleColor(c.actorRole)
                        return (
                          <div key={c.id} style={{
                            background:roleColor.bg, border:`1px solid ${roleColor.border}`,
                            borderRadius:'var(--radius-sm)', padding:'8px 10px',
                          }}>
                            <div style={{ fontSize:'11px', color:roleColor.text, marginBottom:'3px', fontWeight:600 }}>
                              {roleColor.label} · {c.actor} · {fmtDate(c.created_at)}
                            </div>
                            <div style={{ fontSize:'12px', whiteSpace:'pre-wrap' }}>
                              {c.note.startsWith('Comment: ') ? c.note.slice(9) : c.note}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <textarea className="form-control" rows={3}
                    placeholder="Type a comment... it is remembered and saved when you leave this field."
                    value={financeComment}
                    onChange={e => setFinanceComment(e.target.value)}
                    onBlur={addFinanceComment}
                  />
                  <p className="form-hint">
                    Saved locally while typing. Leave the field to save. Clear the box and leave it to remove your comment.
                    {financeCommentStatus && ` ${financeCommentStatus}`}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick actions moved to top header bar */}

          {/* Batch panel — shown when app belongs to a batch */}
          {app.batch_number && (
            <div className="card" style={{ marginBottom:'20px', border:'1px solid #bfdbfe' }}>
              <div className="card-header" style={{ background:'#eff6ff' }}>
                <h2 style={{ color:'#1e40af', display:'flex', alignItems:'center', gap:'8px' }}>
                  <span>⧉</span> Payment Batch
                </h2>
                <span style={{
                  fontFamily:"'JetBrains Mono',monospace", fontSize:'13px',
                  fontWeight:700, color:'#1d4ed8',
                }}>{app.batch_number}</span>
              </div>
              <div className="card-body">
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'16px', marginBottom:'16px' }}>
                  <div>
                    <div className="form-label">Transfer Reference</div>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>
                      {app.batch_transfer_ref}
                    </div>
                  </div>
                  <div>
                    <div className="form-label">Transfer Date</div>
                    <div style={{ fontWeight:500 }}>
                      {app.batch_transfer_date ? fmtDate(app.batch_transfer_date) : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="form-label">Batch Total</div>
                    <div style={{ fontWeight:700, fontSize:'15px', color:'var(--ink)' }}>
                      AED {formatCurrency(app.batch_total_amount)}
                      <span style={{ fontSize:'11px', fontWeight:400, color:'var(--ink-3)', marginLeft:'6px' }}>
                        ({app.batch_app_count} applications)
                      </span>
                    </div>
                  </div>
                </div>
                {app.batch_note && (
                  <div style={{ fontSize:'12px', color:'var(--ink-2)', fontStyle:'italic', marginBottom:'12px' }}>
                    Note: {app.batch_note}
                  </div>
                )}
                <div style={{ fontSize:'12px', color:'var(--ink-3)' }}>
                  This application was processed as part of a grouped bank transfer.
                  Use the batch reference <strong>{app.batch_transfer_ref}</strong> for bank reconciliation.
                </div>
              </div>
            </div>
          )}

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
