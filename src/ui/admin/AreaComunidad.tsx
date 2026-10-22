import { lazy, Suspense } from 'react'
import { CommunityProvider } from '@/ui/community/CommunityProvider'
import { AdminLoading } from '@/ui/community/admin/AdminShared'

// Área «Comunidad y moderación»: el Centro de Mando de Comunidad COMPLETO (sus nueve pestañas: resumen, moderación, usuarios, contenido oficial, temas, encuestas, destacados,
// configuración e historial) dentro del Centro de Administración. No se rehace nada: es la misma pantalla, con el mismo diseño y las mismas protecciones (el servidor sigue
// exigiendo is_app_owner con NOT_ADMIN y la pantalla vuelve a comprobar isAdmin). Se monta solo cuando se abre esta área.
const AdminPage = lazy(() => import('@/ui/community/AdminPage').then((m) => ({ default: m.AdminPage })))

export function AreaComunidad() {
  return (
    <CommunityProvider>
      <Suspense fallback={<AdminLoading />}>
        <AdminPage embedded />
      </Suspense>
    </CommunityProvider>
  )
}
