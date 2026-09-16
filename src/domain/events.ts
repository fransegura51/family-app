// Módulo Eventos (PEPA Events) — configuración del motor común: un
// evento es una variante configurada del mismo motor, no seis
// mini-apps independientes (regla no negociable de la Skill). Este
// archivo reúne lo que cambia por tipo de evento (nombre, módulos
// recomendados, checklist inicial) para que EventosScreen.tsx no lleve
// ningún "if (type === ...)" disperso por la UI.
import type {
  EventGuest,
  EventGuestInviteScope,
  EventModuleKey,
  EventPayment,
  EventTask,
  EventType,
  FamilyEvent,
  InvitationLayer,
} from '@/domain/types'

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

// ---------------------------------------------------------------------
// Fase 4 — "Organízamelo Pepa" (08-data-integration-ai.md, punto 6):
// "First target: structured proposal for tasks, budget, menu, shopping,
// decoration, activities and plan. Do not assume perfect one-shot
// automation." Reglas propias por tipo, sin ninguna llamada a un
// servicio de IA externo (ni falta hace: son listas de partida
// editables, no una redacción libre) — las tareas quedan fuera de esta
// propuesta porque ya se generan solas al crear el evento
// (generateAutoTasks); repetirlas aquí las duplicaría.
// ---------------------------------------------------------------------

const BUDGET_PLAN_TEMPLATES: Record<EventType, { category: string; plannedAmount: number }[]> = {
  cumpleanos: [
    { category: 'Local o espacio', plannedAmount: 150 },
    { category: 'Tarta', plannedAmount: 40 },
    { category: 'Decoración', plannedAmount: 60 },
    { category: 'Comida y bebida', plannedAmount: 120 },
    { category: 'Detalles para invitados', plannedAmount: 30 },
  ],
  comunion: [
    { category: 'Iglesia/parroquia', plannedAmount: 50 },
    { category: 'Restaurante', plannedAmount: 1500 },
    { category: 'Traje o vestido', plannedAmount: 300 },
    { category: 'Fotógrafo', plannedAmount: 400 },
    { category: 'Recuerdos', plannedAmount: 150 },
  ],
  bautizo: [
    { category: 'Ceremonia', plannedAmount: 50 },
    { category: 'Celebración', plannedAmount: 600 },
    { category: 'Recuerdos', plannedAmount: 100 },
  ],
  celebracion: [
    { category: 'Local o espacio', plannedAmount: 200 },
    { category: 'Comida y bebida', plannedAmount: 300 },
    { category: 'Decoración', plannedAmount: 80 },
  ],
  boda: [
    { category: 'Ceremonia', plannedAmount: 300 },
    { category: 'Celebración', plannedAmount: 3000 },
    { category: 'Fotógrafo/vídeo', plannedAmount: 800 },
    { category: 'Flores', plannedAmount: 200 },
    { category: 'Música', plannedAmount: 300 },
  ],
  personalizado: [{ category: 'General', plannedAmount: 100 }],
}

const MENU_PLAN_TEMPLATES: Record<EventType, string[]> = {
  cumpleanos: ['Tarta', 'Bebidas', 'Snacks', 'Chuches'],
  comunion: ['Aperitivo', 'Primer plato', 'Segundo plato', 'Postre', 'Bebidas'],
  bautizo: ['Aperitivo', 'Dulces', 'Bebidas'],
  celebracion: ['Aperitivo', 'Plato principal', 'Postre', 'Bebidas'],
  boda: ['Aperitivo', 'Menú', 'Tarta nupcial', 'Barra libre'],
  personalizado: ['Comida', 'Bebidas'],
}

// Decoración/actividades — petición de la Skill: "Never assume every
// event needs decoration"; boda y personalizado se quedan sin
// propuesta (venue-provided o demasiado variable para adivinar).
const DECORATION_PLAN_TEMPLATES: Record<EventType, string[]> = {
  cumpleanos: ['Globos', 'Pancarta de cumpleaños', 'Centro de mesa'],
  comunion: ['Centros de mesa', 'Detalles en las sillas'],
  bautizo: ['Globos', 'Centro de mesa'],
  celebracion: ['Centros de mesa', 'Iluminación'],
  boda: [],
  personalizado: [],
}

const ACTIVITY_PLAN_TEMPLATES: Record<EventType, { title: string; ageRange?: string }[]> = {
  cumpleanos: [{ title: 'Juegos de fiesta' }, { title: 'Piñata' }],
  comunion: [],
  bautizo: [],
  celebracion: [],
  boda: [],
  personalizado: [],
}

export interface EventPlanProposal {
  missingModules: EventModuleKey[]
  budgetItems: { category: string; plannedAmount: number }[]
  menuItems: { name: string }[]
  decorationItems: { name: string }[]
  activities: { title: string; ageRange?: string }[]
}

export function generateEventPlan(event: Pick<FamilyEvent, 'type' | 'enabledModules'>): EventPlanProposal {
  const recommended = RECOMMENDED_MODULES[event.type]
  const missingModules = recommended.filter((m) => !event.enabledModules.includes(m))
  return {
    missingModules,
    budgetItems: BUDGET_PLAN_TEMPLATES[event.type],
    menuItems: MENU_PLAN_TEMPLATES[event.type].map((name) => ({ name })),
    decorationItems: DECORATION_PLAN_TEMPLATES[event.type].map((name) => ({ name })),
    activities: ACTIVITY_PLAN_TEMPLATES[event.type],
  }
}

// ---------------------------------------------------------------------
// Fase 2 — texto de la invitación/RSVP. La función edge event-rsvp
// (Deno, no puede importar código del cliente) repite esta misma
// lógica a mano — igual que ya pasa con expandOccurrences entre el
// cliente y las funciones edge de calendario; se mantienen las dos
// copias en sincronía a mano si esto cambia.
// ---------------------------------------------------------------------

export const DUAL_LOCATION_EVENT_TYPES: EventType[] = ['comunion', 'bautizo', 'boda']

export function eventDateLine(event: Pick<FamilyEvent, 'dateStatus' | 'eventDate' | 'eventTime'>): string {
  if (event.dateStatus === 'pendiente' || !event.eventDate) return '📅 Fecha todavía por confirmar'
  const label = event.dateStatus === 'provisional' ? 'Fecha provisional' : 'Fecha'
  const time = event.eventTime ? ` a las ${event.eventTime.slice(0, 5)}` : ''
  return `📅 ${label}: ${event.eventDate}${time}`
}

export function eventLocationLines(
  event: Pick<FamilyEvent, 'type' | 'venueLabel' | 'ceremonyLocationLabel' | 'ceremonyTime' | 'celebrationLocationLabel'>,
  guest: { inviteScope: EventGuestInviteScope | null },
): string[] {
  const lines: string[] = []
  if (DUAL_LOCATION_EVENT_TYPES.includes(event.type)) {
    const scope = guest.inviteScope ?? 'ambas'
    if (scope !== 'solo_celebracion' && event.ceremonyLocationLabel) {
      lines.push(`🕊️ Ceremonia: ${event.ceremonyLocationLabel}${event.ceremonyTime ? ' · ' + event.ceremonyTime.slice(0, 5) : ''}`)
    }
    if (scope !== 'solo_ceremonia' && event.celebrationLocationLabel) {
      lines.push(`🎉 Celebración: ${event.celebrationLocationLabel}`)
    }
  } else if (event.venueLabel) {
    lines.push(`📍 ${event.venueLabel}`)
  }
  return lines
}

// Plantillas v1 — solo tema de color (la Skill pide "large, visual
// thumbnails" para elegir tema; el editor en capas de verdad con
// arrastrar/pellizcar/rotar llega en la Fase 3). Sin ningún personaje
// con copyright, solo colores propios de PEPA.
export const INVITATION_TEMPLATES: { key: string; label: string; gradient: string; text: string }[] = [
  { key: 'clasico', label: 'Clásico', gradient: 'linear-gradient(135deg, #4C6EF5, #7C3AED)', text: '#ffffff' },
  { key: 'floral', label: 'Floral', gradient: 'linear-gradient(135deg, #F472B6, #FB923C)', text: '#ffffff' },
  { key: 'elegante', label: 'Elegante', gradient: 'linear-gradient(135deg, #1F2937, #4B5563)', text: '#ffffff' },
  { key: 'alegre', label: 'Alegre', gradient: 'linear-gradient(135deg, #FBBF24, #34D399)', text: '#1f2233' },
]

// ---------------------------------------------------------------------
// Fase 3 — modo "día del evento" y conclusiones de PEPA por reglas.
// Petición de la Skill (00-master-spec.md, puntos 14/15): "Conclusions
// should link directly to the relevant module/action where possible" y
// "On the event date, home view should emphasise..." — nada de IA de
// verdad aquí, solo reglas sobre datos que ya tenemos, igual que las
// "Conclusiones de Pepa" que ya existen en Economía.
// ---------------------------------------------------------------------

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false
  return dateStr === new Date().toISOString().slice(0, 10)
}

function daysUntil(dateStr: string): number {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export interface EventConclusion {
  id: string
  icon: string
  text: string
}

export function computeEventConclusions(input: {
  rsvpDeadline: string | null
  guests: Pick<EventGuest, 'rsvpStatus'>[]
  tasks: Pick<EventTask, 'done' | 'dueDate'>[]
  payments: Pick<EventPayment, 'concept' | 'totalAmount' | 'depositPaid' | 'dueDate' | 'status'>[]
  plannedBudget: number
  spentBudget: number | null
}): EventConclusion[] {
  const conclusions: EventConclusion[] = []

  const pendingGuests = input.guests.filter((g) => g.rsvpStatus === 'pendiente').length
  if (input.rsvpDeadline && pendingGuests > 0) {
    const days = daysUntil(input.rsvpDeadline)
    if (days >= 0 && days <= 7) {
      conclusions.push({
        id: 'rsvp-deadline',
        icon: '⏳',
        text: `${pendingGuests} ${pendingGuests === 1 ? 'invitado sin responder' : 'invitados sin responder'} y el plazo de RSVP es en ${days === 0 ? 'hoy' : days === 1 ? '1 día' : `${days} días`}.`,
      })
    } else if (days < 0) {
      conclusions.push({
        id: 'rsvp-deadline-passed',
        icon: '⏳',
        text: `El plazo de RSVP ya pasó y ${pendingGuests} ${pendingGuests === 1 ? 'invitado sigue' : 'invitados siguen'} sin responder.`,
      })
    }
  }

  const overdueTasks = input.tasks.filter((t) => !t.done && t.dueDate && daysUntil(t.dueDate) < 0).length
  if (overdueTasks > 0) {
    conclusions.push({
      id: 'overdue-tasks',
      icon: '✅',
      text: `${overdueTasks} ${overdueTasks === 1 ? 'tarea tiene' : 'tareas tienen'} fecha ya pasada y sigue sin marcarse hecha.`,
    })
  }

  for (const p of input.payments) {
    if (p.status === 'pagado' || !p.dueDate) continue
    const days = daysUntil(p.dueDate)
    const remaining = p.totalAmount - p.depositPaid
    if (days <= 7 && remaining > 0) {
      conclusions.push({
        id: `payment-${p.concept}-${p.dueDate}`,
        icon: '🧾',
        text:
          days < 0
            ? `"${p.concept}" venció y quedan ${remaining.toFixed(2)} € pendientes.`
            : `"${p.concept}" vence en ${days === 0 ? 'hoy' : days === 1 ? '1 día' : `${days} días`} y quedan ${remaining.toFixed(2)} € pendientes.`,
      })
    }
  }

  if (input.spentBudget !== null && input.plannedBudget > 0 && input.spentBudget > input.plannedBudget) {
    conclusions.push({
      id: 'budget-over',
      icon: '💰',
      text: `El gasto ya supera lo planeado: ${input.spentBudget.toFixed(2)} € gastados de ${input.plannedBudget.toFixed(2)} € presupuestados.`,
    })
  }

  return conclusions
}

// ---------------------------------------------------------------------
// Fase 3 — editor de invitaciones en capas. Petición de la Skill:
// "Think WhatsApp / Instagram Stories simplicity" — nada de lienzo
// estilo Canva de escritorio. Formas decorativas genéricas (sin ningún
// personaje con copyright) para la capa "shape".
// ---------------------------------------------------------------------

export const INVITATION_SHAPES: { key: string; label: string }[] = [
  { key: 'circulo', label: '⚪ Círculo' },
  { key: 'anillo', label: '⭕ Anillo' },
  { key: 'estrella', label: '⭐ Estrella' },
  { key: 'confeti', label: '🎊 Confeti' },
  { key: 'ondas', label: '〰️ Ondas' },
]

export const INVITATION_EMOJI_SUGGESTIONS = ['🎉', '🎂', '🎈', '⛪', '👶', '💍', '🥂', '🌸', '✨', '🎁']

let layerCounter = 0
function newLayerId(): string {
  layerCounter += 1
  return `layer-${Date.now()}-${layerCounter}`
}

// Capas iniciales autorrellenas desde el propio evento (Stage B de la
// Skill) — se usan tanto al abrir el editor por primera vez como en
// "Restaurar plantilla".
export function buildInvitationTemplateLayers(event: FamilyEvent): InvitationLayer[] {
  const infoLines = [eventDateLine(event), ...eventLocationLines(event, { inviteScope: null })]
  return [
    { id: newLayerId(), type: 'emoji', x: 0.5, y: 0.22, rotation: 0, scale: 1, zIndex: 1, text: EVENT_TYPE_META[event.type].icon, fontSize: 56 },
    { id: newLayerId(), type: 'text', x: 0.5, y: 0.42, rotation: 0, scale: 1, zIndex: 2, text: event.title, color: '#ffffff', fontSize: 24, fontFamily: 'inherit' },
    {
      id: newLayerId(),
      type: 'event_data',
      x: 0.5,
      y: 0.78,
      rotation: 0,
      scale: 1,
      zIndex: 3,
      text: infoLines.join('\n'),
      color: '#ffffff',
      fontSize: 14,
      fontFamily: 'inherit',
    },
  ]
}

export function makeInvitationLayer(type: InvitationLayer['type'], overrides: Partial<InvitationLayer> = {}): InvitationLayer {
  return {
    id: newLayerId(),
    type,
    x: 0.5,
    y: 0.5,
    rotation: 0,
    scale: 1,
    zIndex: 10,
    ...overrides,
  }
}

// "Pepa, hazla bonita" (opcional, Skill 07 punto 2) — reglas
// deterministas, no IA de verdad: reparte las capas de texto en
// vertical, centra la foto y las formas, sin tocar el contenido de
// nadie. Nunca se llama sola, solo cuando el usuario la pide.
export function autoArrangeLayers(layers: InvitationLayer[]): InvitationLayer[] {
  const photos = layers.filter((l) => l.type === 'photo')
  const texts = layers.filter((l) => l.type === 'text' || l.type === 'event_data')
  const emojis = layers.filter((l) => l.type === 'emoji')
  const shapes = layers.filter((l) => l.type === 'shape')

  const arranged: InvitationLayer[] = []
  photos.forEach((l) => arranged.push({ ...l, x: 0.5, y: 0.4, rotation: 0, scale: Math.min(l.scale, 1.4) }))
  emojis.forEach((l, i) => arranged.push({ ...l, x: 0.5, y: photos.length > 0 ? 0.16 : 0.2 + i * 0.05, rotation: 0 }))

  const textSlots = texts.length
  texts.forEach((l, i) => {
    const y = textSlots === 1 ? 0.5 : 0.38 + (i / Math.max(1, textSlots - 1)) * 0.4
    arranged.push({ ...l, x: 0.5, y, rotation: 0 })
  })

  const corners: [number, number][] = [
    [0.15, 0.12],
    [0.85, 0.12],
    [0.15, 0.88],
    [0.85, 0.88],
  ]
  shapes.forEach((l, i) => {
    const [x, y] = corners[i % corners.length]
    arranged.push({ ...l, x, y })
  })

  return arranged
}
