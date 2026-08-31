import { supabase } from '@/data/supabaseClient'
import type { PushSubscriptionData } from '@/services/notifications'

// upsert por endpoint: si el dispositivo ya estaba suscrito (p.ej. tras
// desinstalar/reinstalar), evita duplicados en vez de fallar por la
// restricción unique.
export async function savePushSubscription(sub: PushSubscriptionData): Promise<void> {
  const { data: userResult } = await supabase.auth.getUser()
  if (!userResult.user) throw new Error('No autenticado')

  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      profile_id: userResult.user.id,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw error
}
