import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useSession } from '@/auth/useSession'
import { LoginScreen } from '@/ui/LoginScreen'
import { OnboardingScreen } from '@/ui/OnboardingScreen'
import { HomeScreen } from '@/ui/HomeScreen'
import { FamilyScreen } from '@/ui/FamilyScreen'
import { CalendarScreen } from '@/ui/CalendarScreen'
import { TasksScreen } from '@/ui/TasksScreen'
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

export function App() {
  const { session, profile, loading, refreshProfile } = useSession()

  if (loading) return <div className="screen screen-centered">Cargando…</div>
  if (!session) return <LoginScreen />
  if (!profile) {
    // Usuario autenticado pero sin family_id asignado todavía: crea su
    // familia (alta del primer adulto administrador, Fase 1).
    return <OnboardingScreen onCreated={refreshProfile} />
  }

  return (
    // BASE_URL es '/' en local y '/family-app/' en el build de GitHub
    // Pages (vite.config.ts) — sin basename, ninguna ruta coincide bajo
    // esa subruta y la app se queda en blanco tras el login, sin ningún
    // error visible (bug real encontrado probando el despliegue).
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ReminderWatcher />
      <AutomationWatcher />
      <LocationSharingWatcher />
      <Routes>
        <Route element={<NavShell />}>
          <Route path="/" element={<HomeScreen profile={profile} />} />
          <Route path="/calendario" element={<CalendarScreen />} />
          <Route path="/tareas" element={<TasksScreen />} />
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
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
