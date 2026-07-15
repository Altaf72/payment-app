import { Routes, Route, Navigate } from 'react-router-dom'
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
import PayrollWorkbookDashboard from './pages/PayrollWorkbookDashboard'
import DtcmReport from './pages/DtcmReport'

function PrivateRoute({ children, allowedRoles }) {
  const { user, profile, loading } = useAuth()
  if (loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'#6b6b8a'}}>Loading…</div>
  if (!user) return <Navigate to="/login" replace />
  if (allowedRoles && profile && !allowedRoles.includes(profile.role)) return <Navigate to="/" replace />
  return children
}

function HomeRedirect() {
  const { profile } = useAuth()
  if (!profile) return null
  if (['finance','ceo','cfo','superadmin'].includes(profile.role)) return <Navigate to="/dashboard" replace />
  return <Navigate to="/my-applications" replace />
}

export default function App() {
  const { user } = useAuth()

  return (
    <Routes>
      <Route path="/login" element={!user ? <LoginPage /> : <Navigate to="/" replace />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<HomeRedirect />} />
        <Route path="my-applications" element={<MyApplications />} />
        <Route path="new-application" element={<NewApplication />} />
        <Route path="application/:id" element={<ApplicationDetail />} />
        <Route path="application/:applicationId/payment-voucher" element={
          <PrivateRoute allowedRoles={['finance','ceo','cfo','superadmin']}>
            <PaymentVoucher />
          </PrivateRoute>
        } />
        <Route path="payment-voucher/new" element={
          <PrivateRoute allowedRoles={['finance','ceo','cfo','superadmin']}>
            <PaymentVoucher />
          </PrivateRoute>
        } />
        <Route path="receipt-voucher/new" element={
          <PrivateRoute allowedRoles={['finance','ceo','cfo','superadmin']}>
            <PaymentVoucher voucherType="receipt" />
          </PrivateRoute>
        } />
        <Route path="vouchers" element={
          <PrivateRoute allowedRoles={['finance','ceo','cfo','superadmin']}>
            <VouchersDashboard />
          </PrivateRoute>
        } />
        <Route path="payroll-workbook" element={
          <PrivateRoute allowedRoles={['finance','cfo','superadmin']}>
            <PayrollWorkbookDashboard />
          </PrivateRoute>
        } />
        <Route path="dtcm-report" element={
          <PrivateRoute allowedRoles={['finance','cfo','superadmin']}>
            <DtcmReport />
          </PrivateRoute>
        } />
        <Route path="dashboard" element={
          <PrivateRoute allowedRoles={['finance','ceo','cfo','superadmin']}>
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
