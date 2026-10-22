import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ADMIN_AREAS, parseAdminArea, type AdminAreaId } from '@/admin/adminAreas'
import type { AdminTool } from '@/admin/adminTools'
import { AdminGate } from '@/ui/admin/AdminGate'
import { AdminGroupsProvider, AdminGroupsToolbar, groupKey, useAdminGroups } from '@/ui/admin/AdminGroups'
import { AdminSearch } from '@/ui/admin/AdminSearch'
import { AreaResumen } from '@/ui/admin/AreaResumen'
import { AdminLoading, TabBar } from '@/ui/community/admin/AdminShared'
import '@/ui/community/communityAdmin.css'
import '@/ui/admin/administration.css'

// Centro de Administración único de PEPA (/administracion). Reúne en seis áreas lo que antes estaba repartido entre el «Panel de admin» (/admin-uso) y el Centro de Mando de
// Comunidad (/comunidad/admin), con el diseño de este último. La puerta (AdminGate) decide el acceso preguntando al servidor; detrás de ella nada se monta ni se pide hasta que
// alguien con permiso abre cada área, y cada área se monta la primera vez que se abre y se conserva (oculta) después, para no repetir consultas a Supabase al ir y volver.
// Dentro de cada área, los grupos temáticos son plegables (AdminGroup) y el buscador global lleva directamente a una herramienta.
const AreaUsuarios = lazy(() => import('@/ui/admin/AreaUsuarios').then((m) => ({ default: m.AreaUsuarios })))
const AreaComunidad = lazy(() => import('@/ui/admin/AreaComunidad').then((m) => ({ default: m.AreaComunidad })))
const AreaFuncionalidades = lazy(() => import('@/ui/admin/AreaFuncionalidades').then((m) => ({ default: m.AreaFuncionalidades })))
const AreaAyuda = lazy(() => import('@/ui/admin/AreaAyuda').then((m) => ({ default: m.AreaAyuda })))
const AreaSistema = lazy(() => import('@/ui/admin/AreaSistema').then((m) => ({ default: m.AreaSistema })))

const ID_BASE = 'admin'

export function AdministrationPage() {
  return (
    <div className="screen admin-center">
      <AdminGate>
        <AdminGroupsProvider>
          <AdministrationCenter />
        </AdminGroupsProvider>
      </AdminGate>
    </div>
  )
}

function AdministrationCenter() {
  const [params, setParams] = useSearchParams()
  const groups = useAdminGroups()
  const active = parseAdminArea(params.get('area'))
  const [visited, setVisited] = useState<AdminAreaId[]>([active])
  // Última pestaña abierta dentro de Comunidad: el área se conserva montada al irse, así que al volver se vuelve a la misma pestaña (y la dirección la refleja).
  const communityTab = useRef<string | null>(null)
  const tabParam = params.get('tab')
  useEffect(() => {
    if (active === 'comunidad') communityTab.current = tabParam
  }, [active, tabParam])
  useEffect(() => {
    setVisited((v) => (v.includes(active) ? v : [...v, active]))
  }, [active])

  const select = (area: AdminAreaId) => {
    // Al cambiar de área se quitan los parámetros propios de la anterior (p. ej. la pestaña de Comunidad).
    setParams(area === 'comunidad' && communityTab.current ? { area, tab: communityTab.current } : { area }, { replace: true })
  }

  // Un resultado del buscador: abre el área, la pestaña (y sección) de Comunidad si procede, y despliega el bloque que contiene la herramienta.
  const pickTool = (t: AdminTool) => {
    const next: Record<string, string> = { area: t.area }
    if (t.tab) next.tab = t.tab
    if (t.seccion) next.seccion = t.seccion
    setParams(next, { replace: true })
    if (t.group) groups.reveal(groupKey(t.area, t.group))
  }

  const content: Record<AdminAreaId, JSX.Element> = {
    resumen: <AreaResumen onGo={select} />,
    usuarios: <AreaUsuarios />,
    comunidad: <AreaComunidad />,
    funcionalidades: <AreaFuncionalidades />,
    ayuda: <AreaAyuda />,
    sistema: <AreaSistema />,
  }

  return (
    <section className="cadm admin-center-inner" aria-labelledby="admin-title">
      <h1 id="admin-title">🛠️ Centro de Administración</h1>
      <AdminSearch onPick={pickTool} />
      <TabBar tabs={ADMIN_AREAS} active={active} onSelect={select} idBase={ID_BASE} label="Áreas del Centro de Administración" className="cadm-tabs admin-area-tabs" />
      {ADMIN_AREAS.filter((a) => a.id === active || visited.includes(a.id)).map((a) => (
        <div key={a.id} role="tabpanel" id={`${ID_BASE}-panel-${a.id}`} aria-labelledby={`${ID_BASE}-tab-${a.id}`} hidden={a.id !== active} tabIndex={0} className="cadm-panel">
          <h2 className="cadm-panel-title">{a.label}</h2>
          {/* Comunidad ya tiene sus propias pestañas; el resto de áreas se organizan en bloques plegables. */}
          {a.id !== 'comunidad' && <AdminGroupsToolbar area={a.id} />}
          <Suspense fallback={<AdminLoading />}>{content[a.id]}</Suspense>
        </div>
      ))}
    </section>
  )
}
