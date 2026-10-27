// Small, user-scoped browser cache for suggestion lists.  It lets forms render
// immediately on repeat visits while Supabase refreshes the list quietly.
const PREFIX = 'paymentapp.cache.v1'

export function readBrowserCache(key, maxAgeMs = 15 * 60 * 1000) {
  try {
    const item = JSON.parse(localStorage.getItem(`${PREFIX}:${key}`) || 'null')
    if (!item || !Array.isArray(item.data) || Date.now() - item.savedAt > maxAgeMs) return null
    return item.data
  } catch { return null }
}

export function writeBrowserCache(key, data) {
  try { localStorage.setItem(`${PREFIX}:${key}`, JSON.stringify({ savedAt: Date.now(), data })) } catch {}
}
