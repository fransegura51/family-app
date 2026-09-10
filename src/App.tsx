import { BrowserRouter, Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useSession } from '@/auth/useSession'
import { LoginScreen } from '@/ui/LoginScreen'
import { OnboardingScreen } from '@/ui/OnboardingScreen'
import { HomeScreen } from '@/ui/HomeScreen'
import { FamilyScreen } from '@/ui/FamilyScreen'
import { CalendarScreen } from '@/ui/CalendarScreen'
import { RewardsScreen } from '@/ui/RewardsScreen'
import { ShoppingScreen } from '@/ui/ShoppingScreen'
import { AlimentacionScreen } from '@/ui/AlimentacionScreen'
import { FinanceScreen } from '@/ui/FinanceScreen'
import { LocationScreen } from '@/ui/LocationScreen'
import { NavShell } from '@/ui/NavShell'
import { ReminderWatcher } from '@/ui/ReminderWatcher'
import { AutomationWatcher } from '@/ui/AutomationWatcher'
import { LocationSharingWatcher } from '@/ui/LocationSharingWatcher'
import { ActivityScreen } from '@/ui/ActivityScreen'
import { BirthdaysScreen } from '@/ui/BirthdaysScreen'
import { ContactsScreen } from '@/ui/ContactsScreen'
import { GalleryScreen } from '@/ui/GalleryScreen'
import { DocumentsScreen } from '@/ui/DocumentsScreen'
import { MenuSettingsScreen } from '@/ui/MenuSettingsScreen'
import { AyudaScreen } from '@/ui/AyudaScreen'
import { SuggestionsScreen } from '@/ui/SuggestionsScreen'
import { AppLockGate } from '@/ui/AppLockGate'
import { AdminUsageScreen } from '@/ui/AdminUsageScreen'
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
      </BrowserRouter>
    </AppLockGate>
  )
}
