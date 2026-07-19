import { useRef } from 'react'
import { useAuth } from '../context/AuthContext'

export default function LedgerTrackerWorkspace() {
  const { profile } = useAuth()
  const iframeRef = useRef(null)
  const canEdit = profile?.role === 'finance'

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
  }

  return <div style={{ height: 'calc(100vh - 64px)', minHeight: 720, margin: '-24px -32px' }}>
    <iframe ref={iframeRef} onLoad={configureTracker} title="Ledger & Term Tracker" src="/ledger_tracker.html" style={{ display: 'block', width: '100%', height: '100%', border: 0, background: '#edefe8' }} />
  </div>
}
