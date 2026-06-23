import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { amountToWords, formatCurrency } from '../lib/utils'
import {
  nextPaymentVoucherNumber,
  nextStandalonePaymentVoucherNumber,
  nextStandaloneReceiptVoucherNumber,
} from '../lib/voucherUtils'

const emptyCheque = {
  cheque_no: '',
  cheque_date: '',
  bank_name: '',
  in_favour_of: '',
  amount: '',
}

function localDate() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function displayDate(value) {
  if (!value) return ''
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function PaymentVoucherPrint({ application, company, form, cheques, profile, isReceipt, printRef, exportingPdf }) {
  const chequeRows = form.payment_mode === 'Cheque' ? cheques : []
  const description = form.payment_reason?.trim()
  const narration = form.narration?.trim()
  const remarks = form.remarks?.trim()
  return (
    <div ref={printRef} className={`voucher-print ${exportingPdf ? 'voucher-pdf-exporting' : ''}`}>
      <div className="voucher-print-status">{form.status === 'saved' ? (isReceipt ? 'RECEIVED' : 'PAID') : 'DRAFT'}</div>
      <header className="voucher-print-header">
        <div className="voucher-print-logo">
          {company?.logo_url
            ? <img src={company.logo_url} alt="" />
            : <div className="voucher-logo-placeholder">{company?.prefix || ''}</div>
          }
        </div>
        <div>
          <h1>{company?.name || application?.company_name || ''}</h1>
          <p>{isReceipt ? 'RECEIPT VOUCHER' : 'PAYMENT VOUCHER'}</p>
        </div>
        <div className="voucher-print-number">{form.voucher_number}</div>
      </header>

      <section className="voucher-print-summary">
        <div><span>Date</span><strong>{displayDate(form.voucher_date)}</strong></div>
        <div><span>{isReceipt ? 'Receipt Mode' : 'Payment Mode'}</span><strong>{form.payment_mode || '-'}</strong></div>
        <div><span>Reference No.</span><strong>{form.reference_no || '-'}</strong></div>
        <div><span>Currency</span><strong>{form.currency || 'AED'}</strong></div>
        <div className="voucher-total"><span>{isReceipt ? 'Amount Received' : 'Amount Paid'}</span><strong>AED {formatCurrency(Number(form.amount) || 0)}</strong></div>
      </section>

      <div className="voucher-amount-words">
        {amountToWords(Number(form.amount) || 0)}
      </div>

      <section className="voucher-paid-to">
        <span>{isReceipt ? 'Received From:' : 'Paid To:'}</span>
        <strong>{form.paid_to}</strong>
      </section>

      {chequeRows.length > 0 && (
        <section className="voucher-print-section">
          <h2>Cheque Details</h2>
          <table>
            <thead>
              <tr>
                <th>Srl</th>
                <th>Chq #</th>
                <th>Date</th>
                <th>Bank</th>
                <th>{isReceipt ? 'Received From' : 'In Favour Of'}</th>
                <th className="number">Amount</th>
              </tr>
            </thead>
            <tbody>
              {chequeRows.map((cheque, index) => (
                <tr key={index}>
                  <td>{index + 1}</td>
                  <td>{cheque.cheque_no || '-'}</td>
                  <td>{displayDate(cheque.cheque_date) || '-'}</td>
                  <td>{cheque.bank_name || '-'}</td>
                  <td>{cheque.in_favour_of || '-'}</td>
                  <td className="number">AED {formatCurrency(Number(cheque.amount) || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {description && (
        <section className="voucher-print-section">
          <h2>{isReceipt ? 'Receipt Description' : 'Payment Description'}</h2>
          <p>{description}</p>
        </section>
      )}

      {narration && (
        <section className="voucher-print-section">
          <h2>Narration</h2>
          <p>{narration}</p>
        </section>
      )}

      {remarks && (
        <section className="voucher-print-section">
          <h2>Remarks</h2>
          <p className="voucher-print-remarks">{remarks}</p>
        </section>
      )}

      <section className="voucher-signatures">
        <div><span>Prepared By</span><strong>{form.prepared_by_name || profile?.full_name || ''}</strong><i>Signature</i></div>
        <div><span>Approved By</span><strong>{form.approved_by_name || ''}</strong><i>Signature</i></div>
        <div><span>Received By</span><strong>{form.received_by_name || form.paid_to || ''}</strong><i>Signature</i></div>
      </section>

      <footer>
        {application?.ref_number
          ? `Linked application: ${application.ref_number}`
          : `Standalone ${isReceipt ? 'receipt' : 'payment'} voucher`
        } | Generated {new Date().toLocaleString('en-GB')}
      </footer>
    </div>
  )
}

export default function PaymentVoucher({ voucherType = 'payment' }) {
  const { applicationId } = useParams()
  const isStandalone = !applicationId
  const isReceipt = voucherType === 'receipt'
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user, profile } = useAuth()
  const printRef = useRef(null)
  const autoDownloadRef = useRef('')

  const [application, setApplication] = useState(null)
  const [company, setCompany] = useState(null)
  const [companies, setCompanies] = useState([])
  const [existingVouchers, setExistingVouchers] = useState([])
  const [currentVoucherId, setCurrentVoucherId] = useState(null)
  const [cheques, setCheques] = useState([{ ...emptyCheque }])
  const [loading, setLoading] = useState(true)
  const [schemaReady, setSchemaReady] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [exportingPdf, setExportingPdf] = useState(false)
  const [form, setForm] = useState({
    voucher_number: '',
    installment_no: 1,
    voucher_date: localDate(),
    paid_to: '',
    amount: '',
    currency: 'AED',
    receiving_company: '',
    payment_reason: '',
    remarks: '',
    narration: '',
    payment_mode: 'Cheque',
    reference_no: '',
    prepared_by_name: '',
    approved_by_name: '',
    received_by_name: '',
    status: 'draft',
  })

  useEffect(() => {
    load()
  }, [applicationId, voucherType])

  useEffect(() => {
    const requestedVoucherId = searchParams.get('voucher')
    if (
      loading ||
      searchParams.get('download') !== '1' ||
      !currentVoucherId ||
      currentVoucherId !== requestedVoucherId ||
      autoDownloadRef.current === requestedVoucherId
    ) return
    autoDownloadRef.current = requestedVoucherId
    handleDownloadPdf()
  }, [loading, currentVoucherId, searchParams])

  async function load() {
    setLoading(true)
    setError('')

    if (isStandalone) {
      const [companiesResult, vouchersResult] = await Promise.all([
        supabase.from('companies').select('*').order('name'),
        supabase.from('payment_vouchers').select('*')
          .is('application_id', null)
          .eq('voucher_type', voucherType)
          .order('created_at'),
      ])
      if (vouchersResult.error) {
        setSchemaReady(false)
        setError(`Voucher tables are not ready. Run sql/${isReceipt ? 'receipt_vouchers.sql' : 'standalone_payment_vouchers.sql'} in Supabase. ${vouchersResult.error.message}`)
        setLoading(false)
        return
      }
      if (companiesResult.error) {
        setError(companiesResult.error.message || 'Could not load companies')
        setLoading(false)
        return
      }

      const companyRows = companiesResult.data || []
      const vouchers = vouchersResult.data || []
      setSchemaReady(true)
      setCompanies(companyRows)
      setExistingVouchers(vouchers)

      const requestedVoucherId = searchParams.get('voucher')
      const requestedVoucher = vouchers.find(v => v.id === requestedVoucherId)
      if (requestedVoucher) {
        const voucherCompany = companyRows.find(item => item.id === requestedVoucher.company_id) || null
        setCompany(voucherCompany)
        await editVoucher(requestedVoucher, false)
      } else {
        startStandaloneVoucher(null, vouchers)
      }
      setLoading(false)
      return
    }

    const { data: appData, error: appError } = await supabase
      .from('applications_full')
      .select('*')
      .eq('id', applicationId)
      .single()
    if (appError || !appData) {
      setError(appError?.message || 'Application not found')
      setLoading(false)
      return
    }

    const [{ data: companyData }, voucherResult] = await Promise.all([
      supabase.from('companies').select('*').eq('id', appData.company_id).single(),
      supabase.from('payment_vouchers').select('*')
        .eq('application_id', applicationId)
        .eq('voucher_type', 'payment')
        .order('installment_no'),
    ])

    if (voucherResult.error) {
      setApplication(appData)
      setCompany(companyData || null)
      setSchemaReady(false)
      setError(`Voucher tables are not ready. Run sql/payment_vouchers.sql in Supabase. ${voucherResult.error.message}`)
      setLoading(false)
      return
    }

    const vouchers = voucherResult.data || []
    setSchemaReady(true)
    setApplication(appData)
    setCompany(companyData || null)
    setExistingVouchers(vouchers)

    const requestedVoucherId = searchParams.get('voucher')
    const requestedVoucher = vouchers.find(v => v.id === requestedVoucherId)
    if (requestedVoucher) {
      await editVoucher(requestedVoucher, false)
    } else {
      startNewVoucher(appData, companyData, vouchers)
    }
    setLoading(false)
  }

  function startNewVoucher(appData = application, companyData = company, vouchers = existingVouchers) {
    if (!appData) return
    const next = nextPaymentVoucherNumber(companyData?.prefix, appData.ref_number, vouchers)
    setCurrentVoucherId(null)
    setSearchParams({})
    setForm({
      voucher_number: next.voucherNumber,
      installment_no: next.installmentNo,
      voucher_date: localDate(),
      paid_to: appData.payee_name || '',
      amount: '',
      currency: 'AED',
      receiving_company: appData.payee_name || '',
      payment_reason: appData.payment_reason || '',
      remarks: appData.remarks || '',
      narration: appData.payment_reason || '',
      payment_mode: 'Cheque',
      reference_no: appData.ref_number || '',
      prepared_by_name: profile?.full_name || '',
      approved_by_name: '',
      received_by_name: appData.payee_name || '',
      status: 'draft',
    })
    setCheques([{
      ...emptyCheque,
      bank_name: appData.bank_name || '',
      in_favour_of: appData.payee_name || '',
    }])
    setMessage('')
    setError('')
  }

  function startStandaloneVoucher(companyData = company, vouchers = existingVouchers) {
    const companyVouchers = companyData
      ? vouchers.filter(voucher => voucher.company_id === companyData.id)
      : []
    setCurrentVoucherId(null)
    setSearchParams({})
    setCompany(companyData || null)
    setForm({
      voucher_number: companyData
        ? (isReceipt
            ? nextStandaloneReceiptVoucherNumber(companyData.prefix, companyVouchers)
            : nextStandalonePaymentVoucherNumber(companyData.prefix, companyVouchers))
        : '',
      installment_no: 1,
      voucher_date: localDate(),
      paid_to: '',
      amount: '',
      currency: 'AED',
      receiving_company: '',
      payment_reason: '',
      remarks: '',
      narration: '',
      payment_mode: 'Cheque',
      reference_no: '',
      prepared_by_name: profile?.full_name || '',
      approved_by_name: '',
      received_by_name: '',
      status: 'draft',
    })
    setCheques([{ ...emptyCheque }])
    setMessage('')
    setError('')
  }

  function selectStandaloneCompany(companyId) {
    const selectedCompany = companies.find(item => item.id === companyId) || null
    startStandaloneVoucher(selectedCompany, existingVouchers)
  }

  async function editVoucher(voucher, updateUrl = true) {
    setCurrentVoucherId(voucher.id)
    if (updateUrl) setSearchParams({ voucher: voucher.id })
    setForm({
      voucher_number: voucher.voucher_number || '',
      installment_no: voucher.installment_no || 1,
      voucher_date: voucher.voucher_date || localDate(),
      paid_to: voucher.paid_to || '',
      amount: voucher.amount ?? '',
      currency: voucher.currency || 'AED',
      receiving_company: voucher.receiving_company || '',
      payment_reason: voucher.payment_reason || '',
      remarks: voucher.remarks || '',
      narration: voucher.narration || '',
      payment_mode: voucher.payment_mode || 'Cheque',
      reference_no: voucher.reference_no || '',
      prepared_by_name: voucher.prepared_by_name || '',
      approved_by_name: voucher.approved_by_name || '',
      received_by_name: voucher.received_by_name || '',
      status: voucher.status || 'draft',
    })
    const { data } = await supabase
      .from('voucher_cheques')
      .select('*')
      .eq('voucher_id', voucher.id)
      .order('serial_no')
    setCheques((data || []).length > 0 ? data.map(row => ({
      cheque_no: row.cheque_no || '',
      cheque_date: row.cheque_date || '',
      bank_name: row.bank_name || '',
      in_favour_of: row.in_favour_of || '',
      amount: row.amount ?? '',
    })) : [{ ...emptyCheque }])
    setMessage('')
    setError('')
  }

  const currentAmount = Number(form.amount) || 0
  const previouslyVouchered = useMemo(
    () => existingVouchers
      .filter(v => v.id !== currentVoucherId && v.status !== 'cancelled')
      .reduce((sum, voucher) => sum + Number(voucher.amount || 0), 0),
    [existingVouchers, currentVoucherId]
  )
  const availableBalance = Number(application?.amount || 0) - previouslyVouchered
  const displayedVouchers = isStandalone && company
    ? existingVouchers.filter(voucher => voucher.company_id === company.id)
    : existingVouchers
  const chequeTotal = cheques.reduce((sum, cheque) => sum + Number(cheque.amount || 0), 0)
  const chequeMismatch = form.payment_mode === 'Cheque' &&
    cheques.some(row => row.cheque_no || row.amount) &&
    Math.abs(chequeTotal - currentAmount) > 0.009

  function setField(field, value) {
    setForm(current => ({ ...current, [field]: value }))
  }

  function setCheque(index, field, value) {
    setCheques(rows => rows.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [field]: value } : row
    )))
  }

  function addCheque() {
    setCheques(rows => [...rows, {
      ...emptyCheque,
      in_favour_of: form.paid_to,
    }])
  }

  function removeCheque(index) {
    setCheques(rows => rows.length === 1
      ? [{ ...emptyCheque }]
      : rows.filter((_, rowIndex) => rowIndex !== index)
    )
  }

  function validate() {
    if (isStandalone && !company?.id) return 'Company is required'
    if (!form.paid_to.trim()) return isReceipt ? 'Received From is required' : 'Payee name is required'
    if (!form.amount || Number(form.amount) <= 0) return 'Amount is required'
    if (!form.voucher_number.trim()) return 'Voucher number is required'
    return ''
  }

  async function saveVoucher(status) {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return null
    }

    setSaving(true)
    setError('')
    setMessage('')
    try {
      const payload = {
        application_id: applicationId || null,
        company_id: isStandalone ? company.id : application.company_id,
        voucher_type: voucherType,
        voucher_number: form.voucher_number.trim(),
        installment_no: form.installment_no,
        voucher_date: form.voucher_date,
        paid_to: form.paid_to.trim(),
        amount: Number(form.amount),
        currency: form.currency.trim() || 'AED',
        receiving_company: form.receiving_company.trim() || null,
        payment_reason: form.payment_reason.trim() || null,
        remarks: form.remarks.trim() || null,
        narration: form.narration.trim() || null,
        payment_mode: form.payment_mode || null,
        reference_no: form.reference_no.trim() || null,
        prepared_by_name: form.prepared_by_name.trim() || null,
        approved_by_name: form.approved_by_name.trim() || null,
        received_by_name: form.received_by_name.trim() || null,
        status,
        updated_by: user.id,
      }

      let voucher
      if (currentVoucherId) {
        const { data, error: updateError } = await supabase
          .from('payment_vouchers')
          .update(payload)
          .eq('id', currentVoucherId)
          .select()
          .single()
        if (updateError) throw updateError
        voucher = data
      } else {
        const { data, error: insertError } = await supabase
          .from('payment_vouchers')
          .insert({ ...payload, created_by: user.id })
          .select()
          .single()
        if (insertError) throw insertError
        voucher = data
        setCurrentVoucherId(voucher.id)
        setSearchParams({ voucher: voucher.id })
      }

      await supabase.from('voucher_cheques').delete().eq('voucher_id', voucher.id)
      if (form.payment_mode === 'Cheque') {
        const rows = cheques
          .filter(row => row.cheque_no || row.cheque_date || row.bank_name || row.in_favour_of || Number(row.amount))
          .map((row, index) => ({
            voucher_id: voucher.id,
            serial_no: index + 1,
            cheque_no: row.cheque_no.trim() || null,
            cheque_date: row.cheque_date || null,
            bank_name: row.bank_name.trim() || null,
            in_favour_of: row.in_favour_of.trim() || null,
            amount: Number(row.amount) || 0,
          }))
        if (rows.length > 0) {
          const { error: chequeError } = await supabase.from('voucher_cheques').insert(rows)
          if (chequeError) throw chequeError
        }
      }

      const updatedVoucher = { ...voucher, status }
      setForm(current => ({ ...current, status }))
      setExistingVouchers(current => {
        const found = current.some(item => item.id === updatedVoucher.id)
        return found
          ? current.map(item => item.id === updatedVoucher.id ? updatedVoucher : item)
          : [...current, updatedVoucher].sort((a, b) => a.installment_no - b.installment_no)
      })
      setMessage(status === 'draft' ? 'Draft saved' : `${isReceipt ? 'Receipt' : 'Payment'} voucher saved`)
      return voucher
    } catch (saveError) {
      setError(saveError.message || `Could not save ${isReceipt ? 'receipt' : 'payment'} voucher`)
      return null
    } finally {
      setSaving(false)
    }
  }

  function handlePrint() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    window.print()
  }

  async function handleDownloadPdf() {
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    setExportingPdf(true)
    setError('')
    let exportElement = null
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const html2pdf = (await import('html2pdf.js')).default
      exportElement = printRef.current.cloneNode(true)
      exportElement.classList.add('voucher-pdf-document')
      exportElement.style.cssText = [
        'display:block',
        'position:relative',
        'left:auto',
        'top:auto',
        'z-index:auto',
        'width:190mm',
        'padding:0',
        'margin:0',
        'background:#fff',
      ].join(';')
      document.body.appendChild(exportElement)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await html2pdf().set({
        margin: [10, 10, 10, 10],
        filename: `${form.voucher_number || (isReceipt ? 'receipt-voucher' : 'payment-voucher')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          backgroundColor: '#ffffff',
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
      }).from(exportElement).save()
      setMessage('PDF downloaded')
    } catch (downloadError) {
      setError(downloadError.message || 'Could not export PDF')
    } finally {
      exportElement?.remove()
      setExportingPdf(false)
      if (searchParams.get('download') === '1') {
        setSearchParams({ voucher: currentVoucherId })
      }
    }
  }

  if (loading) return <div className="empty-state"><p>Loading {isReceipt ? 'receipt' : 'payment'} voucher...</p></div>
  if (error && !application && !isStandalone) return <div className="alert alert-error">{error}</div>
  if (!schemaReady) {
    return (
      <div>
        <button className="btn btn-outline btn-sm" onClick={() => navigate(isStandalone ? '/dashboard' : `/application/${applicationId}`)} style={{ marginBottom:'16px' }}>
          {isStandalone ? 'Back to Dashboard' : 'Back to Application'}
        </button>
        <div className="alert alert-warning">
          <strong>{isReceipt ? 'Receipt' : 'Payment'} Voucher database setup is required.</strong>
          <div style={{ marginTop:'6px' }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="voucher-screen">
        <div className="page-header flex justify-between items-center" style={{ gap:'16px', flexWrap:'wrap' }}>
          <div>
            <button className="btn btn-outline btn-sm" onClick={() => navigate(isStandalone ? '/dashboard' : `/application/${applicationId}`)} style={{ marginBottom:'8px' }}>
              {isStandalone ? 'Back to Dashboard' : 'Back to Application'}
            </button>
            <h1>
              {isReceipt
                ? 'Standalone Receipt Voucher'
                : isStandalone ? 'Standalone Payment Voucher' : 'Payment Voucher'
              }
            </h1>
            <p>
              {isStandalone
                ? `${company?.name || 'Select a company'} | No ${isReceipt ? 'receipt application' : 'payment application'} required`
                : `${application.ref_number} | ${application.company_name} | No approval-stage restriction`
              }
            </p>
          </div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            <button className="btn btn-outline" onClick={() => isStandalone ? startStandaloneVoucher() : startNewVoucher()}>
              {isReceipt ? 'New Receipt Voucher' : isStandalone ? 'New Standalone Voucher' : 'New Partial Voucher'}
            </button>
            <button className="btn btn-outline" disabled={saving} onClick={() => saveVoucher('draft')}>Save Draft</button>
            <button className="btn btn-primary" disabled={saving} onClick={() => saveVoucher('saved')}>
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button className="btn btn-gold" onClick={handlePrint}>Print</button>
            <button className="btn btn-gold" disabled={exportingPdf} onClick={handleDownloadPdf}>
              {exportingPdf ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {message && <div className="alert alert-success">{message}</div>}

        {isStandalone && (
          <div className="card" style={{ marginBottom:'16px' }}>
            <div className="card-body">
              <div className="form-group" style={{ marginBottom:0, maxWidth:'420px' }}>
                <label className="form-label">Company <span className="required">*</span></label>
                <select
                  className="form-control"
                  value={company?.id || ''}
                  disabled={!!currentVoucherId}
                  onChange={event => selectStandaloneCompany(event.target.value)}
                >
                  <option value="">Select company</option>
                  {companies.map(item => (
                    <option key={item.id} value={item.id}>{item.name} ({item.prefix})</option>
                  ))}
                </select>
                {currentVoucherId && <div className="form-hint">Company is fixed after the voucher is saved.</div>}
              </div>
            </div>
          </div>
        )}

        {displayedVouchers.length > 0 && (
          <div className="card" style={{ marginBottom:'16px' }}>
            <div className="card-header">
              <h2>
                {isReceipt
                  ? `Receipt Vouchers - ${company?.name}`
                  : isStandalone ? `Standalone Vouchers - ${company?.name}` : `Vouchers for ${application.ref_number}`
                }
              </h2>
              <span className="text-sm text-muted">{displayedVouchers.length} saved</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Voucher</th><th>Date</th><th>Status</th><th>Amount</th><th></th></tr></thead>
                <tbody>
                  {displayedVouchers.map(voucher => (
                    <tr key={voucher.id}>
                      <td style={{ fontFamily:"'JetBrains Mono',monospace", fontWeight:600 }}>{voucher.voucher_number}</td>
                      <td>{displayDate(voucher.voucher_date)}</td>
                      <td><span className={`badge badge-${voucher.status === 'saved' ? 'approved' : 'draft'}`}>{voucher.status}</span></td>
                      <td>AED {formatCurrency(voucher.amount)}</td>
                      <td><button className="btn btn-outline btn-sm" onClick={() => editVoucher(voucher)}>Open</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {isStandalone ? (
          <div className="stats-row voucher-stats">
            <div className="stat-card"><div className="stat-label">Company</div><div className="stat-value" style={{fontSize:'18px'}}>{company?.prefix || '-'}</div></div>
            <div className="stat-card"><div className="stat-label">{isReceipt ? 'Receipt Vouchers' : 'Standalone Vouchers'}</div><div className="stat-value">{displayedVouchers.length}</div></div>
            <div className="stat-card"><div className="stat-label">Current Voucher</div><div className="stat-value">AED {formatCurrency(currentAmount)}</div></div>
          </div>
        ) : (
          <>
            <div className="stats-row voucher-stats">
              <div className="stat-card"><div className="stat-label">Application Amount</div><div className="stat-value">AED {formatCurrency(application.amount)}</div></div>
              <div className="stat-card"><div className="stat-label">Previously Vouchered</div><div className="stat-value">AED {formatCurrency(previouslyVouchered)}</div></div>
              <div className="stat-card"><div className="stat-label">Available Balance</div><div className="stat-value">AED {formatCurrency(availableBalance)}</div></div>
              <div className="stat-card"><div className="stat-label">Current Voucher</div><div className="stat-value">AED {formatCurrency(currentAmount)}</div></div>
            </div>

            {currentAmount > availableBalance && (
              <div className="alert alert-warning">
                Current voucher exceeds the available application balance by AED {formatCurrency(currentAmount - availableBalance)}. Saving remains allowed.
              </div>
            )}
          </>
        )}

        <div className="card">
          <div className="card-header">
            <h2>Voucher Details</h2>
            <span className={`badge badge-${form.status === 'saved' ? 'approved' : 'draft'}`}>{form.status}</span>
          </div>
          <div className="card-body">
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Voucher Number</label>
                <input className="form-control" value={form.voucher_number} onChange={e => setField('voucher_number', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Voucher Date</label>
                <input type="date" className="form-control" value={form.voucher_date} onChange={e => setField('voucher_date', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Currency</label>
                <input className="form-control" value={form.currency} onChange={e => setField('currency', e.target.value.toUpperCase())} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{isReceipt ? 'Received From' : 'Payee Name'} <span className="required">*</span></label>
                <input className="form-control" value={form.paid_to} onChange={e => {
                  setField('paid_to', e.target.value)
                  if (cheques.length === 1 && !cheques[0].in_favour_of) setCheque(0, 'in_favour_of', e.target.value)
                }} />
              </div>
              <div className="form-group">
                <label className="form-label">Amount <span className="required">*</span></label>
                <input type="number" min="0" step="0.01" className="form-control" value={form.amount} onChange={e => setField('amount', e.target.value)} />
                <div className="form-hint">{amountToWords(currentAmount)}</div>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">{isReceipt ? 'Received Into / Company' : 'Receiving Company'}</label>
                <input className="form-control" value={form.receiving_company} onChange={e => setField('receiving_company', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">{isReceipt ? 'Receipt Mode' : 'Payment Mode'}</label>
                <select className="form-control" value={form.payment_mode} onChange={e => setField('payment_mode', e.target.value)}>
                  <option value="Cheque">Cheque</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cash">Cash</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">{isReceipt ? 'Receipt / Transfer Reference' : 'Payment / Transfer Reference'}</label>
              <input className="form-control" value={form.reference_no} onChange={e => setField('reference_no', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">{isReceipt ? 'Receipt Reason' : 'Payment Reason'}</label>
              <textarea className="form-control" value={form.payment_reason} onChange={e => setField('payment_reason', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea className="form-control" value={form.remarks} onChange={e => setField('remarks', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Description / Narration</label>
              <textarea className="form-control" value={form.narration} onChange={e => setField('narration', e.target.value)} />
            </div>

            {form.payment_mode === 'Cheque' && (
              <div className="voucher-cheques">
                <div className="flex justify-between items-center" style={{ marginBottom:'10px' }}>
                  <div>
                    <h2 style={{ fontSize:'15px' }}>Cheque Details</h2>
                    <p className="text-sm text-muted">Add one or multiple cheques for this voucher.</p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={addCheque}>Add Cheque</button>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Srl</th><th>Cheque #</th><th>Date</th><th>Bank</th><th>{isReceipt ? 'Received From' : 'In Favour Of'}</th><th>Amount</th><th></th></tr></thead>
                    <tbody>
                      {cheques.map((cheque, index) => (
                        <tr key={index}>
                          <td>{index + 1}</td>
                          <td><input className="form-control" value={cheque.cheque_no} onChange={e => setCheque(index, 'cheque_no', e.target.value)} /></td>
                          <td><input type="date" className="form-control" value={cheque.cheque_date} onChange={e => setCheque(index, 'cheque_date', e.target.value)} /></td>
                          <td><input className="form-control" value={cheque.bank_name} onChange={e => setCheque(index, 'bank_name', e.target.value)} /></td>
                          <td><input className="form-control" placeholder={isReceipt ? 'Received from' : ''} value={cheque.in_favour_of} onChange={e => setCheque(index, 'in_favour_of', e.target.value)} /></td>
                          <td><input type="number" min="0" step="0.01" className="form-control" value={cheque.amount} onChange={e => setCheque(index, 'amount', e.target.value)} /></td>
                          <td><button className="btn btn-danger btn-sm" onClick={() => removeCheque(index)}>Remove</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ textAlign:'right', marginTop:'10px', fontWeight:700 }}>
                  Cheque Total: AED {formatCurrency(chequeTotal)}
                </div>
                {chequeMismatch && (
                  <div className="alert alert-warning" style={{ marginTop:'10px', marginBottom:0 }}>
                    Cheque total differs from the voucher amount. Saving remains allowed.
                  </div>
                )}
              </div>
            )}

            <hr className="divider" />
            <div className="form-row-3">
              <div className="form-group">
                <label className="form-label">Prepared By</label>
                <input className="form-control" value={form.prepared_by_name} onChange={e => setField('prepared_by_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Approved By</label>
                <input className="form-control" value={form.approved_by_name} onChange={e => setField('approved_by_name', e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Received By</label>
                <input className="form-control" value={form.received_by_name} onChange={e => setField('received_by_name', e.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <PaymentVoucherPrint
        application={application}
        company={company}
        form={form}
        cheques={cheques}
        profile={profile}
        isReceipt={isReceipt}
        printRef={printRef}
        exportingPdf={exportingPdf}
      />
    </div>
  )
}
