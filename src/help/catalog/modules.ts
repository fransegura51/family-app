import type { HelpModule } from '@/help/types'

// Catálogo de módulos de PEPA para la Ayuda. Cada uno enlaza con su explicación ampliada histórica (legacyRoute, src/help/legacy) y con su pantalla («Llévame»).
// Comunidad exige cuenta con 18 años cumplidos y Comunidad abierta para esa cuenta: las fichas de USO de Comunidad (publicar, alias…) solo se enseñan a quien puede entrar; las
// generales («Qué es Comunidad», «Por qué no puedo entrar») las ve todo el mundo.
export const HELP_MODULES: HelpModule[] = [
  { id: 'inicio', label: 'Inicio', icon: '🏠', path: '/', summary: 'Resumen del día: compra pendiente, calendario de hoy, fotos, avisos de Eventos y accesos rápidos.', legacyRoute: '/' },
  { id: 'pepa', label: 'Hablar con PEPA', icon: '💬', path: '/', summary: 'Pregúntale o pídele cosas a Pepa con la voz o escribiendo: calendario, compra, cocina, tiempo, tráfico y economía.' },
  { id: 'calendario', label: 'Calendario', icon: '📅', path: '/calendario', summary: 'Eventos y tareas de toda la familia, en varias vistas, con repetición, recordatorios y calendarios enlazados.', legacyRoute: '/calendario' },
  { id: 'compras', label: 'Compras', icon: '🛒', path: '/compras', summary: 'Lista de la compra por tiendas, historial de precios, tickets y estadística de compras.', legacyRoute: '/compras' },
  { id: 'cocina', label: 'La cocina de Pepa', icon: '🍎', path: '/alimentacion', summary: 'Menú semanal y recetas de la familia, con paso del menú a la lista de la compra.', legacyRoute: '/alimentacion' },
  { id: 'economia', label: 'Economía', icon: '💶', path: '/dinero', summary: 'Movimientos, presupuestos, estadísticas, banco y previsión de pagos de la familia.', legacyRoute: '/dinero' },
  { id: 'eventos', label: 'Eventos', icon: '🎉', path: '/eventos', summary: 'Organiza celebraciones: invitados con confirmación por enlace, presupuesto, menú, proveedores y plan del día.', legacyRoute: '/eventos' },
  { id: 'pequenos', label: 'Pequeños Grandes', icon: '⭐', path: '/puntos', summary: 'Puntos y recompensas, educación financiera de los niños y listas de deseos.', legacyRoute: '/puntos' },
  { id: 'familia', label: 'Familia', icon: '👨‍👩‍👧‍👦', path: '/familia', summary: 'Quién forma parte de la familia, sus fichas, peso y medidas, e invitados con acceso limitado.', legacyRoute: '/familia' },
  { id: 'cumpleanos', label: 'Cumpleaños', icon: '🎂', path: '/cumpleanos', summary: 'Próximos cumpleaños de la familia y de los contactos.', legacyRoute: '/cumpleanos' },
  { id: 'contactos', label: 'Contactos', icon: '📇', path: '/contactos', summary: 'Agenda familiar: colegio, médico, emergencias… con importación desde el móvil.', legacyRoute: '/contactos' },
  { id: 'galeria', label: 'Galería', icon: '📷', path: '/galeria', summary: 'Fotos de la familia, compartibles también con invitados con acceso limitado.', legacyRoute: '/galeria' },
  { id: 'documentos', label: 'Documentos', icon: '📁', path: '/documentos', summary: 'Documentos importantes por persona o carpeta, con fecha de vencimiento y avisos.', legacyRoute: '/documentos' },
  { id: 'ubicacion', label: 'Ubicación', icon: '📍', path: '/ubicacion', summary: 'Dónde está cada miembro (con su permiso) y avisos de llegada y salida de sitios guardados.', legacyRoute: '/ubicacion' },
  {
    id: 'comunidad',
    label: 'Comunidad PEPA',
    icon: '🌍',
    path: '/comunidad',
    summary: 'Red de recetas, consejos y conversación entre familias, solo para personas de 18 años o más.',
  },
  { id: 'configuracion', label: 'Configuración', icon: '⚙️', path: '/menu-organizar', summary: 'Nombre de familia y todos los ajustes: menú, colores, Pepa, avisos, Economía, Compras, seguridad y calendario.', legacyRoute: '/menu-organizar' },
  { id: 'notificaciones', label: 'Notificaciones y avisos', icon: '🔔', path: '/menu-organizar', summary: 'Campana, avisos del móvil y resúmenes diarios de tareas.' },
  { id: 'cuentas', label: 'Cuenta, acceso e invitaciones', icon: '🔐', path: '/menu-organizar', summary: 'Entrar con tu correo, PIN y huella, cambiar contraseña, cerrar sesión y cómo se entra en PEPA con una invitación.' },
  { id: 'ayuda', label: 'Ayuda, sugerencias y opiniones', icon: '❓', path: '/ayuda', summary: 'Esta Ayuda, el buzón de sugerencias y las reseñas de PEPA.' },
]

export const HELP_MODULE_BY_ID = new Map(HELP_MODULES.map((m) => [m.id, m]))
