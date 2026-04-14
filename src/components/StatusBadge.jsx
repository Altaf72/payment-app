export default function StatusBadge({ status }) {
  const labels = {
    draft: 'Draft', pending: 'Pending', approved: 'Approved',
    rejected: 'Rejected', escalated: 'Escalated', returned: 'Returned',
    withdrawn: 'Withdrawn',
  }
  return (
    <span className={`badge badge-${status}`}>
      {labels[status] || status}
    </span>
  )
}
