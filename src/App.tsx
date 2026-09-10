import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/auth/useSession'
import { LoginScreen } from '@/ui/LoginScreen'
import { OnboardingScreen } from '@/ui/OnboardingScreen'
import { HomeScreen } from '@/ui/HomeScreen'
import { NavShell } from '@/ui/NavShell'

// Preparación de escala / "que sea la mejor": el bundle único pesaba
// ~1 MB (Vite avisaba en cada build) y en un móvil con datos eso es la
// primera pantalla tardando segundos. Cada sección se descarga solo al
// entrar en ella (React.lazy → un chunk por pantalla; el mapa de
// Leaflet, por ejemplo, ya no lo paga quien nunca abre Ubicación). El
// service worker sigue precacheando todos los chunks, así que sin red
// funciona igual. Inicio y Login se quedan en el bundle principal para
// que la primera pantalla salga al instante.
const FamilyScreen = lazy(() => import('@/ui/FamilyScreen').then((m) => ({ default: m.FamilyScreen })))
const CalendarScreen = lazy(() => import('@/ui/CalendarScreen').then((m) => ({ default: m.CalendarScreen })))
const RewardsScreen = lazy(() => import('@/ui/RewardsScreen').then((m) => ({ default: m.RewardsScreen })))
const ShoppingScreen = lazy(() => import('@/ui/ShoppingScreen').then((m) => ({ default: m.ShoppingScreen })))
const AlimentacionScreen = lazy(() => import('@/ui/AlimentacionScreen').then((m) => ({ default: m.AlimentacionScreen })))
const FinanceScreen = lazy(() => import('@/ui/FinanceScreen').then((m) => ({ default: m.FinanceScreen })))
const LocationScreen = lazy(() => import('@/ui/LocationScreen').then((m) => ({ default: m.LocationScreen })))
import { ReminderWatcher } from '@/ui/ReminderWatcher'
import { AutomationWatcher } from '@/ui/AutomationWatcher'
import { LocationSharingWatcher } from '@/ui/LocationSharingWatcher'
import { AppLockGate } from '@/ui/AppLockGate'
const ActivityScreen = lazy(() => import('@/ui/ActivityScreen').then((m) => ({ default: m.ActivityScreen })))
const BirthdaysScreen = lazy(() => import('@/ui/BirthdaysScreen').then((m) => ({ default: m.BirthdaysScreen })))
const ContactsScreen = lazy(() => import('@/ui/ContactsScreen').then((m) => ({ default: m.ContactsScreen })))
const GalleryScreen = lazy(() => import('@/ui/GalleryScreen').then((m) => ({ default: m.GalleryScreen })))
const DocumentsScreen = lazy(() => import('@/ui/DocumentsScreen').then((m) => ({ default: m.DocumentsScreen })))
const MenuSettingsScreen = lazy(() => import('@/ui/MenuSettingsScreen').then((m) => ({ default: m.MenuSettingsScreen })))
const AyudaScreen = lazy(() => import('@/ui/AyudaScreen').then((m) => ({ default: m.AyudaScreen })))
const SuggestionsScreen = lazy(() => import('@/ui/SuggestionsScreen').then((m) => ({ default: m.SuggestionsScreen })))
const AdminUsageScreen = lazy(() => import('@/ui/AdminUsageScreen').then((m) => ({ default: m.AdminUsageScreen })))
import { LegalScreen, type LegalKind } from '@/ui/LegalScreen'

// Las páginas legales tienen que poder leerse SIN sesión (antes de crear
// la cuenta) — el BrowserRouter solo existe una vez dentro; para estas
// dos rutas se mira la URL a mano antes de la puerta de login.
function legalKindFromLocation(): LegalKind | null {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '')
  const path = window.location.pathname.slice(base.length).replace(/\/$/, '')
  if (path === '/privacidad') return 'privacidad'
  if (path === '/condiciones') return 'condiciones'
  return null
}

// Bug real reportado varias veces ("se queda la pantalla en gris/
// blanco al volver del banco"): enable-banking-auth-callback volvía
// directo a /dinero, una ruta que en GitHub Pages no es un archivo de
// verdad — necesita el truco de 404.html (redirección → decodificar →
// index.html) para funcionar, y ese doble salto es justo el más
// frágil de todos justo tras un enlace externo largo en el móvil (con
// la red recién "despertando"). La raíz ("/") sí es un archivo real,
// sin truco de por medio, así que el banco vuelve siempre ahí y esto
// hace el salto a Economía por dentro, ya con la app cargada y
// funcionando.
function HomeOrBankReturn({ profile }: { profile: Parameters<typeof HomeScreen>[0]['profile'] }) {
  const [params] = useSearchParams()
  const bank = params.get('bank')
  if (bank) {
    const detail = params.get('detail')
    return <Navigate to={`/dinero?bank=${bank}${detail ? `&detail=${detail}` : ''}`} replace />
  }
  return <HomeScreen profile={profile} />
}

export function App() {
  const { session, profile, loading, refreshProfile } = useSession()

  const legalKind = legalKindFromLocation()
  if (loading) return <div className="screen screen-centered">Cargando…</div>
  if (!session) return legalKind ? <LegalScreen kind={legalKind} standalone /> : <LoginScreen />
  if (!profile) {
    // Usuario autenticado pero sin family_id asignado todavía: crea su
    // familia (alta del primer adulto administrador, Fase 1).
    return <OnboardingScreen onCreated={refreshProfile} />
  }

  return (
    <AppLockGate profileId={profile.id}>
      {/* BASE_URL es '/' en local y '/family-app/' en el build de GitHub
          Pages (vite.config.ts) — sin basename, ninguna ruta coincide bajo
          esa subruta y la app se queda en blanco tras el login, sin ningún
          error visible (bug real encontrado probando el despliegue). */}
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <ReminderWatcher />
        <AutomationWatcher />
        <LocationSharingWatcher profileId={profile.id} />
        <Suspense fallback={<div className="screen screen-centered">Cargando…</div>}>
        <Routes>
          <Route element={<NavShell profile={profile} />}>
            <Route path="/" element={<HomeOrBankReturn profile={profile} />} />
            <Route path="/calendario" element={<CalendarScreen />} />
            <Route path="/puntos" element={<RewardsScreen />} />
            <Route path="/compras" element={<ShoppingScreen />} />
            <Route path="/familia" element={<FamilyScreen profile={profile} />} />
            <Route path="/alimentacion" element={<AlimentacionScreen />} />
            <Route path="/dinero" element={<FinanceScreen />} />
            <Route path="/ubicacion" element={<LocationScreen role={profile.role} profileId={profile.id} />} />
            <Route path="/actividad" element={<ActivityScreen />} />
            <Route path="/cumpleanos" element={<BirthdaysScreen />} />
            <Route path="/contactos" element={<ContactsScreen />} />
            <Route path="/galeria" element={<GalleryScreen />} />
            <Route path="/documentos" element={<DocumentsScreen />} />
            <Route path="/menu-organizar" element={<MenuSettingsScreen />} />
            <Route path="/admin-uso" element={<AdminUsageScreen />} />
            <Route path="/ayuda" element={<AyudaScreen />} />
            <Route path="/sugerencias" element={<SuggestionsScreen />} />
            <Route path="/privacidad" element={<LegalScreen kind="privacidad" />} />
            <Route path="/condiciones" element={<LegalScreen kind="condiciones" />} />
          </Route>
        </Routes>
        </Suspense>
      </BrowserRouter>
    </AppLockGate>
  )
}
