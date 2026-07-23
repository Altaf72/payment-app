import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate   = useNavigate()
  const location   = useLocation()

  const [email,      setEmail]      = useState('')
  const [password,   setPassword]   = useState('')
  const [showPw,     setShowPw]     = useState(false)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [mode,       setMode]       = useState('login')  // 'login' | 'forgot'
  const [resetEmail, setResetEmail] = useState('')
  const [resetMsg,   setResetMsg]   = useState('')
  const [resetSent,  setResetSent]  = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      const requestedPath = location.state?.from
      const destination = typeof requestedPath === 'string' &&
        requestedPath.startsWith('/') && !requestedPath.startsWith('//')
        ? requestedPath
        : '/'
      navigate(destination, { replace:true })
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e) {
    e.preventDefault()
    if (!resetEmail.trim()) return setResetMsg('Please enter your email address')
    setResetLoading(true)
    setResetMsg('')
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setResetLoading(false)
    if (error) {
      setResetMsg(error.message || 'Could not send reset email')
    } else {
      setResetSent(true)
      setResetMsg(`Reset link sent to ${resetEmail}. Check your inbox.`)
    }
  }

  return (
    <div style={{
      minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center',
      background:'linear-gradient(135deg, #1a1a2e 0%, #2d2d5e 100%)',
      padding:'20px',
    }}>
      <div style={{ width:'100%', maxWidth:'400px' }}>

        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:'32px' }}>
          <div style={{ fontFamily:"'Noto Serif SC',serif", fontSize:'24px', color:'#c9a84c', letterSpacing:'.2em' }}>
            付款申请单
          </div>
          <div style={{ fontSize:'12px', color:'rgba(255,255,255,0.4)', letterSpacing:'.3em', marginTop:'6px' }}>
            PAYMENT APPLICATION SYSTEM
          </div>
        </div>

        <div className="card" style={{ padding:'32px' }}>

          {/* LOGIN */}
          {mode === 'login' && (
            <>
              <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'6px' }}>Sign in</h2>
              <p className="text-muted text-sm" style={{ marginBottom:'24px' }}>
                Enter your credentials to access the system
              </p>

              {error && <div className="alert alert-error">{error}</div>}

              <form onSubmit={handleLogin}>
                <div className="form-group">
                  <label className="form-label">Email address</label>
                  <input type="email" className="form-control"
                    placeholder="you@company.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    required autoFocus />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div style={{ position:'relative' }}>
                    <input
                      type={showPw ? 'text' : 'password'}
                      className="form-control"
                      placeholder="••••••••"
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      style={{ paddingRight:'40px' }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw(v => !v)}
                      style={{
                        position:'absolute', right:'10px', top:'50%',
                        transform:'translateY(-50%)',
                        background:'none', border:'none', cursor:'pointer',
                        color:'var(--ink-3)', fontSize:'14px', padding:'2px',
                      }}
                      title={showPw ? 'Hide password' : 'Show password'}
                    >
                      {showPw ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary w-full"
                  style={{ justifyContent:'center', padding:'11px' }}
                  disabled={loading}>
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>
              </form>

              <div style={{ textAlign:'center', marginTop:'16px' }}>
                <button
                  onClick={() => { setMode('forgot'); setError(''); setResetEmail(email) }}
                  style={{ background:'none', border:'none', cursor:'pointer',
                    fontSize:'13px', color:'var(--ink-3)', textDecoration:'underline' }}>
                  Forgot password?
                </button>
              </div>
            </>
          )}

          {/* FORGOT PASSWORD */}
          {mode === 'forgot' && (
            <>
              <h2 style={{ fontSize:'18px', fontWeight:600, marginBottom:'6px' }}>Reset Password</h2>
              <p className="text-muted text-sm" style={{ marginBottom:'20px' }}>
                Enter your email and we'll send you a reset link.
              </p>

              {resetMsg && (
                <div className={`alert ${resetSent ? 'alert-success' : 'alert-error'}`} style={{marginBottom:'16px'}}>
                  {resetMsg}
                </div>
              )}

              {!resetSent ? (
                <form onSubmit={handleForgot}>
                  <div className="form-group">
                    <label className="form-label">Email address</label>
                    <input type="email" className="form-control"
                      placeholder="you@company.com"
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      required autoFocus />
                  </div>
                  <button type="submit" className="btn btn-primary w-full"
                    style={{ justifyContent:'center', padding:'11px' }}
                    disabled={resetLoading}>
                    {resetLoading ? 'Sending…' : 'Send Reset Link'}
                  </button>
                </form>
              ) : (
                <div style={{ textAlign:'center', padding:'12px 0' }}>
                  <div style={{ fontSize:'32px', marginBottom:'8px' }}>📧</div>
                  <p style={{ fontSize:'13px', color:'var(--ink-2)' }}>
                    Check your inbox and click the link to set a new password.
                  </p>
                </div>
              )}

              <div style={{ textAlign:'center', marginTop:'16px' }}>
                <button
                  onClick={() => { setMode('login'); setResetSent(false); setResetMsg('') }}
                  style={{ background:'none', border:'none', cursor:'pointer',
                    fontSize:'13px', color:'var(--ink-3)', textDecoration:'underline' }}>
                  ← Back to sign in
                </button>
              </div>
            </>
          )}
        </div>

        <p style={{ textAlign:'center', fontSize:'11px', color:'rgba(255,255,255,0.25)', marginTop:'24px' }}>
          Secured · Passwords are encrypted · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
