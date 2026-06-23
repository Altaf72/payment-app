import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { profile, signOut, isFinanceOrAbove, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  function go(path) {
    navigate(path)
    setMobileMenuOpen(false)
  }

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
      <header className="mobile-header">
        <button className="mobile-menu-button" type="button" aria-label="Open navigation"
          onClick={() => setMobileMenuOpen(true)}>
          Menu
        </button>
        <div className="mobile-header-title">
          <strong>Payment Application</strong>
          <span>{profile?.full_name}</span>
        </div>
      </header>

      {mobileMenuOpen && <button className="mobile-sidebar-backdrop" aria-label="Close navigation"
        onClick={() => setMobileMenuOpen(false)} />}

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <button className="mobile-sidebar-close" type="button" aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}>
          Close
        </button>
        <div className="sidebar-logo">
          <div className="cn">付款申请单</div>
          <div className="en">PAYMENT APPLICATION</div>
        </div>

        <div className="sidebar-section">Applications</div>

        <button className={`sidebar-link ${isActive('/new-application') ? 'active' : ''}`}
          onClick={() => go('/new-application')}>
          <span className="icon">＋</span> New Application
        </button>

        <button className={`sidebar-link ${isActive('/my-applications') ? 'active' : ''}`}
          onClick={() => go('/my-applications')}>
          <span className="icon">📋</span> My Applications
        </button>

        {isFinanceOrAbove && (
          <button className={`sidebar-link ${isActive('/dashboard') ? 'active' : ''}`}
            onClick={() => go('/dashboard')}>
              <span className="icon">📊</span> Dashboard
          </button>
        )}

        {['finance','cfo','ceo','superadmin'].includes(profile?.role) && (
          <>
            <div className="sidebar-section">Finance</div>
            <button className={`sidebar-link ${isActive('/vouchers') ? 'active' : ''}`}
              onClick={() => go('/vouchers')}>
              <span className="icon">V</span> Vouchers
            </button>
            <button className={`sidebar-link ${isActive('/qbo-settings') ? 'active' : ''}`}
              onClick={() => go('/qbo-settings')}>
              <span className="icon">L</span> Local Settings
            </button>
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="sidebar-section">Admin</div>
            <button className={`sidebar-link ${isActive('/settings') ? 'active' : ''}`}
              onClick={() => go('/settings')}>
              <span className="icon">⚙</span> Settings
            </button>
          </>
        )}

        {['manager','finance','cfo','ceo','superadmin'].includes(profile?.role) && (
          <>
            <div className="sidebar-section">Account</div>
            <button className={`sidebar-link ${isActive('/profile') ? 'active' : ''}`}
              onClick={() => go('/profile')}>
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
            color:'rgba(255,255,255,0.72)',letterSpacing:'.08em',fontWeight:600,
            fontFamily:"'JetBrains Mono',monospace"}}>v1.12.14</div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
