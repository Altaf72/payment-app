import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [moduleAccess, setModuleAccess] = useState([])

  async function fetchProfile(userId) {
    const [{ data: profileData }, { data: modules }] = await Promise.all([
      supabase.from('users').select('*').eq('id', userId).single(),
      supabase.from('user_module_access').select('module_key').eq('user_id', userId).eq('granted', true),
    ])

    return {
      profile: profileData ?? null,
      moduleAccess: (modules || []).map(row => row.module_key),
    }
  }

  useEffect(() => {
    let active = true
    let requestId = 0
    let loadedUserId

    async function applySession(session) {
      if (!active) return
      const currentRequest = ++requestId
      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null

      // The same user may emit SIGNED_IN again when a browser window regains
      // focus. Keep the existing app mounted once their profile is loaded.
      if (loadedUserId === nextUserId) return

      setLoading(true)
      setUser(nextUser)

      if (!nextUser) {
        if (active && currentRequest === requestId) {
          setProfile(null)
          setModuleAccess([])
          loadedUserId = null
          setLoading(false)
        }
        return
      }

      // Keep routes and the sidebar paused until both the role and the module
      // permissions are known. Previously the session was marked ready first,
      // which could leave staff users on a blank, non-interactive shell.
      try {
        const nextAccess = await fetchProfile(nextUser.id)
        if (active && currentRequest === requestId) {
          setProfile(nextAccess.profile)
          setModuleAccess(nextAccess.moduleAccess)
          loadedUserId = nextUserId
          setLoading(false)
        }
      } catch (error) {
        // Do not leave the whole application on an infinite loading screen if
        // a temporary profile request fails. The next explicit auth event can
        // retry, while the current signed-in session remains usable.
        if (active && currentRequest === requestId) {
          console.error('Could not load user profile', error)
          setProfile(null)
          setModuleAccess([])
          loadedUserId = nextUserId
          setLoading(false)
        }
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED') return
      applySession(session)
    })

    supabase.auth.getSession().then(({ data: { session } }) => applySession(session))

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

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
    return data
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const isFinanceOrAbove = profile?.role && ['finance','manager','ceo','cfo','superadmin'].includes(profile.role)
  const isSuperAdmin = profile?.role === 'superadmin'
  const isUpperManagement = profile?.role && ['ceo','cfo'].includes(profile.role)
  const hasModule = (moduleKey) => profile?.role === 'superadmin' ||
    moduleAccess.includes(moduleKey) ||
    (moduleKey === 'payment_applications' && profile?.role === 'supervisor') ||
    (moduleKey === 'payment_applications' && profile?.role === 'supervisor') ||
    (moduleKey === 'holiday_home_receipts' && ['finance','cfo','supervisor'].includes(profile?.role)) ||
    (moduleKey === 'holiday_home_receipts' && profile?.holiday_home_receipts_enabled === true)

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signOut,
      isFinanceOrAbove, isSuperAdmin, isUpperManagement, moduleAccess, hasModule
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
