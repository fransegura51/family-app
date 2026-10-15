import { adminSetLaunch } from '@/data/community'
import { launchText } from '@/domain/communityAdmin'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { ActionNotice, InfoBox, TwoTapButton } from '@/ui/community/admin/AdminShared'
import { useAdminAction } from '@/ui/community/admin/useAdminData'

// Interruptor «Abrir Comunidad a todos / Cerrar». Cambia un parámetro de verdad (visible para todos los usuarios), así que pide DOS toques y explica qué pasa.
// El estado actual sale de `useCommunity().status` (ya cargado por el marco de Comunidad: no hace falta otra consulta); tras cambiar se refresca una vez.
export function LaunchSwitch({ onChanged }: { onChanged?: () => void }) {
  const { status, refresh } = useCommunity()
  const action = useAdminAction()
  if (!status) return null
  const launched = status.launched
  const t = launchText(launched)
  return (
    <section className="cadm-card cadm-launch" aria-labelledby="cadm-launch-title">
      <h3 id="cadm-launch-title">Apertura de Comunidad</h3>
      <p>
        <span className={`cadm-chip ${launched ? 'cadm-chip-ok' : 'cadm-chip-warn'}`}>{launched ? 'Abierta' : 'Cerrada'}</span> {t.state}
      </p>
      <InfoBox tone="warn">{t.effect}</InfoBox>
      <ActionNotice message={action.message} error={action.error} />
      <TwoTapButton
        label={t.button}
        armedLabel={t.confirm}
        variant={launched ? 'danger' : 'primary'}
        disabled={action.busy}
        onConfirm={() => {
          void (async () => {
            const r = await action.run(() => adminSetLaunch(!launched), launched ? 'Comunidad cerrada: ahora solo la ven los administradores.' : 'Comunidad abierta a todos.')
            if (r.ok) {
              await refresh()
              onChanged?.()
            }
          })()
        }}
      />
    </section>
  )
}
