import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatCurrency } from '../lib/utils'
import { useAuth } from '../context/AuthContext'

const STORAGE_KEY = 'vouchers_dashboard_filters'
const companyCell = { width:'118px', maxWidth:'118px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }
const descriptionCell = {
  minWidth:'260px', maxWidth:'360px', overflow:'hidden', textOverflow:'ellipsis',
  display:'-webkit-box', WebkitBoxOrient:'vertical', WebkitLineClamp:2, lineHeight:'1.35',
}

function getSavedDashboardState() {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
  } catch {
    return {}
  }
}

function displayDate(value) {
  if (!value) return '—'
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

export default function VouchersDashboard() {
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isStaff = profile?.role === 'staff'
  const saved = getSavedDashboardState()
  const [vouchers, setVouchers] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState(saved.search || '')
  const [typeFilter, setTypeFilter] = useState(saved.typeFilter || 'all')
  const [statusFilter, setStatusFilter] = useState(saved.statusFilter || 'all')
  const [companyFilter, setCompanyFilter] = useState(saved.companyFilter || 'all')

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      search,
      typeFilter,
      statusFilter,
      companyFilter,
      scrollTop: getSavedDashboardState().scrollTop || 0,
    }))
  }, [search, typeFilter, statusFilter, companyFilter])

  useEffect(() => {
    if (loading) return
    const main = document.querySelector('.main-content')
    if (main) main.scrollTop = Number(getSavedDashboardState().scrollTop) || 0
  }, [loading])

  function rememberPosition() {
    const current = getSavedDashboardState()
    const main = document.querySelector('.main-content')
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...current,
      search,
      typeFilter,
      statusFilter,
      companyFilter,
      scrollTop: main?.scrollTop || 0,
    }))
  }

  function openVoucherPath(path) {
    rememberPosition()
    navigate(path)
  }

  async function load() {
    setLoading(true)
    setError('')
    const [voucherResult, companyResult] = await Promise.all([
      supabase.from('payment_vouchers').select('*').order('voucher_date', { ascending: false }),
      supabase.from('companies').select('id, name, prefix, logo_url').order('name'),
    ])
    if (voucherResult.error) {
      setError(`Could not load vouchers. Run sql/receipt_vouchers.sql in Supabase if required. ${voucherResult.error.message}`)
    } else if (companyResult.error) {
      setError(companyResult.error.message || 'Could not load companies')
    } else {
      setVouchers(voucherResult.data || [])
      setCompanies(companyResult.data || [])
    }
    setLoading(false)
  }

  const companyById = useMemo(
    () => Object.fromEntries(companies.map(company => [company.id, company])),
    [companies]
  )

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return vouchers.filter(voucher => {
      if (typeFilter !== 'all' && (voucher.voucher_type || 'payment') !== typeFilter) return false
      if (statusFilter !== 'all' && voucher.status !== statusFilter) return false
      if (companyFilter !== 'all' && voucher.company_id !== companyFilter) return false
      if (!term) return true
      const company = companyById[voucher.company_id]
      return [
        voucher.voucher_number,
        voucher.paid_to,
        voucher.receiving_company,
        voucher.reference_no,
        voucher.payment_reason,
        voucher.narration,
        voucher.remarks,
        voucher.payment_mode,
        company?.name,
        company?.prefix,
      ].some(value => String(value || '').toLowerCase().includes(term))
    })
  }, [vouchers, companyById, search, typeFilter, statusFilter, companyFilter])

  const totals = useMemo(() => ({
    payment: vouchers.filter(voucher => (voucher.voucher_type || 'payment') === 'payment').length,
    receipt: vouchers.filter(voucher => voucher.voucher_type === 'receipt').length,
    amount: filtered.reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0),
  }), [vouchers, filtered])

  function voucherUrl(voucher) {
    const type = voucher.voucher_type || 'payment'
    const base = type === 'receipt'
      ? '/receipt-voucher/new'
      : voucher.application_id
        ? `/application/${voucher.application_id}/payment-voucher`
        : '/payment-voucher/new'
    const params = new URLSearchParams({ voucher: voucher.id, from: 'vouchers' })
    return `${base}?${params.toString()}`
  }

  return (
    <div>
      <div className="page-header flex justify-between items-center" style={{ gap:'12px', flexWrap:'wrap' }}>
        <div>
          <h1>Vouchers Dashboard</h1>
          <p>Payment and receipt vouchers</p>
        </div>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          <button className="btn btn-primary" onClick={() => openVoucherPath(isStaff ? '/payment-voucher/select-application' : '/payment-voucher/new?from=vouchers')}>New Payment Voucher</button>
          <button className="btn btn-outline" onClick={() => openVoucherPath('/receipt-voucher/new?from=vouchers')}>New Receipt Voucher</button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="stats-row">
        <div className="stat-card"><div className="stat-label">All Vouchers</div><div className="stat-value">{vouchers.length}</div></div>
        <div className="stat-card"><div className="stat-label">Payment Vouchers</div><div className="stat-value">{totals.payment}</div></div>
        <div className="stat-card"><div className="stat-label">Receipt Vouchers</div><div className="stat-value">{totals.receipt}</div></div>
        <div className="stat-card"><div className="stat-label">Filtered Amount</div><div className="stat-value" style={{fontSize:'18px'}}>AED {formatCurrency(totals.amount)}</div></div>
      </div>

      <div className="filter-bar" style={{ marginBottom:'14px' }}>
        <input
          className="form-control"
          style={{ minWidth:'240px', flex:'2' }}
          placeholder="Search voucher, party, reference, reason..."
          value={search}
          onChange={event => setSearch(event.target.value)}
        />
        <select className="form-control" value={typeFilter} onChange={event => setTypeFilter(event.target.value)}>
          <option value="all">All types</option>
          <option value="payment">Payment Voucher</option>
          <option value="receipt">Receipt Voucher</option>
        </select>
        <select className="form-control" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="saved">Saved</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className="form-control" value={companyFilter} onChange={event => setCompanyFilter(event.target.value)}>
          <option value="all">All companies</option>
          {companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}
        </select>
        <button className="btn btn-outline" onClick={load}>Refresh</button>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>Vouchers</h2>
          <span className="text-sm text-muted">{filtered.length} shown</span>
        </div>
        {loading ? (
          <div className="empty-state"><p>Loading vouchers...</p></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state"><h3>No vouchers found</h3></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Voucher</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th style={{width:'118px'}}>Company</th>
                  <th>Party</th>
                  <th style={{minWidth:'260px'}}>Description</th>
                  <th>Mode</th>
                  <th style={{textAlign:'right'}}>Amount</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(voucher => {
                  const type = voucher.voucher_type || 'payment'
                  const company = companyById[voucher.company_id]
                  return (
                    <tr key={voucher.id}>
                      <td style={{fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{voucher.voucher_number}</td>
                      <td>{type === 'receipt' ? 'Receipt' : 'Payment'}</td>
                      <td>{displayDate(voucher.voucher_date)}</td>
                      <td style={companyCell} title={company?.name || ''}>{company?.name || '—'}</td>
                      <td>{voucher.paid_to || '—'}</td>
                      <td style={descriptionCell} title={voucher.payment_reason || voucher.narration || ''}>{voucher.payment_reason || voucher.narration || '—'}</td>
                      <td>{voucher.payment_mode || '—'}</td>
                      <td style={{textAlign:'right',whiteSpace:'nowrap'}}>AED {formatCurrency(voucher.amount)}</td>
                      <td>
                        <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                          <button className="btn btn-primary btn-sm" onClick={() => openVoucherPath(voucherUrl(voucher))}>Open</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
