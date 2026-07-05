const HEADER_ALIASES = {
  serial: ['Sl No', 'SL No', 'S No', 'S.No', 'No'],
  employee: ['Employee', 'Employee Name', 'Name', 'Agents Name', 'Agent Name', 'Agent'],
  total: ['Total', 'Salary Total', 'Net Total', 'Net Salary', 'Amount'],
  current_salary: ['Current Month Salary', 'Current Month Salary (Fixed Salary)', 'Salary'],
  fixed_salary: ['Fix Salary', 'Fixed Salary'],
  payment_mode: ['Payment Mode', 'PaymentMode'],
  addon: ['Addon', 'Add On', 'Addition'],
  deduction: ['Deduction', 'Deductions'],
  support: ['Support'],
  commission: ['Commission'],
  deposited_cash: ['Deposited Cash', 'Deposit Cash', 'Staff Deposit'],
  advance: ['Advance', 'Staff Advance'],
  company: ['COMPANY', 'Company'],
}

const DEFAULT_ENTITIES = ['MH', 'HH']

function normalizeHeader(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function columnNameToIndex(name) {
  return name.split('').reduce((total, char) => total * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function xmlText(text) {
  const parser = new DOMParser()
  return parser.parseFromString(text, 'application/xml')
}

function attr(text, name) {
  const match = text.match(new RegExp(`${name}="([^"]*)"`))
  return match ? match[1] : ''
}

function textContent(xml) {
  return String(xml || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

function numberValue(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const number = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(number) ? number : 0
}

function textValue(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' && Number.isInteger(value)) return String(value)
  return String(value).trim()
}

function readShare(value) {
  let number = numberValue(value)
  if (number > 1) number /= 100
  return number < 0 ? 0 : number
}

function normalizeShares(rawShares, company, entities) {
  const total = Object.values(rawShares).reduce((sum, value) => sum + value, 0)
  if (total > 0) {
    return Object.fromEntries(entities.map(entity => [entity, (rawShares[entity] || 0) / total]))
  }
  const normalizedCompany = textValue(company).toUpperCase()
  if (entities.includes(normalizedCompany)) {
    return Object.fromEntries(entities.map(entity => [entity, entity === normalizedCompany ? 1 : 0]))
  }
  const equal = 1 / entities.length
  return Object.fromEntries(entities.map(entity => [entity, equal]))
}

function findColumn(headerMap, logicalName, required = false) {
  for (const alias of HEADER_ALIASES[logicalName] || []) {
    const key = normalizeHeader(alias)
    if (headerMap.has(key)) return headerMap.get(key)
  }
  if (required) throw new Error(`Missing required header: ${HEADER_ALIASES[logicalName].join(' / ')}`)
  return null
}

function buildHeaderMap(rows) {
  const header = rows[0] || []
  const map = new Map()
  header.forEach((value, index) => {
    const key = normalizeHeader(value)
    if (key && !map.has(key)) map.set(key, index)
  })
  return map
}

function detectKnownMainLayout() {
  return {
    serial: 0,
    team: 1,
    employee: 2,
    total: 3,
    current_salary: 4,
    support: 5,
    commission: 6,
    deposited_cash: 7,
    addon: 8,
    advance: 9,
    deduction: 10,
    days_worked: 11,
    month_days: 12,
    fixed_salary: 13,
    remarks: 14,
    role: 15,
    payment_mode: 16,
    period: 17,
    job_title: 18,
    department_team: 19,
    date_of_join: 20,
    last_working_day: 21,
    employee_code: 22,
    company: 23,
    shareColumns: { MH: 24, HH: 25 },
    entityAmountColumns: { MH: 26, HH: 27 },
  }
}

function detectShareColumns(rows) {
  const header = rows[0] || []
  const shares = {}
  header.forEach((value, index) => {
    const label = textValue(value)
    const normalized = normalizeHeader(label)
    if (normalized.endsWith('share') && normalized.length > 'share'.length) {
      const entity = label.replace(/\s+share$/i, '').trim().toUpperCase()
      if (entity) shares[entity] = index
    }
  })
  return shares
}

function detectEntityAmountColumns(rows) {
  const header = rows[0] || []
  const amounts = {}
  header.forEach((value, index) => {
    const label = textValue(value)
    const normalized = normalizeHeader(label)
    if (normalized.endsWith('amount') && normalized.length > 'amount'.length) {
      const entity = label.replace(/\s+amount$/i, '').trim().toUpperCase()
      if (entity) amounts[entity] = index
    }
  })
  return amounts
}

function addAmount(target, key, amount) {
  target[key] = (target[key] || 0) + amount
}

function addAllocated(target, shares, amount) {
  Object.entries(shares).forEach(([entity, share]) => addAmount(target, entity, amount * share))
}

async function inflateRaw(bytes) {
  if (!globalThis.DecompressionStream) {
    throw new Error('This browser cannot read Excel workbooks. Please use Chrome or Edge.')
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function unzipEntries(buffer) {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  let eocd = -1
  for (let index = bytes.length - 22; index >= 0; index -= 1) {
    if (view.getUint32(index, true) === 0x06054b50) {
      eocd = index
      break
    }
  }
  if (eocd < 0) throw new Error('This does not look like a valid Excel workbook.')
  const totalEntries = view.getUint16(eocd + 10, true)
  let offset = view.getUint32(eocd + 16, true)
  const entries = {}

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) break
    const method = view.getUint16(offset + 10, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const localHeaderOffset = view.getUint32(offset + 42, true)
    const name = new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + nameLength))

    const localNameLength = view.getUint16(localHeaderOffset + 26, true)
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true)
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(dataStart, dataStart + compressedSize)
    let data
    if (method === 0) data = compressed
    else if (method === 8) data = await inflateRaw(compressed)
    else throw new Error(`Unsupported workbook compression method ${method}`)
    entries[name] = data

    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function decodeEntry(entries, name) {
  const data = entries[name]
  return data ? new TextDecoder('utf-8').decode(data) : ''
}

function parseSharedStrings(xml) {
  if (!xml) return []
  const items = []
  const matches = xml.match(/<si[\s\S]*?<\/si>/g) || []
  matches.forEach(item => {
    const textParts = [...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(match => textContent(match[1]))
    items.push(textParts.join(''))
  })
  return items
}

function parseWorkbook(entries) {
  const workbookXml = decodeEntry(entries, 'xl/workbook.xml')
  const relsXml = decodeEntry(entries, 'xl/_rels/workbook.xml.rels')
  const rels = {}
  ;[...relsXml.matchAll(/<Relationship\b[^>]*>/g)].forEach(match => {
    const tag = match[0]
    rels[attr(tag, 'Id')] = attr(tag, 'Target')
  })
  const sheets = []
  ;[...workbookXml.matchAll(/<sheet\b[^>]*>/g)].forEach(match => {
    const tag = match[0]
    const name = attr(tag, 'name')
    const rid = attr(tag, 'r:id')
    const target = rels[rid]
    if (name && target) sheets.push({ name, path: `xl/${target.replace(/^\/?xl\//, '')}` })
  })
  return sheets
}

function parseSheetRows(xml, sharedStrings) {
  const rows = []
  const rowMatches = xml.match(/<row\b[\s\S]*?<\/row>/g) || []
  rowMatches.forEach(rowXml => {
    const cells = []
    const cellMatches = rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) || []
    cellMatches.forEach(cellXml => {
      const ref = attr(cellXml, 'r')
      const col = columnNameToIndex((ref.match(/[A-Z]+/) || ['A'])[0])
      const type = attr(cellXml, 't')
      let value = ''
      if (type === 'inlineStr') {
        value = [...cellXml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
          .map(match => textContent(match[1]))
          .join('')
      } else {
        const valueMatch = cellXml.match(/<v[^>]*>([\s\S]*?)<\/v>/)
        value = valueMatch ? textContent(valueMatch[1]) : ''
        if (type === 's') value = sharedStrings[Number(value)] || ''
        else if (value !== '' && !Number.isNaN(Number(value))) value = Number(value)
      }
      cells[col] = value
    })
    rows.push(cells)
  })
  return rows
}

function isBlankCell(value) {
  return value === null || value === undefined || textValue(value) === ''
}

function isBlankRow(row) {
  return !row || row.every(isBlankCell)
}

function findCommissionDetails(rows) {
  const titleNeedle = 'agentscommissiondetails'
  const titleRowIndex = rows.findIndex(row =>
    row.some(cell => normalizeHeader(cell).includes(titleNeedle))
  )
  if (titleRowIndex < 0) return null

  let headerRowIndex = titleRowIndex + 1
  while (headerRowIndex < rows.length && isBlankRow(rows[headerRowIndex])) headerRowIndex += 1
  if (headerRowIndex >= rows.length) return null

  const headerRow = rows[headerRowIndex]
  let firstCol = headerRow.findIndex(cell => !isBlankCell(cell))
  if (firstCol < 0) return null
  let lastCol = headerRow.length - 1
  while (lastCol > firstCol && isBlankCell(headerRow[lastCol])) lastCol -= 1

  const headers = []
  for (let col = firstCol; col <= lastCol; col += 1) {
    headers.push(textValue(headerRow[col]) || `Column ${col - firstCol + 1}`)
  }

  const dataRows = []
  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const sourceRow = rows[rowIndex] || []
    const values = []
    for (let col = firstCol; col <= lastCol; col += 1) values.push(sourceRow[col] ?? '')
    if (values.every(isBlankCell)) break
    dataRows.push(values)
  }

  if (dataRows.length === 0) return null
  return {
    title: textValue(rows[titleRowIndex].find(cell => normalizeHeader(cell).includes(titleNeedle))) || 'Agents Commission Details',
    headers,
    rows: dataRows,
  }
}

export async function parsePayrollWorkbook(file) {
  const entries = await unzipEntries(await file.arrayBuffer())
  const sharedStrings = parseSharedStrings(decodeEntry(entries, 'xl/sharedStrings.xml'))
  const sheets = parseWorkbook(entries)
  const mainSheet = sheets.find(sheet => sheet.name.toLowerCase() === 'main')
  if (!mainSheet) throw new Error('Source workbook must contain a sheet named Main.')

  const rows = parseSheetRows(decodeEntry(entries, mainSheet.path), sharedStrings)
  const headerMap = buildHeaderMap(rows)
  const knownLayout = detectKnownMainLayout()
  const required = knownLayout || {
    serial: findColumn(headerMap, 'serial'),
    employee: findColumn(headerMap, 'employee', true),
    total: findColumn(headerMap, 'total', true),
    current_salary: findColumn(headerMap, 'current_salary', true),
  }
  const optional = knownLayout || {
    fixed_salary: findColumn(headerMap, 'fixed_salary'),
    addon: findColumn(headerMap, 'addon'),
    deduction: findColumn(headerMap, 'deduction'),
    support: findColumn(headerMap, 'support'),
    commission: findColumn(headerMap, 'commission'),
    deposited_cash: findColumn(headerMap, 'deposited_cash'),
    advance: findColumn(headerMap, 'advance'),
    company: findColumn(headerMap, 'company'),
  }
  const shareColumns = knownLayout?.shareColumns || detectShareColumns(rows)
  const entityAmountColumns = knownLayout?.entityAmountColumns || detectEntityAmountColumns(rows)
  const detectedEntities = new Set([...DEFAULT_ENTITIES, ...Object.keys(shareColumns), ...Object.keys(entityAmountColumns)])
  const entities = [...detectedEntities]
  const totals = {
    salaryExpense: 0,
    commission: 0,
    advance: 0,
    advancePaid: 0,
    advanceRecovery: 0,
    depositedCash: 0,
    depositedCashPaid: 0,
    depositedCashRecovery: 0,
    actualPayment: 0,
    difference: 0,
  }
  const entitySummary = Object.fromEntries(entities.map(entity => [entity, {
    salaryExpense: 0,
    commission: 0,
    grossPayrollCost: 0,
    advance: 0,
    depositedCash: 0,
    netPayment: 0,
  }]))
  const employees = []
  let lastTeam = ''

  rows.slice(1).forEach(row => {
    if (required.serial !== null && !textValue(row[required.serial])) return
    const employee = textValue(row[required.employee])
    if (!employee) return
    const team = textValue(row[optional.team])
    if (team) lastTeam = team
    const currentSalary = numberValue(row[required.current_salary])
    const fixedSalary = optional.fixed_salary === null ? currentSalary : numberValue(row[optional.fixed_salary])
    const totalPayable = numberValue(row[required.total])
    const addon = numberValue(row[optional.addon])
    const deduction = numberValue(row[optional.deduction])
    const support = numberValue(row[optional.support])
    const commission = numberValue(row[optional.commission])
    const advance = numberValue(row[optional.advance])
    const depositedCash = numberValue(row[optional.deposited_cash])
    const company = optional.company === null ? '' : textValue(row[optional.company]).toUpperCase()
    const salaryExpense = totalPayable - commission - advance - depositedCash
    const rawShares = Object.fromEntries(Object.entries(shareColumns).map(([entity, col]) => [entity, readShare(row[col])]))
    const shares = normalizeShares(rawShares, company, entities)
    const difference = salaryExpense + commission + advance + depositedCash - totalPayable
    const entityAmounts = Object.fromEntries(Object.entries(entityAmountColumns).map(([entity, col]) => [entity, numberValue(row[col])]))

    totals.salaryExpense += salaryExpense
    totals.commission += commission
    totals.advance += advance
    totals.advancePaid += advance > 0 ? advance : 0
    totals.advanceRecovery += advance < 0 ? Math.abs(advance) : 0
    totals.depositedCash += depositedCash
    totals.depositedCashPaid += depositedCash > 0 ? depositedCash : 0
    totals.depositedCashRecovery += depositedCash < 0 ? Math.abs(depositedCash) : 0
    totals.actualPayment += totalPayable
    totals.difference += difference

    entities.forEach(entity => {
      const share = shares[entity] || 0
      entitySummary[entity].salaryExpense += salaryExpense * share
      entitySummary[entity].commission += commission * share
      entitySummary[entity].advance += advance * share
      entitySummary[entity].depositedCash += depositedCash * share
      entitySummary[entity].netPayment += entityAmountColumns[entity] === undefined
        ? totalPayable * share
        : entityAmounts[entity]
      entitySummary[entity].grossPayrollCost += (salaryExpense + commission) * share
    })

    employees.push({
      slNo: textValue(row[required.serial]),
      employee,
      name: employee,
      team,
      teamFilled: lastTeam || 'Unassigned',
      company,
      currentSalary,
      fixedSalary,
      fixSalary: fixedSalary,
      salaryExpense,
      commission,
      advance,
      depositedCash,
      deduction,
      support,
      addon,
      daysWorked: numberValue(row[optional.days_worked]),
      totalDaysMonth: numberValue(row[optional.month_days]),
      remarks: textValue(row[optional.remarks]),
      role: textValue(row[optional.role]) || 'Unspecified',
      paymentMode: textValue(row[optional.payment_mode]) || 'Unspecified',
      period: textValue(row[optional.period]),
      jobTitle: textValue(row[optional.job_title]),
      deptTeam: textValue(row[optional.department_team]),
      doj: textValue(row[optional.date_of_join]),
      lwd: textValue(row[optional.last_working_day]),
      empCode: textValue(row[optional.employee_code]),
      mhShare: readShare(row[shareColumns.MH]) * 100,
      hhShare: readShare(row[shareColumns.HH]) * 100,
      mhAmount: numberValue(row[entityAmountColumns.MH]),
      hhAmount: numberValue(row[entityAmountColumns.HH]),
      totalPayable,
      total: totalPayable,
      difference,
      shares,
      entityAmounts,
    })
  })

  if (employees.length === 0) throw new Error('No employee rows found on Main sheet.')
  return {
    fileName: file.name,
    sheetName: mainSheet.name,
    commissionDetails: findCommissionDetails(rows),
    entities,
    totals,
    entitySummary: entities.map(entity => ({ entity, ...entitySummary[entity] })),
    employees,
    generatedAt: new Date().toISOString(),
  }
}

export function payrollRowsToCsv(rows) {
  const escape = value => `"${String(value ?? '').replace(/"/g, '""')}"`
  return rows.map(row => row.map(escape).join(',')).join('\n')
}
