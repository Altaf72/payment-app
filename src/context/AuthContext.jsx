import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) fetchProfile(session.user.id)
      else setProfile(null)
    })

    return () => subscription.unsubscribe()
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

  return (
    <AuthContext.Provider value={{
      user, profile, loading,
      signIn, signOut,
      isFinanceOrAbove, isSuperAdmin, isUpperManagement
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
