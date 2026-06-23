import { useMemo, useRef, useState } from 'react'

const HISTORY_PREFIX = 'qbo_posting_history_'
const DEFAULTS_PREFIX = 'qbo_posting_defaults_'
const LAST_BACKUP_KEY = 'qbo_posting_last_backup'
const VOUCHER_HISTORY_KEY = 'voucher_name_history'
const VOUCHER_LAST_BACKUP_KEY = 'voucher_name_history_last_backup'

function readQboStorage() {
  const companies = {}
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index)
    if (!key?.startsWith(HISTORY_PREFIX) && !key?.startsWith(DEFAULTS_PREFIX)) continue
    const isHistory = key.startsWith(HISTORY_PREFIX)
    const companyId = key.slice((isHistory ? HISTORY_PREFIX : DEFAULTS_PREFIX).length)
    if (!companyId) continue
    try {
      companies[companyId] = companies[companyId] || {}
      companies[companyId][isHistory ? 'history' : 'defaults'] = JSON.parse(localStorage.getItem(key) || '{}')
    } catch {}
  }
  return companies
}

function uniqueRecent(imported = [], existing = []) {
  const values = [...imported, ...existing]
    .map(value => String(value || '').trim())
    .filter(Boolean)
  return values.filter((value, index) =>
    values.findIndex(item => item.toLowerCase() === value.toLowerCase()) === index
  ).slice(0, 25)
}

function readVoucherStorage() {
  try {
    const parsed = JSON.parse(localStorage.getItem(VOUCHER_HISTORY_KEY) || '{}')
    return {
      payees: Array.isArray(parsed.payees) ? parsed.payees : [],
      receivingCompanies: Array.isArray(parsed.receivingCompanies) ? parsed.receivingCompanies : [],
      preparedBy: Array.isArray(parsed.preparedBy) ? parsed.preparedBy : [],
      approvedBy: Array.isArray(parsed.approvedBy) ? parsed.approvedBy : [],
      receivedBy: Array.isArray(parsed.receivedBy) ? parsed.receivedBy : [],
    }
  } catch {
    return { payees: [], receivingCompanies: [], preparedBy: [], approvedBy: [], receivedBy: [] }
  }
}

function mergeHistory(imported = {}, existing = {}) {
  return {
    debitAccounts: uniqueRecent(imported.debitAccounts, existing.debitAccounts),
    creditAccounts: uniqueRecent(imported.creditAccounts, existing.creditAccounts),
    taxes: uniqueRecent(imported.taxes, existing.taxes),
    classes: uniqueRecent(imported.classes, existing.classes),
  }
}

function mergeVoucherHistory(imported = {}, existing = {}) {
  return {
    payees: uniqueRecent(imported.payees, existing.payees),
    receivingCompanies: uniqueRecent(imported.receivingCompanies, existing.receivingCompanies),
    preparedBy: uniqueRecent(imported.preparedBy, existing.preparedBy),
    approvedBy: uniqueRecent(imported.approvedBy, existing.approvedBy),
    receivedBy: uniqueRecent(imported.receivedBy, existing.receivedBy),
  }
}

function countValues(companies) {
  return Object.values(companies).reduce((total, entry) => {
    const history = entry.history || {}
    return total +
      (history.debitAccounts?.length || 0) +
      (history.creditAccounts?.length || 0) +
      (history.taxes?.length || 0) +
      (history.classes?.length || 0)
  }, 0)
}

function countVoucherValues(history) {
  return (history.payees?.length || 0) +
    (history.receivingCompanies?.length || 0) +
    (history.preparedBy?.length || 0) +
    (history.approvedBy?.length || 0) +
    (history.receivedBy?.length || 0)
}

export default function QboSettings() {
  const fileRef = useRef()
  const voucherFileRef = useRef()
  const [replaceExisting, setReplaceExisting] = useState(false)
  const [message, setMessage] = useState({ type:'', text:'' })
  const [revision, setRevision] = useState(0)

  const companies = useMemo(() => readQboStorage(), [revision])
  const voucherHistory = useMemo(() => readVoucherStorage(), [revision])
  const companyCount = Object.keys(companies).length
  const valueCount = countValues(companies)
  const voucherValueCount = countVoucherValues(voucherHistory)
  const lastBackup = localStorage.getItem(LAST_BACKUP_KEY)
  const voucherLastBackup = localStorage.getItem(VOUCHER_LAST_BACKUP_KEY)

  function downloadBackup() {
    const backup = {
      type: 'payment-app-qbo-local-data',
      version: 1,
      exported_at: new Date().toISOString(),
      companies,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `qbo-posting-data-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    localStorage.setItem(LAST_BACKUP_KEY, backup.exported_at)
    setRevision(value => value + 1)
    setMessage({ type:'success', text:`Downloaded QBO backup for ${companyCount} company record(s).` })
  }

  function downloadVoucherBackup() {
    const backup = {
      type: 'payment-app-voucher-local-data',
      version: 1,
      exported_at: new Date().toISOString(),
      history: voucherHistory,
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type:'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `voucher-local-data-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    localStorage.setItem(VOUCHER_LAST_BACKUP_KEY, backup.exported_at)
    setRevision(value => value + 1)
    setMessage({ type:'success', text:`Downloaded voucher local data backup with ${voucherValueCount} remembered value(s).` })
  }

  async function restoreBackup(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage({ type:'', text:'' })

    try {
      const backup = JSON.parse(await file.text())
      if (backup?.type !== 'payment-app-qbo-local-data' || backup?.version !== 1 || !backup?.companies) {
        throw new Error('This is not a valid Payment App QBO backup file.')
      }

      if (replaceExisting) {
        const keysToDelete = []
        for (let index = 0; index < localStorage.length; index += 1) {
          const key = localStorage.key(index)
          if (key?.startsWith(HISTORY_PREFIX) || key?.startsWith(DEFAULTS_PREFIX)) keysToDelete.push(key)
        }
        keysToDelete.forEach(key => localStorage.removeItem(key))
      }

      Object.entries(backup.companies).forEach(([companyId, imported]) => {
        const historyKey = `${HISTORY_PREFIX}${companyId}`
        const defaultsKey = `${DEFAULTS_PREFIX}${companyId}`
        let existingHistory = {}
        try { existingHistory = JSON.parse(localStorage.getItem(historyKey) || '{}') } catch {}

        const history = replaceExisting
          ? mergeHistory(imported.history || {}, {})
          : mergeHistory(imported.history || {}, existingHistory)
        localStorage.setItem(historyKey, JSON.stringify(history))

        const importedDefaults = imported.defaults || {}
        const defaults = {
          debitAccount: history.debitAccounts[0] || importedDefaults.debitAccount || '',
          creditAccount: history.creditAccounts[0] || importedDefaults.creditAccount || '',
          tax: history.taxes[0] || importedDefaults.tax || '',
          qboClass: history.classes[0] || importedDefaults.qboClass || '',
        }
        localStorage.setItem(defaultsKey, JSON.stringify(defaults))
      })

      setRevision(value => value + 1)
      setMessage({
        type:'success',
        text:`QBO data ${replaceExisting ? 'replaced' : 'merged'} successfully from ${file.name}.`,
      })
    } catch (error) {
      setMessage({ type:'error', text:error.message || 'Could not restore QBO backup.' })
    }
  }

  async function restoreVoucherBackup(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage({ type:'', text:'' })

    try {
      const backup = JSON.parse(await file.text())
      if (backup?.type !== 'payment-app-voucher-local-data' || backup?.version !== 1 || !backup?.history) {
        throw new Error('This is not a valid Payment App voucher local data backup file.')
      }

      const existing = replaceExisting ? {} : readVoucherStorage()
      const history = mergeVoucherHistory(backup.history || {}, existing)
      localStorage.setItem(VOUCHER_HISTORY_KEY, JSON.stringify(history))
      setRevision(value => value + 1)
      setMessage({
        type:'success',
        text:`Voucher local data ${replaceExisting ? 'replaced' : 'merged'} successfully from ${file.name}.`,
      })
    } catch (error) {
      setMessage({ type:'error', text:error.message || 'Could not restore voucher local data backup.' })
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Finance Local Settings</h1>
        <p>Finance-owned local suggestions and portable backups</p>
      </div>

      {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}

      <label style={{
        display:'flex',alignItems:'flex-start',gap:'8px',padding:'12px',
        border:'1px solid var(--border-2)',borderRadius:'var(--radius-sm)',background:'var(--cream)',
        marginBottom:'18px',
      }}>
        <input type="checkbox" checked={replaceExisting}
          onChange={event => setReplaceExisting(event.target.checked)}
          style={{marginTop:'3px'}} />
        <span>
          <strong style={{display:'block',fontSize:'12px'}}>Replace existing local data during restore</strong>
          <span style={{fontSize:'11px',color:'var(--ink-3)'}}>
            Leave unchecked to merge the imported file with values already stored on this computer.
          </span>
        </span>
      </label>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-label">Company Records</div>
          <div className="stat-value">{companyCount}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Saved Suggestions</div>
          <div className="stat-value">{valueCount}</div>
        </div>
        <div className="stat-card" style={{gridColumn:'span 2'}}>
          <div className="stat-label">Last Backup</div>
          <div style={{fontSize:'14px',fontWeight:600,marginTop:'8px'}}>
            {lastBackup ? new Date(lastBackup).toLocaleString('en-GB') : 'No backup downloaded yet'}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:'18px' }}>
        <div className="card-header">
          <h2>Voucher Local Data Backup</h2>
          <span className="text-sm text-muted">{voucherValueCount} remembered value(s)</span>
        </div>
        <div className="card-body">
          <p style={{fontSize:'13px',color:'var(--ink-2)',marginBottom:'14px'}}>
            The backup contains only remembered Payee Name, Receiving Company, Prepared By, Approved By and Received By suggestions.
          </p>
          <div style={{fontSize:'12px',color:'var(--ink-3)',marginBottom:'18px'}}>
            Last voucher backup: {voucherLastBackup ? new Date(voucherLastBackup).toLocaleString('en-GB') : 'No backup downloaded yet'}
          </div>

          <div style={{display:'flex',gap:'10px',flexWrap:'wrap'}}>
            <button className="btn btn-primary" type="button" onClick={downloadVoucherBackup}
              disabled={voucherValueCount === 0}>
              Download Voucher Data
            </button>
            <button className="btn btn-outline" type="button" onClick={() => voucherFileRef.current?.click()}>
              Restore Voucher Data
            </button>
            <input ref={voucherFileRef} type="file" accept=".json,application/json"
              onChange={restoreVoucherBackup} style={{display:'none'}} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2>QBO Local Data Backup</h2>
          <span className="text-sm text-muted">No Supabase data</span>
        </div>
        <div className="card-body">
          <p style={{fontSize:'13px',color:'var(--ink-2)',marginBottom:'18px'}}>
            The backup contains only remembered Debit/Expense accounts, Credit/Bank/Cash accounts, Tax values and Classes.
          </p>

          <div style={{display:'flex',gap:'10px',flexWrap:'wrap',marginBottom:'18px'}}>
            <button className="btn btn-primary" type="button" onClick={downloadBackup}
              disabled={companyCount === 0}>
              Download QBO Data
            </button>
            <button className="btn btn-outline" type="button" onClick={() => fileRef.current?.click()}>
              Restore QBO Data
            </button>
            <input ref={fileRef} type="file" accept=".json,application/json"
              onChange={restoreBackup} style={{display:'none'}} />
          </div>
        </div>
      </div>
    </div>
  )
}
