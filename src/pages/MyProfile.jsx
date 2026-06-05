import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const SIG_LOCAL_KEY = (userId) => `sig_${userId}`

export default function MyProfile() {
  const { user, profile } = useAuth()

  // Signature states
  // Password change
  const [curPw,    setCurPw]    = useState('')
  const [newPw,    setNewPw]    = useState('')
  const [confPw,   setConfPw]   = useState('')
  const [showPw,   setShowPw]   = useState(false)
  const [pwLoading,setPwLoading]= useState(false)
  const [pwMsg,    setPwMsg]    = useState({ type:'', text:'' })

  const [localSig,   setLocalSig]   = useState(null)   // base64 from localStorage
  const [cloudSig,   setCloudSig]   = useState(null)   // signed URL from Supabase
  const [uploading,  setUploading]  = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [msg,        setMsg]        = useState({ type:'', text:'' })
  const [preview,    setPreview]    = useState(null)    // currently selected file preview
  const fileRef = useRef()

  const canSign = ['manager','finance','cfo','ceo','superadmin'].includes(profile?.role)

  useEffect(() => {
    if (!user) return
    // Load from localStorage
    const stored = localStorage.getItem(SIG_LOCAL_KEY(user.id))
    if (stored) setLocalSig(stored)
    // Load from Supabase
    loadCloudSig()
  }, [user])

  async function loadCloudSig() {
    if (!user) return
    const path = `${user.id}/signature.png`
    const { data, error } = await supabase.storage
      .from('signatures')
      .createSignedUrl(path, 3600)
    if (!error && data?.signedUrl) setCloudSig(data.signedUrl)
    else setCloudSig(null)
  }

  function flash(type, text) {
    setMsg({ type, text })
    setTimeout(() => setMsg({ type:'', text:'' }), 3500)
  }

  function handleFileSelect(e) {
    const file = e.target.files[0]
    if (!file) return
    if (file.size > 200 * 1024) {
      flash('error', 'Signature image must be under 200KB')
      e.target.value = ''; return
    }
    if (!['image/png','image/jpeg','image/webp'].includes(file.type)) {
      flash('error', 'Use PNG, JPG or WebP')
      e.target.value = ''; return
    }
    const reader = new FileReader()
    reader.onload = ev => setPreview(ev.target.result)
    reader.readAsDataURL(file)
  }

  function saveToDevice() {
    if (!preview) return
    localStorage.setItem(SIG_LOCAL_KEY(user.id), preview)
    setLocalSig(preview)
    setPreview(null)
    if (fileRef.current) fileRef.current.value = ''
    flash('success', '✓ Signature saved to this device')
  }

  async function uploadToCloud() {
    if (!preview) return
    setUploading(true)
    try {
      // Convert base64 to blob
      const res  = await fetch(preview)
      const blob = await res.blob()
      const path = `${user.id}/signature.png`
      const { error } = await supabase.storage
        .from('signatures')
        .upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (error) throw error
      await loadCloudSig()
      // Also save to device
      localStorage.setItem(SIG_LOCAL_KEY(user.id), preview)
      setLocalSig(preview)
      setPreview(null)
      if (fileRef.current) fileRef.current.value = ''
      flash('success', '✓ Signature saved to cloud and this device')
    } catch (err) {
      flash('error', err.message || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function clearDevice() {
    if (!confirm('Remove signature from this device?')) return
    localStorage.removeItem(SIG_LOCAL_KEY(user.id))
    setLocalSig(null)
    flash('success', 'Signature removed from this device')
  }

  async function clearCloud() {
    if (!confirm('Delete signature from cloud? It will no longer be available on other devices.')) return
    setDeleting(true)
    try {
      await supabase.storage.from('signatures').remove([`${user.id}/signature.png`])
      setCloudSig(null)
      flash('success', 'Signature deleted from cloud')
    } catch (err) {
      flash('error', err.message)
    } finally {
      setDeleting(false)
    }
  }

  async function changePassword(e) {
    e.preventDefault()
    if (newPw.length < 8) return setPwMsg({ type:'error', text:'Password must be at least 8 characters' })
    if (newPw !== confPw)  return setPwMsg({ type:'error', text:'Passwords do not match' })
    setPwLoading(true)
    setPwMsg({ type:'', text:'' })
    // Verify current password by re-signing in
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email, password: curPw
    })
    if (signInErr) {
      setPwLoading(false)
      return setPwMsg({ type:'error', text:'Current password is incorrect' })
    }
    const { error } = await supabase.auth.updateUser({ password: newPw })
    setPwLoading(false)
    if (error) setPwMsg({ type:'error', text: error.message })
    else {
      setPwMsg({ type:'success', text:'✓ Password changed successfully' })
      setCurPw(''); setNewPw(''); setConfPw('')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>My Profile</h1>
        <p>{profile?.full_name} · {profile?.email} · <strong>{profile?.role}</strong></p>
      </div>

      {msg.text && (
        <div className={`alert alert-${msg.type}`} style={{marginBottom:'20px'}}>{msg.text}</div>
      )}

      {/* Signature section */}
      {canSign ? (
        <div className="card">
          <div className="card-header">
            <h2>✍ My Signature</h2>
            <span className="text-sm text-muted">Used on approved PDF documents</span>
          </div>
          <div className="card-body">

            {/* Tips */}
            <div className="alert alert-info" style={{marginBottom:'20px',fontSize:'12px',lineHeight:'1.7'}}>
              <strong>Tips for best results:</strong><br/>
              · PNG with transparent background recommended<br/>
              · Sign on white paper, photograph or scan, crop tightly<br/>
              · Max 200KB · PNG / JPG / WebP accepted<br/>
              · Your signature is <strong>never visible to other users</strong> — only you can access it
            </div>

            {/* Current signatures */}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'16px',marginBottom:'24px'}}>
              {/* Device */}
              <div style={{background:'var(--cream-2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:600,color:'var(--ink-3)',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'.06em'}}>
                  💻 On This Device
                </div>
                {localSig ? (
                  <div>
                    <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:'6px',
                      padding:'12px',marginBottom:'10px',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'80px'}}>
                      <img src={localSig} alt="signature" style={{maxHeight:'70px',maxWidth:'100%',objectFit:'contain'}} />
                    </div>
                    <div style={{fontSize:'11px',color:'var(--status-approved)',marginBottom:'8px'}}>✓ Signature stored on this device</div>
                    <button className="btn btn-danger btn-sm" onClick={clearDevice}>Remove from device</button>
                  </div>
                ) : (
                  <div style={{color:'var(--ink-3)',fontSize:'12px',padding:'12px 0'}}>
                    No signature stored on this device
                  </div>
                )}
              </div>

              {/* Cloud */}
              <div style={{background:'var(--cream-2)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:'16px'}}>
                <div style={{fontSize:'12px',fontWeight:600,color:'var(--ink-3)',marginBottom:'10px',textTransform:'uppercase',letterSpacing:'.06em'}}>
                  ☁ Cloud (Any Device)
                </div>
                {cloudSig ? (
                  <div>
                    <div style={{background:'#fff',border:'1px solid var(--border)',borderRadius:'6px',
                      padding:'12px',marginBottom:'10px',display:'flex',alignItems:'center',justifyContent:'center',minHeight:'80px'}}>
                      <img src={cloudSig} alt="signature" style={{maxHeight:'70px',maxWidth:'100%',objectFit:'contain'}} />
                    </div>
                    <div style={{fontSize:'11px',color:'var(--status-approved)',marginBottom:'8px'}}>✓ Available on all your devices</div>
                    <button className="btn btn-danger btn-sm" disabled={deleting} onClick={clearCloud}>
                      {deleting ? 'Deleting…' : 'Delete from cloud'}
                    </button>
                  </div>
                ) : (
                  <div style={{color:'var(--ink-3)',fontSize:'12px',padding:'12px 0'}}>
                    No signature in cloud — only available on devices where you saved it locally
                  </div>
                )}
              </div>
            </div>

            <hr className="divider" />

            {/* Upload new */}
            <div>
              <div style={{fontSize:'13px',fontWeight:600,marginBottom:'12px'}}>
                Upload / Replace Signature
              </div>
              <input type="file" ref={fileRef} className="form-control"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileSelect}
                style={{padding:'7px',marginBottom:'12px'}} />

              {preview && (
                <div style={{marginBottom:'16px'}}>
                  <div style={{fontSize:'12px',fontWeight:500,color:'var(--ink-2)',marginBottom:'8px'}}>Preview:</div>
                  <div style={{background:'#fff',border:'2px solid var(--gold)',borderRadius:'8px',
                    padding:'16px',display:'inline-flex',alignItems:'center',justifyContent:'center',minHeight:'80px'}}>
                    <img src={preview} alt="preview" style={{maxHeight:'70px',maxWidth:'300px',objectFit:'contain'}} />
                  </div>
                  <div style={{display:'flex',gap:'10px',marginTop:'12px',flexWrap:'wrap'}}>
                    <button className="btn btn-outline" onClick={saveToDevice}>
                      💻 Save to This Device Only
                    </button>
                    <button className="btn btn-primary" disabled={uploading} onClick={uploadToCloud}>
                      {uploading ? 'Uploading…' : '☁ Save to Cloud + This Device'}
                    </button>
                    <button className="btn btn-outline" onClick={() => {
                      setPreview(null)
                      if (fileRef.current) fileRef.current.value = ''
                    }}>Cancel</button>
                  </div>
                  <p style={{fontSize:'11px',color:'var(--ink-3)',marginTop:'8px'}}>
                    <strong>Device only</strong> — stays on this browser, fast, no server.<br/>
                    <strong>Cloud</strong> — available when you log in from any device or browser.
                  </p>
                </div>
              )}
            </div>

          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            <p className="text-muted">Signature management is available for Manager, Finance Officer, CFO, and CEO roles.</p>
          </div>
        </div>
      )}
      {/* Change Password */}
      <div className="card" style={{ marginTop:'20px' }}>
        <div className="card-header">
          <h2>🔒 Change Password</h2>
          <span className="text-sm text-muted">Your password is encrypted — no one can read it</span>
        </div>
        <div className="card-body">
          {pwMsg.text && (
            <div className={`alert alert-${pwMsg.type}`} style={{ marginBottom:'16px' }}>{pwMsg.text}</div>
          )}
          <form onSubmit={changePassword}>
            <div className="form-group">
              <label className="form-label">Current Password</label>
              <div style={{ position:'relative' }}>
                <input type={showPw ? 'text' : 'password'} className="form-control"
                  placeholder="Your current password"
                  value={curPw} onChange={e => setCurPw(e.target.value)} required
                  style={{ paddingRight:'40px' }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)',
                    background:'none', border:'none', cursor:'pointer', color:'var(--ink-3)', fontSize:'14px' }}>
                  {showPw ? '🙈' : '👁'}
                </button>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input type={showPw ? 'text' : 'password'} className="form-control"
                  placeholder="Min 8 characters"
                  value={newPw} onChange={e => setNewPw(e.target.value)} required />
              </div>
              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input type={showPw ? 'text' : 'password'} className="form-control"
                  placeholder="Re-enter new password"
                  value={confPw} onChange={e => setConfPw(e.target.value)} required />
              </div>
            </div>
            <div style={{ fontSize:'12px', color:'var(--ink-3)', marginBottom:'14px', lineHeight:'1.6' }}>
              🔐 Passwords are hashed with bcrypt. No one — including Super Admin — can view your password.
              Admin can only trigger a reset, never see the actual value.
            </div>
            <button type="submit" className="btn btn-primary" disabled={pwLoading}>
              {pwLoading ? 'Updating…' : 'Change Password'}
            </button>
          </form>
        </div>
      </div>

    </div>
  )
}
