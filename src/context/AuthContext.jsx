import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)
const IDLE_TIMEOUT_MS = 2 * 60 * 60 * 1000
const IDLE_NOTICE_KEY = 'payment_app_idle_notice'
const idleActivityKey = userId => `payment_app_last_activity:${userId}`

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [moduleAccess, setModuleAccess] = useState([])
  const [moduleRoles, setModuleRoles] = useState([])

  async function fetchProfile(userId) {
    const [{ data: profileData }, { data: modules }, { data: roles }] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('user_module_access').select('module_key').eq('user_id', userId).eq('granted', true),
      supabase.from('user_module_roles').select('module_key,role_key').eq('user_id', userId),
    ])

    return {
      profile: profileData ?? null,
      moduleAccess: (modules || []).map(row => row.module_key),
      moduleRoles: roles || [],
    }
  }

  useEffect(() => {
    let active = true
    let generation = 0
    let pendingUserId = null
    let loadedUserId = null
    let initialized = false

    async function applySession(session) {
      if (!active) return
      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null
      if ((nextUserId !== null && nextUserId === pendingUserId) ||
          (initialized && nextUserId === loadedUserId && nextUserId !== null)) return
      const currentGeneration = ++generation
      pendingUserId = nextUserId
      initialized = true
      setLoading(true)
      setAuthError('')
      if (!nextUser) {
        loadedUserId = null
        setUser(null)
        setProfile(null)
        setModuleAccess([])
        setModuleRoles([])
        pendingUserId = null
        setLoading(false)
        return
      }
      try {
        const nextAccess = await fetchProfile(nextUserId)
        if (!active || currentGeneration !== generation) return
        if (!nextAccess.profile) throw new Error('User profile was not found')
        setProfile(nextAccess.profile)
        setModuleAccess(nextAccess.moduleAccess)
        setModuleRoles(nextAccess.moduleRoles)
        setUser(nextUser)
        loadedUserId = nextUserId
      } catch (error) {
        if (!active || currentGeneration !== generation) return
        console.error('Could not load user profile', error)
        setUser(nextUser)
        setProfile(null)
        setModuleAccess([])
        setModuleRoles([])
        setAuthError(error?.message || 'Unable to load account permissions')
        loadedUserId = null
      } finally {
        if (active && currentGeneration === generation) {
          pendingUserId = null
          setLoading(false)
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return
      // A sign-out must invalidate the previous user's deduplication state.
      // Otherwise signing back in as the same user is ignored.
      if (event === 'SIGNED_OUT') {
        loadedUserId = null
        pendingUserId = null
        ++generation
      }
      // Supabase callbacks must not await queries that also use the auth client.
      setTimeout(() => { if (active) applySession(session) }, 0)
    })

    // Do not depend solely on INITIAL_SESSION. Some environments never deliver
    // that event to the mounted provider, leaving /login stuck indefinitely.
    const startupTimer = setTimeout(() => {
      if (active && !initialized) {
        setAuthError('Session initialization timed out. Please try signing in.')
        setLoading(false)
      }
    }, 6000)
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || initialized) return
      if (error) throw error
      applySession(data?.session ?? null)
    }).catch(error => {
      if (!active || initialized) return
      setAuthError(error?.message || 'Could not restore session')
      setLoading(false)
    })
    return () => {
      active = false
      clearTimeout(startupTimer)
      ++generation
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!user?.id) return
    const activityKey = idleActivityKey(user.id)
    let timer
    let activityFlushTimer
    let signingOut = false
    const readActivity = () => Number(localStorage.getItem(activityKey)) || 0

    function scheduleCheck() {
      clearTimeout(timer)
      const lastActivity = readActivity()
      const remaining = Math.max(0, IDLE_TIMEOUT_MS - (Date.now() - lastActivity))
      timer = setTimeout(checkIdle, remaining)
    }

    async function checkIdle() {
      if (signingOut) return
      const lastActivity = readActivity()
      if (lastActivity && Date.now() - lastActivity < IDLE_TIMEOUT_MS) {
        scheduleCheck()
        return
      }
      signingOut = true
      sessionStorage.setItem(IDLE_NOTICE_KEY, '1')
      localStorage.setItem(IDLE_NOTICE_KEY, `${user.id}:${Date.now()}`)
      await supabase.auth.signOut({ scope: 'local' })
    }

    function recordActivity() {
      if (signingOut) return
      const lastActivity = readActivity()
      const now = Date.now()
      if (lastActivity && now - lastActivity >= IDLE_TIMEOUT_MS) {
        checkIdle()
        return
      }
      // Limit writes during continuous mouse movement while sharing activity
      // across all tabs signed in as this user in this browser.
      if (!lastActivity || now - lastActivity >= 10000) {
        clearTimeout(activityFlushTimer)
        localStorage.setItem(activityKey, String(now))
        scheduleCheck()
      } else {
        // Preserve the final activity time even when it falls inside the
        // write-throttling window.
        clearTimeout(activityFlushTimer)
        activityFlushTimer = setTimeout(() => {
          if (!signingOut && now > readActivity()) {
            localStorage.setItem(activityKey, String(now))
            scheduleCheck()
          }
        }, 1000)
      }
    }

    function onStorage(event) {
      if (event.key === activityKey && event.newValue) scheduleCheck()
      if (event.key === IDLE_NOTICE_KEY && event.newValue?.startsWith(`${user.id}:`)) {
        sessionStorage.setItem(IDLE_NOTICE_KEY, '1')
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') checkIdle()
    }

    if (!readActivity()) localStorage.setItem(activityKey, String(Date.now()))
    scheduleCheck()
    const activityEvents = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel']
    activityEvents.forEach(event => window.addEventListener(event, recordActivity, { passive:true }))
    window.addEventListener('storage', onStorage)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimeout(timer)
      clearTimeout(activityFlushTimer)
      activityEvents.forEach(event => window.removeEventListener(event, recordActivity))
      window.removeEventListener('storage', onStorage)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user?.id])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Check app-level active flag
    const { data: profile } = await supabase
      .from('users')
      .select('is_active, merged_into')
      .eq('id', data.user.id)
      .single()
    if (profile?.is_active === false) {
      await supabase.auth.signOut()
      throw new Error('Your account has been deactivated. Please contact your administrator.')
    }
    if (profile?.merged_into) {
      await supabase.auth.signOut()
      throw new Error('This account has been merged. Please log in with your new account credentials.')
    }
    localStorage.setItem(idleActivityKey(data.user.id), String(Date.now()))
    sessionStorage.removeItem(IDLE_NOTICE_KEY)
    return data
  }

  async function signOut() {
    // A local sign-out is sufficient for this browser and avoids a network
    // request preventing the user from leaving the current session.
    const { error } = await supabase.auth.signOut({ scope: 'local' })
    if (error) throw error
    if (user?.id) localStorage.removeItem(idleActivityKey(user.id))
    sessionStorage.removeItem(IDLE_NOTICE_KEY)
    setUser(null)
    setProfile(null)
    setModuleAccess([])
    setModuleRoles([])
    setAuthError('')
    setLoading(false)
  }

  const isFinanceOrAbove = profile?.role && ['finance','manager','ceo','cfo','superadmin'].includes(profile.role)
  const isSuperAdmin = profile?.role === 'superadmin'
  const isUpperManagement = profile?.role && ['ceo','cfo'].includes(profile.role)
  const hasModule = (moduleKey) => profile?.role === 'superadmin' ||
    moduleAccess.includes(moduleKey) ||
    (moduleKey === 'payment_applications' && profile?.role === 'supervisor') ||
    (moduleKey === 'payment_applications' && profile?.role === 'supervisor') ||
    (moduleKey === 'holiday_home_receipts' && ['finance','cfo','supervisor','manager'].includes(profile?.role)) ||
    (moduleKey === 'holiday_home_receipts' && profile?.holiday_home_receipts_enabled === true)
  const hasModuleRole = (moduleKey, roleKey) => profile?.role === 'superadmin' || moduleRoles.some(row =>
    row.module_key === moduleKey && (row.role_key === roleKey ||
      (roleKey === 'view' && ['make','finance'].includes(row.role_key)) ||
      (roleKey === 'make' && row.role_key === 'finance')))

  return (
    <AuthContext.Provider value={{
      user, profile, loading, authError,
      signIn, signOut,
      isFinanceOrAbove, isSuperAdmin, isUpperManagement, moduleAccess, moduleRoles, hasModule, hasModuleRole
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
