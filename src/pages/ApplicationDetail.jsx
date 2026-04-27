import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useReactToPrint } from 'react-to-print'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import StatusBadge from '../components/StatusBadge'
import { formatCurrency } from '../lib/utils'

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
                {e.action.charAt(0).toUpperCase() + e.action.slice(1).replace('_', ' ')}
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

function PrintView({ app }) {
  const date = fmtDate(app.submitted_at || app.created_at)
  const lCell = {
    background: '#f5f0e8', padding: '10px 14px', border: '1px solid #c8b99a',
    fontSize: '15px', fontWeight: 700, verticalAlign: 'top', textAlign: 'center',
    width: '140px', fontFamily: "'Noto Serif SC',serif",
  }
  const vCell = {
    padding: '10px 14px', border: '1px solid #c8b99a',
    fontSize: '16px', verticalAlign: 'top', textAlign: 'center', wordBreak: 'break-word',
  }
  return (
    <div style={{ padding: '32px 40px', fontFamily: "'Cormorant Garamond',serif", maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
        {app.logo_url
          ? <img src={app.logo_url} alt="logo" style={{ height: '52px', objectFit: 'contain' }} />
          : <div style={{ width: '52px' }} />
        }
        <div style={{ textAlign: 'center', flex: 1 }}>
          <div style={{ fontFamily: "'Noto Serif SC',serif", fontSize: '29px', fontWeight: 700, letterSpacing: '.2em' }}>付款申请单</div>
          <div style={{ fontSize: '15px', letterSpacing: '.35em', marginTop: '4px', color: '#333', fontWeight: 600 }}>PAYMENT APPLICATION</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', color: '#666', minWidth: '120px' }}>
          <div>DATE: {date}</div>
          <div style={{ marginTop: '4px', fontFamily: 'monospace', fontSize: '11px' }}>{app.ref_number}</div>
        </div>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', border: '1.5px solid #8b6914' }}>
        <tbody>
          <tr>
            <td style={lCell}>申请部门<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Company</span></td>
            <td style={vCell}>{toProperCase(app.company_name)}</td>
            <td style={lCell}>申请人<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Applicant</span></td>
            <td style={vCell}>{toProperCase(app.submitted_by_name)}</td>
          </tr>
          <tr>
            <td style={lCell}>付款事由<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Payment Reason</span></td>
            <td style={vCell} colSpan={3}>{toProperCase(app.payment_reason)}</td>
          </tr>
          <tr>
            <td style={lCell}>付款方式<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Payment Method</span></td>
            <td style={vCell} colSpan={3}>{toProperCase(app.payment_method_name) || '—'}</td>
          </tr>
          <tr>
            <td style={lCell}>付款金额<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Amount</span></td>
            <td style={{ ...vCell, fontWeight: 700, fontSize: '18px' }} colSpan={3}>AED {formatCurrency(app.amount)}</td>
          </tr>
          <tr>
            <td style={lCell}>大写金额<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>In Words</span></td>
            <td style={vCell} colSpan={3}>{toProperCase(app.amount_words)}</td>
          </tr>
          <tr>
            <td style={lCell}>收款单位<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Receiving Co.</span></td>
            <td style={vCell} colSpan={3}>{toProperCase(app.payee_name) || '—'}</td>
          </tr>
          <tr>
            <td style={lCell}>开户银行<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Bank</span></td>
            <td style={vCell} colSpan={3}>{toProperCase(app.bank_name) || '—'}</td>
          </tr>
          <tr>
            <td style={lCell}>银行账号<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Account/IBAN</span></td>
            <td style={{ ...vCell, fontFamily: 'monospace', fontSize: '14px' }} colSpan={3}>{app.bank_account || '—'}</td>
          </tr>
          <tr>
            <td style={lCell}>备注说明<br /><span style={{ fontSize: '12px', fontWeight: 400 }}>Remarks</span></td>
            <td style={{ ...vCell, minHeight: '60px', whiteSpace: 'pre-wrap' }} colSpan={3}>{app.remarks || '—'}</td>
          </tr>
          <tr>
            <td colSpan={4} style={{ border: '1px solid #c8b99a', padding: '0' }}>
              <div style={{ display: 'flex' }}>
                {[
                  ['部门主管审批签字', 'Department Head'],
                  ['财务部审批签字', 'Finance Officer'],
                  ['总经理审批签字', 'General Manager'],
                ].map(([cn, en], i) => (
                  <div key={i} style={{ flex: 1, borderRight: i < 2 ? '1px solid #c8b99a' : 'none', padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', fontFamily: "'Noto Serif SC',serif", fontWeight: 600, marginBottom: '2px' }}>{cn}</div>
                    <div style={{ fontSize: '12px', color: '#555', marginBottom: '8px' }}>{en}</div>
                    <div style={{ height: '44px', borderBottom: '1px solid #999', margin: '0 16px' }} />
                    <div style={{ fontSize: '12px', color: '#555', marginTop: '6px' }}>DATE: {date}</div>
                  </div>
                ))}
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div style={{ marginTop: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: '14px', fontWeight: 700, letterSpacing: '.12em',
          color: app.status === 'approved' ? '#7f1d1d'
               : app.status === 'rejected' ? '#7f1d1d'
               : app.status === 'pending'  ? '#92400e'
               : '#374151',
          background: app.status === 'approved' ? '#fee2e2'
                    : app.status === 'rejected' ? '#fee2e2'
                    : app.status === 'pending'  ? '#fef3c7'
                    : '#f3f4f6',
          padding: '4px 14px', borderRadius: '4px',
          border: '1.5px solid currentColor',
        }}>
          ◆ {app.status?.toUpperCase()}
        </span>
        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
          Generated: {fmtDate(new Date().toISOString())}
        </span>
      </div>
    </div>
  )
}

export default function ApplicationDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, profile, isFinanceOrAbove, isSuperAdmin } = useAuth()
  const printRef = useRef()

  const [app, setApp] = useState(null)
  const [auditLog, setAuditLog] = useState([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [note, setNote] = useState('')
  const [showEscalate, setShowEscalate] = useState(false)
  const [escalateTo, setEscalateTo] = useState('')
  const [managers, setManagers] = useState([])
  const [attachmentUrl, setAttachmentUrl] = useState(null)
  const [showRevert,   setShowRevert]   = useState(false)
  const [showDelete,   setShowDelete]   = useState(false)
  const [deleteReason, setDeleteReason] = useState('')
  const [actionNote2,  setActionNote2]  = useState('')

  const handlePrint = useReactToPrint({ content: () => printRef.current })

  useEffect(() => { load() }, [id])

  async function load() {
    setLoading(true)
    const [{ data: appData }, { data: logData }, { data: mgrs }] = await Promise.all([
      supabase.from('applications_full').select('*').eq('id', id).single(),
      supabase.from('audit_log')
        .select('id, action, note, created_at, users!action_by(full_name)')
        .eq('application_id', id).order('created_at'),
      supabase.from('users').select('id,full_name,role').in('role', ['ceo', 'cfo']),
    ])

    let logoUrl = null
    if (appData?.company_id) {
      const { data: co } = await supabase.from('companies').select('logo_url').eq('id', appData.company_id).single()
      logoUrl = co?.logo_url || null
    }

    setApp(appData ? { ...appData, logo_url: logoUrl } : null)
    setAuditLog((logData || []).map(l => ({ ...l, actor: l.users?.full_name || 'System' })))
    setManagers(mgrs || [])

    if (appData?.attachment_path) {
      const { data: signed } = await supabase.storage
        .from('attachments')
        .createSignedUrl(appData.attachment_path, 3600)
      setAttachmentUrl(signed?.signedUrl || null)
    }
    setLoading(false)
  }

  async function doAction(action, extra = {}) {
    setActionLoading(true)
    try {
      const statusMap = { approve: 'approved', reject: 'rejected', return: 'returned', escalate: 'escalated' }
      await supabase.from('applications').update({
        status: statusMap[action],
        outcome_note: ['reject', 'return'].includes(action) ? note : null,
        processed_at: new Date().toISOString(),
        ...extra,
      }).eq('id', id)
      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id,
        action: statusMap[action] || action,
        note: note || null,
      })
      setNote(''); setShowEscalate(false)
      await load()
    } finally { setActionLoading(false) }
  }

  async function revertToPending() {
    setActionLoading(true)
    try {
      await supabase.from('applications').update({
        status: 'pending',
        outcome_note: null,
        processed_at: null,
      }).eq('id', id)
      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id,
        action: 'reverted',
        note: actionNote2 || 'Reverted to Pending by Finance Officer',
      })
      setShowRevert(false)
      setActionNote2('')
      await load()
    } finally { setActionLoading(false) }
  }

  async function softDelete() {
    if (!deleteReason.trim()) return alert('A reason is required to delete an application.')
    setActionLoading(true)
    try {
      // Snapshot key fields into deleted_applications_log first
      await supabase.from('deleted_applications_log').insert({
        application_id:  id,
        ref_number:      app.ref_number,
        company_name:    app.company_name,
        submitted_by:    app.submitted_by_name,
        amount:          app.amount,
        payment_reason:  app.payment_reason,
        status_at_delete: app.status,
        deleted_by:      profile.full_name,
        delete_reason:   deleteReason,
      })
      // Soft delete — marks row, hides from all views
      await supabase.from('applications').update({
        deleted_at:    new Date().toISOString(),
        deleted_by:    user.id,
        delete_reason: deleteReason,
      }).eq('id', id)
      // Final audit entry
      await supabase.from('audit_log').insert({
        application_id: id, action_by: user.id,
        action: 'deleted',
        note: `Deleted by ${profile.full_name}. Reason: ${deleteReason}`,
      })
      setShowDelete(false)
      setDeleteReason('')
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
      `Reference: ${app.ref_number}`,
      `Company: ${app.company_name}`,
      `Applicant: ${app.submitted_by_name}`,
      `Payment Reason: ${app.payment_reason}`,
      `Amount: AED ${formatCurrency(app.amount)}`,
      `Payment Method: ${app.payment_method_name || '—'}`,
      `Receiving Company: ${app.payee_name || '—'}`,
      `Bank: ${app.bank_name || '—'}`,
      `Account/IBAN: ${app.bank_account || '—'}`,
      `Status: ${app.status?.toUpperCase()}`,
      `Date: ${fmtDate(app.submitted_at || app.created_at)}`,
      ``,
      `View application: ${window.location.href}`,
    ].join('\n')
    window.open(`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`)
  }

  if (loading) return <div className="empty-state"><p>Loading…</p></div>
  if (!app) return <div className="empty-state"><h3>Application not found</h3></div>

  const canAct = isFinanceOrAbove && ['pending', 'escalated'].includes(app.status)
  const isOwner = app.submitted_by === user?.id
  const canEdit = isOwner && ['draft', 'returned'].includes(app.status)
  const isMgr = ['ceo', 'cfo'].includes(profile?.role)

  return (
    <div>
      <div style={{ display: 'none' }}>
        <div ref={printRef}><PrintView app={app} /></div>
      </div>

      <div className="page-header flex justify-between items-center no-print">
        <div>
          <button className="btn btn-outline btn-sm" style={{ marginBottom: '8px' }} onClick={() => navigate(-1)}>← Back</button>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {app.ref_number || 'Application'}
            <StatusBadge status={app.status} />
          </h1>
          <p>{toProperCase(app.submitted_by_name)} · {app.company_name} · {fmtDate(app.submitted_at || app.created_at)}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button className="btn btn-outline" onClick={shareWhatsApp}>💬 WhatsApp</button>
          <button className="btn btn-outline" onClick={shareEmail}>✉ Email</button>
          <button className="btn btn-gold" onClick={handlePrint}>⎙ Download PDF</button>
          {canEdit && <button className="btn btn-primary" onClick={() => navigate(`/new-application?edit=${id}`)}>✎ Edit</button>}
          {isSuperAdmin && !app.deleted_at && (
            <button className="btn btn-danger" onClick={() => setShowDelete(true)}>🗑 Delete</button>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDelete && (
        <div style={{
          position:'fixed', inset:0, zIndex:3000,
          background:'rgba(10,10,20,0.75)',
          display:'flex', alignItems:'center', justifyContent:'center', padding:'20px'
        }}>
          <div style={{
            background:'#fff', borderRadius:'12px', width:'100%', maxWidth:'480px',
            boxShadow:'0 24px 64px rgba(0,0,0,0.4)', overflow:'hidden'
          }}>
            <div style={{background:'#dc2626', padding:'16px 20px', display:'flex', alignItems:'center', gap:'10px'}}>
              <span style={{fontSize:'20px'}}>🗑</span>
              <h3 style={{color:'#fff', fontSize:'16px', fontWeight:600}}>Delete Application</h3>
            </div>
            <div style={{padding:'24px'}}>
              <div className="alert alert-error" style={{marginBottom:'16px'}}>
                <strong>This cannot be undone.</strong> The application will be hidden from all users.
                A permanent record will be kept in the deleted applications log.
              </div>
              <div style={{background:'#f9fafb', borderRadius:'8px', padding:'12px', marginBottom:'16px', fontSize:'13px'}}>
                <div><strong>Ref:</strong> {app.ref_number}</div>
                <div><strong>Amount:</strong> AED {formatCurrency(app.amount)}</div>
                <div><strong>Submitted by:</strong> {app.submitted_by_name}</div>
                <div><strong>Status:</strong> {app.status?.toUpperCase()}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Reason for deletion <span style={{color:'#dc2626'}}>*</span></label>
                <textarea className="form-control" rows={3}
                  placeholder="Required: explain why this application is being deleted…"
                  value={deleteReason} onChange={e => setDeleteReason(e.target.value)} />
              </div>
              <div style={{display:'flex', gap:'10px', justifyContent:'flex-end', marginTop:'8px'}}>
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
                <div><div className="form-label">Company</div><div style={{ fontWeight: 500 }}>{app.company_name}</div></div>
                <div><div className="form-label">Applicant</div><div>{toProperCase(app.submitted_by_name)}</div></div>
              </div>
              <hr className="divider" />
              <div className="form-group">
                <div className="form-label">Payment Reason</div>
                <div>{toProperCase(app.payment_reason)}</div>
              </div>
              <div className="form-row">
                <div><div className="form-label">Payment Method</div><div>{toProperCase(app.payment_method_name) || '—'}</div></div>
                <div><div className="form-label">Amount</div><div style={{ fontWeight: 600, fontSize: '17px' }}>AED {formatCurrency(app.amount)}</div></div>
              </div>
              <div className="form-group">
                <div className="form-label">Amount in Words</div>
                <div className="text-muted">{app.amount_words}</div>
              </div>
              <hr className="divider" />
              <div className="form-row">
                <div><div className="form-label">Receiving Company</div><div>{toProperCase(app.payee_name) || '—'}</div></div>
                <div><div className="form-label">Bank</div><div>{toProperCase(app.bank_name) || '—'}</div></div>
              </div>
              <div className="form-group">
                <div className="form-label">Account / IBAN</div>
                <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: '13px' }}>{app.bank_account || '—'}</div>
              </div>
              {app.remarks && (
                <div className="form-group">
                  <div className="form-label">Remarks</div>
                  <div style={{ whiteSpace: 'pre-line' }}>{app.remarks}</div>
                </div>
              )}
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

          {canAct && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header"><h2>Review Application</h2></div>
              <div className="card-body">
                <div className="form-group">
                  <label className="form-label">Note (shown to applicant on reject/return)</label>
                  <textarea className="form-control" placeholder="Optional note…"
                    value={note} onChange={e => setNote(e.target.value)} />
                </div>
                {!showEscalate ? (
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button className="btn btn-success" disabled={actionLoading} onClick={() => doAction('approve')}>✓ Approve</button>
                    <button className="btn btn-warning" disabled={actionLoading}
                      onClick={() => { if (!note.trim()) return alert('Add a note explaining what to correct'); doAction('return') }}>
                      ↩ Return for Edit
                    </button>
                    <button className="btn btn-danger" disabled={actionLoading}
                      onClick={() => { if (!note.trim()) return alert('Add a rejection reason'); doAction('reject') }}>
                      ✕ Reject
                    </button>
                    <button className="btn btn-outline" disabled={actionLoading} onClick={() => setShowEscalate(true)}>↑ Escalate</button>
                  </div>
                ) : (
                  <div>
                    <div className="form-group">
                      <label className="form-label">Escalate to</label>
                      <select className="form-control" value={escalateTo} onChange={e => setEscalateTo(e.target.value)}>
                        <option value="">Select CEO / CFO…</option>
                        {managers.map(m => <option key={m.id} value={m.id}>{m.full_name} ({m.role.toUpperCase()})</option>)}
                      </select>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn btn-warning" disabled={actionLoading || !escalateTo}
                        onClick={() => doAction('escalate', { escalated_to: escalateTo })}>↑ Send for Approval</button>
                      <button className="btn btn-outline" onClick={() => setShowEscalate(false)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Revert approved/rejected back to pending */}
          {isFinanceOrAbove && ['approved','rejected'].includes(app.status) && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header">
                <h2>⚠ Revert Decision</h2>
                <span className="text-sm text-muted">Finance Officer only</span>
              </div>
              <div className="card-body">
                <div className="alert alert-warning" style={{ marginBottom: '14px' }}>
                  This will revert the application back to <strong>Pending</strong> for re-review. The action is logged permanently.
                </div>
                {!showRevert ? (
                  <button className="btn btn-warning" onClick={() => setShowRevert(true)}>
                    ↺ Revert to Pending
                  </button>
                ) : (
                  <div>
                    <div className="form-group">
                      <label className="form-label">Reason for reverting <span style={{color:'#dc2626'}}>*</span></label>
                      <textarea className="form-control" placeholder="Explain why this is being reverted…"
                        value={actionNote2} onChange={e => setActionNote2(e.target.value)} />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <button className="btn btn-warning" disabled={actionLoading || !actionNote2.trim()}
                        onClick={revertToPending}>
                        {actionLoading ? 'Reverting…' : '↺ Confirm Revert'}
                      </button>
                      <button className="btn btn-outline" onClick={() => { setShowRevert(false); setActionNote2('') }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {isMgr && app.status === 'escalated' && app.escalated_to === user?.id && (
            <div className="card" style={{ marginBottom: '20px' }}>
              <div className="card-header"><h2>Management Approval</h2></div>
              <div className="card-body">
                <div className="alert alert-warning">This application has been escalated to you for final approval.</div>
                <div className="form-group mt-3">
                  <label className="form-label">Decision note</label>
                  <textarea className="form-control" placeholder="Add a note…" value={note} onChange={e => setNote(e.target.value)} />
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-success" disabled={actionLoading} onClick={() => doAction('approve')}>✓ Approve</button>
                  <button className="btn btn-danger" disabled={actionLoading}
                    onClick={() => { if (!note.trim()) return alert('Add a reason'); doAction('reject') }}>✕ Reject</button>
                </div>
              </div>
            </div>
          )}

          {!isFinanceOrAbove && app.outcome_note && (
            <div className={`alert ${app.status === 'approved' ? 'alert-success' : app.status === 'returned' ? 'alert-warning' : 'alert-error'}`}>
              <strong>{app.status === 'returned' ? 'Please correct and resubmit:' : app.status === 'rejected' ? 'Rejection reason:' : 'Note:'}</strong>
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
