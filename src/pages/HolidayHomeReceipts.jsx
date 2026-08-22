import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { formatCurrency } from '../lib/utils'

const today = () => new Date().toISOString().slice(0, 10)
const localDateValue = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
const empty = () => ({ company_id:'', receipt_number:'', receipt_date:today(), received_from:'', id_passport:'', property_key:'', check_in_date:'', check_out_date:'', rental_payment:'', security_deposit:'', admin_fee:'', additional_service:'', description:'', received_by_name:'', administrator_name:'', accounts_name:'', customer_name:'' })
const historyKey = 'holiday-home-receipt-history'
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]))
const printDate = value => value ? new Intl.DateTimeFormat('en-GB', { weekday:'long', day:'numeric', month:'long', year:'numeric' }).format(new Date(`${value}T00:00:00`)) : ''
const receiptPrintDate = value => {
  if (!value) return ''
  const date = new Date(`${value}T00:00:00`), day = date.getDate()
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th'
  return `${day}${suffix}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
}
const amountInWords = value => {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  const underThousand = number => {
    const hundred = Math.floor(number / 100), rest = number % 100
    return `${hundred ? `${ones[hundred]} Hundred${rest ? ' ' : ''}` : ''}${rest < 20 ? ones[rest] : `${tens[Math.floor(rest / 10)]}${rest % 10 ? ` ${ones[rest % 10]}` : ''}`}`
  }
  const whole = Math.round(Number(value || 0))
  if (!whole) return 'Zero only'
  const millions = Math.floor(whole / 1000000), thousands = Math.floor((whole % 1000000) / 1000), rest = whole % 1000
  return `${millions ? `${underThousand(millions)} Million ` : ''}${thousands ? `${underThousand(thousands)} Thousand ` : ''}${rest ? underThousand(rest) : ''}`.trim() + ' only'
}

export default function HolidayHomeReceipts() {
  const { user, profile, moduleAccess } = useAuth()
  const [rows, setRows] = useState([])
  const [companies, setCompanies] = useState([])
  const [createCompanyIds, setCreateCompanyIds] = useState([])
  const [properties, setProperties] = useState([])
  const [applicationClasses, setApplicationClasses] = useState([])
  const [usersById, setUsersById] = useState({})
  const [form, setForm] = useState(empty)
  const [editingId, setEditingId] = useState(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const [quick, setQuick] = useState('')
  const [nightInput, setNightInput] = useState('')
  const [propertyDisplay, setPropertyDisplay] = useState('')
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem(historyKey) || '{}') } catch { return {} } })
  const [dashboardSearch, setDashboardSearch] = useState('')
  const [dashboardCompany, setDashboardCompany] = useState('')
  const [dashboardFrom, setDashboardFrom] = useState('')
  const [dashboardTo, setDashboardTo] = useState('')
  const [dashboardPreparedBy, setDashboardPreparedBy] = useState('')
  const [dashboardStatus, setDashboardStatus] = useState('')
  const [insight, setInsight] = useState(null)
  const [sortDirection, setSortDirection] = useState('asc')

  const set = (key, value) => setForm(current => ({ ...current, [key]:value }))
  const guests = useMemo(() => (history.guests || []).map(item => {
    if (typeof item !== 'string') return item
    try { return JSON.parse(item) } catch { return { name:item, id:'' } }
  }).filter(item => item?.name), [history])

  const load = async () => {
    const [r, c, a, p, users, classes] = await Promise.all([
      supabase.from('holiday_home_receipts').select('*').order('receipt_date', { ascending:false }),
      supabase.from('companies').select('id,name,prefix,holiday_receipt_header_url').eq('active', true),
      supabase.from('user_companies').select('company_id').eq('user_id', user.id),
      supabase.from('cheque_flow_properties').select('property_key,property_unit,entity,display_bedrooms').order('property_key'),
      supabase.from('users').select('id,full_name'),
      supabase.from('application_classes').select('name').eq('active', true).order('name'),
    ])
    if (r.error) setError(r.error.message)
    const ids = new Set((a.data || []).map(item => item.company_id))
    const allowed = (c.data || []).filter(item => ids.has(item.id))
    setRows(r.data || [])
    // Keep all company names available for supervised receipt history, while
    // restricting new receipts to the supervisor's own company assignments.
    setCompanies(c.data || [])
    setCreateCompanyIds([...ids])
    setProperties(p.data || [])
    setApplicationClasses(classes.data || [])
    setUsersById(Object.fromEntries((users.data || []).map(item => [item.id, item.full_name])))
    if (allowed.length === 1) setForm(current => current.company_id ? current : { ...current, company_id:allowed[0].id })
  }

  useEffect(() => { if (user?.id) load() }, [user?.id])
  const createCompanies = companies.filter(item => createCompanyIds.includes(item.id))
  const company = companies.find(item => item.id === form.company_id)
  const choices = properties.filter(item => !company || [company.prefix, company.name].some(value => String(item.entity || '').toLowerCase().includes(String(value).toLowerCase())))
  const nights = useMemo(() => form.check_in_date && form.check_out_date ? Math.max(0, Math.round((new Date(`${form.check_out_date}T00:00:00`) - new Date(`${form.check_in_date}T00:00:00`)) / 86400000)) : 0, [form.check_in_date, form.check_out_date])
  const total = ['rental_payment', 'security_deposit', 'admin_fee', 'additional_service'].reduce((sum, key) => sum + Number(form[key] || 0), 0)
  const canCreate = ['superadmin','supervisor'].includes(profile?.role) || moduleAccess.includes('holiday_home_receipts') || profile?.holiday_home_receipts_enabled === true
  const isFinance = profile?.role === 'finance'
  const filteredRows = useMemo(() => {
    const term = dashboardSearch.trim().toLowerCase()
    return rows.filter(receipt => {
      const property = receipt.property_display || properties.find(item => item.property_key === receipt.property_key)?.property_unit || receipt.property_key
      const companyName = companies.find(item => item.id === receipt.company_id)?.name || ''
      const receiptTotal = Number(receipt.rental_payment || 0) + Number(receipt.security_deposit || 0) + Number(receipt.admin_fee || 0) + Number(receipt.additional_service || 0)
      const matchesTerm = !term || [receipt.receipt_number, receipt.received_from, receipt.id_passport, property, companyName, receipt.description, receiptTotal, formatCurrency(receiptTotal), receipt.rental_payment, receipt.security_deposit, receipt.admin_fee, receipt.additional_service].some(value => String(value || '').toLowerCase().includes(term))
      const matchesCompany = !dashboardCompany || receipt.company_id === dashboardCompany
      const matchesFrom = !dashboardFrom || receipt.receipt_date >= dashboardFrom
      const matchesTo = !dashboardTo || receipt.receipt_date <= dashboardTo
      const matchesPreparedBy = !dashboardPreparedBy || receipt.created_by === dashboardPreparedBy
      const matchesStatus = !dashboardStatus || (receipt.status || 'pending') === dashboardStatus
      return matchesTerm && matchesCompany && matchesFrom && matchesTo && matchesPreparedBy && matchesStatus
    })
      .sort((left, right) => {
        const leftName = usersById[left.created_by] || ''
        const rightName = usersById[right.created_by] || ''
        return leftName.localeCompare(rightName) * (sortDirection === 'asc' ? 1 : -1)
      })
  }, [rows, properties, companies, usersById, dashboardSearch, dashboardCompany, dashboardFrom, dashboardTo, dashboardPreparedBy, dashboardStatus, sortDirection])
  const reportSummary = useMemo(() => {
    const sum = list => list.filter(item => item.status !== 'void').reduce((totalAmount, item) => totalAmount + Number(item.rental_payment || 0) + Number(item.security_deposit || 0) + Number(item.admin_fee || 0) + Number(item.additional_service || 0), 0)
    const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
    const startOfWeek = new Date(startOfToday); startOfWeek.setDate(startOfWeek.getDate() - 6)
    const todayKey = localDateValue(startOfToday), weekKey = localDateValue(startOfWeek)
    const daily = filteredRows.filter(item => item.receipt_date === todayKey)
    const weekly = filteredRows.filter(item => item.receipt_date >= weekKey && item.receipt_date <= todayKey)
    return { daily, weekly, dailyTotal:sum(daily), weeklyTotal:sum(weekly), pending:filteredRows.filter(item => item.status === 'pending').length }
  }, [filteredRows])
  const insightRows = useMemo(() => {
    if (!insight) return []
    if (insight === 'today') return reportSummary.daily
    if (insight === 'week') return reportSummary.weekly
    if (insight === 'pending') return filteredRows.filter(item => (item.status || 'pending') === 'pending')
    return []
  }, [insight, reportSummary, filteredRows])

  const remember = (key, value) => {
    value = String(value || '').trim()
    if (!value) return
    const next = { ...history, [key]:[value, ...(history[key] || []).filter(item => String(item).toLowerCase() !== value.toLowerCase())].slice(0, 20) }
    setHistory(next)
    localStorage.setItem(historyKey, JSON.stringify(next))
  }
  const rememberGuest = () => {
    const guest = { name:form.received_from.trim(), id:form.id_passport.trim() }
    if (!guest.name) return
    const next = { ...history, guests:[guest, ...guests.filter(item => item.name.toLowerCase() !== guest.name.toLowerCase())].slice(0, 20) }
    setHistory(next)
    localStorage.setItem(historyKey, JSON.stringify(next))
  }

  const openNew = async () => {
    const next = empty()
    next.received_by_name = profile?.full_name || ''
    if (createCompanies.length === 1) {
      next.company_id = createCompanies[0].id
      const { data } = await supabase.rpc('next_holiday_home_receipt_number', { p_company_id:createCompanies[0].id })
      next.receipt_number = data || ''
    }
    setForm(next); setEditingId(null); setNightInput(''); setPropertyDisplay(''); setQuick(''); setError(''); setOpen(true)
  }
  const openEdit = receipt => {
    setForm({ ...empty(), ...receipt })
    setEditingId(receipt.id)
    setPropertyDisplay(receipt.property_display || properties.find(item => item.property_key === receipt.property_key)?.property_unit || receipt.property_key)
    setNightInput(String(receipt.nights ?? ''))
    setQuick(''); setError(''); setOpen(true)
  }
  const chooseCompany = async id => {
    set('company_id', id); set('property_key', ''); setPropertyDisplay('')
    const { data } = await supabase.rpc('next_holiday_home_receipt_number', { p_company_id:id })
    set('receipt_number', data || '')
  }
  const setNights = value => {
    setNightInput(value)
    if (!form.check_in_date || value === '') return
    const date = new Date(`${form.check_in_date}T00:00:00`)
    date.setDate(date.getDate() + Math.max(0, Number(value)))
    set('check_out_date', localDateValue(date))
  }
  const chooseGuest = value => {
    const guest = guests.find(item => item.name === value)
    setForm(current => ({ ...current, received_from:value, customer_name:value, id_passport:guest?.id || current.id_passport }))
  }
  const chooseProperty = value => {
    // Application Classes are the canonical apartment/property names. Store the
    // selected name in the existing property key so no receipt migration is needed.
    const foundClass = applicationClasses.find(item => item.name === value)
    const found = choices.find(item => item.property_unit === value || item.property_key === value)
    setPropertyDisplay(value)
    set('property_key', foundClass?.name || found?.property_key || '')
  }
  const autofill = () => {
    const match = quick.match(/^\s*(.*?)\s*,\s*(.*?)\s*\((\d{4}-\d\d-\d\d)\s+\d\d:\d\d\s*-\s*(\d{4}-\d\d-\d\d)\s+\d\d:\d\d\)\s*$/)
    if (!match) return setError('Use: Guest, Property (YYYY-MM-DD HH:MM - YYYY-MM-DD HH:MM)')
    const [, guest, place, inDate, outDate] = match
    const needle = place.trim().toLowerCase()
    const foundClass = applicationClasses.find(item => item.name.toLowerCase().includes(needle) || needle.includes(item.name.toLowerCase()))
    const found = properties.find(item => `${item.property_key} ${item.property_unit || ''}`.toLowerCase().includes(needle) || needle.includes(String(item.property_unit || '').toLowerCase()))
    const guestMatch = guests.find(item => item.name.toLowerCase() === guest.trim().toLowerCase())
    setPropertyDisplay(foundClass?.name || found?.property_unit || place.trim())
    setForm(current => ({ ...current, received_from:guest.trim(), customer_name:guest.trim(), id_passport:guestMatch?.id || current.id_passport, property_key:foundClass?.name || found?.property_key || '', check_in_date:inDate, check_out_date:outDate, description:place.trim() }))
    setNightInput(String(Math.max(0, Math.round((new Date(`${outDate}T00:00:00`) - new Date(`${inDate}T00:00:00`)) / 86400000))))
    setError('')
  }
  const save = async event => {
    event.preventDefault()
    if (!form.company_id || !form.received_from || !form.property_key || !form.check_in_date || !form.check_out_date || nights < 0) return setError('Enter company, guest, property, check-in and check-out.')
    const selectedProperty = properties.find(item => item.property_key === form.property_key)
    const payload = { ...form, property_display:selectedProperty?.property_unit || propertyDisplay || form.property_key, nights, rental_payment:Number(form.rental_payment || 0), security_deposit:Number(form.security_deposit || 0), admin_fee:Number(form.admin_fee || 0), additional_service:Number(form.additional_service || 0), updated_by:user.id }
    const query = editingId
      ? supabase.from('holiday_home_receipts').update(payload).eq('id', editingId)
      : supabase.from('holiday_home_receipts').insert({ ...payload, created_by:user.id })
    const { error:saveError } = await query
    if (saveError) return setError(saveError.message)
    rememberGuest()
    ;['received_by_name', 'administrator_name', 'accounts_name', 'customer_name'].forEach(key => remember(key, form[key]))
    setOpen(false); setEditingId(null); load()
  }
  const acknowledge = async receipt => {
    if (!confirm(`Acknowledge ${receipt.receipt_number} after physical fund verification? It will be locked for the GRO.`)) return
    const { error:actionError } = await supabase.from('holiday_home_receipts').update({ status:'acknowledged', acknowledged_by:user.id, acknowledged_at:new Date().toISOString(), updated_by:user.id }).eq('id', receipt.id)
    if (actionError) return setError(actionError.message)
    load()
  }
  const voidReceipt = async receipt => {
    const reason = prompt(`Void ${receipt.receipt_number}. A void reason is required:`)
    if (!reason?.trim()) return
    const { error:actionError } = await supabase.from('holiday_home_receipts').update({ status:'void', voided_by:user.id, voided_at:new Date().toISOString(), void_reason:reason.trim(), updated_by:user.id }).eq('id', receipt.id)
    if (actionError) return setError(actionError.message)
    load()
  }
  const printReceipt = async receipt => {
    const property = properties.find(item => item.property_key === receipt.property_key) || { property_unit:receipt.property_display }
    const receiptCompany = companies.find(item => item.id === receipt.company_id)
    const win = window.open('', '_blank')
    if (!win) return
    let header = `${window.location.origin}/holiday-home-receipt-header.png`
    if (receiptCompany?.holiday_receipt_header_url) {
      const { data } = await supabase.storage.from('attachments').createSignedUrl(`receipt-headers/${receipt.company_id}.png`, 3600)
      header = data?.signedUrl || header
    }
    const amount = Number(receipt.rental_payment) + Number(receipt.security_deposit) + Number(receipt.admin_fee) + Number(receipt.additional_service)
    const blankLines = '<tr class="blank"><td colspan="5">&nbsp;</td></tr>'.repeat(4)
    win.document.write(`<title>${escapeHtml(receipt.receipt_number)}</title><style>@page{size:A4 portrait;margin:10mm}body{font-family:Georgia,'Times New Roman',serif;max-width:190mm;margin:auto;color:#111;font-size:12px}.receipt-header{width:100%;height:24mm;object-fit:contain;display:block}.receipt-meta{display:flex;justify-content:space-between;align-items:center;margin:1mm 4mm 2mm;font-size:13px}.receipt-title{text-align:center;font-size:22px;font-weight:700;letter-spacing:.5px;margin:2mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #1f2b35;padding:3px 5px;vertical-align:middle}th{text-align:center;font-size:12px;font-weight:700}.entry{font-size:14px;font-weight:600;min-height:18px}.received-line{font-size:14px}.received-line b{margin-left:9px}.stay-wrap{padding:0!important}.stay-grid{width:100%;border-collapse:collapse;table-layout:fixed}.stay-grid th,.stay-grid td{border:0;border-right:1px solid #1f2b35;padding:3px 5px;text-align:center}.stay-grid th:last-child,.stay-grid td:last-child{border-right:0}.stay-grid th{border-bottom:1px solid #1f2b35}.amount{text-align:center;font-size:14px;font-weight:600}.sum-label{font-size:14px;font-weight:700}.description{height:18px;vertical-align:top}.blank td{height:18px}.signatures{display:grid;grid-template-columns:repeat(4,1fr);gap:9mm;margin-top:17mm}.signature{border-top:1px solid #222;padding-top:3px;text-align:center;min-height:24px}.sign-name{font-weight:600;min-height:16px}.note{margin-top:3mm;font-size:11px}@media print{body{margin:0}}</style><img class="receipt-header" src="${escapeHtml(header)}"><div class="receipt-meta"><span>No: <b>${escapeHtml(receipt.receipt_number)}</b></span><span>Date: <b>${escapeHtml(receiptPrintDate(receipt.receipt_date))}</b></span></div><div class="receipt-title">RECEIPT</div><table><colgroup><col style="width:27%"><col style="width:16%"><col style="width:19%"><col style="width:19%"><col style="width:19%"></colgroup><tr><td colspan="5" class="received-line">Received From:<b>${escapeHtml(receipt.received_from)}</b></td></tr><tr><td colspan="2" class="received-line">ID / Passport Number:<b>${escapeHtml(receipt.id_passport)}</b></td><td colspan="3" class="received-line">Apartment:<b>${escapeHtml(property.property_unit || receipt.property_key)}</b></td></tr><tr><td colspan="5" class="stay-wrap"><table class="stay-grid"><tr><th>Check in Date</th><th>Check out Date</th><th>Nights</th></tr><tr><td class="entry">${escapeHtml(printDate(receipt.check_in_date))}</td><td class="entry">${escapeHtml(printDate(receipt.check_out_date))}</td><td class="entry">${escapeHtml(receipt.nights)}</td></tr></table></td></tr><tr><th>Rental Payment</th><th>Security Deposit</th><th>Admin Fee</th><th>Additional Service</th><th>Total Amount</th></tr><tr><td class="amount">${Number(receipt.rental_payment) ? `AED ${formatCurrency(receipt.rental_payment)}` : ''}</td><td class="amount">${Number(receipt.security_deposit) ? `AED ${formatCurrency(receipt.security_deposit)}` : ''}</td><td class="amount">${Number(receipt.admin_fee) ? `AED ${formatCurrency(receipt.admin_fee)}` : ''}</td><td class="amount">${Number(receipt.additional_service) ? `AED ${formatCurrency(receipt.additional_service)}` : ''}</td><td class="amount">AED ${formatCurrency(amount)}</td></tr><tr><td class="sum-label">The Sum of Dhs.</td><td colspan="4" class="entry">${escapeHtml(amountInWords(amount))}</td></tr><tr><th colspan="5">Description</th></tr><tr><td colspan="5" class="description">${escapeHtml(receipt.description)}</td></tr>${blankLines}</table><div class="signatures"><div class="signature"><div class="sign-name">${escapeHtml(receipt.received_by_name)}</div>Received By</div><div class="signature"><div class="sign-name">${escapeHtml(receipt.customer_name)}</div>Customer</div><div class="signature"><div class="sign-name">${escapeHtml(receipt.accounts_name)}</div>Accounts</div><div class="signature"><div class="sign-name">${escapeHtml(receipt.administrator_name)}</div>Administrator</div></div><div class="note">In case of cancellation - Security Deposit is non-refundable.</div><script>window.onload=()=>window.print()<\/script>`)
    win.document.close()
  }

  return <div>
    <div className="page-header flex justify-between items-center"><div><h1>Holiday Home Receipts</h1><p>Guest stay and rental receipts</p></div>{canCreate && <button className="btn btn-primary" onClick={openNew}>New Holiday Home Receipt</button>}</div>
    {error && <div className="alert alert-error">{error}</div>}
    {open && <form className="card" onSubmit={save}><div className="card-header"><h2>Holiday Home Receipt</h2></div><div className="card-body">
      <label className="form-group"><span className="form-label">Quick stay entry</span><div style={{display:'flex',gap:8}}><input className="form-control" value={quick} onChange={event => setQuick(event.target.value)} placeholder="Emel C, Imperial Ave 3405 (2026-07-21 15:00 - 2026-07-24 11:00)"/><button className="btn btn-outline" type="button" onClick={autofill}>Auto fill</button></div></label>
      <div className="form-row-3"><label className="form-group">Company<select className="form-control" required value={form.company_id} onChange={event => chooseCompany(event.target.value)}><option value="">Select company</option>{createCompanies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-group">Receipt No.<input className="form-control" readOnly value={form.receipt_number}/></label><label className="form-group">Date<input className="form-control" type="date" value={form.receipt_date} onChange={event => set('receipt_date', event.target.value)}/></label></div>
      <div className="form-row"><label className="form-group">Received From<input className="form-control" required list="received-from-list" value={form.received_from} onChange={event => chooseGuest(event.target.value)}/><datalist id="received-from-list">{guests.map(item => <option key={item.name} value={item.name}/>)}</datalist></label><label className="form-group">ID / Passport<input className="form-control" value={form.id_passport} onChange={event => set('id_passport', event.target.value)}/></label></div>
      <div className="form-row-3"><label className="form-group">Apartment / Property (Class)<select className="form-control" required value={propertyDisplay} onChange={event => chooseProperty(event.target.value)}><option value="">Select apartment / property</option>{applicationClasses.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select><span className="form-hint">Uses the Application Classes list.</span></label><label className="form-group">Check-in<input className="form-control" type="date" value={form.check_in_date} onChange={event => set('check_in_date', event.target.value)}/></label><label className="form-group">Check-out / Nights<input className="form-control" type="date" value={form.check_out_date} onChange={event => set('check_out_date', event.target.value)}/><input className="form-control" type="number" min="0" placeholder="Number of nights" value={nightInput} onChange={event => setNights(event.target.value)}/><span className="form-hint">{nights} night(s)</span></label></div>
      <div className="form-row-3">{[['Rental Payment','rental_payment'],['Security Deposit','security_deposit'],['Admin Fee','admin_fee'],['Additional Service','additional_service']].map(([label, key]) => <label className="form-group" key={key}>{label}<input className="form-control" type="number" min="0" value={form[key]} onChange={event => set(key, event.target.value)}/></label>)}<div className="form-group"><span className="form-label">Total</span><div className="form-control">AED {formatCurrency(total)}</div></div></div>
      <label className="form-group">Description<textarea className="form-control" value={form.description} onChange={event => set('description', event.target.value)}/></label><div className="form-row-3">{[['Received By','received_by_name'],['Administrator','administrator_name'],['Accounts','accounts_name'],['Customer','customer_name']].map(([label, key]) => <label className="form-group" key={key}>{label}<input className="form-control" list={`${key}-list`} value={form[key]} onChange={event => set(key, event.target.value)}/><datalist id={`${key}-list`}>{(history[key] || []).map(item => <option key={item} value={item}/>)}</datalist></label>)}</div>
      <button className="btn btn-primary">{editingId ? 'Save Changes' : 'Save Receipt'}</button><button type="button" className="btn btn-outline" style={{marginLeft:8}} onClick={() => { setOpen(false); setEditingId(null) }}>Cancel</button>
    </div></form>}
    <div className="form-row-3" style={{marginBottom:16}}><button type="button" className="card" style={{textAlign:'left',cursor:'pointer'}} onClick={() => setInsight('today')}><div className="card-body"><b>Today</b><div>{reportSummary.daily.length} receipts</div><strong>AED {formatCurrency(reportSummary.dailyTotal)}</strong></div></button><button type="button" className="card" style={{textAlign:'left',cursor:'pointer'}} onClick={() => setInsight('week')}><div className="card-body"><b>Last 7 days</b><div>{reportSummary.weekly.length} receipts</div><strong>AED {formatCurrency(reportSummary.weeklyTotal)}</strong></div></button><button type="button" className="card" style={{textAlign:'left',cursor:'pointer'}} onClick={() => setInsight('pending')}><div className="card-body"><b>Awaiting Finance acknowledgement</b><div>{reportSummary.pending} receipt(s)</div></div></button></div>
    {insight && <div className="modal-backdrop" onClick={() => setInsight(null)}><div className="modal" style={{maxWidth:900}} onClick={event => event.stopPropagation()}><div className="modal-header"><h2>{insight==='today' ? 'Today\'s receipts' : insight==='week' ? 'Last 7 days' : 'Awaiting Finance acknowledgement'}</h2><button className="btn btn-outline btn-sm" onClick={() => setInsight(null)}>Close</button></div><div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Guest</th><th>Prepared by</th><th>Amount</th><th>Status</th><th /></tr></thead><tbody>{insightRows.map(receipt => <tr key={receipt.id}><td>{receipt.receipt_number}</td><td>{receipt.receipt_date}</td><td>{receipt.received_from}</td><td>{usersById[receipt.created_by] || '-'}</td><td>AED {formatCurrency(Number(receipt.rental_payment)+Number(receipt.security_deposit)+Number(receipt.admin_fee)+Number(receipt.additional_service))}</td><td>{receipt.status || 'pending'}</td><td><button className="btn btn-outline btn-sm" onClick={() => printReceipt(receipt)}>Print / PDF</button>{isFinance && (receipt.status || 'pending')==='pending' && <button className="btn btn-primary btn-sm" style={{marginLeft:5}} onClick={() => acknowledge(receipt)}>Acknowledge</button>}{isFinance && (receipt.status || 'pending')!=='void' && <button className="btn btn-outline btn-sm" style={{marginLeft:5}} onClick={() => voidReceipt(receipt)}>Void</button>}</td></tr>)}{!insightRows.length && <tr><td colSpan="7" style={{textAlign:'center',padding:22}}>No receipts in this report.</td></tr>}</tbody></table></div></div></div>}
    {isFinance && rows.some(receipt => (receipt.status || 'pending') === 'pending') && <div className="card" style={{marginBottom:16}}><div className="card-header"><h2>Finance acknowledgement queue</h2></div><div className="card-body">{rows.filter(receipt => (receipt.status || 'pending') === 'pending').map(receipt => <div key={receipt.id} style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}><b>{receipt.receipt_number}</b><span>{receipt.received_from}</span><span className="text-muted">AED {formatCurrency(Number(receipt.rental_payment)+Number(receipt.security_deposit)+Number(receipt.admin_fee)+Number(receipt.additional_service))}</span><button className="btn btn-primary btn-sm" onClick={() => acknowledge(receipt)}>Acknowledge</button><button className="btn btn-outline btn-sm" onClick={() => voidReceipt(receipt)}>Void</button></div>)}</div></div>}
    {rows.some(receipt => receipt.created_by === user.id && (receipt.status || 'pending') === 'pending') && <div className="card" style={{marginBottom:16}}><div className="card-header"><h2>My editable receipts</h2></div><div className="card-body">{rows.filter(receipt => receipt.created_by === user.id && (receipt.status || 'pending') === 'pending').map(receipt => <div key={receipt.id} style={{display:'flex',gap:8,alignItems:'center',marginBottom:8,flexWrap:'wrap'}}><b>{receipt.receipt_number}</b><span>{receipt.received_from}</span><button className="btn btn-outline btn-sm" onClick={() => openEdit(receipt)}>Edit</button><button className="btn btn-outline btn-sm" onClick={() => printReceipt(receipt)}>Print / PDF</button></div>)}</div></div>}
    <div className="card"><div className="card-header"><h2>Receipts</h2><span className="text-muted">{filteredRows.length} shown</span></div><div className="card-body" style={{paddingBottom:0}}><div className="form-row-3"><label className="form-group">Search<input className="form-control" value={dashboardSearch} onChange={event => setDashboardSearch(event.target.value)} placeholder="Receipt, guest, property, ID, description or amount"/></label><label className="form-group">Company<select className="form-control" value={dashboardCompany} onChange={event => setDashboardCompany(event.target.value)}><option value="">All assigned companies</option>{companies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="form-group">Prepared By<select className="form-control" value={dashboardPreparedBy} onChange={event => setDashboardPreparedBy(event.target.value)}><option value="">All preparers</option>{Object.entries(usersById).sort(([,a],[,b]) => a.localeCompare(b)).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label><label className="form-group">Receipt date range<div style={{display:'flex',gap:8}}><input className="form-control" type="date" value={dashboardFrom} onChange={event => setDashboardFrom(event.target.value)}/><input className="form-control" type="date" value={dashboardTo} onChange={event => setDashboardTo(event.target.value)}/></div></label></div><button className="btn btn-outline btn-sm" type="button" onClick={() => { setDashboardSearch(''); setDashboardCompany(''); setDashboardPreparedBy(''); setDashboardFrom(''); setDashboardTo('') }}>Clear search</button></div><div className="table-wrap"><table><thead><tr><th>Receipt</th><th>Date</th><th>Company</th><th>Guest</th><th>Property</th><th>Nights</th><th>Amount</th><th><button type="button" onClick={() => setSortDirection(current => current === 'asc' ? 'desc' : 'asc')} style={{border:0,background:'transparent',font:'inherit',color:'inherit',cursor:'pointer'}}>Prepared By {sortDirection === 'asc' ? '↑' : '↓'}</button></th><th /></tr></thead><tbody>{filteredRows.map(receipt => <tr key={receipt.id}><td>{receipt.receipt_number}</td><td>{receipt.receipt_date}</td><td>{companies.find(item => item.id === receipt.company_id)?.name || '—'}</td><td>{receipt.received_from}</td><td>{properties.find(item => item.property_key === receipt.property_key)?.property_unit || receipt.property_key}</td><td>{receipt.nights}</td><td>AED {formatCurrency(Number(receipt.rental_payment) + Number(receipt.security_deposit) + Number(receipt.admin_fee) + Number(receipt.additional_service))}</td><td>{usersById[receipt.created_by] || '—'}</td><td><button className="btn btn-outline btn-sm" onClick={() => printReceipt(receipt)}>Print / PDF</button></td></tr>)}{!filteredRows.length && <tr><td colSpan="9" className="text-muted" style={{textAlign:'center',padding:24}}>No receipts match the selected search.</td></tr>}</tbody></table></div></div>
  </div>
}
