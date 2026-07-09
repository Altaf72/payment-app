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

export async function buildPfsFieldsForApproval(supabase, app, assignedBy = null) {
  if (!app?.id) return {}

  const { data: current, error: currentError } = await supabase
    .from('applications')
    .select('pfs_folder,pfs_no,pfs_display')
    .eq('id', app.id)
    .single()

  if (currentError) throw currentError
  if (current?.pfs_display || current?.pfs_no) return {}

  const pfsFolder = getPfsFolder(app?.payment_method_name)
  const { data, error } = await supabase
    .from('applications')
    .select('pfs_no')
    .eq('pfs_folder', pfsFolder)
    .order('pfs_no', { ascending: false })
    .limit(1)

  if (error) throw error

  const nextNo = Number(data?.[0]?.pfs_no || 0) + 1
  return {
    pfs_folder: pfsFolder,
    pfs_no: nextNo,
    pfs_display: formatPfsDisplay(pfsFolder, nextNo),
    pfs_assigned_at: new Date().toISOString(),
    pfs_assigned_by: assignedBy || null,
  }
}
