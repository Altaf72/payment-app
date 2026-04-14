const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
  'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen',
  'Seventeen','Eighteen','Nineteen']
const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']

function toWords(n) {
  n = Math.round(n)
  if (n === 0) return 'Zero'
  if (n < 20) return ones[n]
  if (n < 100) return tens[Math.floor(n/10)] + (n%10 ? ' '+ones[n%10] : '')
  if (n < 1000) return ones[Math.floor(n/100)]+' Hundred'+(n%100?' '+toWords(n%100):'')
  if (n < 1000000) return toWords(Math.floor(n/1000))+' Thousand'+(n%1000?' '+toWords(n%1000):'')
  return toWords(Math.floor(n/1000000))+' Million'+(n%1000000?' '+toWords(n%1000000):'')
}

export function amountToWords(amount) {
  if (!amount || isNaN(amount)) return ''
  const whole = Math.floor(amount)
  const fils = Math.round((amount - whole) * 100)
  let w = toWords(whole) + ' Dirham' + (whole !== 1 ? 's' : '')
  if (fils > 0) w += ' and ' + toWords(fils) + ' Fils'
  return w + ' Only'
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-AE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  }).replace(/\//g, '-')
}
