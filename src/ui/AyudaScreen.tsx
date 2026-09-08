// Menú explicativo de cada sección — petición real: "menú explicativo
// para cada sección y lo que tiene que ofrecer", pensando sobre todo en
// quien se une a la app por primera vez (un invitado, o cualquier
// miembro nuevo de la familia) y no sabe para qué sirve cada pestaña.
import { Link } from 'react-router-dom'
import { NAV_TABS } from '@/domain/navTabs'

const DESCRIPTIONS: Record<string, string> = {
  '/': 'Resumen del día: próximos eventos, cumpleaños cercanos y accesos rápidos.',
  '/familia': 'Quién forma parte de la familia, sus fotos, y los usuarios invitados con acceso limitado.',
  '/calendario': 'Eventos de todos, en varias vistas (mes, semana, agenda...). Se puede enlazar con Google Calendar o con cualquier calendario por URL.',
  '/puntos': 'Puntos y recompensas por tareas hechas — pensado sobre todo para los más pequeños.',
  '/compras': 'Lista de la compra, recetas, historial de precios y tickets — desde apuntar algo suelto hasta llevar la compra semanal.',
  '/alimentacion': 'Menú semanal, registro de comidas y seguimiento de peso/medidas de la familia.',
  '/dinero': 'Economía familiar: resumen, estadísticas, movimientos y presupuesto — con todo trazable hasta el ticket o gasto exacto.',
  '/ubicacion': 'Dónde está cada miembro ahora mismo (con su permiso) y avisos automáticos de llegada/salida de sitios guardados.',
  '/cumpleanos': 'Próximos cumpleaños de la familia y de los contactos, con recordatorios.',
  '/contactos': 'Agenda familiar (colegio, médico, emergencias...) — se puede importar desde el móvil con un archivo .vcf.',
  '/galeria': 'Fotos de la familia, compartibles también con invitados que solo tengan acceso a esta sección.',
  '/documentos': 'Documentos importantes por persona o carpeta, con fecha de vencimiento y recordatorios de renovación si hace falta.',
}

export function AyudaScreen() {
  return (
    <div className="screen">
      <h1>Ayuda</h1>
      <p className="muted">Para qué sirve cada sección de la app.</p>
      <div className="event-list">
        {NAV_TABS.map((tab) => (
          <Link key={tab.to} to={tab.to} className="card task-card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="task-card-main">
              <strong>
                {tab.icon} {tab.label}
              </strong>
              <p className="muted" style={{ margin: '4px 0 0' }}>
                {DESCRIPTIONS[tab.to] ?? ''}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
