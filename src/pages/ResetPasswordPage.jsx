import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [password,  setPassword]  = useState('')
  const [confirm,   setConfirm]   = useState('')
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [msg,       setMsg]       = useState({ type:'', text:'' })
  const [ready,     setReady]     = useState(false)

  useEffect(() => {
    // Supabase puts the session token in the URL hash on redirect
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true)
      else setMsg({ type:'error', text:'Invalid or expired reset link. Please request a new one.' })
    })
  }, [])

  async function handleReset(e) {
    e.preventDefault()
    if (password.length < 8) return setMsg({ type:'error', text:'Password must be at least 8 characters' })
    if (password !== confirm)  return setMsg({ type:'error', text:'Passwords do not match' })
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setMsg({ type:'error', text: error.message })
    } else {
      setMsg({ type:'success', text:'Password updated successfully! Redirecting to login…' })
      setTimeout(() => navigate('/login'), 2000)
    }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg, #1a1a2e 0%, #2d2d5e 100%)',
      padding:'20px',
    }}>
      <div style={{ width:'100%', maxWidth:'400px' }}>
        <div style={{ textAlign:'center', marginBottom:'28px' }}>
          <div style={{ fontFamily:"'Noto Serif SC',serif", fontSize:'22px', color:'#c9a84c', letterSpacing:'.2em' }}>
            付款申请单
          </div>
        </div>
        <div className="card" style={{ padding:'32px' }}>
          <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'6px' }}>Set New Password</h2>
          <p className="text-muted text-sm" style={{ marginBottom:'20px' }}>
            Choose a strong password for your account.
          </p>

          {msg.text && (
            <div className={`alert alert-${msg.type}`} style={{ marginBottom:'16px' }}>{msg.text}</div>
          )}

          {ready && msg.type !== 'success' && (
            <form onSubmit={handleReset}>
              <div className="form-group">
                <label className="form-label">New Password</label>
                <div style={{ position:'relative' }}>
                  <input
                    type={showPw ? 'text' : 'password'}
                    className="form-control"
                    placeholder="Min 8 characters"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required autoFocus
                    style={{ paddingRight:'40px' }}
                  />
                  <button type="button" onClick={() => setShowPw(v => !v)}
                    style={{ position:'absolute', right:'10px', top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', cursor:'pointer', color:'var(--ink-3)', fontSize:'14px' }}>
                    {showPw ? '🙈' : '👁'}
                  </button>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <input type={showPw ? 'text' : 'password'} className="form-control"
                  placeholder="Re-enter password"
                  value={confirm} onChange={e => setConfirm(e.target.value)} required />
              </div>
              <div style={{ fontSize:'12px', color:'var(--ink-3)', marginBottom:'16px', lineHeight:'1.6' }}>
                🔒 Your password is encrypted — no one including system administrators can read it.
              </div>
              <button type="submit" className="btn btn-primary w-full"
                style={{ justifyContent:'center', padding:'11px' }} disabled={loading}>
                {loading ? 'Updating…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
