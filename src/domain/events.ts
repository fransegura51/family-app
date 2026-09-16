// Módulo Eventos (PEPA Events) — configuración del motor común: un
// evento es una variante configurada del mismo motor, no seis
// mini-apps independientes (regla no negociable de la Skill). Este
// archivo reúne lo que cambia por tipo de evento (nombre, módulos
// recomendados, checklist inicial) para que EventosScreen.tsx no lleve
// ningún "if (type === ...)" disperso por la UI.
import type { EventModuleKey, EventType } from '@/domain/types'

export const EVENT_TYPE_META: Record<EventType, { label: string; icon: string }> = {
  cumpleanos: { label: 'Cumpleaños', icon: '🎂' },
  comunion: { label: 'Comunión', icon: '⛪' },
  bautizo: { label: 'Bautizo', icon: '👶' },
  celebracion: { label: 'Celebración', icon: '🎉' },
  boda: { label: 'Boda íntima', icon: '💍' },
  personalizado: { label: 'Personalizado', icon: '✨' },
}

export const EVENT_TYPES: EventType[] = ['cumpleanos', 'comunion', 'bautizo', 'celebracion', 'boda', 'personalizado']

// Subtipos de Celebración — la propia Skill los deja abiertos
// ("Other"), así que el último valor siempre es editable a mano.
export const CELEBRATION_SUBTYPES = [
  'Aniversario',
  'Jubilación',
  'Fiesta sorpresa',
  'Reunión familiar',
  'Compromiso',
  'Graduación',
  'Celebración especial',
  'Otro',
]

export const EVENT_MODULES: { key: EventModuleKey; label: string; icon: string }[] = [
  { key: 'invitados', label: 'Invitados', icon: '👥' },
  { key: 'invitaciones', label: 'Invitaciones y RSVP', icon: '💌' },
  { key: 'tareas', label: 'Preparativos', icon: '✅' },
  { key: 'presupuesto', label: 'Presupuesto', icon: '💰' },
  { key: 'pagos', label: 'Pagos y fianzas', icon: '🧾' },
  { key: 'menu_compra', label: 'Menú y compra', icon: '🍽️' },
  { key: 'decoracion', label: 'Decoración', icon: '🎈' },
  { key: 'actividades', label: 'Actividades y juegos', icon: '🎲' },
  { key: 'mesas', label: 'Mesas', icon: '🪑' },
  { key: 'ceremonia', label: 'Ceremonia', icon: '🕊️' },
  { key: 'proveedores', label: 'Proveedores', icon: '📇' },
  { key: 'detalles', label: 'Detalles / recuerdos', icon: '🎁' },
  { key: 'regalos', label: 'Regalos recibidos', icon: '🎀' },
  { key: 'plan_dia', label: 'Plan del día', icon: '🗓️' },
]

// Selección "Recomendado / completo" al crear el evento — la propia
// Skill deja claro que ningún módulo es obligatorio salvo la identidad
// básica del evento; esto es solo el punto de partida sugerido.
export const RECOMMENDED_MODULES: Record<EventType, EventModuleKey[]> = {
  cumpleanos: ['invitados', 'invitaciones', 'tareas', 'presupuesto', 'menu_compra', 'decoracion', 'actividades', 'plan_dia'],
  comunion: [
    'invitados',
    'invitaciones',
    'tareas',
    'presupuesto',
    'pagos',
    'menu_compra',
    'ceremonia',
    'mesas',
    'proveedores',
    'detalles',
    'plan_dia',
  ],
  bautizo: ['invitados', 'invitaciones', 'tareas', 'presupuesto', 'ceremonia', 'menu_compra', 'plan_dia'],
  celebracion: ['invitados', 'invitaciones', 'tareas', 'presupuesto', 'menu_compra', 'plan_dia'],
  boda: [
    'invitados',
    'invitaciones',
    'tareas',
    'presupuesto',
    'pagos',
    'menu_compra',
    'ceremonia',
    'mesas',
    'proveedores',
    'detalles',
    'plan_dia',
  ],
  personalizado: ['invitados', 'tareas', 'presupuesto'],
}

// Checklist inicial por tipo — desfase en días respecto a la fecha del
// evento (negativo = antes). Sin fecha puesta, las tareas se crean
// igual pero sin due_date (se recalculan en cuanto se ponga/cambie la
// fecha — ver recalculateAutoTasks en src/data/events.ts).
interface TaskTemplateItem {
  title: string
  daysBeforeEvent: number | null
}

const TASK_TEMPLATES: Record<EventType, TaskTemplateItem[]> = {
  cumpleanos: [
    { title: 'Elegir y reservar el local o espacio', daysBeforeEvent: 30 },
    { title: 'Enviar las invitaciones', daysBeforeEvent: 21 },
    { title: 'Confirmar la tarta', daysBeforeEvent: 7 },
    { title: 'Decidir la decoración', daysBeforeEvent: 7 },
    { title: 'Comprar lo necesario', daysBeforeEvent: 3 },
  ],
  comunion: [
    { title: 'Reservar iglesia/parroquia', daysBeforeEvent: 90 },
    { title: 'Reservar restaurante/salón', daysBeforeEvent: 60 },
    { title: 'Enviar las invitaciones', daysBeforeEvent: 45 },
    { title: 'Traje/vestido y complementos', daysBeforeEvent: 30 },
    { title: 'Confirmar menú con el restaurante', daysBeforeEvent: 14 },
    { title: 'Detalles/recuerdos para los invitados', daysBeforeEvent: 14 },
  ],
  bautizo: [
    { title: 'Reservar iglesia/parroquia', daysBeforeEvent: 60 },
    { title: 'Confirmar padrinos', daysBeforeEvent: 45 },
    { title: 'Enviar las invitaciones', daysBeforeEvent: 30 },
    { title: 'Confirmar celebración/menú', daysBeforeEvent: 14 },
  ],
  celebracion: [
    { title: 'Elegir fecha y lugar', daysBeforeEvent: 30 },
    { title: 'Enviar las invitaciones', daysBeforeEvent: 14 },
    { title: 'Confirmar menú', daysBeforeEvent: 7 },
  ],
  boda: [
    { title: 'Reservar ceremonia', daysBeforeEvent: 120 },
    { title: 'Reservar celebración', daysBeforeEvent: 120 },
    { title: 'Enviar las invitaciones', daysBeforeEvent: 60 },
    { title: 'Confirmar menú y bebidas', daysBeforeEvent: 30 },
    { title: 'Confirmar mesas y asientos', daysBeforeEvent: 14 },
    { title: 'Recoger anillos/detalles', daysBeforeEvent: 7 },
  ],
  personalizado: [{ title: 'Definir lo esencial del evento', daysBeforeEvent: 14 }],
}

export function generateAutoTasks(type: EventType, eventDate: string | null): { title: string; dueDate: string | null }[] {
  return TASK_TEMPLATES[type].map((item) => ({
    title: item.title,
    dueDate: eventDate && item.daysBeforeEvent !== null ? offsetDate(eventDate, -item.daysBeforeEvent) : null,
  }))
}

function offsetDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}
