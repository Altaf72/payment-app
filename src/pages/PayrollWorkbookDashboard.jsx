import { useEffect, useMemo, useState } from 'react'
import { parsePayrollWorkbook, payrollRowsToCsv } from '../lib/payrollWorkbook'
import { formatCurrency } from '../lib/utils'

const ENTITY_COLORS = {
  MH: '#C9A66B',
  HH: '#5FB3A3',
}

const THEME = {
  bg: '#101722',
  panel: '#182231',
  panelAlt: '#223147',
  row: '#1b2636',
  rowAlt: '#202d40',
  line: '#40516b',
  lineSoft: '#2b3a50',
  text: '#f8fafc',
  muted: '#b8c4d8',
  subtle: '#8fa2bd',
}

const PAYROLL_SESSION_KEY = 'paymentapp.payroll.session'
const PAYROLL_LOCAL_KEY = 'paymentapp.payroll.lastParsed'
const PAYROLL_LAST_FILE_KEY = 'paymentapp.payroll.lastFile'
const LANGUAGE_KEY = 'paymentapp.displayLanguage'

const PAYROLL_TEXT = {
  en: {
    consoleTitle: 'Payroll Review Console',
    mainSheet: 'Main',
    rows: 'rows',
    lastFile: 'Last file',
    exportLedger: 'Export Ledger CSV',
    reading: 'Reading...',
    chooseFile: 'Choose payroll file',
    noWorkbook: 'No workbook loaded',
    noWorkbookHelp: 'Choose the monthly payroll file, for example PAYROLL JUNE2026.xlsm. The console reads Main sheet A:AB locally in your browser.',
    lastLoaded: 'Last loaded',
    headcount: 'Headcount',
    payrollRows: 'payroll rows',
    totalPayroll: 'Total Payroll',
    mainTotalColumn: 'Main sheet Total column',
    fixedSalary: 'Fixed Salary',
    fixedSalaryColumn: 'Fix Salary column',
    commission: 'Commission',
    commissionColumn: 'Commission column',
    deductions: 'Deductions',
    deductionColumn: 'Deduction column',
    actualCost: 'Actual Cost',
    stampHint: "The stamps use the workbook's own MH Amount and HH Amount columns. Click a stamp to inspect contributing rows.",
    byCompanyTag: 'By Company Tag',
    companyHeadcountHint: 'Company column, headcount view',
    byActualCost: 'By Actual Cost to Company',
    allocationHint: 'MH Amount / HH Amount allocation view',
    totalColumn: 'Total column',
    paymentModeExposure: 'Payment Mode & WPS Exposure',
    paymentModeHint: 'Payment Mode split by entity amount',
    costComposition: 'Cost Composition - Accrual Build-Up',
    costCompositionHint: 'Fix+Support+Addon-Deduction, Commission, Other - by MH/HH Share%',
    settlement: 'Settlement Waterfall & Intercompany Position',
    settlementHint: 'How the payable actually gets cleared, per disbursing bank/cash',
    advanceControl: 'Advance & Deduction Control',
    advanceHint: 'Positive advances and applied deductions by company',
    byTeam: 'By Team / Department',
    byTeamHint: 'Team carried down from Main sheet',
    byRole: 'By Role',
    byRoleHint: 'Role column',
    top10: 'Top 10 By Total Cost',
    top10Hint: 'Grouped by Sl No, so salary + commission rows combine',
    reviewFlags: 'Review Flags',
    noFlags: 'No review flags found.',
    employeeLedger: 'Employee Ledger',
    shownRows: 'row(s) shown',
    searchPlaceholder: 'Search name / code / remarks',
    allCompanies: 'All companies',
    allRoles: 'All roles',
    allPaymentModes: 'All payment modes',
    hideZeroRows: 'Hide zero rows',
    close: 'Close',
  },
  zh: {
    consoleTitle: '工资审核控制台',
    mainSheet: '主表',
    rows: '行',
    lastFile: '上次文件',
    exportLedger: '导出明细 CSV',
    reading: '读取中...',
    chooseFile: '选择工资文件',
    noWorkbook: '未加载工资表',
    noWorkbookHelp: '请选择每月工资文件，例如 PAYROLL JUNE2026.xlsm。系统会在浏览器本地读取 Main 表 A:AB。',
    lastLoaded: '上次加载',
    headcount: '人数',
    payrollRows: '工资行',
    totalPayroll: '工资总额',
    mainTotalColumn: 'Main 表 Total 列',
    fixedSalary: '固定工资',
    fixedSalaryColumn: 'Fix Salary 列',
    commission: '佣金',
    commissionColumn: 'Commission 列',
    deductions: '扣款',
    deductionColumn: 'Deduction 列',
    actualCost: '实际成本',
    stampHint: '圆章使用工资表中的 MH Amount 和 HH Amount 列。点击圆章可查看明细行。',
    byCompanyTag: '按公司标签',
    companyHeadcountHint: 'Company 列，按人数查看',
    byActualCost: '按公司实际成本',
    allocationHint: 'MH Amount / HH Amount 分摊视图',
    totalColumn: 'Total 列',
    paymentModeExposure: '付款方式与 WPS 分布',
    paymentModeHint: '按公司金额拆分付款方式',
    costComposition: '成本组成 - 应计构成',
    costCompositionHint: 'Fix+Support+Addon-Deduction、Commission、Other，按 MH/HH 比例',
    settlement: '结算瀑布与公司间余额',
    settlementHint: '按实际付款银行/现金渠道查看应付如何清算',
    advanceControl: '预支与扣款控制',
    advanceHint: '按公司查看预支和已扣款',
    byTeam: '按团队 / 部门',
    byTeamHint: '从 Main 表带出的 Team',
    byRole: '按岗位',
    byRoleHint: 'Role 列',
    top10: '总成本前 10',
    top10Hint: '按 Sl No 合并，所以工资和佣金行会合计',
    reviewFlags: '复核提示',
    noFlags: '未发现复核提示。',
    employeeLedger: '员工明细',
    shownRows: '行显示',
    searchPlaceholder: '搜索姓名 / 编号 / 备注',
    allCompanies: '全部公司',
    allRoles: '全部岗位',
    allPaymentModes: '全部付款方式',
    hideZeroRows: '隐藏零金额行',
    close: '关闭',
  },
}

function readDisplayLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_KEY) === 'zh' ? 'zh' : 'en'
  } catch {
    return 'en'
  }
}

function readStoredPayroll() {
  try {
    const stored = sessionStorage.getItem(PAYROLL_SESSION_KEY)
    if (stored) return JSON.parse(stored)
  } catch {
    // Ignore session restore failures and try the persistent local copy.
  }
  try {
    const stored = localStorage.getItem(PAYROLL_LOCAL_KEY)
    if (!stored) return null
    const payroll = JSON.parse(stored)
    sessionStorage.setItem(PAYROLL_SESSION_KEY, JSON.stringify(payroll))
    return payroll
  } catch {
    return null
  }
}

function readLastPayrollFile() {
  try {
    return localStorage.getItem(PAYROLL_LAST_FILE_KEY) || ''
  } catch {
    return ''
  }
}

function rememberPayroll(payroll, fileLabel) {
  const serialized = JSON.stringify(payroll)
  try {
    sessionStorage.setItem(PAYROLL_SESSION_KEY, serialized)
  } catch {
    // Session restore is a convenience; keep the upload working even if storage is full.
  }
  try {
    localStorage.setItem(PAYROLL_LOCAL_KEY, serialized)
  } catch {
    // Persistent restore is also a convenience; large workbooks can still be loaded manually.
  }
  try {
    localStorage.setItem(PAYROLL_LAST_FILE_KEY, fileLabel)
  } catch {
    // Ignore local storage failures.
  }
}

function money(value) {
  return `AED ${formatCurrency(Number(value || 0))}`
}

function number(value) {
  return formatCurrency(Number(value || 0))
}

function normalizeText(value) {
  return String(value || '').trim()
}

function groupKey(record) {
  const match = String(record.slNo || '').match(/^(\d+)/)
  if (match) return `SL-${match[1]}`
  return normalizeText(record.name).replace(/\s+[a-z]$/i, '').toLowerCase()
}

function buildEmployeeGroups(records) {
  const groups = new Map()
  records.forEach(record => {
    const key = groupKey(record)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(record)
  })
  return [...groups.values()].map(rows => {
    const primary = rows.find(row => !/\s+[a-z]$/i.test(normalizeText(row.name))) || rows[0]
    return {
      name: normalizeText(primary.name).replace(/\s+[a-z]$/i, ''),
      company: primary.company,
      teamFilled: primary.teamFilled,
      role: [...new Set(rows.map(row => row.role).filter(Boolean))].join(' + '),
      paymentMode: [...new Set(rows.map(row => row.paymentMode).filter(Boolean))].join(' + '),
      total: rows.reduce((sum, row) => sum + row.total, 0),
      mhAmount: rows.reduce((sum, row) => sum + row.mhAmount, 0),
      hhAmount: rows.reduce((sum, row) => sum + row.hhAmount, 0),
      rows,
    }
  })
}

function sum(records, key) {
  return records.reduce((total, record) => total + Number(record[key] || 0), 0)
}

function groupSum(records, key, amountKey = 'total') {
  const result = {}
  records.forEach(record => {
    const label = normalizeText(record[key]) || 'Unassigned'
    result[label] = (result[label] || 0) + Number(record[amountKey] || 0)
  })
  return Object.entries(result).sort((a, b) => b[1] - a[1])
}

function isLedgerZeroRow(row) {
  return ['fixSalary', 'commission', 'deduction', 'total', 'mhAmount', 'hhAmount']
    .every(key => Math.abs(Number(row[key] || 0)) < 0.005)
}

function derivePayrollReviewFields(record) {
  const salaryExpenseBase = record.fixSalary + record.support + record.addon - record.deduction
  const mhSalaryExpense = salaryExpenseBase * (record.mhShare / 100)
  const hhSalaryExpense = salaryExpenseBase * (record.hhShare / 100)
  const mhCommissionExpense = record.commission * (record.mhShare / 100)
  const hhCommissionExpense = record.commission * (record.hhShare / 100)
  const paymentMode = normalizeText(record.paymentMode)
  const mode = paymentMode.toUpperCase()
  let channel = ''
  let channelType = ''

  if (mode.includes('ENBD')) {
    channel = 'MH'
    channelType = 'WPS-ENBD'
  } else if (mode.includes('JAE')) {
    channel = 'HH'
    channelType = 'WPS-JAE'
  } else {
    channel = record.company === 'MH' || record.company === 'HH' ? record.company : 'UNASSIGNED'
    channelType = mode.includes('CASH') ? 'CASH' : mode === 'BANK' ? 'BANK' : paymentMode || 'Unspecified'
  }

  return {
    ...record,
    salaryExpenseBase,
    mhSalaryExpense,
    hhSalaryExpense,
    mhCommissionExpense,
    hhCommissionExpense,
    channel,
    channelType,
  }
}

function computeWaterfall(records, entity) {
  const other = entity === 'MH' ? 'HH' : 'MH'
  const ownField = entity === 'MH' ? 'mhAmount' : 'hhAmount'
  const otherField = other === 'MH' ? 'mhAmount' : 'hhAmount'
  const selfByChannel = {}
  let totalAccrued = 0
  let selfCleared = 0
  let dueToOther = 0
  let dueFromOther = 0

  records.forEach(record => {
    totalAccrued += record[ownField]
    if (record.channel === entity) {
      selfCleared += record[ownField]
      selfByChannel[record.channelType] = (selfByChannel[record.channelType] || 0) + record[ownField]
      dueFromOther += record[otherField]
    } else if (record.channel === other) {
      dueToOther += record[ownField]
    }
  })

  return {
    entity,
    totalAccrued,
    selfCleared,
    selfByChannel,
    dueToOther,
    dueFromOther,
    closing: totalAccrued - selfCleared - dueToOther,
  }
}

function downloadCsv(filename, rows) {
  const blob = new Blob(['\uFEFF' + payrollRowsToCsv(rows)], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function ConsoleCard({ children, style }) {
  return (
    <section style={{
      background:THEME.panel,
      border:`1px solid ${THEME.line}`,
      borderRadius:'10px',
      padding:'18px',
      color:THEME.text,
      boxShadow:'0 1px 2px rgba(15, 23, 42, 0.08)',
      ...style,
    }}>
      {children}
    </section>
  )
}

function SectionHeader({ title, hint, action }) {
  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', alignItems:'center', marginBottom:'14px', flexWrap:'wrap' }}>
      <div>
        <h2 style={{ margin:0, color:THEME.text, fontSize:'16px' }}>{title}</h2>
        {hint && <div style={{ color:THEME.muted, fontSize:'12px', marginTop:'3px' }}>{hint}</div>}
      </div>
      {action}
    </div>
  )
}

function Kpi({ label, value, sub, onClick }) {
  return (
    <button type="button" onClick={onClick} style={{
      textAlign:'left',
      background:THEME.panel,
      border:`1px solid ${THEME.line}`,
      borderRadius:'10px',
      padding:'15px 16px',
      color:THEME.text,
      cursor:onClick ? 'pointer' : 'default',
      boxShadow:'0 1px 2px rgba(15, 23, 42, 0.08)',
    }}>
      <div style={{ color:THEME.muted, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.12em' }}>{label}</div>
      <div style={{ fontFamily:'monospace', fontSize:'21px', fontWeight:700, marginTop:'7px' }}>{value}</div>
      {sub && <div style={{ color:THEME.subtle, fontSize:'11px', marginTop:'5px' }}>{sub}</div>}
    </button>
  )
}

function BarList({ rows, max, color = '#C9A66B', onClick }) {
  if (!rows.length) return <div style={{ color:THEME.muted, fontSize:'13px' }}>No rows to show.</div>
  return rows.map(([label, value]) => (
    <button key={label} type="button" onClick={() => onClick?.(label)} style={{
      display:'grid',
      gridTemplateColumns:'minmax(110px, 160px) 1fr minmax(90px, 120px)',
      gap:'10px',
      width:'100%',
      alignItems:'center',
      padding:'7px 0',
      background:'transparent',
      border:0,
      color:THEME.text,
      cursor:onClick ? 'pointer' : 'default',
      textAlign:'left',
    }}>
      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:'13px' }}>{label}</span>
      <span style={{ height:'8px', borderRadius:'20px', overflow:'hidden', background:THEME.lineSoft }}>
        <span style={{ display:'block', height:'100%', width:`${max ? Math.max(2, Math.round((Math.abs(value) / max) * 100)) : 0}%`, background:color }} />
      </span>
      <span style={{ fontFamily:'monospace', color:THEME.text, fontSize:'12px', textAlign:'right', fontWeight:700 }}>{number(value)}</span>
    </button>
  ))
}

function MiniTable({ columns, rows, onRowClick, sticky = false, showTotals = false, maxHeight = '420px' }) {
  const totals = showTotals
    ? Object.fromEntries(columns.map((column, index) => {
      if (index === 0) return [column.key, `${rows.length} shown`]
      if (!column.num) return [column.key, '']
      return [column.key, rows.reduce((total, row) => total + Number(row[column.key] || 0), 0)]
    }))
    : null

  return (
    <div style={{ overflow:'auto', maxHeight:sticky ? maxHeight : undefined, border:sticky ? `1px solid ${THEME.lineSoft}` : undefined, borderRadius:sticky ? '8px' : undefined }}>
      <table style={{ width:'100%', borderCollapse:'collapse', color:THEME.text, fontSize:'13px' }}>
        <thead>
          <tr>
            {columns.map(col => (
              <th key={col.key} style={{ textAlign:col.num ? 'right' : 'left', color:THEME.muted, fontSize:'11px', padding:'9px 8px', borderBottom:`1px solid ${THEME.line}`, background:THEME.panelAlt, textTransform:'uppercase', letterSpacing:'.05em', position:sticky ? 'sticky' : undefined, top:sticky ? 0 : undefined, zIndex:sticky ? 2 : undefined }}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${row.name || row.label || index}-${index}`} onClick={() => onRowClick?.(row)}
              style={{ cursor:onRowClick ? 'pointer' : 'default', background:index % 2 ? THEME.rowAlt : THEME.row }}>
              {columns.map(col => (
                <td key={col.key} style={{ textAlign:col.num ? 'right' : 'left', padding:'9px 8px', borderBottom:`1px solid ${THEME.lineSoft}`, fontFamily:col.num ? 'monospace' : undefined, color:THEME.text, fontWeight:col.num ? 700 : 500 }}>
                  {col.render ? col.render(row) : col.num ? number(row[col.key]) : row[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {showTotals && (
          <tfoot>
            <tr>
              {columns.map((col, index) => (
                <td key={col.key} style={{ textAlign:col.num ? 'right' : 'left', padding:'10px 8px', borderTop:`2px solid ${THEME.line}`, background:THEME.panelAlt, color:THEME.text, fontFamily:col.num ? 'monospace' : undefined, fontWeight:800, position:sticky ? 'sticky' : undefined, bottom:sticky ? 0 : undefined, zIndex:sticky ? 2 : undefined }}>
                  {index === 0 ? totals[col.key] : col.num ? number(totals[col.key]) : totals[col.key]}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

function ReferenceTable({ table }) {
  if (!table) return null
  return (
    <ConsoleCard>
      <SectionHeader
        title={table.title}
        hint="Reference only from Main sheet. Not used in payroll calculations."
      />
      <div style={{ overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', color:THEME.text, fontSize:'13px' }}>
          <thead>
            <tr>
              {table.headers.map((header, index) => (
                <th key={`${header}-${index}`} style={{ textAlign:'left', color:THEME.muted, fontSize:'11px', padding:'9px 8px', borderBottom:`1px solid ${THEME.line}`, background:THEME.panelAlt, textTransform:'uppercase', letterSpacing:'.05em', whiteSpace:'nowrap' }}>
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => {
              const isTotal = rowIndex === table.rows.length - 1
              return (
                <tr key={rowIndex} style={{ background:isTotal ? '#2d2617' : rowIndex % 2 ? THEME.rowAlt : THEME.row, fontWeight:isTotal ? 800 : 500 }}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} style={{ padding:'9px 8px', borderBottom:`1px solid ${THEME.lineSoft}`, color:THEME.text, fontFamily:typeof cell === 'number' ? 'monospace' : undefined, textAlign:typeof cell === 'number' ? 'right' : 'left', whiteSpace:'nowrap' }}>
                      {typeof cell === 'number' ? number(cell) : cell}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </ConsoleCard>
  )
}

function CompositionEntity({ entity, records, onShow }) {
  const salaryField = entity === 'MH' ? 'mhSalaryExpense' : 'hhSalaryExpense'
  const commissionField = entity === 'MH' ? 'mhCommissionExpense' : 'hhCommissionExpense'
  const amountField = entity === 'MH' ? 'mhAmount' : 'hhAmount'
  const salaryExpense = sum(records, salaryField)
  const commissionExpense = sum(records, commissionField)
  const totalCashCost = sum(records, amountField)
  const other = totalCashCost - salaryExpense - commissionExpense
  const total = Math.max(totalCashCost, 1)
  const segments = [
    { key:'salary', label:'Salary Expense', amount:salaryExpense, color:ENTITY_COLORS[entity] },
    { key:'commission', label:'Commission Expense', amount:commissionExpense, color:entity === 'MH' ? '#8a661f' : '#047866' },
    { key:'other', label:'Other (Deposited Cash, Advance, timing)', amount:other, color:'#64748b' },
  ]

  function showSegment(segment) {
    if (segment.key === 'salary') {
      onShow(`${entity} Salary Expense`, records.filter(row => row[salaryField] !== 0).sort((a, b) => b[salaryField] - a[salaryField]), [
        { key:'name', label:'Name' },
        { key:'fixSalary', label:'Fix Salary', num:true },
        { key:'support', label:'Support', num:true },
        { key:'addon', label:'Addon', num:true },
        { key:'deduction', label:'Deduction', num:true },
        { key:salaryField, label:`${entity} Salary Exp.`, num:true },
      ])
    } else if (segment.key === 'commission') {
      onShow(`${entity} Commission Expense`, records.filter(row => row[commissionField] !== 0).sort((a, b) => b[commissionField] - a[commissionField]), [
        { key:'name', label:'Name' },
        { key:'commission', label:'Commission', num:true },
        { key:commissionField, label:`${entity} Commission Exp.`, num:true },
      ])
    } else {
      const rows = records
        .map(row => ({ ...row, otherAmount: row[amountField] - row[salaryField] - row[commissionField] }))
        .filter(row => Math.abs(row.otherAmount) > 0.5)
        .sort((a, b) => b.otherAmount - a.otherAmount)
      onShow(`${entity} Other / Timing`, rows, [
        { key:'name', label:'Name' },
        { key:'depositedCash', label:'Deposited Cash', num:true },
        { key:'advance', label:'Advance', num:true },
        { key:'otherAmount', label:'Other', num:true },
      ])
    }
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'10px', fontWeight:800, color:THEME.text }}>
        <span style={{ width:'10px', height:'10px', borderRadius:'50%', background:ENTITY_COLORS[entity] }} />
        {entity} - {entity === 'MH' ? 'Million Homes' : 'HomesVIP'}
      </div>
      <div style={{ display:'flex', height:'26px', borderRadius:'7px', overflow:'hidden', background:THEME.lineSoft, marginBottom:'10px' }}>
        {segments.map(segment => (
          <span key={segment.key} style={{ width:`${Math.max((segment.amount / total) * 100, 0)}%`, background:segment.color }} />
        ))}
      </div>
      <div style={{ display:'flex', gap:'14px', flexWrap:'wrap', fontSize:'12px', color:THEME.muted }}>
        {segments.map(segment => (
          <button key={segment.key} type="button" onClick={() => showSegment(segment)} style={{ border:0, background:'transparent', padding:0, color:THEME.text, cursor:'pointer', textAlign:'left' }}>
            <span style={{ display:'inline-block', width:'8px', height:'8px', borderRadius:'2px', background:segment.color, marginRight:'5px' }} />
            {segment.label}: <span style={{ fontFamily:'monospace', fontWeight:800, textDecoration:'underline dotted' }}>{money(segment.amount)}</span>
          </button>
        ))}
      </div>
      <div style={{ color:THEME.muted, fontSize:'12px', marginTop:'10px' }}>
        = Total Cash Cost <strong style={{ color:THEME.text, fontFamily:'monospace' }}>{money(totalCashCost)}</strong>
      </div>
    </div>
  )
}

function WaterfallEntity({ waterfall, records, onShow }) {
  const entity = waterfall.entity
  const other = entity === 'MH' ? 'HH' : 'MH'
  const ownField = entity === 'MH' ? 'mhAmount' : 'hhAmount'
  const rows = Object.entries(waterfall.selfByChannel).sort((a, b) => b[1] - a[1])
  const closingOk = Math.abs(waterfall.closing) < 1

  function showAccrued() {
    onShow(`${entity} Actual Cost`, records.filter(row => row[ownField] > 0).sort((a, b) => b[ownField] - a[ownField]), [
      { key:'name', label:'Name' },
      { key:'role', label:'Role' },
      { key:'paymentMode', label:'Payment Mode' },
      { key:ownField, label:`${entity} Amount`, num:true },
    ])
  }

  function showChannel(channelType, amount) {
    onShow(`${entity} Cleared via ${channelType}`, records.filter(row => row.channel === entity && row.channelType === channelType).sort((a, b) => b[ownField] - a[ownField]), [
      { key:'name', label:'Name' },
      { key:'role', label:'Role' },
      { key:'paymentMode', label:'Payment Mode' },
      { key:ownField, label:`${entity} Amount`, num:true },
    ])
  }

  function showDueToOther() {
    onShow(`${entity} Due to ${other}`, records.filter(row => row.channel === other && row[ownField] > 0).sort((a, b) => b[ownField] - a[ownField]), [
      { key:'name', label:'Name' },
      { key:'channelType', label:'Paid Via' },
      { key:'paymentMode', label:'Payment Mode' },
      { key:ownField, label:`${entity} Amount`, num:true },
    ])
  }

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', marginBottom:'12px', fontWeight:800, color:THEME.text }}>
        <span style={{ width:'10px', height:'10px', borderRadius:'50%', background:ENTITY_COLORS[entity] }} />
        {entity} Salary Payable - Control
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', color:THEME.text, fontSize:'13px' }}>
        <tbody>
          <tr>
            <td style={waterfallCell}>Credit from Expense (accrued)</td>
            <td style={waterfallAmount}><button type="button" style={linkAmountStyle} onClick={showAccrued}>{money(waterfall.totalAccrued)}</button></td>
          </tr>
          {rows.map(([channelType, amount]) => (
            <tr key={channelType}>
              <td style={{ ...waterfallCell, paddingLeft:'18px', color:THEME.muted }}>Less: {channelType} (own bank/cash)</td>
              <td style={waterfallAmount}><button type="button" style={linkAmountStyle} onClick={() => showChannel(channelType, amount)}>({money(amount)})</button></td>
            </tr>
          ))}
          {waterfall.dueToOther > 0 && (
            <tr>
              <td style={{ ...waterfallCell, paddingLeft:'18px', color:THEME.muted }}>Less: Due to {other} (paid by {other}'s channel)</td>
              <td style={waterfallAmount}><button type="button" style={linkAmountStyle} onClick={showDueToOther}>({money(waterfall.dueToOther)})</button></td>
            </tr>
          )}
          <tr>
            <td style={{ ...waterfallCell, borderTop:`2px double ${THEME.line}`, fontWeight:800 }}>Closing Balance</td>
            <td style={{ ...waterfallAmount, borderTop:`2px double ${THEME.line}`, color:closingOk ? '#047857' : '#dc2626', fontWeight:900 }}>{money(waterfall.closing)} {closingOk ? 'OK' : 'Check'}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function IntercompanyNet({ mhWaterfall, hhWaterfall, records, onShow }) {
  const dueToMH = hhWaterfall.dueToOther
  const dueFromMH = hhWaterfall.dueFromOther
  const net = dueToMH - dueFromMH
  const netLabel = net >= 0 ? 'Net Due to MH (from HH)' : 'Net Due to HH (from MH)'

  return (
    <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', alignItems:'center', flexWrap:'wrap', background:THEME.panelAlt, borderRadius:'8px', padding:'12px 14px', marginTop:'16px', fontSize:'13px' }}>
      <div style={{ color:THEME.muted }}>
        Due to MH (HH channel liability){' '}
        <button type="button" style={linkAmountStyle} onClick={() => onShow('HH Due to MH', records.filter(row => row.channel === 'MH' && row.hhAmount > 0).sort((a, b) => b.hhAmount - a.hhAmount), [
          { key:'name', label:'Name' },
          { key:'channelType', label:'Paid Via' },
          { key:'hhAmount', label:'HH Amount', num:true },
        ])}>{money(dueToMH)}</button>
        {' '}· Due from MH (HH receivable){' '}
        <button type="button" style={linkAmountStyle} onClick={() => onShow('HH Due from MH', records.filter(row => row.channel === 'HH' && row.mhAmount > 0).sort((a, b) => b.mhAmount - a.mhAmount), [
          { key:'name', label:'Name' },
          { key:'channelType', label:'Paid Via' },
          { key:'mhAmount', label:'MH Amount', num:true },
        ])}>{money(dueFromMH)}</button>
      </div>
      <div style={{ color:THEME.text, fontWeight:800 }}>{netLabel}: <span style={{ fontFamily:'monospace' }}>{money(Math.abs(net))}</span></div>
    </div>
  )
}

function ChannelBookSummary({ records, onShow }) {
  const channelRows = [
    {
      key: 'WPS-ENBD',
      label: 'WPS-ENBD',
      owner: 'MH book',
      note: 'belongs to MH - HH trx is done to help',
      records: records.filter(row => row.channelType === 'WPS-ENBD'),
      adjustmentField: 'hhAmount',
    },
    {
      key: 'WPS-JAE',
      label: 'WPS-JAE',
      owner: 'HH book',
      note: 'belongs to HH - MH trx is done to help',
      records: records.filter(row => row.channelType === 'WPS-JAE'),
      adjustmentField: 'mhAmount',
    },
    {
      key: 'BANK-MH',
      label: 'Bank',
      owner: 'MH book',
      note: 'bank follows COMPANY MH; split remains internal',
      records: records.filter(row => row.channelType === 'BANK' && row.channel === 'MH'),
      adjustmentField: 'hhAmount',
    },
    {
      key: 'BANK-HH',
      label: 'Bank',
      owner: 'HH book',
      note: 'bank follows COMPANY HH; split remains internal',
      records: records.filter(row => row.channelType === 'BANK' && row.channel === 'HH'),
      adjustmentField: 'mhAmount',
    },
    {
      key: 'CASH-MH',
      label: 'Cash',
      owner: 'MH book',
      note: 'cash follows COMPANY MH; split remains internal',
      records: records.filter(row => row.channelType === 'CASH' && row.channel === 'MH'),
      adjustmentField: 'hhAmount',
    },
    {
      key: 'CASH-HH',
      label: 'Cash',
      owner: 'HH book',
      note: 'cash follows COMPANY HH; split remains internal',
      records: records.filter(row => row.channelType === 'CASH' && row.channel === 'HH'),
      adjustmentField: 'mhAmount',
    },
  ].map(row => ({
    ...row,
    total: sum(row.records, 'total'),
    mhAmount: sum(row.records, 'mhAmount'),
    hhAmount: sum(row.records, 'hhAmount'),
    adjustmentAmount: row.adjustmentField ? sum(row.records, row.adjustmentField) : 0,
  }))

  return (
    <div style={{ marginTop:'16px', borderTop:`1px solid ${THEME.lineSoft}`, paddingTop:'14px' }}>
      <div style={{ color:THEME.muted, fontSize:'12px', marginBottom:'8px' }}>Channel book summary</div>
      <MiniTable
        columns={[
          { key:'label', label:'Channel' },
          { key:'owner', label:'Book' },
          { key:'total', label:'Paid From Book', num:true },
          { key:'mhAmount', label:'MH Amount', num:true },
          { key:'hhAmount', label:'HH Amount', num:true },
          { key:'adjustmentAmount', label:'Cross/Internal', num:true },
          { key:'note', label:'Note' },
        ]}
        rows={channelRows.filter(row => row.records.length)}
        onRowClick={row => onShow(`${row.label} - ${row.owner}`, row.records, [
          { key:'name', label:'Name' },
          { key:'company', label:'Company' },
          { key:'paymentMode', label:'Payment Mode' },
          { key:'mhAmount', label:'MH Amount', num:true },
          { key:'hhAmount', label:'HH Amount', num:true },
          { key:'total', label:'Total', num:true },
        ])}
      />
    </div>
  )
}

export default function PayrollWorkbookDashboard() {
  const [payroll, setPayroll] = useState(() => readStoredPayroll())
  const [lastPayrollFile, setLastPayrollFile] = useState(() => readLastPayrollFile())
  const [displayLanguage, setDisplayLanguage] = useState(() => readDisplayLanguage())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [companyFilter, setCompanyFilter] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [modeFilter, setModeFilter] = useState('')
  const [hideZeroRows, setHideZeroRows] = useState(false)
  const [modal, setModal] = useState(null)

  const baseRecords = payroll?.employees || []
  const records = useMemo(() => baseRecords.map(derivePayrollReviewFields), [baseRecords])
  const groups = useMemo(() => buildEmployeeGroups(records), [records])
  const text = PAYROLL_TEXT[displayLanguage]

  useEffect(() => {
    function handleLanguageChange(event) {
      if (event.type === 'storage' && event.key && event.key !== LANGUAGE_KEY) return
      setDisplayLanguage(event.detail === 'zh' || readDisplayLanguage() === 'zh' ? 'zh' : 'en')
    }
    window.addEventListener('paymentapp:language-change', handleLanguageChange)
    window.addEventListener('storage', handleLanguageChange)
    return () => {
      window.removeEventListener('paymentapp:language-change', handleLanguageChange)
      window.removeEventListener('storage', handleLanguageChange)
    }
  }, [])

  const analysis = useMemo(() => {
    if (!payroll) return null
    const totals = {
      headcount: groups.length,
      rows: records.length,
      total: sum(records, 'total'),
      fixedSalary: sum(records, 'fixSalary'),
      currentSalary: sum(records, 'currentSalary'),
      commission: sum(records, 'commission'),
      deduction: sum(records, 'deduction'),
      advance: sum(records, 'advance'),
      depositedCash: sum(records, 'depositedCash'),
      mhAmount: sum(records, 'mhAmount'),
      hhAmount: sum(records, 'hhAmount'),
    }
    const byCompany = groupSum(records, 'company')
    const byTeam = groupSum(records, 'teamFilled')
    const byRole = groupSum(records, 'role')
    const paymentModes = ['MH', 'HH'].map(entity => {
      const entityRecords = records.filter(row => row.company === entity)
      return {
        entity,
        rows: groupSum(entityRecords, 'paymentMode', 'total'),
      }
    })
    const mhWaterfall = computeWaterfall(records, 'MH')
    const hhWaterfall = computeWaterfall(records, 'HH')
    const topEarners = [...groups].sort((a, b) => b.total - a.total).slice(0, 10)
    const flags = records.flatMap(row => {
      const found = []
      if (row.total !== row.mhAmount + row.hhAmount) found.push({ name:row.name, desc:`Total differs from MH+HH amount by ${money(row.total - row.mhAmount - row.hhAmount)}` })
      if (row.deduction > 0 && !row.remarks) found.push({ name:row.name, desc:`Deduction ${money(row.deduction)} without remarks` })
      if (!row.company || row.company === 'UNASSIGNED') found.push({ name:row.name, desc:'Missing company tag' })
      if (!row.paymentMode || row.paymentMode === 'Unspecified') found.push({ name:row.name, desc:'Missing payment mode' })
      return found
    })
    return { totals, byCompany, byTeam, byRole, paymentModes, mhWaterfall, hhWaterfall, topEarners, flags }
  }, [groups, payroll, records])

  const filteredRecords = useMemo(() => {
    const query = search.trim().toLowerCase()
    return records.filter(row => {
      if (query && !`${row.name} ${row.empCode} ${row.remarks}`.toLowerCase().includes(query)) return false
      if (companyFilter && row.company !== companyFilter) return false
      if (roleFilter && row.role !== roleFilter) return false
      if (modeFilter && row.paymentMode !== modeFilter) return false
      if (hideZeroRows && isLedgerZeroRow(row)) return false
      return true
    })
  }, [companyFilter, hideZeroRows, modeFilter, records, roleFilter, search])

  async function handleFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const parsedPayroll = await parsePayrollWorkbook(file)
      const fileLabel = file.path || file.webkitRelativePath || file.name
      setPayroll(parsedPayroll)
      setLastPayrollFile(fileLabel)
      rememberPayroll(parsedPayroll, fileLabel)
    } catch (parseError) {
      setPayroll(null)
      setError(parseError.message || 'Could not read payroll workbook')
    } finally {
      setLoading(false)
    }
  }

  function exportLedger() {
    downloadCsv(`payroll-ledger-${Date.now()}.csv`, [
      ['Sl No', 'Name', 'Company', 'Team', 'Role', 'Payment Mode', 'Fix Salary', 'Commission', 'Deduction', 'Total', 'MH Amount', 'HH Amount', 'Remarks'],
      ...records.map(row => [row.slNo, row.name, row.company, row.teamFilled, row.role, row.paymentMode, row.fixSalary, row.commission, row.deduction, row.total, row.mhAmount, row.hhAmount, row.remarks]),
    ])
  }

  function showRows(title, rows, columns) {
    setModal({ title, rows, columns })
  }

  const companies = [...new Set(records.map(row => row.company).filter(Boolean))].sort()
  const roles = [...new Set(records.map(row => row.role).filter(Boolean))].sort()
  const modes = [...new Set(records.map(row => row.paymentMode).filter(Boolean))].sort()
  const totalMax = Math.max(...(analysis?.byCompany || []).map(([, value]) => Math.abs(value)), 1)
  const teamMax = Math.max(...(analysis?.byTeam || []).map(([, value]) => Math.abs(value)), 1)
  const roleMax = Math.max(...(analysis?.byRole || []).map(([, value]) => Math.abs(value)), 1)

  return (
    <div className="payroll-console" style={{ background:THEME.bg, color:THEME.text, margin:'-24px', padding:'24px', minHeight:'calc(100vh - 48px)' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', gap:'16px', flexWrap:'wrap', borderBottom:`1px solid ${THEME.line}`, paddingBottom:'18px', marginBottom:'22px' }}>
        <div>
          <div style={{ color:THEME.muted, fontSize:'11px', textTransform:'uppercase', letterSpacing:'.14em' }}>{text.consoleTitle}</div>
          <h1 style={{ margin:'4px 0 0', color:THEME.text, fontSize:'26px' }}>Million Homes · HomesVIP</h1>
        </div>
        <div style={{ display:'flex', gap:'10px', alignItems:'center', flexWrap:'wrap' }}>
          {payroll && <span style={{ color:THEME.muted, fontSize:'12px', fontFamily:'monospace' }}>{payroll.fileName} · {text.mainSheet} · {records.length} {text.rows}</span>}
          {!payroll && lastPayrollFile && <span style={{ color:THEME.muted, fontSize:'12px', fontFamily:'monospace' }}>{text.lastFile}: {lastPayrollFile}</span>}
          {payroll && <button type="button" className="btn btn-outline btn-sm" onClick={exportLedger}>{text.exportLedger}</button>}
          <label style={{ background:'#C9A66B', color:'#1A1408', padding:'10px 16px', borderRadius:'8px', fontWeight:700, cursor:'pointer' }}>
            {loading ? text.reading : text.chooseFile}
            <input type="file" accept=".xlsx,.xlsm" onChange={handleFile} style={{ display:'none' }} />
          </label>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {!payroll || !analysis ? (
        <ConsoleCard style={{ maxWidth:'560px', margin:'60px auto', textAlign:'center', borderStyle:'dashed', padding:'52px 28px' }}>
          <div style={{ width:'46px', height:'46px', margin:'0 auto 18px', border:`1px solid ${THEME.line}`, borderRadius:'8px', display:'grid', placeItems:'center', color:THEME.muted, fontFamily:'monospace' }}>XLS</div>
          <h2 style={{ color:THEME.text, margin:'0 0 10px' }}>{text.noWorkbook}</h2>
          <p style={{ color:THEME.muted, lineHeight:1.6 }}>{text.noWorkbookHelp}</p>
          {lastPayrollFile && (
            <p style={{ color:THEME.subtle, lineHeight:1.6, marginTop:'12px', fontFamily:'monospace' }}>{text.lastLoaded}: {lastPayrollFile}</p>
          )}
        </ConsoleCard>
      ) : (
        <div style={{ display:'grid', gap:'16px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(170px, 1fr))', gap:'12px' }}>
            <Kpi label={text.headcount} value={analysis.totals.headcount} sub={`${analysis.totals.rows} ${text.payrollRows}`} onClick={() => showRows('Unique Staff', groups, [
              { key:'name', label:'Name' }, { key:'company', label:'Company' }, { key:'teamFilled', label:'Team' }, { key:'role', label:'Role' }, { key:'total', label:'Total', num:true },
            ])} />
            <Kpi label={text.totalPayroll} value={money(analysis.totals.total)} sub={text.mainTotalColumn} onClick={() => showRows('Total Payroll Rows', records, ledgerColumns())} />
            <Kpi label={text.fixedSalary} value={money(analysis.totals.fixedSalary)} sub={text.fixedSalaryColumn} />
            <Kpi label={text.commission} value={money(analysis.totals.commission)} sub={text.commissionColumn} onClick={() => showRows('Commission Rows', records.filter(row => row.commission > 0), ledgerColumns())} />
            <Kpi label={text.deductions} value={money(analysis.totals.deduction)} sub={text.deductionColumn} onClick={() => showRows('Deduction Rows', records.filter(row => row.deduction > 0), ledgerColumns())} />
          </div>

          <div style={{ display:'flex', gap:'28px', alignItems:'center', flexWrap:'wrap', padding:'12px 4px' }}>
            {['MH','HH'].map(entity => (
              <button key={entity} type="button" onClick={() => showRows(`${entity} ${text.actualCost}`, records.filter(row => row[entity === 'MH' ? 'mhAmount' : 'hhAmount'] > 0), ledgerColumns())}
                style={{ width:'120px', height:'120px', borderRadius:'50%', border:`2px dashed ${ENTITY_COLORS[entity]}`, color:ENTITY_COLORS[entity], background:'transparent', cursor:'pointer' }}>
                <div style={{ color:THEME.text, fontWeight:800, letterSpacing:'.05em' }}>{entity}</div>
                <div style={{ color:THEME.text, fontFamily:'monospace', fontSize:'13px', marginTop:'5px' }}>
                  {money(entity === 'MH' ? analysis.totals.mhAmount : analysis.totals.hhAmount)}
                </div>
                <div style={{ fontSize:'9px', marginTop:'5px', textTransform:'uppercase' }}>{text.actualCost}</div>
              </button>
            ))}
            <div style={{ color:THEME.muted, maxWidth:'360px', fontSize:'13px', lineHeight:1.6 }}>
              {text.stampHint}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'16px' }}>
            <ConsoleCard>
              <SectionHeader title={text.byCompanyTag} hint={text.companyHeadcountHint} />
              <BarList rows={analysis.byCompany} max={totalMax} color="#C9A66B" onClick={label => showRows(`Company ${label}`, records.filter(row => row.company === label), ledgerColumns())} />
            </ConsoleCard>
            <ConsoleCard>
              <SectionHeader title={text.byActualCost} hint={text.allocationHint} />
              <BarList rows={[['MH', analysis.totals.mhAmount], ['HH', analysis.totals.hhAmount]]} max={Math.max(analysis.totals.mhAmount, analysis.totals.hhAmount, 1)} color="#5FB3A3" />
              <div style={{ color:THEME.muted, fontSize:'12px', marginTop:'12px', borderTop:`1px solid ${THEME.lineSoft}`, paddingTop:'12px' }}>
                {text.totalColumn} {money(analysis.totals.total)} · MH+HH {money(analysis.totals.mhAmount + analysis.totals.hhAmount)}
              </div>
            </ConsoleCard>
          </div>

          <ConsoleCard>
            <SectionHeader title={text.paymentModeExposure} hint={text.paymentModeHint} />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'18px' }}>
              {analysis.paymentModes.map(block => (
                <div key={block.entity}>
                  <div style={{ color:ENTITY_COLORS[block.entity], fontSize:'12px', textTransform:'uppercase', letterSpacing:'.12em', marginBottom:'8px' }}>{block.entity}</div>
                  <BarList rows={block.rows} max={Math.max(...block.rows.map(([, value]) => value), 1)} color={ENTITY_COLORS[block.entity]} />
                </div>
              ))}
            </div>
          </ConsoleCard>

          <ConsoleCard>
            <SectionHeader title={text.costComposition} hint={text.costCompositionHint} />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'18px' }}>
              <CompositionEntity entity="MH" records={records} onShow={showRows} />
              <CompositionEntity entity="HH" records={records} onShow={showRows} />
            </div>
          </ConsoleCard>

          <ConsoleCard>
            <SectionHeader title={text.settlement} hint={text.settlementHint} />
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'18px' }}>
              <WaterfallEntity waterfall={analysis.mhWaterfall} records={records} onShow={showRows} />
              <WaterfallEntity waterfall={analysis.hhWaterfall} records={records} onShow={showRows} />
            </div>
            <IntercompanyNet mhWaterfall={analysis.mhWaterfall} hhWaterfall={analysis.hhWaterfall} records={records} onShow={showRows} />
            <ChannelBookSummary records={records} onShow={showRows} />
          </ConsoleCard>

          <ConsoleCard>
            <SectionHeader title={text.advanceControl} hint={text.advanceHint} />
            <MiniTable columns={[
              { key:'company', label:'Company' }, { key:'advance', label:'Advance', num:true }, { key:'deduction', label:'Deduction', num:true },
            ]} rows={companies.map(company => ({
              company,
              advance: sum(records.filter(row => row.company === company), 'advance'),
              deduction: sum(records.filter(row => row.company === company), 'deduction'),
            }))} />
          </ConsoleCard>

          <ReferenceTable table={payroll.commissionDetails} />

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(320px, 1fr))', gap:'16px' }}>
            <ConsoleCard>
              <SectionHeader title={text.byTeam} hint={text.byTeamHint} />
              <BarList rows={analysis.byTeam.slice(0, 10)} max={teamMax} color="#C9A66B" />
            </ConsoleCard>
            <ConsoleCard>
              <SectionHeader title={text.byRole} hint={text.byRoleHint} />
              <BarList rows={analysis.byRole.slice(0, 10)} max={roleMax} color="#5FB3A3" />
            </ConsoleCard>
          </div>

          <ConsoleCard>
            <SectionHeader title={text.top10} hint={text.top10Hint} />
            <MiniTable columns={[
              { key:'name', label:'Name' }, { key:'company', label:'Company' }, { key:'paymentMode', label:'Payment Mode' }, { key:'total', label:'Total', num:true },
            ]} rows={analysis.topEarners} onRowClick={row => showRows(row.name, row.rows, ledgerColumns())} />
          </ConsoleCard>

          <ConsoleCard>
            <SectionHeader title={text.reviewFlags} hint={`${analysis.flags.length} item(s)`} />
            {analysis.flags.length === 0 ? (
              <div style={{ color:'#7FBF8F', fontSize:'13px' }}>{text.noFlags}</div>
            ) : analysis.flags.slice(0, 20).map((flag, index) => (
              <div key={`${flag.name}-${index}`} style={{ display:'flex', gap:'10px', padding:'9px 0', borderBottom:`1px solid ${THEME.lineSoft}`, fontSize:'13px' }}>
                <span style={{ width:'7px', height:'7px', borderRadius:'50%', background:'#E2725B', marginTop:'6px' }} />
                <span><strong>{flag.name}</strong> <span style={{ color:THEME.muted }}>{flag.desc}</span></span>
              </div>
            ))}
          </ConsoleCard>

          <ConsoleCard>
            <SectionHeader title={text.employeeLedger} hint={`${filteredRecords.length} ${text.shownRows}`} />
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'12px' }}>
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder={text.searchPlaceholder} style={filterStyle} />
              <select value={companyFilter} onChange={event => setCompanyFilter(event.target.value)} style={filterStyle}>
                <option value="">{text.allCompanies}</option>
                {companies.map(company => <option key={company} value={company}>{company}</option>)}
              </select>
              <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} style={filterStyle}>
                <option value="">{text.allRoles}</option>
                {roles.map(role => <option key={role} value={role}>{role}</option>)}
              </select>
              <select value={modeFilter} onChange={event => setModeFilter(event.target.value)} style={filterStyle}>
                <option value="">{text.allPaymentModes}</option>
                {modes.map(mode => <option key={mode} value={mode}>{mode}</option>)}
              </select>
              <label style={toggleStyle}>
                <input type="checkbox" checked={hideZeroRows} onChange={event => setHideZeroRows(event.target.checked)} />
                <span>{text.hideZeroRows}</span>
              </label>
            </div>
            <MiniTable columns={ledgerColumns()} rows={filteredRecords} sticky showTotals maxHeight="520px" />
          </ConsoleCard>
        </div>
      )}

      {modal && (
        <div onClick={() => setModal(null)} style={{ position:'fixed', inset:0, background:'#0A0C10CC', zIndex:1000, padding:'6vh 20px', overflow:'auto' }}>
          <div onClick={event => event.stopPropagation()} style={{ maxWidth:'960px', margin:'0 auto', background:THEME.panel, border:`1px solid ${THEME.line}`, borderRadius:'10px', color:THEME.text }}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', alignItems:'center', padding:'16px 18px', borderBottom:`1px solid ${THEME.line}` }}>
              <h2 style={{ margin:0, fontSize:'16px', color:THEME.text }}>{modal.title}</h2>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setModal(null)}>{text.close}</button>
            </div>
            <div style={{ padding:'18px' }}>
              <MiniTable columns={modal.columns} rows={modal.rows} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const filterStyle = {
  background:'#0f1724',
  border:`1px solid ${THEME.line}`,
  color:THEME.text,
  borderRadius:'7px',
  padding:'8px 10px',
  fontSize:'13px',
}

const toggleStyle = {
  display:'inline-flex',
  alignItems:'center',
  gap:'7px',
  background:'#0f1724',
  border:`1px solid ${THEME.line}`,
  color:THEME.text,
  borderRadius:'7px',
  padding:'8px 10px',
  fontSize:'13px',
  cursor:'pointer',
  minHeight:'38px',
}

const linkAmountStyle = {
  background:'transparent',
  border:0,
  borderBottom:`1px dotted ${THEME.subtle}`,
  color:THEME.text,
  cursor:'pointer',
  fontFamily:'monospace',
  fontWeight:800,
  padding:0,
}

const waterfallCell = {
  padding:'9px 4px',
  borderBottom:`1px solid ${THEME.lineSoft}`,
  color:THEME.muted,
}

const waterfallAmount = {
  padding:'9px 4px',
  borderBottom:`1px solid ${THEME.lineSoft}`,
  textAlign:'right',
  whiteSpace:'nowrap',
}

function ledgerColumns() {
  return [
    { key:'slNo', label:'Sl No' },
    { key:'name', label:'Name' },
    { key:'company', label:'Co' },
    { key:'teamFilled', label:'Team' },
    { key:'role', label:'Role' },
    { key:'paymentMode', label:'Pay Mode' },
    { key:'fixSalary', label:'Fix Salary', num:true },
    { key:'commission', label:'Commission', num:true },
    { key:'deduction', label:'Deduction', num:true },
    { key:'total', label:'Total', num:true },
    { key:'mhAmount', label:'MH Amt', num:true },
    { key:'hhAmount', label:'HH Amt', num:true },
  ]
}
