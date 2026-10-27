import { useCallback, useEffect, useState } from 'react'
import { getAiState } from '@/data/aiControl'
import { aiErrorText, type AiState } from '@/domain/aiControl'
import { useRealtimeRefresh } from '@/state/useRealtimeRefresh'
import { HelpDestMark } from '@/help/ui/HelpDest'
import { AdminGroup } from '@/ui/admin/AdminGroups'
import { AiAlerts } from '@/ui/admin/ia/AiAlerts'
import { AiFamilies } from '@/ui/admin/ia/AiFamilies'
import { AiLimits } from '@/ui/admin/ia/AiLimits'
import { AiPlans, AiPrices } from '@/ui/admin/ia/AiPlansPrices'
import { AiProjection } from '@/ui/admin/ia/AiProjection'
import { AiSwitches } from '@/ui/admin/ia/AiSwitches'
import { AiUsage, PeriodPicker, usePeriod } from '@/ui/admin/ia/AiUsage'
import { AdminError, AdminLoading } from '@/ui/community/admin/AdminShared'
import '@/ui/admin/ia/aiControl.css'

// Área «Control de IA»: interruptores (general y por función), consumo y costes, familias, límites, alertas, proyección, planes y tarifas. Todo lo decide y aplica el servidor; esta
// pantalla solo lo enseña y lo cambia. Los interruptores se sincronizan al momento entre dispositivos (Realtime sobre ai_config y ai_alert, solo legibles por administradores).
export function AreaIA() {
  const [state, setState] = useState<AiState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const period = usePeriod()

  useEffect(() => {
    let alive = true
    getAiState().then(
      (s) => {
        if (!alive) return
        setState(s)
        setError(null)
      },
      (e: unknown) => {
        if (alive) setError(aiErrorText(e))
      },
    )
    return () => {
      alive = false
    }
  }, [tick])

  const reload = useCallback(() => setTick((t) => t + 1), [])
  useRealtimeRefresh(['ai_config', 'ai_alert'], reload)

  if (error && !state) return <AdminError message={error} onRetry={reload} />
  if (!state) return <AdminLoading />

  return (
    <div className="admin-area">
      <HelpDestMark id="admin.control-ia" />
      <p className="muted">
        Aquí controlas toda la inteligencia artificial de PEPA: qué funciones están activas, cuánto consumen, cuánto cuestan (estimado), y cuándo saltan los avisos. Nada de lo que ven las familias se muestra: solo cifras.
      </p>
      {error && (
        <p className="cadm-notice cadm-notice-error" role="alert">
          {error}
        </p>
      )}

      <AdminGroup area="ia" id="interruptores" title="Interruptores de IA" summary="Interruptor general y uno por función, por módulo" badge={state.enabled ? 'Activada' : 'Desactivada'} badgeTone={state.enabled ? 'info' : 'alert'} defaultOpen helpId="ia.grupo-interruptores">
        <AiSwitches state={state} reload={reload} />
      </AdminGroup>

      <AdminGroup area="ia" id="consumo" title="Consumo y costes" summary="Llamadas, tokens y coste estimado por función, módulo y modelo" helpId="ia.grupo-consumo">
        <div className="ai-stack">
          <PeriodPicker period={period} />
          <AiUsage period={period} />
        </div>
      </AdminGroup>

      <AdminGroup area="ia" id="familias" title="Consumo por familias" summary="Ranking, detalle por función y por persona, y límites propios">
        <div className="ai-stack">
          <PeriodPicker period={period} />
          <AiFamilies period={period} functions={state.functions} />
        </div>
      </AdminGroup>

      <AdminGroup area="ia" id="limites" title="Límites y presupuestos" summary="Observación, aviso o bloqueo; excepciones por familia" helpId="ia.grupo-limites">
        <AiLimits functions={state.functions} />
      </AdminGroup>

      <AdminGroup area="ia" id="alertas" title="Alertas y anomalías" summary="Subidas bruscas, bucles, errores del proveedor y límites cercanos" helpId="ia.grupo-alertas" badge={state.openAlerts > 0 ? state.openAlerts : undefined} badgeTone="alert">
        <AiAlerts state={state} reloadState={reload} />
      </AdminGroup>

      <AdminGroup area="ia" id="proyeccion" title="Proyección de costes de IA" summary="Escenarios de 1.000, 10.000 y 100.000 familias (no es gasto real)" helpId="ia.grupo-proyeccion">
        <AiProjection />
      </AdminGroup>

      <AdminGroup area="ia" id="planes" title="Planes (preparación)" summary="Cuotas por plan y función para el futuro modelo gratuito y de pago; sin efecto hoy">
        <AiPlans functions={state.functions} />
      </AdminGroup>

      <AdminGroup area="ia" id="tarifas" title="Tarifas y registro de cambios" summary="Precios por modelo con fecha de vigencia y quién cambió qué">
        <AiPrices />
      </AdminGroup>
    </div>
  )
}
