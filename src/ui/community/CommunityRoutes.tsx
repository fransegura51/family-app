import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { CommunityLayout } from '@/ui/community/CommunityLayout'
import { CommunityProvider } from '@/ui/community/CommunityProvider'

// Cada pantalla de Comunidad se descarga solo al entrar en ella (como el resto de PEPA). El contrato de rutas está en communityNav.ts.
const CommunityHome = lazy(() => import('@/ui/community/CommunityHome').then((m) => ({ default: m.CommunityHome })))
const CommunitySectionPage = lazy(() => import('@/ui/community/CommunitySectionPage').then((m) => ({ default: m.CommunitySectionPage })))
const PostDetailPage = lazy(() => import('@/ui/community/PostDetailPage').then((m) => ({ default: m.PostDetailPage })))
const PostEditorPage = lazy(() => import('@/ui/community/PostEditorPage').then((m) => ({ default: m.PostEditorPage })))
const DraftsPage = lazy(() => import('@/ui/community/DraftsPage').then((m) => ({ default: m.DraftsPage })))
const SearchPage = lazy(() => import('@/ui/community/SearchPage').then((m) => ({ default: m.SearchPage })))
const SavedPage = lazy(() => import('@/ui/community/SavedPage').then((m) => ({ default: m.SavedPage })))
const ProfilePage = lazy(() => import('@/ui/community/ProfilePage').then((m) => ({ default: m.ProfilePage })))
const MySettingsPage = lazy(() => import('@/ui/community/MySettingsPage').then((m) => ({ default: m.MySettingsPage })))
const MedalsPage = lazy(() => import('@/ui/community/MedalsPage').then((m) => ({ default: m.MedalsPage })))
const NewsPage = lazy(() => import('@/ui/community/NewsPage').then((m) => ({ default: m.NewsPage })))
const RulesPage = lazy(() => import('@/ui/community/RulesPage').then((m) => ({ default: m.RulesPage })))
const AdminPage = lazy(() => import('@/ui/community/AdminPage').then((m) => ({ default: m.AdminPage })))

export function CommunityRoutes() {
  return (
    <CommunityProvider>
      <Suspense fallback={<div className="screen screen-centered">Cargando…</div>}>
        <Routes>
          <Route element={<CommunityLayout />}>
            <Route index element={<CommunityHome />} />
            <Route path="s/:section" element={<CommunitySectionPage />} />
            <Route path="p/:id" element={<PostDetailPage />} />
            <Route path="nueva" element={<PostEditorPage />} />
            <Route path="editar/:id" element={<PostEditorPage />} />
            <Route path="borradores" element={<DraftsPage />} />
            <Route path="guardados" element={<SavedPage />} />
            <Route path="buscar" element={<SearchPage />} />
            <Route path="u/:id" element={<ProfilePage />} />
            <Route path="mi-perfil" element={<MySettingsPage />} />
            <Route path="medallas" element={<MedalsPage />} />
            <Route path="novedades" element={<NewsPage />} />
            <Route path="normas" element={<RulesPage />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="*" element={<Navigate to="/comunidad" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </CommunityProvider>
  )
}
