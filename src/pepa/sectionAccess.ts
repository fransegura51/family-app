// ¿Puede esta cuenta ver una sección? Mismo criterio que el menú de la app (ui/NavShell.tsx) y que Economía por voz (pepa/finance.ts, canAccessFinance):
// si el perfil tiene secciones limitadas y la pedida no está entre ellas, no se le enseña ni se le cuenta por voz. Un fallo de red o de sesión NO es
// «sin acceso»: se lanza, para que Pepa diga que no ha podido comprobarlo en vez de negar o conceder a ciegas.
import { supabase } from '@/data/supabaseClient'

export async function canAccessSection(sectionId: string): Promise<boolean> {
  const { data: userResult, error: userError } = await supabase.auth.getUser()
  if (userError || !userResult.user) throw new Error('sin sesión')
  const { data, error } = await supabase.from('profiles').select('allowed_sections').eq('id', userResult.user.id).maybeSingle()
  if (error || !data) throw new Error('perfil no disponible')
  const sections = data.allowed_sections as string[] | null
  return sections == null || sections.includes(sectionId)
}
