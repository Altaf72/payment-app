import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import LoginPage from './pages/LoginPage'
import MyApplications from './pages/MyApplications'
import NewApplication from './pages/NewApplication'
import FinanceDashboard from './pages/FinanceDashboard'
import ApplicationDetail from './pages/ApplicationDetail'
import SettingsPage from './pages/SettingsPage'
import MyProfile from './pages/MyProfile'
import ResetPasswordPage from './pages/ResetPasswordPage'
import PaymentVoucher from './pages/PaymentVoucher'
import QboSettings from './pages/QboSettings'
import VouchersDashboard from './pages/VouchersDashboard'
import PaymentVoucherApplicationPicker from './pages/PaymentVoucherApplicationPicker'
import PayrollWorkbookDashboard from './pages/PayrollWorkbookDashboard'
import DtcmReport from './pages/DtcmReport'
import ImprestFundManagement from './pages/ImprestFundManagement'
import LedgerTrackerWorkspace from './pages/LedgerTrackerWorkspace'

function PrivateRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#6b6b8a'}}>Loading…</div>
  if (!user) return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}${location.hash}` }} />
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}

function HomeRedirect() {
  const { profile } = useAuth()
  if (!profile) return null
  if (['finance','ceo','cfo','superadmin'].includes(profile.role)) return <Navigate to="/dashboard" replace />
  return <Navigate to="/my-applications" replace />
}

function LoginRoute() {
  const { user } = useAuth()
  const location = useLocation()
  const requestedPath = location.state?.from
  const destination = typeof requestedPath === 'string' &&
    requestedPath.startsWith('/') && !requestedPath.startsWith('//')
    ? requestedPath
    : '/'
  return !user ? <LoginPage /> : <Navigate to={destination} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<HomeRedirect />} />
        <Route path="my-applications" element={<MyApplications />} />
        <Route path="new-application" element={<NewApplication />} />
        <Route path="application/:id" element={<ApplicationDetail />} />
        <Route path="application/:applicationId/payment-voucher" element={
          <PrivateRoute allowedRoles={['staff','finance','ceo','cfo','superadmin']}>
            <PaymentVoucher />
          </PrivateRoute>
        } />
        <Route path="payment-voucher/new" element={
          <PrivateRoute allowedRoles={['finance','ceo','cfo','superadmin']}>
            <PaymentVoucher />
          </PrivateRoute>
        } />
        <Route path="payment-voucher/select-application" element={
          <PrivateRoute allowedRoles={['staff']}><PaymentVoucherApplicationPicker /></PrivateRoute>
        } />
        <Route path="receipt-voucher/new" element={
          <PrivateRoute allowedRoles={['staff','finance','ceo','cfo','superadmin']}>
            <PaymentVoucher voucherType="receipt" />
          </PrivateRoute>
        } />
        <Route path="vouchers" element={
          <PrivateRoute allowedRoles={['staff','finance','ceo','cfo','superadmin']}>
            <VouchersDashboard />
          </PrivateRoute>
        } />
        <Route path="payroll-workbook" element={
          <PrivateRoute allowedRoles={['finance','cfo','superadmin']}>
            <PayrollWorkbookDashboard />
          </PrivateRoute>
        } />
        <Route path="dtcm-report" element={
          <PrivateRoute allowedRoles={['finance','cfo','manager','superadmin']}>
            <DtcmReport />
          </PrivateRoute>
        } />
        <Route path="imprest-funds" element={<PrivateRoute allowedRoles={['finance','cfo','superadmin','manager']}><ImprestFundManagement /></PrivateRoute>} />
        <Route path="cheque-flow" element={<PrivateRoute allowedRoles={['finance','cfo','superadmin']}><LedgerTrackerWorkspace /></PrivateRoute>} />
        <Route path="dashboard" element={
          <PrivateRoute allowedRoles={['finance','manager','ceo','cfo','superadmin']}>
            <FinanceDashboard />
          </PrivateRoute>
        } />
        <Route path="profile" element={<PrivateRoute><MyProfile /></PrivateRoute>} />
        <Route path="qbo-settings" element={
          <PrivateRoute allowedRoles={['finance','ceo','cfo','superadmin']}>
            <QboSettings />
          </PrivateRoute>
        } />
        <Route path="settings" element={
          <PrivateRoute allowedRoles={['superadmin']}>
            <SettingsPage />
          </PrivateRoute>
        } />
      </Route>
    </Routes>
  )
}
