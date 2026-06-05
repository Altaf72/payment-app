export default function StatusBadge({ status }) {
  const labels = {
    draft:        'Draft',
    pending:      'Pending',
    mgr_approved: 'Mgr Approved',
    mgr_rejected: 'Mgr Rejected',
    fin_approved: 'Fin Approved',
    approved:     'Approved',
    rejected:     'Rejected',
    escalated:    'Escalated',
    returned:     'Returned',
    withdrawn:    'Withdrawn',
  }
  return (
    <span className={`badge badge-${status}`}>
      {labels[status] || status}
    </span>
  )
}
