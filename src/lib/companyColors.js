// Palette of pastel colours for company identity
// Each company gets one assigned by index order
// Colours chosen to be pale enough for inkjet printing (low ink use)

export const COMPANY_PALETTE = [
  { accent: '#1d4ed8', pastel: '#dbeafe', name: 'Blue'   },
  { accent: '#065f46', pastel: '#d1fae5', name: 'Green'  },
  { accent: '#92400e', pastel: '#fef3c7', name: 'Amber'  },
  { accent: '#7c3aed', pastel: '#ede9fe', name: 'Purple' },
  { accent: '#be123c', pastel: '#ffe4e6', name: 'Rose'   },
  { accent: '#0e7490', pastel: '#cffafe', name: 'Cyan'   },
  { accent: '#c2410c', pastel: '#ffedd5', name: 'Orange' },
  { accent: '#4d7c0f', pastel: '#ecfccb', name: 'Lime'   },
]

// Returns { accent, pastel } for a company based on its index in the sorted list
export function getCompanyColor(companies, companyId) {
  const sorted = [...companies].sort((a, b) => a.created_at?.localeCompare(b.created_at || '') || 0)
  const idx = sorted.findIndex(c => c.id === companyId)
  return COMPANY_PALETTE[Math.max(0, idx) % COMPANY_PALETTE.length]
}

// Derive initials from applicant full name e.g. "Kaynat Hussain" -> "KH"
export function getInitials(fullName) {
  if (!fullName) return 'XX'
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('')
}

// Build filename: PA-CO1-2026-0016.pdf
export function buildFilename(refNumber) {
  if (!refNumber) return 'PA-application.pdf'
  return `PA-${refNumber}.pdf`
}
