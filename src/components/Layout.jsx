import { useEffect, useState } from 'react'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import appPackage from '../../package.json'

const LANGUAGE_KEY = 'paymentapp.displayLanguage'

const TEXT = {
  en: {
    menu: 'Menu',
    close: 'Close',
    paymentApplication: 'Payment Application',
    paymentApplicationCaps: 'PAYMENT APPLICATION',
    paymentApplicationCn: '付款申请单',
    applications: 'Applications',
    newApplication: 'New Application',
    myApplications: 'My Applications',
    dashboard: 'Dashboard',
    finance: 'Finance',
    vouchers: 'Vouchers',
    payrollWorkbook: 'Payroll Workbook',
    dtcmReport: 'DTCM Report',
    imprestFunds: 'Imprest Fund Management',
    localSettings: 'Local Settings',
    admin: 'Admin',
    settings: 'Settings',
    account: 'Account',
    mySignature: 'My Signature',
    signOut: 'Sign out',
    language: 'Language',
    english: 'English',
    chinese: 'Chinese',
    roles: {
      staff: 'Staff',
      manager: 'Manager',
      finance: 'Finance Officer',
      ceo: 'CEO',
      cfo: 'CFO',
      superadmin: 'Super Admin',
    },
  },
  zh: {
    menu: '菜单',
    close: '关闭',
    paymentApplication: '付款申请',
    paymentApplicationCaps: '付款申请',
    paymentApplicationCn: '付款申请单',
    applications: '申请',
    newApplication: '新增申请',
    myApplications: '我的申请',
    dashboard: '仪表板',
    finance: '财务',
    vouchers: '凭证',
    payrollWorkbook: '工资工作簿',
    dtcmReport: 'DTCM Report',
    imprestFunds: 'Imprest Fund Management',
    localSettings: '本地设置',
    admin: '管理',
    settings: '设置',
    account: '账户',
    mySignature: '我的签名',
    signOut: '退出登录',
    language: '显示语言',
    english: 'English',
    chinese: '中文',
    roles: {
      staff: '员工',
      manager: '经理',
      finance: '财务',
      ceo: 'CEO',
      cfo: 'CFO',
      superadmin: '超级管理员',
    },
  },
}

function readDisplayLanguage() {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY)
    return stored === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

export default function Layout() {
  const { profile, signOut, isFinanceOrAbove, isSuperAdmin } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [displayLanguage, setDisplayLanguage] = useState(() => readDisplayLanguage())
  const text = TEXT[displayLanguage]

  const isActive = (path) => location.pathname === path || location.pathname.startsWith(path + '/')

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    try {
      localStorage.setItem(LANGUAGE_KEY, displayLanguage)
    } catch {
      // Language preference is a convenience; ignore browser storage failures.
    }
    document.documentElement.lang = displayLanguage === 'zh' ? 'zh-CN' : 'en'
    window.dispatchEvent(new CustomEvent('paymentapp:language-change', { detail: displayLanguage }))
  }, [displayLanguage])

  function go(path) {
    navigate(path)
    setMobileMenuOpen(false)
  }

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  const roleLabel = {
    staff: text.roles.staff,
    manager: text.roles.manager,
    finance: text.roles.finance,
    ceo: text.roles.ceo,
    cfo: text.roles.cfo,
    superadmin: text.roles.superadmin,
  }[profile?.role] || ''

  function renderLanguageSwitch() {
    return (
    <div className="language-switch" aria-label={text.language}>
      <span>{text.language}</span>
      <button type="button" className={displayLanguage === 'en' ? 'active' : ''}
        onClick={() => setDisplayLanguage('en')}>
        {text.english}
      </button>
      <button type="button" className={displayLanguage === 'zh' ? 'active' : ''}
        onClick={() => setDisplayLanguage('zh')}>
        {text.chinese}
      </button>
    </div>
    )
  }

  return (
    <div className="app-shell">
      <header className="mobile-header">
        <button className="mobile-menu-button" type="button" aria-label="Open navigation"
          onClick={() => setMobileMenuOpen(true)}>
          {text.menu}
        </button>
        <div className="mobile-header-title">
          <strong>{text.paymentApplication}</strong>
          <span>{profile?.full_name}</span>
        </div>
        <div className="mobile-language-switch">
          {renderLanguageSwitch()}
        </div>
      </header>

      {mobileMenuOpen && <button className="mobile-sidebar-backdrop" aria-label="Close navigation"
        onClick={() => setMobileMenuOpen(false)} />}

      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <button className="mobile-sidebar-close" type="button" aria-label="Close navigation"
          onClick={() => setMobileMenuOpen(false)}>
          {text.close}
        </button>
        <div className="sidebar-logo">
          <div className="cn">{text.paymentApplicationCn}</div>
          <div className="en">{text.paymentApplicationCaps}</div>
        </div>

        {renderLanguageSwitch()}

        <div className="sidebar-section">{text.applications}</div>

        <button className={`sidebar-link ${isActive('/new-application') ? 'active' : ''}`}
          onClick={() => go('/new-application')}>
          <span className="icon">＋</span> {text.newApplication}
        </button>

        <button className={`sidebar-link ${isActive('/my-applications') ? 'active' : ''}`}
          onClick={() => go('/my-applications')}>
          <span className="icon">📋</span> {text.myApplications}
        </button>

        {isFinanceOrAbove && (
          <button className={`sidebar-link ${isActive('/dashboard') ? 'active' : ''}`}
            onClick={() => go('/dashboard')}>
              <span className="icon">📊</span> {text.dashboard}
          </button>
        )}

        {profile?.role === 'manager' && (
          <>
            <button className={`sidebar-link ${isActive('/dtcm-report') ? 'active' : ''}`} onClick={() => go('/dtcm-report')}>
              <span className="icon">D</span> {text.dtcmReport}
            </button>
            <button className={`sidebar-link ${isActive('/imprest-funds') ? 'active' : ''}`} onClick={() => go('/imprest-funds')}>
              <span className="icon">I</span> {text.imprestFunds}
            </button>
          </>
        )}

        {['finance','cfo','ceo','superadmin'].includes(profile?.role) && (
          <>
            <div className="sidebar-section">{text.finance}</div>
            <button className={`sidebar-link ${isActive('/vouchers') ? 'active' : ''}`}
              onClick={() => go('/vouchers')}>
              <span className="icon">V</span> {text.vouchers}
            </button>
            {['finance','cfo','superadmin'].includes(profile?.role) && (
              <button className={`sidebar-link ${isActive('/payroll-workbook') ? 'active' : ''}`}
                onClick={() => go('/payroll-workbook')}>
                <span className="icon">P</span> {text.payrollWorkbook}
              </button>
            )}
            {['finance','cfo','superadmin'].includes(profile?.role) && (
              <button className={`sidebar-link ${isActive('/dtcm-report') ? 'active' : ''}`}
                onClick={() => go('/dtcm-report')}>
                <span className="icon">D</span> {text.dtcmReport}
              </button>
            )}
            {['finance','cfo','superadmin'].includes(profile?.role) && (
              <button className={`sidebar-link ${isActive('/imprest-funds') ? 'active' : ''}`} onClick={() => go('/imprest-funds')}>
                <span className="icon">I</span> {text.imprestFunds}
              </button>
            )}
            <button className={`sidebar-link ${isActive('/qbo-settings') ? 'active' : ''}`}
              onClick={() => go('/qbo-settings')}>
              <span className="icon">L</span> {text.localSettings}
            </button>
          </>
        )}

        {isSuperAdmin && (
          <>
            <div className="sidebar-section">{text.admin}</div>
            <button className={`sidebar-link ${isActive('/settings') ? 'active' : ''}`}
              onClick={() => go('/settings')}>
              <span className="icon">⚙</span> {text.settings}
            </button>
          </>
        )}

        {['manager','finance','cfo','ceo','superadmin'].includes(profile?.role) && (
          <>
            <div className="sidebar-section">{text.account}</div>
            <button className={`sidebar-link ${isActive('/profile') ? 'active' : ''}`}
              onClick={() => go('/profile')}>
              <span className="icon">✍</span> {text.mySignature}
            </button>
          </>
        )}

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <strong>{profile?.full_name}</strong>
            {roleLabel} · {profile?.email}
          </div>
          <button className="btn btn-outline w-full" style={{fontSize:'12px',justifyContent:'center'}} onClick={handleSignOut}>
            {text.signOut}
          </button>
          <div style={{marginTop:'10px',textAlign:'center',fontSize:'10px',
            color:'rgba(255,255,255,0.72)',letterSpacing:'.08em',fontWeight:600,
            fontFamily:"'JetBrains Mono',monospace"}}>v{appPackage.version}</div>
        </div>
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}


