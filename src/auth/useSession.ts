import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/data/supabaseClient'
import type { Profile } from '@/domain/types'

interface SessionState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  refreshProfile: () => Promise<void>
}

async function fetchProfile(session: Session): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, family_id, role, display_name')
    .eq('id', session.user.id)
    .maybeSingle()

  if (error || !data) return null
  return {
    id: data.id,
    familyId: data.family_id,
    role: data.role,
    displayName: data.display_name,
  }
}

// Sesión + perfil (familia y rol) del usuario autenticado. auth/ es el
// único lugar de la UI que sabe de Supabase Auth; el resto del árbol
// consume este hook. `refreshProfile` se usa tras el onboarding, cuando
// se acaba de crear el perfil y todavía no está en el estado local.
export function useSession(): SessionState {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function handleSession(nextSession: Session | null) {
      if (!nextSession) {
        if (active) {
          setSession(null)
          setProfile(null)
          setLoading(false)
        }
        return
      }
      const nextProfile = await fetchProfile(nextSession)
      if (!active) return
      setSession(nextSession)
      setProfile(nextProfile)
      setLoading(false)
    }

    supabase.auth.getSession().then(({ data }) => handleSession(data.session))

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      handleSession(nextSession)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  async function refreshProfile() {
    if (!session) return
    const nextProfile = await fetchProfile(session)
    setProfile(nextProfile)
  }

  return { session, profile, loading, refreshProfile }
}
