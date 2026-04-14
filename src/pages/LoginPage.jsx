import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await signIn(email, password)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Invalid email or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a1a2e 0%, #2d2d5e 100%)',
      padding: '20px',
    }}>
      <div style={{ width: '100%', maxWidth: '400px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ fontFamily: "'Noto Serif SC', serif", fontSize: '24px', color: '#c9a84c', letterSpacing: '.2em' }}>
            付款申请单
          </div>
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.4)', letterSpacing: '.3em', marginTop: '6px' }}>
            PAYMENT APPLICATION SYSTEM
          </div>
        </div>

        {/* Card */}
        <div className="card" style={{ padding: '32px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '6px' }}>Sign in</h2>
          <p className="text-muted text-sm" style={{ marginBottom: '24px' }}>Enter your credentials to access the system</p>

          {error && <div className="alert alert-error">{error}</div>}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email address</label>
              <input
                type="email" className="form-control"
                placeholder="you@company.com"
                value={email} onChange={e => setEmail(e.target.value)}
                required autoFocus
              />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password" className="form-control"
                placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-full" style={{ justifyContent: 'center', padding: '11px' }} disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '24px' }}>
          Secured with row-level encryption · {new Date().getFullYear()}
        </p>
      </div>
    </div>
  )
}
