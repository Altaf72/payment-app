import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../lib/utils'

export default function PaymentVoucherApplicationPicker() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [applications, setApplications] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      const { data, error: loadError } = await supabase
        .from('applications_full')
        .select('id, ref_number, company_name, payee_name, payment_reason, amount, status, submitted_at, created_at')
        .eq('submitted_by', user.id)
        .neq('status', 'draft')
        .order('submitted_at', { ascending: false })
      if (loadError) setError(loadError.message || 'Could not load your payment applications.')
      else setApplications(data || [])
      setLoading(false)
    }
    if (user?.id) load()
  }, [user?.id])

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return applications
    return applications.filter(app => [app.ref_number, app.company_name, app.payee_name, app.payment_reason, app.status]
      .some(value => String(value || '').toLowerCase().includes(term)))
  }, [applications, search])

  return (
    <div>
      <div className="page-header">
        <button className="btn btn-outline btn-sm" onClick={() => navigate('/vouchers')} style={{ marginBottom:'8px' }}>Back to Vouchers Dashboard</button>
        <h1>New Payment Voucher</h1>
        <p>Select one of your submitted Payment Applications to make its linked payment voucher.</p>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="filter-bar" style={{ marginBottom:'14px' }}>
        <input className="form-control" style={{ minWidth:'260px', flex:1 }} autoFocus
          placeholder="Search application, company, payee, reason..." value={search}
          onChange={event => setSearch(event.target.value)} />
      </div>
      <div className="card">
        <div className="card-header"><h2>Your Payment Applications</h2><span className="text-sm text-muted">{filtered.length} shown</span></div>
        {loading ? <div className="empty-state"><p>Loading applications...</p></div>
          : filtered.length === 0 ? <div className="empty-state"><h3>No submitted applications found</h3><p>Create and submit a Payment Application first.</p></div>
          : <div className="table-wrap"><table><thead><tr><th>Application</th><th>Company</th><th>Payee</th><th>Reason</th><th>Status</th><th style={{ textAlign:'right' }}>Amount</th><th></th></tr></thead>
            <tbody>{filtered.map(app => <tr key={app.id}>
              <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:700 }}>{app.ref_number}</td>
              <td>{app.company_name || '—'}</td><td>{app.payee_name || '—'}</td><td>{app.payment_reason || '—'}</td>
              <td><span className="badge badge-draft">{app.status}</span></td>
              <td style={{ textAlign:'right' }}>AED {formatCurrency(app.amount)}</td>
              <td><button className="btn btn-primary btn-sm" onClick={() => navigate(`/application/${app.id}/payment-voucher`)}>Make Payment Voucher</button></td>
            </tr>)}</tbody>
          </table></div>}
      </div>
    </div>
  )
}
