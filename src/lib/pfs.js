export function getPfsFolder(paymentMethodName) {
  return String(paymentMethodName || '').toLowerCase().includes('cash')
    ? 'cash'
    : 'bank_non_cash'
}

export function formatPfsDisplay(folder, number) {
  if (!folder || !number) return ''
  const prefix = folder === 'cash' ? 'CASH-PFS' : 'BANK-PFS'
  return `${prefix}-${String(number).padStart(4, '0')}`
}

// A PFS belongs to the application from the moment it is made.
export async function buildPfsFieldsForCreation(supabase, paymentMethodName, assignedBy = null) {
  const pfsFolder = getPfsFolder(paymentMethodName)
  // PFS numbering must be shared by every maker.  Do not derive it from rows
  // visible to the current user: staff RLS can hide other makers' applications.
  const { data, error } = await supabase.rpc('next_pfs_number', {
    p_folder: pfsFolder,
  })

  if (error) throw error

  const nextNo = Number(data)
  if (!Number.isInteger(nextNo) || nextNo < 1) {
    throw new Error('Could not allocate a PFS number')
  }
  return {
    pfs_folder: pfsFolder,
    pfs_no: nextNo,
    pfs_display: formatPfsDisplay(pfsFolder, nextNo),
    pfs_assigned_at: new Date().toISOString(),
    pfs_assigned_by: assignedBy || null,
  }
}
