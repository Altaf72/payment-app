const DB_NAME = 'payment-app-downloads'
const STORE_NAME = 'directory-handles'
const ROOT_KEY = 'downloads-folder-v2'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function cleanSegment(value, fallback) {
  const cleaned = String(value || '').replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim()
  return cleaned || fallback
}

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function readStoredHandle() {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const request = transaction.objectStore(STORE_NAME).get(ROOT_KEY)
    request.onsuccess = () => resolve(request.result || null)
    request.onerror = () => reject(request.error)
  }).finally(() => db.close())
}

async function storeHandle(handle) {
  const db = await openHandleDb()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    transaction.objectStore(STORE_NAME).put(handle, ROOT_KEY)
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error)
  }).finally(() => db.close())
}

async function writableParentHandle() {
  if (!window.showDirectoryPicker) return null
  let handle = null
  try { handle = await readStoredHandle() } catch {}
  if (handle) {
    const options = { mode:'readwrite' }
    let permission = await handle.queryPermission(options)
    if (permission !== 'granted') permission = await handle.requestPermission(options)
    if (permission === 'granted') return handle
  }

  if (!sessionStorage.getItem('payment_download_location_explained')) {
    window.alert('Select your standard Downloads folder once. The app will create PAYMENTAPPDOWNLOADS and its month/Class folders inside Downloads automatically.')
    sessionStorage.setItem('payment_download_location_explained', '1')
  }
  handle = await window.showDirectoryPicker({ id:'payment-app-downloads-folder-v2', mode:'readwrite', startIn:'downloads' })
  await storeHandle(handle)
  return handle
}

export async function saveOrganizedDownload({ blob, fileName, date, classNames }) {
  const parent = await writableParentHandle()
  if (!parent) return { saved:false, unsupported:true }

  const parsed = date ? new Date(date) : new Date()
  const validDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const year = validDate.getFullYear()
  const month = validDate.getMonth()
  const monthFolder = `${year} ${String(month + 1).padStart(2, '0')} ${MONTHS[month]}`
  const classFolder = cleanSegment((classNames || []).find(Boolean), 'Unclassified')
  const safeName = cleanSegment(fileName, 'attachment')

  const base = await parent.getDirectoryHandle('PAYMENTAPPDOWNLOADS', { create:true })
  const period = await base.getDirectoryHandle(monthFolder, { create:true })
  const property = await period.getDirectoryHandle(classFolder, { create:true })
  const file = await property.getFileHandle(safeName, { create:true })
  const writable = await file.createWritable()
  await writable.write(blob)
  await writable.close()
  return { saved:true, path:`PAYMENTAPPDOWNLOADS\\${monthFolder}\\${classFolder}\\${safeName}` }
}
