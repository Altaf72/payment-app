function csvCell(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export function buildQboJournalCsv({
  debitAccount,
  creditAccount,
  amount,
  description,
  name,
  tax,
  qboClass,
}) {
  const headers = ['ACCOUNT', 'DEBITS', 'CREDITS', 'DESCRIPTION', 'NAME', 'TAX', 'CLASS']
  const rows = [
    [debitAccount, Number(amount).toFixed(2), '', description, name, tax, qboClass],
    [creditAccount, '', Number(amount).toFixed(2), description, '', '', qboClass],
  ]
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\r\n')
}
