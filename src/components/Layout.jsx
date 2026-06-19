import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { profile, signOut, isFinanceOrAbove, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const roleLabel = {
    staff: 'Staff',
    manager: 'Manager',
    finance: 'Finance Officer',
    ceo: 'CEO',
    cfo: 'CFO',
    superadmin: 'Super Admin',
  }[profile?.role] || ''

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="cn">付款申请单</div>
          <div className="en">PAYMENT APPLICATION</div>
        </div>

        <div className="sidebar-section">Applications</div>

        <button className={`sidebar-link ${isActive('/new-application') ? 'active' : ''}`}
          onClick={() => navigate('/new-application')}>
          <span className="icon">＋</span> New Application
        </button>

        <button className={`sidebar-link ${isActive('/my-applications') ? 'active' : ''}`}
          onClick={() => navigate('/my-applications')}>
          <span className="icon">📋</span> My Applications
        </button>

        {isFinanceOrAbove && (
          <button className={`sidebar-link ${isActive('/dashboard') ? 'active' : ''}`}
            onClick={() => navigate('/dashboard')}>
            <span className="icon">📊</span> Dashboard
          </button>
        )}

        {isSuperAdmin && (
          <>
            <div className="sidebar-section">Admin</div>
            <button className={`sidebar-link ${isActive('/settings') ? 'active' : ''}`}
              onClick={() => navigate('/settings')}>
              <span className="icon">⚙</span> Settings
            </button>
          </>
        )}

        {['manager','finance','cfo','ceo','superadmin'].includes(profile?.role) && (
          <>
            <div className="sidebar-section">Account</div>
            <button className={`sidebar-link ${isActive('/profile') ? 'active' : ''}`}
              onClick={() => navigate('/profile')}>
              <span className="icon">✍</span> My Signature
            </button>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <strong>{profile?.full_name}</strong>
            {roleLabel} · {profile?.email}
          </div>
          <button className="btn btn-outline w-full" style={{fontSize:'12px',justifyContent:'center'}} onClick={handleSignOut}>
            Sign out
          </button>
          <div style={{marginTop:'10px',textAlign:'center',fontSize:'10px',
            color:'rgba(255,255,255,0.2)',letterSpacing:'.08em',
            fontFamily:"'JetBrains Mono',monospace"}}>v1.8.5</div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
