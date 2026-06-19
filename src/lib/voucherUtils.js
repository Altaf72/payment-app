export function applicationSequence(refNumber) {
  const match = String(refNumber || '').match(/(\d+)(?!.*\d)/)
  return match?.[1] || String(refNumber || '').replace(/[^a-zA-Z0-9]/g, '') || '0000'
}

export function paymentVoucherBase(prefix, refNumber) {
  return `${String(prefix || '').toUpperCase()}PV-${applicationSequence(refNumber)}`
}

export function nextPaymentVoucherNumber(prefix, refNumber, existingVouchers = []) {
  const base = paymentVoucherBase(prefix, refNumber)
  if (existingVouchers.length === 0) {
    return { voucherNumber: base, installmentNo: 1 }
  }

  const maxInstallment = existingVouchers.reduce(
    (max, voucher) => Math.max(max, Number(voucher.installment_no) || 1),
    1
  )
  const installmentNo = maxInstallment + 1
  return {
    voucherNumber: `${base}-${String(installmentNo).padStart(2, '0')}`,
    installmentNo,
  }
}
