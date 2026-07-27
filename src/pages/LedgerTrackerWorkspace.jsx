import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'

export default function LedgerTrackerWorkspace() {
  const { profile, user } = useAuth()
  const iframeRef = useRef(null)
  const replaceInProgressRef = useRef(false)
  const ignoreStateSaveUntilRef = useRef(0)
  const normalizedRole = String(profile?.role || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
  const canEdit = ['finance', 'finance_officer'].includes(normalizedRole)
  // The iframe may finish loading before the asynchronous user profile arrives.
  // Recreate it once the role is known, so an initial "view only" configuration
  // can never remain attached to a Finance Officer session.
  const trackerKey = normalizedRole || 'role-loading'

  useEffect(() => {
    async function syncWorkbook(event) {
      if (event.origin !== window.location.origin || !['chequeflow:workbook-import', 'chequeflow:state-save', 'chequeflow:property-save'].includes(event.data?.type) || !user?.id) return
      if (event.data.type === 'chequeflow:state-save' &&
          (replaceInProgressRef.current || Date.now() < ignoreStateSaveUntilRef.current)) return
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
        const entries = (state.cheques || []).map((c, index) => ({ source_import_key: c.sourceImportKey || `workbook-${index}-${String(c.propertyKey || '').trim()}-${c.chequeDate || ''}`, direction: String(c.direction || 'Payable').toLowerCase() === 'receivable' ? 'receivable' : 'payable', cheque_no: c.chequeNo || null, property_key: c.propertyKey || null, entity: c.entity || null, due_date: isoDate(c.chequeDate) || new Date().toISOString().slice(0, 10), property_name: c.description || null, counterparty: c.counterparty || c.description || c.propertyKey || 'Unassigned', category: c.paymentPurpose || null, recurrence_frequency: c.recurrenceFrequency || null, amount: Number(c.amount || 0.01) || 0.01, currency: 'AED', status: mapStatus(c.status), source_status: c.status || null, notes: c.description || null, created_by: user.id, updated_by: user.id }))
        const deposits = (state.deposits || []).filter(d => propertyKeys.has(String(d.propertyKey || '').trim())).map(d => ({ property_key: String(d.propertyKey).trim(), rental_deposit: Number(d.rentalDeposit || 0), dewa_deposit: Number(d.dewaDeposit || 0), chiller_deposit: Number(d.chillerDeposit || 0), gas_deposit: Number(d.gasDeposit || 0), other_deposit: Number(d.otherDeposit || 0), remark: d.remark || null, created_by: user.id, updated_by: user.id }))
        const setup = Object.entries(state.setupLists || {}).map(([list_name, values_json]) => ({ list_name, values_json, updated_by: user.id }))

        if (event.data.type === 'chequeflow:workbook-import') {
          replaceInProgressRef.current = true
          ignoreStateSaveUntilRef.current = Date.now() + 3000
          const { data: result, error } = await supabase.rpc('replace_cheque_flow_dataset', {
            p_entries: entries,
            p_properties: properties,
            p_deposits: deposits,
            p_setup_lists: setup,
            p_expected_entries: entries.length,
            p_expected_properties: properties.length,
            p_expected_deposits: deposits.length,
            p_expected_setup_lists: setup.length,
          })
          if (error) throw new Error(`${error.message}. Run the latest sql/cheque_flow.sql in Supabase, then retry.`)
          if (Number(result?.entries) !== entries.length ||
              Number(result?.properties) !== properties.length ||
              Number(result?.deposits) !== deposits.length ||
              Number(result?.setup_lists) !== setup.length) {
            throw new Error('Replacement verification failed. The previous dataset was retained.')
          }
          if (iframeRef.current?.contentDocument) {
            await hydrateTrackerFromSupabase(iframeRef.current.contentDocument)
          }
          iframeRef.current?.contentWindow?.postMessage({
            type: 'chequeflow:sync-result',
            ok: true,
            replace: true,
            counts: result,
          }, window.location.origin)
          replaceInProgressRef.current = false
          return
        }

        if (properties.length) { const { error } = await supabase.from('cheque_flow_properties').upsert(properties, { onConflict: 'property_key' }); if (error) throw error }
        if (deposits.length) { const { error } = await supabase.from('cheque_flow_deposits').upsert(deposits, { onConflict: 'property_key' }); if (error) throw error }
        if (entries.length) { const { error } = await supabase.from('cheque_flow_entries').upsert(entries, { onConflict: 'source_import_key' }); if (error) throw error }
        if (setup.length) { const { error } = await supabase.from('cheque_flow_setup_lists').upsert(setup, { onConflict: 'list_name' }); if (error) throw error }
        iframeRef.current?.contentWindow?.postMessage({ type: 'chequeflow:sync-result', ok: true }, window.location.origin)
      } catch (error) {
        replaceInProgressRef.current = false
        ignoreStateSaveUntilRef.current = Date.now() + 3000
        iframeRef.current?.contentWindow?.postMessage({ type: 'chequeflow:sync-result', ok: false, message: error.message }, window.location.origin)
        if (event.data.type === 'chequeflow:workbook-import' && iframeRef.current?.contentDocument) {
          await hydrateTrackerFromSupabase(iframeRef.current.contentDocument)
        }
      }
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
    setupView.innerHTML = `<div class="panel"><div class="panel-head"><h2>Setup</h2><span class="hint">Data exchange tools</span></div><p style="color:#5B665F;margin:0 0 14px">ChequeFlow saves changes to Supabase automatically. Use Excel only for controlled import and export.</p><div class="row-flex"><button class="btn btn-primary" id="setupExcelExport">Excel Export</button><button class="btn" id="setupExcelImport">Excel Import</button></div><p id="setupSyncMessage" style="display:none;margin:14px 0 0;color:#17624F;font-weight:700"></p></div>`
    doc.querySelector('main')?.appendChild(setupView)
    const showSetup = () => {
      doc.querySelectorAll('.view').forEach(view => view.classList.remove('active'))
      doc.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'))
      setupView.classList.add('active'); setupTab.classList.add('active')
    }
    setupTab.addEventListener('click', showSetup)
    doc.getElementById('setupExcelExport')?.addEventListener('click', () => doc.defaultView?.APP?.exportFullWorkbook?.())
    doc.getElementById('setupExcelImport')?.addEventListener('click', () => doc.getElementById('fileExcelImport')?.click())
    doc.getElementById('fileExcelImport')?.addEventListener('change', () => {
      const notice = doc.getElementById('setupSyncMessage')
      if (notice) { notice.style.display = 'block'; notice.style.color = '#5B665F'; notice.textContent = 'Uploading workbook and updating Supabase…' }
    })
    const originalPersistState = doc.defaultView?.APP?.persistState
    let saveTimer
    if (originalPersistState && !doc.defaultView.__chequeFlowSupabaseBridge) {
      doc.defaultView.__chequeFlowSupabaseBridge = true
      doc.defaultView.APP.persistState = function persistAndSync() {
        originalPersistState()
        clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
          const state = doc.defaultView.APP.STATE
          doc.defaultView.parent.postMessage({ type: 'chequeflow:state-save', state: { cheques: state.cheques, properties: state.properties, deposits: state.deposits, setupLists: state.setupLists } }, window.location.origin)
        }, 350)
      }
    }
    if (!canEdit) {
      const style = doc.createElement('style')
      style.textContent = `.view input,.view select,.view textarea,.view button:not(.tab-btn){pointer-events:none!important;opacity:.62!important}.view #setupExcelExport,.view #setupExcelImport{display:none!important}`
      doc.head.appendChild(style)
    }
    if (!canEdit) headerActions?.insertAdjacentHTML('beforeend', '<span style="font-size:12px;color:#5B665F">View only</span>')
    doc.defaultView?.addEventListener('message', event => {
      if (event.origin !== window.location.origin || event.data?.type !== 'chequeflow:sync-result') return
      doc.defaultView?.APP?.toast?.(event.data.ok ? 'Saved to Supabase.' : `Supabase sync failed: ${event.data.message}`, event.data.ok ? 'ok' : 'err')
      const notice = doc.getElementById('setupSyncMessage')
      if (notice && notice.style.display !== 'none') {
        notice.style.color = event.data.ok ? '#17624F' : '#B42318'
        notice.textContent = event.data.ok && event.data.replace
          ? `Replacement verified — ${event.data.counts?.entries || 0} cheques, ${event.data.counts?.properties || 0} properties, ${event.data.counts?.deposits || 0} deposits. Previous data archived.`
          : event.data.ok
            ? 'Changes saved to Supabase.'
            : `Workbook upload failed: ${event.data.message}`
      }
    })
    hydrateTrackerFromSupabase(doc)
  }

  async function hydrateTrackerFromSupabase(doc) {
    try {
      const [propertiesResult, entriesResult, depositsResult, setupResult] = await Promise.all([
        supabase.from('cheque_flow_properties').select('*').order('property_key'),
        supabase.from('cheque_flow_entries').select('*').order('due_date'),
        supabase.from('cheque_flow_deposits').select('*').order('property_key'),
        supabase.from('cheque_flow_setup_lists').select('*'),
      ])
      // The setup table was added later; it must not prevent the master data
      // from loading for an installation that has not run that migration yet.
      const criticalError = propertiesResult.error || entriesResult.error || depositsResult.error
      if (criticalError) throw criticalError

      const app = doc.defaultView?.APP
      if (!app?.STATE) return
      const properties = (propertiesResult.data || []).map(property => ({
        propertyKey: property.property_key,
        recordType: property.record_type || 'Property',
        propertyUnit: property.property_unit || '',
        entity: property.entity || '',
        payeeOwner: property.payee_owner || '',
        contractStart: property.contract_start || '',
        contractEnd: property.contract_end || '',
        annualRent: property.annual_rent ?? '',
        totalInstallments: property.total_installments ?? '',
        propertyStatus: property.property_status || '',
        ownerNationality: property.owner_nationality || '',
        managementType: property.management_type || '',
      }))
      const cheques = (entriesResult.data || []).map(entry => ({
        sourceImportKey: entry.source_import_key,
        chequeDate: entry.due_date || '',
        amount: entry.amount ?? '',
        entity: entry.entity || '',
        direction: entry.direction === 'receivable' ? 'Receivable' : 'Payable',
        propertyKey: entry.property_key || '',
        counterparty: entry.counterparty || '',
        description: entry.notes || entry.property_name || '',
        paymentPurpose: entry.category || '',
        recurrenceFrequency: entry.recurrence_frequency || '',
        chequeNo: entry.cheque_no || '',
        status: entry.source_status || trackerStatus(entry.status),
      }))
      const deposits = (depositsResult.data || []).map(deposit => ({
        propertyKey: deposit.property_key,
        rentalDeposit: deposit.rental_deposit ?? '', dewaDeposit: deposit.dewa_deposit ?? '',
        chillerDeposit: deposit.chiller_deposit ?? '', gasDeposit: deposit.gas_deposit ?? '',
        otherDeposit: deposit.other_deposit ?? '', remark: deposit.remark || '',
      }))
      const setupLists = Object.fromEntries((setupResult.data || []).map(row => [row.list_name, row.values_json]))

      app.STATE.properties = app.backfillRecordTypes(properties.map(app.withId))
      app.STATE.cheques = app.backfillDirection(cheques.map(app.withId))
      app.STATE.deposits = deposits.map(app.withId)
      app.STATE.setupLists = { ...app.STATE.setupLists, ...setupLists }
      app.refreshAllViews?.()
      if (!properties.length && !cheques.length) app.toast?.('No ChequeFlow records are in Supabase yet. Import the workbook from Setup to populate it.', 'err')
    } catch (error) {
      doc.defaultView?.APP?.toast?.(`Could not load ChequeFlow data from Supabase: ${error.message}`, 'err')
    }
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
function trackerStatus(value) { return ({ cleared: 'Paid/Cleared', returned: 'Returned/Cancelled', on_hold: 'Hold', pending: 'Pending' })[value] || 'Pending' }
