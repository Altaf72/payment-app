import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function LedgerTrackerWorkspace() {
  const { profile, user } = useAuth()
  const iframeRef = useRef(null)
  const normalizedRole = String(profile?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const canEdit = ['finance', 'finance_officer'].includes(normalizedRole)
  // The iframe may finish loading before the asynchronous user profile arrives.
  // Recreate it once the role is known, so an initial "view only" configuration
  // can never remain attached to a Finance Officer session.
  const trackerKey = normalizedRole || 'role-loading'

  useEffect(() => {
    async function syncWorkbook(event) {
      if (event.origin !== window.location.origin || !['chequeflow:workbook-import', 'chequeflow:property-save'].includes(event.data?.type) || !user?.id) return
      if (event.data.type === 'chequeflow:property-save') {
        try {
          const p = event.data.property
          const row = { property_key: String(p.propertyKey || '').trim(), record_type: p.recordType || 'Property', property_unit: p.propertyUnit ? String(p.propertyUnit) : null, entity: p.entity || null, payee_owner: p.payeeOwner || null, contract_start: isoDate(p.contractStart), contract_end: isoDate(p.contractEnd), annual_rent: Number(p.annualRent || 0), total_installments: Number(p.totalInstallments || 0) || null, property_status: p.propertyStatus || null, owner_nationality: p.ownerNationality || null, management_type: p.managementType || null, created_by: user.id, updated_by: user.id }
          const { error } = await supabase.from('cheque_flow_properties').upsert(row, { onConflict: 'property_key' })
          if (error) throw error
          iframeRef.current?.contentWindow?.postMessage({ type: 'chequeflow:sync-result', ok: true }, window.location.origin)
        } catch (error) { iframeRef.current?.contentWindow?.postMessage({ type: 'chequeflow:sync-result', ok: false, message: error.message }, window.location.origin) }
        return
      }
      const state = event.data.state || {}
      try {
        const properties = (state.properties || []).filter(p => p.propertyKey).map(p => ({ property_key: String(p.propertyKey).trim(), record_type: p.recordType || 'Property', property_unit: p.propertyUnit ? String(p.propertyUnit) : null, entity: p.entity || null, payee_owner: p.payeeOwner || null, contract_start: isoDate(p.contractStart), contract_end: isoDate(p.contractEnd), annual_rent: Number(p.annualRent || 0), total_installments: Number(p.totalInstallments || 0) || null, property_status: p.propertyStatus || null, owner_nationality: p.ownerNationality || null, management_type: p.managementType || null, created_by: user.id, updated_by: user.id }))
        const propertyKeys = new Set(properties.map(p => p.property_key))
        const entries = (state.cheques || []).map((c, index) => ({ source_import_key: `workbook-${index}-${String(c.propertyKey || '').trim()}-${c.chequeDate || ''}`, direction: String(c.direction || 'Payable').toLowerCase() === 'receivable' ? 'receivable' : 'payable', cheque_no: c.chequeNo || null, property_key: c.propertyKey || null, entity: c.entity || null, due_date: isoDate(c.chequeDate) || new Date().toISOString().slice(0, 10), property_name: c.description || null, counterparty: c.counterparty || c.description || c.propertyKey || 'Unassigned', category: c.paymentPurpose || null, recurrence_frequency: c.recurrenceFrequency || null, amount: Number(c.amount || 0.01) || 0.01, currency: 'AED', status: mapStatus(c.status), source_status: c.status || null, notes: c.description || null, created_by: user.id, updated_by: user.id }))
        const deposits = (state.deposits || []).filter(d => propertyKeys.has(String(d.propertyKey || '').trim())).map(d => ({ property_key: String(d.propertyKey).trim(), rental_deposit: Number(d.rentalDeposit || 0), dewa_deposit: Number(d.dewaDeposit || 0), chiller_deposit: Number(d.chillerDeposit || 0), gas_deposit: Number(d.gasDeposit || 0), other_deposit: Number(d.otherDeposit || 0), remark: d.remark || null, created_by: user.id, updated_by: user.id }))
        if (properties.length) { const { error } = await supabase.from('cheque_flow_properties').upsert(properties, { onConflict: 'property_key' }); if (error) throw error }
        if (deposits.length) { const { error } = await supabase.from('cheque_flow_deposits').upsert(deposits, { onConflict: 'property_key' }); if (error) throw error }
        if (entries.length) { const { error } = await supabase.from('cheque_flow_entries').upsert(entries, { onConflict: 'source_import_key' }); if (error) throw error }
        const setup = Object.entries(state.setupLists || {}).map(([list_name, values_json]) => ({ list_name, values_json, updated_by: user.id }))
        if (setup.length) { const { error } = await supabase.from('cheque_flow_setup_lists').upsert(setup, { onConflict: 'list_name' }); if (error) throw error }
        iframeRef.current?.contentWindow?.postMessage({ type: 'chequeflow:sync-result', ok: true }, window.location.origin)
      } catch (error) { iframeRef.current?.contentWindow?.postMessage({ type: 'chequeflow:sync-result', ok: false, message: error.message }, window.location.origin) }
    }
    window.addEventListener('message', syncWorkbook)
    return () => window.removeEventListener('message', syncWorkbook)
  }, [user?.id])

  function configureTracker() {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    ;['btnJsonBackup', 'btnJsonRestore', 'btnResetSaved'].forEach(id => doc.getElementById(id)?.remove())
    const headerActions = doc.querySelector('.masthead-actions')
    ;['btnExcelExport', 'btnExcelImport'].forEach(id => doc.getElementById(id)?.remove())
    const tabs = doc.getElementById('tabsNav')
    const setupTab = doc.createElement('button')
    setupTab.type = 'button'; setupTab.className = 'tab-btn'; setupTab.textContent = 'Setup'; setupTab.dataset.view = 'setup'
    tabs.appendChild(setupTab)
    const setupView = doc.createElement('section')
    setupView.id = 'view-setup'; setupView.className = 'view'
    setupView.innerHTML = `<div class="panel"><div class="panel-head"><h2>Setup</h2><span class="hint">Data exchange tools</span></div><p style="color:#5B665F;margin:0 0 14px">ChequeFlow is managed in Supabase. Use Excel only for controlled import and export.</p><div class="row-flex"><button class="btn btn-primary" id="setupExcelExport">Excel Export</button><button class="btn" id="setupExcelImport">Excel Import</button></div></div>`
    doc.querySelector('main')?.appendChild(setupView)
    const showSetup = () => {
      doc.querySelectorAll('.view').forEach(view => view.classList.remove('active'))
      doc.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'))
      setupView.classList.add('active'); setupTab.classList.add('active')
    }
    setupTab.addEventListener('click', showSetup)
    doc.getElementById('setupExcelExport')?.addEventListener('click', () => doc.defaultView?.APP?.exportFullWorkbook?.())
    doc.getElementById('setupExcelImport')?.addEventListener('click', () => doc.getElementById('fileExcelImport')?.click())
    if (!canEdit) {
      const style = doc.createElement('style')
      style.textContent = `.view input,.view select,.view textarea,.view button:not(.tab-btn){pointer-events:none!important;opacity:.62!important}.view #setupExcelExport,.view #setupExcelImport{display:none!important}`
      doc.head.appendChild(style)
    }
    if (!canEdit) headerActions?.insertAdjacentHTML('beforeend', '<span style="font-size:12px;color:#5B665F">View only</span>')
    doc.defaultView?.addEventListener('message', event => {
      if (event.origin !== window.location.origin || event.data?.type !== 'chequeflow:sync-result') return
      doc.defaultView?.APP?.toast?.(event.data.ok ? 'Workbook synced to Supabase.' : `Supabase sync failed: ${event.data.message}`, event.data.ok ? 'ok' : 'err')
    })
  }

  return <div style={{ height: 'calc(100vh - 64px)', minHeight: 720, margin: '-24px -32px' }}>
    <iframe key={trackerKey} ref={iframeRef} onLoad={configureTracker} title="Ledger & Term Tracker" src="/ledger_tracker.html" style={{ display: 'block', width: '100%', height: '100%', border: 0, background: '#edefe8' }} />
  </div>
}

function isoDate(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}
function mapStatus(value) { const text = String(value || '').toLowerCase(); if (text.includes('cleared') || text === 'cash') return 'cleared'; if (text.includes('return') || text.includes('cancel')) return 'returned'; if (text.includes('hold')) return 'on_hold'; return 'pending' }
