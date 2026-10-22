import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { adminOverview } from '@/data/community'
import { ADMIN_TABS, ADMIN_TEXT, MODERATION_SECTIONS, parseAdminTab, toAdminOverview, type AdminTabId, type ModerationSection } from '@/domain/communityAdmin'
import { useCommunity } from '@/ui/community/CommunityProvider'
import { Breadcrumbs } from '@/ui/community/Breadcrumbs'
import { pageCrumbs, paths } from '@/ui/community/communityNav'
import { AdminLoading, AdminTabs } from '@/ui/community/admin/AdminShared'
import { FeaturedTab } from '@/ui/community/admin/FeaturedTab'
import { LogTab } from '@/ui/community/admin/LogTab'
import { ModerationTab } from '@/ui/community/admin/ModerationTab'
import { OfficialTab } from '@/ui/community/admin/OfficialTab'
import { OverviewTab } from '@/ui/community/admin/OverviewTab'
import { PollsTab } from '@/ui/community/admin/PollsTab'
import { SettingsTab } from '@/ui/community/admin/SettingsTab'
import { TopicProposalsTab } from '@/ui/community/admin/TopicProposalsTab'
import { UsersTab } from '@/ui/community/admin/UsersTab'
import { useAdminData } from '@/ui/community/admin/useAdminData'
import '@/ui/community/communityAdmin.css'

// Centro de Mando de Comunidad (solo los dos administradores de Comunidad; el servidor lo impone con NOT_ADMIN).
// Si quien entra no es administrador, se enseña un aviso y NO se llama al servidor.
// `embedded`: dentro del área «Comunidad y moderación» del Centro de Administración (/administracion): sin migas ni título propios (los pone el Centro), pero con las mismas nueve
// pestañas y la misma comprobación de administración.
export function AdminPage({ embedded = false }: { embedded?: boolean }) {
  const { status, loading } = useCommunity()
  if (loading) return <AdminLoading />
  if (!status?.isAdmin) return <NotAdmin embedded={embedded} />
  return <AdminCenter embedded={embedded} />
}

export function NotAdmin({ embedded = false }: { embedded?: boolean }) {
  return (
    <section className="cadm" aria-labelledby="cadm-notadmin">
      {!embedded && <Breadcrumbs crumbs={pageCrumbs('Administración')} />}
      <h1 id="cadm-notadmin">{ADMIN_TEXT.notAdmin}</h1>
      <p className="muted">Si crees que deberías tener acceso, habla con la administración de Comunidad.</p>
      <Link to={paths.home} className="link-button">
        Volver a la portada de Comunidad
      </Link>
    </section>
  )
}

const ID_BASE = 'cadm'

export function AdminCenter({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams()
  const active = parseAdminTab(params.get('tab'))
  // Cada pestaña se monta la primera vez que se abre y se conserva (oculta) después: volver a ella no repite la consulta al servidor.
  const [visited, setVisited] = useState<AdminTabId[]>([active])
  const secParam = params.get('seccion')
  const [section, setSection] = useState<ModerationSection>(MODERATION_SECTIONS.find((s) => s.id === secParam)?.id ?? 'denuncias')
  // Un enlace (o el buscador del Centro de Administración) puede pedir una sección concreta de Moderación (?seccion=…) o una pestaña: se abren aunque aún no se hubiesen visitado.
  useEffect(() => {
    const wanted = MODERATION_SECTIONS.find((s) => s.id === secParam)?.id
    if (wanted) setSection(wanted)
  }, [secParam])
  useEffect(() => {
    setVisited((v) => (v.includes(active) ? v : [...v, active]))
  }, [active])

  // El resumen se pide una vez al entrar; solo se vuelve a pedir si, mientras tanto, se ha cambiado algo que lo afecta (denuncias, expulsiones…).
  const overviewLoader = useCallback(async () => toAdminOverview(await adminOverview()), [])
  const overview = useAdminData(overviewLoader)
  const dirty = useRef(false)
  const markDirty = useCallback(() => {
    dirty.current = true
  }, [])

  const select = (tab: AdminTabId) => {
    setVisited((v) => (v.includes(tab) ? v : [...v, tab]))
    // Se conservan los demás parámetros de la dirección (p. ej. ?area=comunidad dentro del Centro de Administración): solo cambia la pestaña.
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('tab', tab)
        return next
      },
      { replace: true },
    )
    if (tab === 'resumen' && dirty.current) {
      dirty.current = false
      overview.reload()
    }
  }
  const go = (tab: AdminTabId, sec?: ModerationSection) => {
    if (sec) setSection(sec)
    select(tab)
  }

  const content: Record<AdminTabId, ReactNode> = {
    resumen: <OverviewTab overview={overview.data} loading={overview.loading} error={overview.error} onReload={overview.reload} onGo={go} />,
    moderacion: <ModerationTab section={section} onSection={setSection} onChanged={markDirty} />,
    usuarios: <UsersTab onChanged={markDirty} />,
    oficial: <OfficialTab onChanged={markDirty} />,
    temas: <TopicProposalsTab onChanged={markDirty} />,
    encuestas: <PollsTab onGo={go} />,
    destacados: <FeaturedTab onChanged={markDirty} />,
    configuracion: <SettingsTab onChanged={markDirty} />,
    historial: <LogTab />,
  }

  return (
    <section className="cadm" aria-labelledby="cadm-title">
      {!embedded && <Breadcrumbs crumbs={pageCrumbs('Administración')} />}
      {embedded ? (
        <h2 id="cadm-title" className="cadm-embedded-title">
          Centro de Mando de Comunidad
        </h2>
      ) : (
        <h1 id="cadm-title">Centro de Mando de Comunidad</h1>
      )}
      <p className="muted cadm-intro">{ADMIN_TEXT.twoAdmins}</p>
      <AdminTabs active={active} onSelect={select} idBase={ID_BASE} grouped={embedded} />
      {ADMIN_TABS.filter((t) => t.id === active || visited.includes(t.id)).map((t) => (
        <div key={t.id} role="tabpanel" id={`${ID_BASE}-panel-${t.id}`} aria-labelledby={`${ID_BASE}-tab-${t.id}`} hidden={t.id !== active} tabIndex={0} className="cadm-panel">
          <h2 className="cadm-panel-title">{t.label}</h2>
          {content[t.id]}
        </div>
      ))}
    </section>
  )
}
