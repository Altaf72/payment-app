const DB_NAME = 'payment-app-downloads'
const STORE_NAME = 'directory-handles'
const ROOT_KEY = 'downloads-folder-v2'
const ROOT_FOLDER = 'PAYMENTAPPDOWNLOADS'
const REVIEW_FOLDER = '_Needs Review'
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
    try {
      const options = { mode:'readwrite' }
      let permission = await handle.queryPermission(options)
      if (permission !== 'granted') permission = await handle.requestPermission(options)
      if (permission === 'granted') return handle
    } catch {
      // Stored folder is no longer valid (moved/deleted) - ask for it again below.
    }
  }

  if (!sessionStorage.getItem('payment_download_location_explained')) {
    window.alert('Select your standard Downloads folder once. The app will create PAYMENTAPPDOWNLOADS and its month/Class folders inside Downloads automatically.')
    sessionStorage.setItem('payment_download_location_explained', '1')
  }
  handle = await window.showDirectoryPicker({ id:'payment-app-downloads-folder-v2', mode:'readwrite', startIn:'downloads' })
  await storeHandle(handle)
  return handle
}

/**
 * Make sure the download folder is chosen and writable. Call this straight
 * from a click handler (before any slow work) so the browser can show its
 * permission prompt. Returns { ok:true } | { ok:false, cancelled:true } | { ok:false, unsupported:true }
 */
export async function ensureDownloadFolder() {
  try {
    const handle = await writableParentHandle()
    return handle ? { ok:true } : { ok:false, unsupported:true }
  } catch (error) {
    if (error?.name === 'AbortError') return { ok:false, cancelled:true }
    throw error
  }
}

async function uniqueFileName(directory, proposedName) {
  const dot = proposedName.lastIndexOf('.')
  const stem = dot > 0 ? proposedName.slice(0, dot) : proposedName
  const ext = dot > 0 ? proposedName.slice(dot) : ''
  let candidate = proposedName
  let index = 2
  while (true) {
    try {
      await directory.getFileHandle(candidate)
      candidate = `${stem} (${index++})${ext}`
    } catch (error) {
      if (error?.name === 'NotFoundError') return candidate
      throw error
    }
  }
}

async function openPath(root, segments) {
  let directory = root
  for (const segment of segments) {
    directory = await directory.getDirectoryHandle(segment, { create:true })
  }
  return directory
}

async function writeBlob(directory, proposedName, blob) {
  const uniqueName = await uniqueFileName(directory, proposedName)
  const file = await directory.getFileHandle(uniqueName, { create:true })
  const writable = await file.createWritable()
  try {
    await writable.write(blob)
    await writable.close()
  } catch (error) {
    await writable.abort().catch(() => {})
    throw error
  }
  return uniqueName
}

/**
 * Save a file into PAYMENTAPPDOWNLOADS using the filing rules:
 *
 *   - folder given        -> <Month>\<folder...>\file           (e.g. Batches\BATCH-2026-0042)
 *   - one or more classes -> <Month>\<Class>\file (one copy per class)
 *   - no class / reviewReason given -> _Needs Review\file       (flagged for manual filing)
 *
 * Returns:
 *   { saved, paths, path, needsReview, reason, errors }
 *   { saved:false, cancelled:true }    user closed the folder picker
 *   { saved:false, unsupported:true }  browser cannot write to folders
 */
export async function saveOrganizedDownload({ blob, fileName, date, classNames, folder, reviewReason }) {
  let parent
  try {
    parent = await writableParentHandle()
  } catch (error) {
    if (error?.name === 'AbortError') return { saved:false, cancelled:true }
    throw error
  }
  if (!parent) return { saved:false, unsupported:true }

  const parsed = date ? new Date(date) : new Date()
  const validDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  const year = validDate.getFullYear()
  const month = validDate.getMonth()
  const monthFolder = `${year} ${String(month + 1).padStart(2, '0')} ${MONTHS[month]}`

  const folderSegments = (Array.isArray(folder) ? folder : [])
    .map(value => cleanSegment(value, '')).filter(Boolean)
  const rawClasses = Array.isArray(classNames) ? classNames : (classNames ? [classNames] : [])
  const classes = [...new Set(rawClasses.map(value => cleanSegment(value, '')).filter(Boolean))]

  const safeName = cleanSegment(fileName, 'attachment')
  const dot = safeName.lastIndexOf('.')
  const stem = dot > 0 ? safeName.slice(0, dot) : safeName
  const extension = dot > 0 ? safeName.slice(dot) : ''

  // Decide the destinations. Each target is { segments, name, label }.
  let targets = []
  let needsReview = false
  let reason = ''
  if (reviewReason) {
    needsReview = true
    reason = reviewReason
  } else if (folderSegments.length) {
    targets = [{ segments:[monthFolder, ...folderSegments], name:safeName }]
  } else if (classes.length) {
    targets = classes.map(classFolder => {
      const others = classes.filter(name => name !== classFolder)
      return {
        segments:[monthFolder, classFolder],
        name:others.length ? `${stem} - Also ${others.join(', ')}${extension}` : safeName,
      }
    })
  } else {
    needsReview = true
    reason = 'No class on this record'
  }
  if (needsReview) targets = [{ segments:[REVIEW_FOLDER], name:safeName }]

  const base = await parent.getDirectoryHandle(ROOT_FOLDER, { create:true })
  const paths = []
  const errors = []

  for (const target of targets) {
    try {
      const directory = await openPath(base, target.segments)
      const savedName = await writeBlob(directory, target.name, blob)
      paths.push([ROOT_FOLDER, ...target.segments, savedName].join('\\'))
    } catch (error) {
      errors.push({ className:target.segments[target.segments.length - 1], message:String(error?.message || error) })
    }
  }

  return {
    saved:paths.length === targets.length,
    path:paths[0] || null,
    paths,
    needsReview,
    reason,
    ...(errors.length ? { errors } : {})
  }
}
