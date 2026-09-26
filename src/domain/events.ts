// Módulo Eventos (PEPA Events) — configuración del motor común: un
// evento es una variante configurada del mismo motor, no seis
// mini-apps independientes (regla no negociable de la Skill). Este
// archivo reúne lo que cambia por tipo de evento (nombre, módulos
// recomendados, checklist inicial) para que EventosScreen.tsx no lleve
// ningún "if (type === ...)" disperso por la UI.
import type {
  EventGuest,
  EventGuestInviteScope,
  EventGuestMember,
  EventModuleKey,
  EventPayment,
  EventTableSeat,
  EventTask,
  EventType,
  FamilyEvent,
  InvitationLayer,
} from '@/domain/types'
import type { AttentionItem } from '@/domain/attention'

// Arte real, traído fuera por el usuario ("quiero obras de arte", no SVG
// dibujado a mano) — ver InvitationTemplateMeta.image más abajo.
import invitaDinosaurios from '@/assets/eventos/invitaciones/dinosaurios.jpg'
import invitaUnicornio from '@/assets/eventos/invitaciones/unicornio.jpg'
import invitaFutbol from '@/assets/eventos/invitaciones/futbol.jpg'
import invitaCoches from '@/assets/eventos/invitaciones/coches.jpg'
import invitaVideojuegos from '@/assets/eventos/invitaciones/videojuegos.jpg'
import invitaPrincesa from '@/assets/eventos/invitaciones/princesa.jpg'
import invitaEspacio from '@/assets/eventos/invitaciones/espacio.jpg'
import invitaPiratas from '@/assets/eventos/invitaciones/piratas.jpg'
import invitaSafari from '@/assets/eventos/invitaciones/safari.jpg'
import invitaAcampada from '@/assets/eventos/invitaciones/acampada.jpg'
import invitaOceano from '@/assets/eventos/invitaciones/oceano.jpg'
import invitaHadas from '@/assets/eventos/invitaciones/hadas.jpg'
import invitaGranja from '@/assets/eventos/invitaciones/granja.jpg'
import invitaAlienigenas from '@/assets/eventos/invitaciones/alienigenas.jpg'
import invitaPlaya from '@/assets/eventos/invitaciones/playa.jpg'
import invitaConcierto from '@/assets/eventos/invitaciones/concierto.jpg'
import invitaBoda from '@/assets/eventos/invitaciones/boda.jpg'
import invitaSuperheroe from '@/assets/eventos/invitaciones/superheroe.jpg'
import invitaCorazones from '@/assets/eventos/invitaciones/corazones.jpg'
import invitaObras from '@/assets/eventos/invitaciones/obras.jpg'
import invitaNochevieja from '@/assets/eventos/invitaciones/nochevieja.jpg'
import invitaComunion from '@/assets/eventos/invitaciones/comunion.jpg'
import invitaBebeNino from '@/assets/eventos/invitaciones/bebe_nino.jpg'
import invitaDisco from '@/assets/eventos/invitaciones/disco.jpg'
import invitaElegante from '@/assets/eventos/invitaciones/elegante.jpg'
import invitaBautizo from '@/assets/eventos/invitaciones/bautizo.jpg'
import invitaBarbacoa from '@/assets/eventos/invitaciones/barbacoa.jpg'
import invitaBautizoNina from '@/assets/eventos/invitaciones/bautizo_nina.jpg'
import invitaNavidad from '@/assets/eventos/invitaciones/navidad.jpg'
import invitaCumpleanosElegante from '@/assets/eventos/invitaciones/cumpleanos_elegante.jpg'
import invitaNavidadHogar from '@/assets/eventos/invitaciones/navidad_hogar.jpg'
import invitaNavidadMuneco from '@/assets/eventos/invitaciones/navidad_muneco.jpg'
import invitaNavidadDorada from '@/assets/eventos/invitaciones/navidad_dorada.jpg'
import invitaNavidadPapanoel from '@/assets/eventos/invitaciones/navidad_papanoel.jpg'
import invitaNavidadGalletas from '@/assets/eventos/invitaciones/navidad_galletas.jpg'
import invitaNavidadFarolillos from '@/assets/eventos/invitaciones/navidad_farolillos.jpg'
import invitaHalloweenCalabaza from '@/assets/eventos/invitaciones/halloween_calabaza.jpg'
import invitaHalloweenCasa from '@/assets/eventos/invitaciones/halloween_casa.jpg'
import invitaHalloweenBruja from '@/assets/eventos/invitaciones/halloween_bruja.jpg'
import invitaHalloweenFantasmas from '@/assets/eventos/invitaciones/halloween_fantasmas.jpg'
import invitaAlegre from '@/assets/eventos/invitaciones/alegre.jpg'
import invitaCumpleanosRosa from '@/assets/eventos/invitaciones/cumpleanos_rosa.jpg'
import invitaCumpleanosFiesta from '@/assets/eventos/invitaciones/cumpleanos_fiesta.jpg'
import invitaGraduacionEsfuerzo from '@/assets/eventos/invitaciones/graduacion_esfuerzo.jpg'
import invitaGraduacionSuena from '@/assets/eventos/invitaciones/graduacion_suena.jpg'
import invitaGraduacionDisciplina from '@/assets/eventos/invitaciones/graduacion_disciplina.jpg'
import invitaGraduacionExplorar from '@/assets/eventos/invitaciones/graduacion_explorar.jpg'
import invitaBebeNina from '@/assets/eventos/invitaciones/bebe_nina.jpg'
import invitaBebeNeutro from '@/assets/eventos/invitaciones/bebe_neutro.jpg'
import invitaBebeArcoiris from '@/assets/eventos/invitaciones/bebe_arcoiris.jpg'
import invitaCasaBienvenida from '@/assets/eventos/invitaciones/casa_bienvenida.jpg'
import invitaCasaLlaves from '@/assets/eventos/invitaciones/casa_llaves.jpg'
import invitaCasaTerraza from '@/assets/eventos/invitaciones/casa_terraza.jpg'
import invitaCasaCajas from '@/assets/eventos/invitaciones/casa_cajas.jpg'
import invitaDespedidaNovia from '@/assets/eventos/invitaciones/despedida_novia.jpg'
import invitaDespedidaNovio from '@/assets/eventos/invitaciones/despedida_novio.jpg'
import invitaDespedidaViaje from '@/assets/eventos/invitaciones/despedida_viaje.jpg'
import invitaDespedidaNoche from '@/assets/eventos/invitaciones/despedida_noche.jpg'
import invitaFloralJardin from '@/assets/eventos/invitaciones/floral_jardin.jpg'
import invitaFloralPicnic from '@/assets/eventos/invitaciones/floral_picnic.jpg'
import invitaFloralPrimavera from '@/assets/eventos/invitaciones/floral_primavera.jpg'
import invitaFloralNoche from '@/assets/eventos/invitaciones/floral_noche.jpg'
import invitaPlayaPiscina from '@/assets/eventos/invitaciones/playa_piscina.jpg'
import invitaPlayaPina from '@/assets/eventos/invitaciones/playa_pina.jpg'
import invitaPlayaAtardecer from '@/assets/eventos/invitaciones/playa_atardecer.jpg'
import invitaPlayaTerraza from '@/assets/eventos/invitaciones/playa_terraza.jpg'
import invitaComidaFamiliar from '@/assets/eventos/invitaciones/comida_familiar.jpg'
import invitaCenaHogar from '@/assets/eventos/invitaciones/cena_hogar.jpg'
import invitaTapas from '@/assets/eventos/invitaciones/tapas.jpg'
import invitaDesayuno from '@/assets/eventos/invitaciones/desayuno.jpg'
import invitaJubilacionBrindis from '@/assets/eventos/invitaciones/jubilacion_brindis.jpg'
import invitaJubilacionViaje from '@/assets/eventos/invitaciones/jubilacion_viaje.jpg'
import invitaJubilacionRelax from '@/assets/eventos/invitaciones/jubilacion_relax.jpg'
import invitaJubilacionCena from '@/assets/eventos/invitaciones/jubilacion_cena.jpg'
import invitaCarnavalBufon from '@/assets/eventos/invitaciones/carnaval_bufon.jpg'
import invitaCarnavalPlumas from '@/assets/eventos/invitaciones/carnaval_plumas.jpg'
import invitaCarnavalPayaso from '@/assets/eventos/invitaciones/carnaval_payaso.jpg'
import invitaCarnavalConfeti from '@/assets/eventos/invitaciones/carnaval_confeti.jpg'
import invitaOtonoAcogedor from '@/assets/eventos/invitaciones/otono_acogedor.jpg'
import invitaOtonoSenderismo from '@/assets/eventos/invitaciones/otono_senderismo.jpg'
import invitaOtonoHogar from '@/assets/eventos/invitaciones/otono_hogar.jpg'
import invitaOtonoCosecha from '@/assets/eventos/invitaciones/otono_cosecha.jpg'
import invitaCorazonesAcuarela from '@/assets/eventos/invitaciones/corazones_acuarela.jpg'
import invitaCorazonesMadera from '@/assets/eventos/invitaciones/corazones_madera.jpg'
import invitaCorazonesTerraza from '@/assets/eventos/invitaciones/corazones_terraza.jpg'
import invitaCorazonesDorado from '@/assets/eventos/invitaciones/corazones_dorado.jpg'
import invitaClasico from '@/assets/eventos/invitaciones/clasico.jpg'
import invitaCelebracionDorada from '@/assets/eventos/invitaciones/celebracion_dorada.jpg'
import invitaFiestaAcuarela from '@/assets/eventos/invitaciones/fiesta_acuarela.jpg'
import invitaRobots from '@/assets/eventos/invitaciones/robots.jpg'
import invitaOsitos from '@/assets/eventos/invitaciones/ositos.jpg'
import invitaGatitos from '@/assets/eventos/invitaciones/gatitos.jpg'
import invitaKpop from '@/assets/eventos/invitaciones/kpop.jpg'
import invitaPijamas from '@/assets/eventos/invitaciones/pijamas.jpg'
import invitaSuperheroina from '@/assets/eventos/invitaciones/superheroina.jpg'
import invitaSirena from '@/assets/eventos/invitaciones/sirena.jpg'
import invitaDelfinTortuga from '@/assets/eventos/invitaciones/delfin_tortuga.jpg'
import invitaMago from '@/assets/eventos/invitaciones/mago.jpg'
import invitaBruja from '@/assets/eventos/invitaciones/bruja.jpg'
import invitaMonstruo from '@/assets/eventos/invitaciones/monstruo.jpg'

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
  'Despedida de soltero/a',
  'Estreno de casa',
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

// Petición real: "podemos incluir una ubicación real... que se pueda
// abrir" — la invitación en sí es una imagen (capas/texto), no se
// puede hacer clicable nada dentro de ella; el enlace real va en el
// texto que acompaña al compartir. No hace falta pedir coordenadas ni
// picker de mapa (ni geocodificar, que sería de pago): un enlace de
// búsqueda de Google Maps con el nombre/dirección que ya se escribe en
// "Ubicación" ya abre la app de mapas y da indicaciones.
// Petición real: "¿Y qué va a buscar si pongo en mi casa?" — un enlace
// hecho solo con el texto de "Lugar" falla si ese texto es informal
// ("en mi casa"). Con coordenadas reales (elegidas con el buscador de
// sitios, ver EventLocationCoordsPicker) el enlace va directo a esas
// coordenadas, sin depender de que el texto sea buscable; sin
// coordenadas, cae al texto tal cual (como antes).
export function buildMapsUrl(label: string, coords?: { latitude: number; longitude: number } | null): string {
  if (coords) return `https://www.google.com/maps?q=${coords.latitude},${coords.longitude}`
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(label)}`
}

export function eventLocationMapLines(
  event: Pick<
    FamilyEvent,
    | 'type'
    | 'venueLabel'
    | 'venueLatitude'
    | 'venueLongitude'
    | 'ceremonyLocationLabel'
    | 'ceremonyLocationLatitude'
    | 'ceremonyLocationLongitude'
    | 'celebrationLocationLabel'
    | 'celebrationLocationLatitude'
    | 'celebrationLocationLongitude'
  >,
  guest: { inviteScope: EventGuestInviteScope | null },
): string[] {
  const lines: string[] = []
  if (DUAL_LOCATION_EVENT_TYPES.includes(event.type)) {
    const scope = guest.inviteScope ?? 'ambas'
    if (scope !== 'solo_celebracion' && event.ceremonyLocationLabel) {
      const coords = event.ceremonyLocationLatitude != null && event.ceremonyLocationLongitude != null ? { latitude: event.ceremonyLocationLatitude, longitude: event.ceremonyLocationLongitude } : null
      lines.push(`🕊️ Cómo llegar a la ceremonia: ${buildMapsUrl(event.ceremonyLocationLabel, coords)}`)
    }
    if (scope !== 'solo_ceremonia' && event.celebrationLocationLabel) {
      const coords =
        event.celebrationLocationLatitude != null && event.celebrationLocationLongitude != null ? { latitude: event.celebrationLocationLatitude, longitude: event.celebrationLocationLongitude } : null
      lines.push(`🎉 Cómo llegar a la celebración: ${buildMapsUrl(event.celebrationLocationLabel, coords)}`)
    }
  } else if (event.venueLabel) {
    const coords = event.venueLatitude != null && event.venueLongitude != null ? { latitude: event.venueLatitude, longitude: event.venueLongitude } : null
    lines.push(`📍 Cómo llegar: ${buildMapsUrl(event.venueLabel, coords)}`)
  }
  return lines
}

// Eventos Fase 14B — desglose OPCIONAL de personas dentro de una
// unidad invitada. adults_count/children_count (event_guests) SIGUEN
// siendo la fuente de verdad — esta función nunca los recalcula, solo
// compara para poder avisar (sin bloquear) si el desglose tiene más
// personas de un tipo que las contadas para el grupo. Un desglose
// parcial (menos personas que el recuento) es válido y no es aviso.
export interface GuestBreakdownStatus {
  adultsMembers: number
  childrenMembers: number
  totalMembers: number
  adultsExceeded: boolean
  childrenExceeded: boolean
}

export function computeGuestBreakdownStatus(
  guest: Pick<EventGuest, 'adultsCount' | 'childrenCount'>,
  members: Pick<EventGuestMember, 'personType'>[],
): GuestBreakdownStatus {
  const adultsMembers = members.filter((m) => m.personType === 'adulto').length
  const childrenMembers = members.filter((m) => m.personType === 'nino').length
  return {
    adultsMembers,
    childrenMembers,
    totalMembers: members.length,
    adultsExceeded: adultsMembers > guest.adultsCount,
    childrenExceeded: childrenMembers > guest.childrenCount,
  }
}

// Eventos Fase 14C — dos modos de ocupación de mesa MUTUAMENTE
// EXCLUYENTES para no duplicar plazas: una unidad SIN ninguna persona
// desglosada sigue contando por unidad completa (event_guests.table_id,
// exactamente como antes de la Fase 14A); en cuanto tiene aunque sea
// una persona desglosada, la unidad pasa a modo "personas" y deja de
// contar por su table_id de unidad (que puede quedar con un valor
// antiguo sin usar — no se borra, por si se borran luego todas las
// personas y hay que volver limpiamente al modo unidad). Las plazas
// del desglose parcial que todavía no tienen nombre (unidentified)
// nunca se inventan ni se reparten en ninguna mesa: solo se cuentan
// aparte, como recordatorio de "personas por nombrar".
export interface GuestSeatingStatus {
  mode: 'unidad' | 'personas'
  totalDeclared: number
  identifiedCount: number
  unidentifiedCount: number
  seatedIdentifiedCount: number
  unassignedIdentifiedCount: number
}

export function computeGuestSeatingStatus(
  guest: Pick<EventGuest, 'adultsCount' | 'childrenCount'>,
  members: Pick<EventGuestMember, 'tableId'>[],
): GuestSeatingStatus {
  const totalDeclared = guest.adultsCount + guest.childrenCount
  if (members.length === 0) {
    return { mode: 'unidad', totalDeclared, identifiedCount: 0, unidentifiedCount: 0, seatedIdentifiedCount: 0, unassignedIdentifiedCount: 0 }
  }
  const identifiedCount = members.length
  const seatedIdentifiedCount = members.filter((m) => m.tableId != null).length
  return {
    mode: 'personas',
    totalDeclared,
    identifiedCount,
    unidentifiedCount: Math.max(0, totalDeclared - identifiedCount),
    seatedIdentifiedCount,
    unassignedIdentifiedCount: identifiedCount - seatedIdentifiedCount,
  }
}

// Cuántas personas hay realmente sentadas en UNA mesa concreta,
// combinando los dos modos sin sumar dos veces la misma unidad: si
// tiene personas desglosadas, cuenta cada persona asignada a esa mesa
// (1 cada una); si no, cuenta el grupo entero solo si su table_id de
// unidad es esa mesa (como siempre).
export function computeTableOccupancy(
  table: Pick<EventTableSeat, 'id'>,
  guests: Pick<EventGuest, 'id' | 'adultsCount' | 'childrenCount' | 'tableId'>[],
  membersByGuestId: Record<string, Pick<EventGuestMember, 'tableId'>[]>,
): number {
  let count = 0
  for (const g of guests) {
    const members = membersByGuestId[g.id] ?? []
    if (members.length === 0) {
      if (g.tableId === table.id) count += g.adultsCount + g.childrenCount
    } else {
      count += members.filter((m) => m.tableId === table.id).length
    }
  }
  return count
}

function invitationDateClause(event: Pick<FamilyEvent, 'dateStatus' | 'eventDate' | 'eventTime'>): string {
  if (event.dateStatus === 'pendiente' || !event.eventDate) return 'en una fecha que anunciaremos pronto'
  const nice = new Date(event.eventDate + 'T00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })
  const time = event.eventTime ? ` a las ${event.eventTime.slice(0, 5)}` : ''
  const suffix = event.dateStatus === 'provisional' ? ' (fecha provisional)' : ''
  return `el ${nice}${time}${suffix}`
}

// Petición real: "definir un texto genérico de invitación para cada
// clase de evento que se ajuste bien en cada plantilla... y los campos
// de datos de cada evento se inserten" — un párrafo corto (2 líneas
// casi siempre, para caber en el hueco de la plantilla) en vez de la
// lista de hechos a secas (esa sigue existiendo en eventDateLine/
// eventLocationLines, usada en la vista rápida por invitado). Los
// tipos con dos ubicaciones (DUAL_LOCATION_EVENT_TYPES) tienen versión
// para cuando están las dos y para cuando solo hay una rellena — no se
// inventa una ubicación que el evento todavía no tiene.
export function buildInvitationMessage(event: FamilyEvent): string {
  const when = invitationDateClause(event)
  const title = event.title.trim()
  const ceremony = event.ceremonyLocationLabel
  const celebration = event.celebrationLocationLabel
  const venue = event.venueLabel

  switch (event.type) {
    case 'cumpleanos': {
      const where = venue ? ` en ${venue}` : ''
      return `Os esperamos ${when}${where} para celebrar ${title}.\n¡Queremos pasarlo en grande con vosotros!`
    }
    case 'comunion': {
      if (ceremony && celebration) return `Celebramos ${title} ${when}.\n🕊️ ${ceremony}   🎉 ${celebration}`
      if (ceremony) return `Celebramos ${title} ${when} en ${ceremony}.\n¡Nos encantaría compartir este día con vosotros!`
      if (celebration) return `Celebramos ${title} ${when}.\nOs esperamos en ${celebration} para disfrutarlo juntos.`
      return `Celebramos ${title} ${when}.\n¡Nos encantaría compartir este día con vosotros!`
    }
    case 'bautizo': {
      if (ceremony && celebration) return `Celebramos ${title} ${when}.\n🕊️ ${ceremony}   🎉 ${celebration}`
      if (ceremony) return `Celebramos ${title} ${when} en ${ceremony}.\nQueremos compartir este momento con vosotros.`
      if (celebration) return `Celebramos ${title} ${when}.\nOs esperamos en ${celebration} para disfrutarlo juntos.`
      return `Celebramos ${title} ${when}.\nQueremos compartir este momento con vosotros.`
    }
    case 'boda': {
      if (ceremony && celebration) return `Nos casamos ${when}.\n💍 ${ceremony}   🥂 ${celebration}`
      if (ceremony) return `Nos casamos ${when} en ${ceremony}.\n¡Queremos compartir este día con quienes más queremos!`
      if (celebration) return `Nos casamos ${when}.\nOs esperamos en ${celebration} para celebrarlo juntos.`
      return `Nos casamos ${when}.\n¡Queremos compartir este día con quienes más queremos!`
    }
    case 'celebracion': {
      const where = venue ? ` en ${venue}` : ''
      return `Celebramos ${title} ${when}${where}.\n¡Nos encantaría contar con vosotros!`
    }
    case 'personalizado':
    default: {
      const where = venue ? ` en ${venue}` : ''
      return `${title}\nOs esperamos ${when}${where}.\n¡No os lo podéis perder!`
    }
  }
}

// Plantillas — cada una es color + una ilustración decorativa propia
// (ver INVITATION_ART en EventosScreen.tsx, ahí vive el JSX porque este
// archivo es .ts sin JSX). Petición real: "no quiero un simple fondo
// colorido, quiero plantillas bonitas temáticas para cada clase de
// evento" — con referencia a plantillas de Canva/Pinterest, que no se
// pueden copiar (son diseños de terceros con derechos); en su lugar,
// arte propio original con el mismo espíritu de cada tema. `artKey`
// nunca cambia para una `key` ya existente (event_invitations guarda
// el `key` de eventos ya creados; renombrar rompería sus diseños).
export interface InvitationTemplateMeta {
  key: string
  label: string
  gradient: string
  text: string
  artKey: string
  // Petición real: "quiero obras de arte" — el SVG dibujado a mano
  // tiene techo (queda "plano", nunca pintado/con textura). Cuando el
  // usuario trae una ilustración propia (encargada fuera, con
  // licencia en regla) para un tema, `image` apunta a ese archivo y
  // sustituye el dibujo por artKey sin tocar nada más del editor — las
  // capas del usuario (texto/emoji/foto) se siguen viendo encima igual.
  image?: string
  // Petición real: "no es necesario que todas las tarjetas tengan el
  // mismo formato" — la tarjeta de invitación por defecto es 3:4, pero
  // algunas fotos vienen de una hoja apaisada (más ancha que alta) y
  // forzarlas a 3:4 recortaba los lados dejando "casi solo la tarjeta
  // del centro". Cuando `image` no encaja bien en 3:4, `imageAspect`
  // (ancho/alto real de la foto) hace que la tarjeta adopte esa forma
  // en vez de recortar — se ve la imagen entera, sin recorte.
  imageAspect?: number
  // Petición real: "quiero poder ponerle una capa de texto ajustable...
  // me refiero a esa parte de cada tarjeta (círculo azul) no las
  // tarjetas enteras... habrá que ajustarlo tarjeta por tarjeta" — el
  // hueco en blanco real dentro de la ilustración, detectado por
  // color (relleno por inundación desde el centro, con margen hacia
  // dentro) y comprobado a ojo. Fracción del ancho/alto de la tarjeta
  // (0..1, no de la imagen sin recortar). Las capas por defecto se
  // colocan dentro de esta caja en vez de en posiciones fijas iguales
  // para las 100 plantillas.
  textArea?: { x: number; y: number; width: number; height: number }
}

export const INVITATION_TEMPLATES: InvitationTemplateMeta[] = [
  { key: 'clasico', label: 'Clásico', gradient: 'linear-gradient(135deg, #4C6EF5, #7C3AED)', text: '#ffffff', artKey: 'confeti', image: invitaClasico, imageAspect: 1.1861, textArea: { x: 0.34, y: 0.2, width: 0.56, height: 0.5976 } },
  // GRUPO A — certificada ("GLOBOS: buen resultado. Mantener especialmente la separación actual entre
  // título y cuerpo"). No tocar.
  { key: 'alegre', label: 'Globos', gradient: 'linear-gradient(160deg, #FBBF24, #FB923C)', text: '#1f2233', artKey: 'globos', image: invitaAlegre, imageAspect: 0.6531, textArea: { x: 0.2284, y: 0.1571, width: 0.532, height: 0.5843 } },
  // Zona intencionadamente <0.45 de ancho: activa el modo "compact" de buildInvitationTemplateLayers
  // (fuente más pequeña automática) — el cartel blanco real es pequeño (sujeto por las manos de los
  // monstruos), no hay más superficie limpia que ganar ampliando, así que se reduce la fuente en vez de
  // invadir a los personajes.
  { key: 'monstruo', label: 'Monstruo', gradient: 'linear-gradient(160deg, #2DD4BF, #059669)', text: '#ffffff', artKey: 'monstruo', image: invitaMonstruo, imageAspect: 0.8333, textArea: { x: 0.3, y: 0.35, width: 0.36, height: 0.5541 } },
  { key: 'futbol', label: 'Fútbol', gradient: 'linear-gradient(160deg, #3B82F6, #1E3A8A)', text: '#ffffff', artKey: 'futbol', image: invitaFutbol, imageAspect: 0.4361, textArea: { x: 0.1, y: 0.08, width: 0.8, height: 0.56 } },
  // GRUPO A — certificada ("UNICORNIO: resultado prácticamente correcto. No tocar salvo ajuste mínimo
  // realmente necesario"). Sin cambios esta fase.
  // Plantilla certificada (grupo A) — excepción autorizada explícitamente por el usuario 2026-09-26 SOLO
  // para el bug real de solape con el texto de certificación de 4 líneas tras subir AVG_CHAR_WIDTH_RATIO
  // a 0.6: se amplía únicamente el alto (x/y/width intactos) al mínimo necesario para overflowed=false.
  { key: 'unicornio', label: 'Unicornio', gradient: 'linear-gradient(160deg, #F5D0FE, #C4B5FD)', text: '#4C1D95', artKey: 'unicornio', image: invitaUnicornio, imageAspect: 0.4322, textArea: { x: 0.2, y: 0.1, width: 0.6, height: 0.6 } },
  // GRUPO A — certificada ("DORADO: funciona correctamente"). No tocar.
  { key: 'elegante', label: 'Dorado', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'dorado', image: invitaElegante, imageAspect: 1.1861, textArea: { x: 0.1876, y: 0.13, width: 0.5693, height: 0.6742 } },
  // Sin instrucción explícita en la revisión manual de esta fase — textArea sin tocar (es la plantilla del
  // caso de certificación "Bodas de plata" de la fase anterior, no confundir con floral_picnic/primavera/noche).
  // FASE 2 — fondo rediseñado (2026-09): marco de madera con flores/pajarera en el borde, pájaro posado en
  // el borde superior — panel claro central grande. Ya NO es la imagen usada en el caso de certificación
  // "Bodas de plata" de sesiones anteriores (esa referencia queda obsoleta con este cambio de fondo).
  { key: 'floral', label: 'Floral', gradient: 'linear-gradient(160deg, #FFE4E6, #FED7AA)', text: '#7C2D12', artKey: 'floral', image: invitaFloralJardin, imageAspect: 0.6667, textArea: { x: 0.32, y: 0.22, width: 0.46, height: 0.6807 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("personaje más pequeño/lateral, mucha más zona
  // central/derecha"). NO tocar textArea ahora.
  // FASE 2 — fondo rediseñado (2026-09): tarjeta grande y limpia, oso reducido a la esquina inferior
  // izquierda. imageAspect y textArea recalculados desde cero sobre la imagen nueva real.
  { key: 'bautizo', label: 'Celeste', gradient: 'linear-gradient(160deg, #DBEAFE, #BFDBFE)', text: '#1E3A8A', artKey: 'celeste', image: invitaBautizo, imageAspect: 1.2736, textArea: { x: 0.4, y: 0.08, width: 0.5, height: 0.6807 } },
  { key: 'disco', label: 'Disco', gradient: 'linear-gradient(160deg, #581C87, #1E1B4B)', text: '#ffffff', artKey: 'disco', image: invitaDisco, imageAspect: 1.188, textArea: { x: 0.28, y: 0.22, width: 0.58, height: 0.5976 } },
  // Lote 2 — petición real, lista de 26 temas; 3 no se hacen por ser
  // personajes/estilos con derechos de terceros (Minecraft, Mario Bros,
  // Spiderman — ver INVITATION_ART en EventosScreen.tsx). El resto se
  // reparte en varios lotes.
  { key: 'dinosaurios', label: 'Dinosaurios', gradient: 'linear-gradient(160deg, #84CC16, #166534)', text: '#ffffff', artKey: 'dinosaurios', image: invitaDinosaurios, imageAspect: 0.4361, textArea: { x: 0.22, y: 0.3, width: 0.5, height: 0.6807 } },
  { key: 'videojuegos', label: 'Videojuegos', gradient: 'linear-gradient(160deg, #312E81, #4C1D95)', text: '#ffffff', artKey: 'videojuegos', image: invitaVideojuegos, imageAspect: 0.499, textArea: { x: 0.13, y: 0.32, width: 0.7, height: 0.5491 } },
  // Ampliada 2026-09-26 (feedback en vivo): la ronda de estrechado anterior calibró justo lo mínimo para
  // el texto de certificación, dejando hueco real sin aprovechar dentro del corazón — quien escriba más
  // texto que el de certificación se beneficia de más margen real. Comprobado que sigue sin invadir las
  // rosas de las esquinas ni la punta inferior del corazón.
  { key: 'corazones', label: 'Corazones', gradient: 'linear-gradient(160deg, #FDA4AF, #E11D48)', text: '#ffffff', artKey: 'corazones', image: invitaCorazones, imageAspect: 0.4512, textArea: { x: 0.15, y: 0.18, width: 0.7, height: 0.44 } },
  // FASE 2 — fondo rediseñado (2026-09): sigue siendo el ID "ositos" (nunca se renombra por un cambio
  // cosmético), aunque el personaje visual ahora es un cachorro detective — mismo concepto reducido a la
  // esquina inferior izquierda, gran pergamino limpio central/derecho.
  { key: 'ositos', label: 'Ositos', gradient: 'linear-gradient(160deg, #FDE9D9, #D6A574)', text: '#5C3A1E', artKey: 'ositos', image: invitaOsitos, imageAspect: 1.2192, textArea: { x: 0.32, y: 0.08, width: 0.54, height: 0.6 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("necesita tarjeta clara considerablemente mayor").
  // FASE 2 — fondo rediseñado (2026-09): tarjeta clara mucho mayor, gatitos reducidos a las esquinas.
  { key: 'gatitos', label: 'Gatitos', gradient: 'linear-gradient(160deg, #F3E8FF, #E9D5FF)', text: '#6B21A8', artKey: 'gatitos', image: invitaGatitos, imageAspect: 0.6667, textArea: { x: 0.18, y: 0.3, width: 0.64, height: 0.5976 } },
  { key: 'coches', label: 'Coches de carreras', gradient: 'linear-gradient(160deg, #1F2937, #7F1D1D)', text: '#ffffff', artKey: 'coches', image: invitaCoches, imageAspect: 0.4829, textArea: { x: 0.14, y: 0.2, width: 0.64, height: 0.5976 } },
  // Lote 3.
  // GRUPO C — marcada para futuro rediseño/ajuste de fondo ("elementos del robot invaden zona de escritura").
  // FASE 2 — fondo rediseñado (2026-09): panel claro rectangular con robots solo en las 4 esquinas.
  { key: 'robots', label: 'Robots', gradient: 'linear-gradient(160deg, #64748B, #1E293B)', text: '#ffffff', artKey: 'robots', image: invitaRobots, imageAspect: 0.6667, textArea: { x: 0.15, y: 0.2, width: 0.7, height: 0.62 } },
  // GRUPO A — certificada ("SUPERHÉROE: PASA. No rediseñar ni modificar innecesariamente."). Sin cambios.
  { key: 'superheroe', label: 'Superhéroe', gradient: 'linear-gradient(160deg, #DC2626, #1E3A8A)', text: '#ffffff', artKey: 'superheroe', image: invitaSuperheroe, imageAspect: 0.4844, textArea: { x: 0.0978, y: 0.3606, width: 0.7933, height: 0.4561 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("zona útil insuficiente, ampliar panel claro").
  // FASE 2 — fondo rediseñado (2026-09): panel claro ampliado, superheroína desplazada a la izquierda.
  { key: 'superheroina', label: 'Superheroína', gradient: 'linear-gradient(160deg, #EC4899, #7C3AED)', text: '#ffffff', artKey: 'superheroina', image: invitaSuperheroina, imageAspect: 0.6667, textArea: { x: 0.38, y: 0.22, width: 0.46, height: 0.6807 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("reducir decoración inferior y aumentar zona limpia").
  // FASE 2 — fondo rediseñado (2026-09): cartel claro superior, niños/decoración bajados a la parte inferior.
  { key: 'pijamas', label: 'Estrellitas', gradient: 'linear-gradient(160deg, #312E81, #0F172A)', text: '#ffffff', artKey: 'pijamas', image: invitaPijamas, imageAspect: 0.6667, textArea: { x: 0.24, y: 0.05, width: 0.62, height: 0.5976 } },
  // "Guerreras Kpop" — ambiente genérico de concierto/idol (neón,
  // micro, focos), sin ningún grupo, cara ni persona real de por medio.
  // GRUPO C — identificado como "CANTANTE / ESTRELLA MUSICAL" de la revisión manual (no es un nombre
  // literal — inferido por tema: ambiente de concierto/idol, sin grupo/cara real, ver comentario "Lote 3"
  // más arriba; marcado para futuro rediseño: "aumentar panel/estrella/zona clara"). NO tocar textArea ahora.
  // FASE 2 — fondo rediseñado (2026-09): estrella de neón con zona clara en su franja horizontal central.
  { key: 'kpop', label: 'Kpop', gradient: 'linear-gradient(160deg, #DB2777, #6D28D9)', text: '#ffffff', artKey: 'kpop', image: invitaKpop, imageAspect: 0.6667, textArea: { x: 0.38, y: 0.28, width: 0.5, height: 0.6807 } },
  // Lote 4 — arte real traído por el usuario (dos hojas de 6 y 12
  // ilustraciones ya recortadas en plantillas individuales). De las 12
  // de la segunda hoja se descarta una (castillo/varita/lechuza al
  // estilo Hogwarts — personaje/franquicia con derechos de terceros,
  // misma regla que Minecraft/Mario/Spiderman). El resto sustituye el
  // SVG de algún tema ya existente (dinosaurios/unicornio/fútbol/
  // coches/videojuegos, arriba) o suma un tema nuevo. Estos temas
  // nuevos no llevan `artKey` propio con dibujo de repuesto porque
  // siempre tienen `image`; si en el futuro faltara la imagen, el
  // fallback de InvitationBackgroundArt usa 'confeti'.
  { key: 'princesa', label: 'Princesa', gradient: 'linear-gradient(160deg, #FBCFE8, #F9A8D4)', text: '#9D174D', artKey: 'confeti', image: invitaPrincesa, imageAspect: 0.5, textArea: { x: 0.16, y: 0.34, width: 0.68, height: 0.36 } },
  { key: 'espacio', label: 'Espacio', gradient: 'linear-gradient(160deg, #1E3A8A, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaEspacio, imageAspect: 0.4322, textArea: { x: 0.22, y: 0.18, width: 0.5, height: 0.6807 } },
  { key: 'piratas', label: 'Piratas', gradient: 'linear-gradient(160deg, #38BDF8, #D6A574)', text: '#5C3A1E', artKey: 'confeti', image: invitaPiratas, imageAspect: 0.4355, textArea: { x: 0.15, y: 0.24, width: 0.6, height: 0.5976 } },
  { key: 'safari', label: 'Safari', gradient: 'linear-gradient(160deg, #84CC16, #166534)', text: '#ffffff', artKey: 'confeti', image: invitaSafari, imageAspect: 1.214, textArea: { x: 0.28, y: 0.28, width: 0.44, height: 0.4875 } },
  { key: 'acampada', label: 'Acampada', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaAcampada, imageAspect: 0.5565, textArea: { x: 0.38, y: 0.16, width: 0.52, height: 0.6807 } },
  { key: 'oceano', label: 'Fondo del mar', gradient: 'linear-gradient(160deg, #0EA5E9, #075985)', text: '#ffffff', artKey: 'confeti', image: invitaOceano, imageAspect: 0.5011, textArea: { x: 0.12, y: 0.28, width: 0.7, height: 0.42 } },
  // GRUPO C — "HADA" en la revisión manual, marcada para futuro rediseño de fondo ("hada más pequeña/
  // lateral, varita fuera de la zona de escritura, gran zona limpia central"). NO tocar textArea ahora.
  // FASE 2 — fondo rediseñado (2026-09): hada pequeña en la esquina superior, varita fuera de la zona de
  // escritura, gran pergamino limpio central.
  { key: 'hadas', label: 'Hadas', gradient: 'linear-gradient(160deg, #FBCFE8, #BBF7D0)', text: '#BE185D', artKey: 'confeti', image: invitaHadas, imageAspect: 0.6667, textArea: { x: 0.18, y: 0.14, width: 0.66, height: 0.7 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("cartel central más alto/vertical, reorganizar animales").
  // FASE 2 — fondo rediseñado (2026-09): cartel de madera vertical con animales solo alrededor del borde.
  { key: 'granja', label: 'Granja', gradient: 'linear-gradient(160deg, #FDE9D9, #DC2626)', text: '#7C2D12', artKey: 'confeti', image: invitaGranja, imageAspect: 0.6667, textArea: { x: 0.24, y: 0.28, width: 0.52, height: 0.6807 } },
  { key: 'alienigenas', label: 'Alienígenas', gradient: 'linear-gradient(160deg, #312E81, #020617)', text: '#ffffff', artKey: 'confeti', image: invitaAlienigenas, imageAspect: 0.5, textArea: { x: 0.15, y: 0.2, width: 0.62, height: 0.5976 } },
  { key: 'playa', label: 'Playa tropical', gradient: 'linear-gradient(160deg, #FDBA74, #FB7185)', text: '#7C2D12', artKey: 'confeti', image: invitaPlaya, imageAspect: 0.4492, textArea: { x: 0.16, y: 0.12, width: 0.6, height: 0.5976 } },
  { key: 'concierto', label: 'Concierto', gradient: 'linear-gradient(160deg, #7C3AED, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaConcierto, imageAspect: 0.4688, textArea: { x: 0.2, y: 0.08, width: 0.6, height: 0.5976 } },
  { key: 'boda', label: 'Boda', gradient: 'linear-gradient(160deg, #F5F0E6, #E7DFC6)', text: '#4A5D23', artKey: 'confeti', image: invitaBoda, imageAspect: 1.2163, textArea: { x: 0.24, y: 0.14, width: 0.5, height: 0.6807 } },
  // Lote 5 — segunda hoja de arte real. Se descartan los repetidos de
  // temas que ya tenían imagen (fútbol, dinosaurios, espacio, unicornio)
  // y una sirena que se parece demasiado a un personaje Disney conocido
  // (pelo rojo, top de concha, mismo silueta) — misma regla de siempre.
  // GRUPO C — marcada para futuro rediseño de fondo ("cartel mucho más alto/vertical; brazo/pala fuera de
  // la zona de escritura"). NO tocar textArea ahora.
  // FASE 2 — fondo rediseñado (2026-09): cartel vertical con cinta de peligro, niños en las esquinas
  // superiores, excavadora fuera del pergamino (por la izquierda, ver zona más estrecha por ese lado).
  { key: 'obras', label: 'Obras', gradient: 'linear-gradient(160deg, #FBBF24, #78350F)', text: '#1f2233', artKey: 'confeti', image: invitaObras, imageAspect: 0.6667, textArea: { x: 0.26, y: 0.14, width: 0.5, height: 0.68 } },
  { key: 'nochevieja', label: 'Nochevieja', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaNochevieja, imageAspect: 0.5, textArea: { x: 0.12, y: 0.03, width: 0.7, height: 0.6 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("óvalo dorado central grande, vertical/alargado").
  // FASE 2 — fondo rediseñado (2026-09): marco dorado fino, flores en corners, cáliz/vela/biblia abajo a
  // la izquierda — franja central ancha completamente libre.
  { key: 'comunion', label: 'Comunión', gradient: 'linear-gradient(160deg, #ECFDF5, #D1FAE5)', text: '#166534', artKey: 'confeti', image: invitaComunion, imageAspect: 0.6667, textArea: { x: 0.3, y: 0.2, width: 0.44, height: 0.4875 } },
  // GRUPO A — certificada ("BEBÉ NIÑO: PERFECTA. CERTIFICADA. NO TOCAR"). Referencia de no-regresión.
  { key: 'bebe_nino', label: 'Bebé niño', gradient: 'linear-gradient(160deg, #DBEAFE, #BFDBFE)', text: '#1E3A8A', artKey: 'confeti', image: invitaBebeNino, imageAspect: 0.4844, textArea: { x: 0.15, y: 0.1, width: 0.7, height: 0.4 } },
  // Lote 6 — tercera hoja de arte real. Se descartan los repetidos
  // (Nochevieja, Playa, los 5 de boda que ya teníamos cubiertos, la
  // variante rosa de comunión, el barco de bautizo y el osito de luna
  // que repetía Bebé niño) y se sustituye el comunion.jpg del lote 5
  // (floral verde) por este cáliz, más reconocible.
  { key: 'barbacoa', label: 'Barbacoa', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaBarbacoa, imageAspect: 1.1861, textArea: { x: 0.28, y: 0.16, width: 0.46, height: 0.6807 } },
  // Lote 7 — cuarta hoja. Se descartan los repetidos (Nochevieja, un
  // marco de luces de jardín parecido a Barbacoa, y rosas/corazones que
  // ya teníamos) y se añaden Bautizo niña, Navidad y un Cumpleaños más
  // elegante/adulto (pastel de chocolate y cóctel, distinto del
  // Cumpleaños infantil de "Globos").
  { key: 'bautizo_nina', label: 'Bautizo niña', gradient: 'linear-gradient(160deg, #FCE7F3, #FBCFE8)', text: '#9D174D', artKey: 'confeti', image: invitaBautizoNina, imageAspect: 0.4214, textArea: { x: 0.18, y: 0.08, width: 0.56, height: 0.5976 } },
  { key: 'navidad', label: 'Navidad', gradient: 'linear-gradient(160deg, #166534, #7F1D1D)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidad, imageAspect: 0.4214, textArea: { x: 0.1, y: 0.08, width: 0.74, height: 0.5491 } },
  { key: 'cumpleanos_elegante', label: 'Cumpleaños elegante', gradient: 'linear-gradient(160deg, #134E4A, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaCumpleanosElegante, imageAspect: 0.4214, textArea: { x: 0.16, y: 0.05, width: 0.56, height: 0.5976 } },
  // Lote 8 — "Navidad varias" (pedido explícito en la lista de 26
  // temas: varias variantes navideñas, no solo una) + una hoja extra de
  // Halloween que no estaba en la lista pero encaja igual de bien en
  // Celebración/Personalizado — nada con copyright, calabazas/fantasmas
  // genéricos.
  // Zona intencionadamente <0.45 de ancho: activa el modo "compact" (fuente más pequeña automática) — el
  // pergamino real es pequeño y la chimenea/calcetines limitan la altura, no hay más superficie limpia real
  // que ganar ampliando sin invadirlos.
  { key: 'navidad_hogar', label: 'Navidad junto al fuego', gradient: 'linear-gradient(160deg, #7F1D1D, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidadHogar, imageAspect: 0.5911, textArea: { x: 0.24, y: 0.05, width: 0.44, height: 0.48 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("crear cartel central más largo y ancho").
  // FASE 2 — fondo rediseñado (2026-09): cartel de madera mucho más ancho/largo, muñeco de nieve reducido
  // a la esquina inferior izquierda.
  { key: 'navidad_muneco', label: 'Navidad muñeco de nieve', gradient: 'linear-gradient(160deg, #1E3A8A, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaNavidadMuneco, imageAspect: 0.6667, textArea: { x: 0.2, y: 0.12, width: 0.62, height: 0.6 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("gran zona central limpia, evitar ramas diagonales").
  // FASE 2 — fondo rediseñado (2026-09): decoración redistribuida a las esquinas opuestas (arriba-izq /
  // abajo-dcha), gran zona central limpia sin ramas diagonales.
  { key: 'navidad_dorada', label: 'Navidad dorada', gradient: 'linear-gradient(160deg, #F5F0E6, #E7DFC6)', text: '#7C2D12', artKey: 'confeti', image: invitaNavidadDorada, imageAspect: 0.6667, textArea: { x: 0.26, y: 0.15, width: 0.42, height: 0.5541 } },
  // GRUPO C — marcada para futuro rediseño de fondo ("zona de escritura considerablemente más ancha").
  // FASE 2 — fondo rediseñado (2026-09): zona de escritura mucho más ancha, Papá Noel/reno solo asomando
  // por el borde izquierdo.
  { key: 'navidad_papanoel', label: 'Navidad Papá Noel', gradient: 'linear-gradient(160deg, #7F1D1D, #1E3A8A)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidadPapanoel, imageAspect: 0.6667, textArea: { x: 0.34, y: 0.08, width: 0.58, height: 0.8 } },
  // Hoja ligeramente inclinada — sin soporte de rotación en textArea hoy (solo x/y/width/height, ver
  // InvitationTemplateMeta), y esta fase no lo añade (evitar fragilidad para una sola plantilla, ver
  // informe). Ajuste mínimo de zona, no de orientación — pendiente de fase futura si hiciera falta más.
  { key: 'navidad_galletas', label: 'Navidad galletas', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidadGalletas, imageAspect: 0.5911, textArea: { x: 0.25, y: 0.15, width: 0.5, height: 0.6807 } },
  { key: 'navidad_farolillos', label: 'Navidad farolillos', gradient: 'linear-gradient(160deg, #1E3A8A, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaNavidadFarolillos, imageAspect: 0.5895, textArea: { x: 0.34, y: 0.18, width: 0.56, height: 0.5976 } },
  { key: 'halloween_calabaza', label: 'Halloween calabaza', gradient: 'linear-gradient(160deg, #C2410C, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaHalloweenCalabaza, imageAspect: 0.6531, textArea: { x: 0.15, y: 0.27, width: 0.68, height: 0.5976 } },
  // GRUPO A — certificada ("HALLOWEEN CASA ENCANTADA: PERFECTA. CERTIFICADA. NO TOCAR"). Referencia de no-regresión.
  // Plantilla certificada (grupo A) — excepción autorizada explícitamente por el usuario 2026-09-26 SOLO
  // para el bug real de solape con el texto de certificación de 4 líneas tras subir AVG_CHAR_WIDTH_RATIO
  // a 0.6: se amplía únicamente el alto (x/y/width intactos) al mínimo necesario para overflowed=false.
  { key: 'halloween_casa', label: 'Halloween casa encantada', gradient: 'linear-gradient(160deg, #1E1B4B, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaHalloweenCasa, imageAspect: 0.6531, textArea: { x: 0.2387, y: 0.3212, width: 0.5227, height: 0.6788 } },
  { key: 'halloween_bruja', label: 'Halloween bruja', gradient: 'linear-gradient(160deg, #166534, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaHalloweenBruja, imageAspect: 0.6531, textArea: { x: 0.35, y: 0.27, width: 0.47, height: 0.6807 } },
  { key: 'halloween_fantasmas', label: 'Halloween fantasmas', gradient: 'linear-gradient(160deg, #C2410C, #1E1B4B)', text: '#FFF7ED', artKey: 'confeti', image: invitaHalloweenFantasmas, imageAspect: 0.6531, textArea: { x: 0.27, y: 0.11, width: 0.4, height: 0.5541 } },
  // Lote 9 — más variantes de cumpleaños; se descarta una cuarta
  // (señal de madera "Buena compañía/Risas/Momentos inolvidables" en
  // playa) por quedar demasiado parecida a Playa tropical.
  { key: 'cumpleanos_rosa', label: 'Cumpleaños rosa', gradient: 'linear-gradient(160deg, #FBCFE8, #FDA4AF)', text: '#9D174D', artKey: 'confeti', image: invitaCumpleanosRosa, imageAspect: 0.6531, textArea: { x: 0.32, y: 0.1, width: 0.44, height: 0.4875 } },
  { key: 'cumpleanos_fiesta', label: 'Cumpleaños fiesta', gradient: 'linear-gradient(160deg, #FBBF24, #0EA5E9)', text: '#1f2233', artKey: 'confeti', image: invitaCumpleanosFiesta, imageAspect: 0.6531, textArea: { x: 0.18, y: 0.14, width: 0.5, height: 0.6807 } },
  // Lote 10 — "Ribete (Graduación)" de la lista de 26 (varias
  // variantes), Bebé chica/Cuna neutral/variante arcoíris (completa la
  // pareja con Bebé niño), y tres categorías nuevas que no estaban en la
  // lista pero encajan en Celebración/Personalizado: estrenar casa,
  // despedida de soltero/a y más variantes de Floral y Playa tropical
  // ("varias", igual que Navidad).
  // FASE 2 — fondo rediseñado (2026-09): tarjeta con marco dorado fino, birrete/globos en corners,
  // libros/diploma abajo — franja central amplia libre.
  { key: 'graduacion_esfuerzo', label: 'Graduación esfuerzo', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaGraduacionEsfuerzo, imageAspect: 0.6667, textArea: { x: 0.2, y: 0.28, width: 0.62, height: 0.5976 } },
  { key: 'graduacion_suena', label: 'Graduación sueña', gradient: 'linear-gradient(160deg, #166534, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaGraduacionSuena, imageAspect: 0.6667, textArea: { x: 0.17, y: 0.09, width: 0.66, height: 0.58 } },
  // FASE 2 — fondo rediseñado (2026-09): tarjeta CIRCULAR dorada, birrete arriba-dcha, libros/diploma
  // abajo — zona segura es el rectángulo inscrito en el círculo evitando ambos.
  // Zona intencionadamente <0.45 de ancho: activa el modo "compact" (fuente más pequeña automática). La tarjeta
  // circular de esta plantilla limita la superficie real utilizable, real límite geométrico documentado en
  // FASE 1 — no hay más espacio limpio real dentro del círculo que ganar ampliando el rectángulo.
  { key: 'graduacion_disciplina', label: 'Graduación disciplina', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaGraduacionDisciplina, imageAspect: 0.6667, textArea: { x: 0.29, y: 0.28, width: 0.42, height: 0.5541 } },
  { key: 'graduacion_explorar', label: 'Graduación explorar', gradient: 'linear-gradient(160deg, #166534, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaGraduacionExplorar, imageAspect: 0.6667, textArea: { x: 0.17, y: 0.3, width: 0.58, height: 0.5976 } },
  { key: 'bebe_nina', label: 'Bebé niña', gradient: 'linear-gradient(160deg, #FBCFE8, #FDA4AF)', text: '#9D174D', artKey: 'confeti', image: invitaBebeNina, imageAspect: 0.9526, textArea: { x: 0.2444, y: 0.1238, width: 0.4667, height: 0.68 } },
  { key: 'bebe_neutro', label: 'Cuna neutral', gradient: 'linear-gradient(160deg, #D9F99D, #FDE9D9)', text: '#3F6212', artKey: 'confeti', image: invitaBebeNeutro, imageAspect: 0.9526, textArea: { x: 0.1036, y: 0.1413, width: 0.7373, height: 0.5898 } },
  { key: 'bebe_arcoiris', label: 'Bebé arcoíris', gradient: 'linear-gradient(160deg, #FBCFE8, #BFDBFE)', text: '#9D174D', artKey: 'confeti', image: invitaBebeArcoiris, imageAspect: 0.951, textArea: { x: 0.0724, y: 0.0497, width: 0.644, height: 0.6 } },
  // FASE 2 — fondo rediseñado (2026-09): marco con forma de casa; decoración (llavero "Bienvenidos",
  // plantas, pizarra, cajas) fuera del propio marco — zona segura es el rectángulo inscrito bajo el tejado.
  { key: 'casa_bienvenida', label: 'Nueva casa bienvenida', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaBienvenida, imageAspect: 0.6667, textArea: { x: 0.25, y: 0.2, width: 0.45, height: 0.6807 } },
  // FASE 2 — fondo rediseñado (2026-09): marco fino dorado, plantas/vela/llaves fuera o en el borde inferior.
  { key: 'casa_llaves', label: 'Nueva casa llaves', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaLlaves, imageAspect: 0.6667, textArea: { x: 0.22, y: 0.14, width: 0.56, height: 0.5976 } },
  // FASE 2 — fondo rediseñado (2026-09): cartel de madera, cojines/planta fuera del marco por abajo.
  { key: 'casa_terraza', label: 'Nueva casa terraza', gradient: 'linear-gradient(160deg, #166534, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaTerraza, imageAspect: 0.6667, textArea: { x: 0.3, y: 0.12, width: 0.54, height: 0.62 } },
  { key: 'casa_cajas', label: 'Nueva casa mudanza', gradient: 'linear-gradient(160deg, #B45309, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaCajas, imageAspect: 1, textArea: { x: 0.2138, y: 0.1231, width: 0.4947, height: 0.7093 } },
  { key: 'despedida_novia', label: 'Despedida de soltera', gradient: 'linear-gradient(160deg, #EC4899, #9D174D)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaNovia, imageAspect: 1, textArea: { x: 0.2582, y: 0.1116, width: 0.4947, height: 0.68 } },
  // FASE 2 — fondo rediseñado (2026-09): gorra arriba-izq, señal fuera del marco a la derecha, cubo "EL
  // NOVIO" abajo-izq.
  { key: 'despedida_novio', label: 'Despedida de soltero', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaNovio, imageAspect: 0.6667, textArea: { x: 0.32, y: 0.3, width: 0.46, height: 0.6807 } },
  // FASE 2 — fondo rediseñado (2026-09): sombrero arriba-izq, señal/carteles fuera del marco a los lados.
  { key: 'despedida_viaje', label: 'Despedida de viaje', gradient: 'linear-gradient(160deg, #0EA5E9, #78350F)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaViaje, imageAspect: 0.6667, textArea: { x: 0.27, y: 0.14, width: 0.5, height: 0.68 } },
  // FASE 2 — fondo rediseñado (2026-09): bola de discoteca arriba-izq, señal/neón/cubo fuera del marco.
  { key: 'despedida_noche', label: 'Despedida de noche', gradient: 'linear-gradient(160deg, #7C3AED, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaNoche, imageAspect: 0.6667, textArea: { x: 0.32, y: 0.18, width: 0.4, height: 0.58 } },
  // Estrechada 2026-09-26 (reportado en vivo): con el bug de ancho ya corregido, el texto por fin ocupa el
  // ancho real declarado — reveló que 0.72 era más ancho que el cartel limpio de la foto (mariposa y
  // sombrero de paja pegados a los bordes). Solo cambia x/width, nunca la imagen.
  { key: 'floral_picnic', label: 'Floral picnic', gradient: 'linear-gradient(160deg, #FFE4E6, #FED7AA)', text: '#7C2D12', artKey: 'floral', image: invitaFloralPicnic, imageAspect: 1, textArea: { x: 0.22, y: 0.08, width: 0.56, height: 0.58 } },
  // Estrechada 2026-09-26 (reportado en vivo): mismo motivo que floral_picnic — 0.7 invadía la mariposa y
  // el jarrón de tulipanes a los lados del cartel. Solo cambia x/width, nunca la imagen.
  // Fondo sustituido 2026-09-26 (imagen nueva del usuario, mismo archivo/ruta/ID) — pergamino grande y
  // limpio, imageAspect recalculado (1024x1536 real → 0.6667, ya no cuadrada). textArea recalculada desde
  // cero: modo compact (ancho<0.45) para evitar la mariposa naranja superior-izquierda y la mariposa rosa
  // de la derecha; el jarrón de tulipanes y las flores del borde inferior quedan fuera de la zona.
  { key: 'floral_primavera', label: 'Floral primavera', gradient: 'linear-gradient(160deg, #FFE4E6, #D9F99D)', text: '#3F6212', artKey: 'floral', image: invitaFloralPrimavera, imageAspect: 0.6667, textArea: { x: 0.3, y: 0.18, width: 0.44, height: 0.5 } },
  // Fondo sustituido 2026-09-26 (imagen nueva del usuario, mismo archivo/ruta/ID) — pergamino grande junto
  // a farolillos de exterior, imageAspect recalculado (1024x1536 real → 0.6667, ya no cuadrada). textArea
  // recalculada desde cero: modo compact (ancho<0.45) para evitar la enredadera que cae sobre el borde
  // superior del pergamino y las flores/farolillos de la parte inferior.
  { key: 'floral_noche', label: 'Floral noche de jardín', gradient: 'linear-gradient(160deg, #B45309, #451A03)', text: '#FFF7ED', artKey: 'floral', image: invitaFloralNoche, imageAspect: 0.6667, textArea: { x: 0.32, y: 0.18, width: 0.43, height: 0.48 } },
  { key: 'playa_piscina', label: 'Playa piscina', gradient: 'linear-gradient(160deg, #0EA5E9, #FB7185)', text: '#7C2D12', artKey: 'confeti', image: invitaPlayaPiscina, imageAspect: 1, textArea: { x: 0.28, y: 0.12, width: 0.55, height: 0.6 } },
  { key: 'playa_pina', label: 'Playa piña colada', gradient: 'linear-gradient(160deg, #FBBF24, #0EA5E9)', text: '#7C2D12', artKey: 'confeti', image: invitaPlayaPina, imageAspect: 1, textArea: { x: 0.2529, y: 0.2116, width: 0.672, height: 0.588 } },
  { key: 'playa_atardecer', label: 'Playa atardecer', gradient: 'linear-gradient(160deg, #FB923C, #7C2D12)', text: '#FFF7ED', artKey: 'confeti', image: invitaPlayaAtardecer, imageAspect: 1, textArea: { x: 0.24, y: 0.12, width: 0.58, height: 0.5976 } },
  // GRUPO A — certificada ("PLAYA NOCHE / PLAYA TERRAZA: funcionan correctamente"). No tocar salvo necesidad real.
  // Plantilla certificada (grupo A) — excepción autorizada explícitamente por el usuario 2026-09-26 SOLO
  // para el bug real de solape con el texto de certificación de 4 líneas tras subir AVG_CHAR_WIDTH_RATIO
  // a 0.6: se amplía únicamente el alto (x/y/width intactos) al mínimo necesario para overflowed=false.
  { key: 'playa_terraza', label: 'Playa noche de verano', gradient: 'linear-gradient(160deg, #B45309, #1E1B4B)', text: '#FFF7ED', artKey: 'confeti', image: invitaPlayaTerraza, imageAspect: 1, textArea: { x: 0.212, y: 0.1849, width: 0.476, height: 0.68 } },
  // Lote 11 — Clásico (SVG→foto), Reunión familiar (ya existe como
  // subtipo de Celebración) con varias escenas de comida, Jubilación
  // (también subtipo ya existente) y más variantes de Carnaval, Otoño y
  // Corazones. Se descarta una última hoja recibida por repetir Dorado,
  // Disco, Barbacoa y Comunión.
  // FASE 2 — fondo rediseñado (2026-09): cartel de madera, señal fuera a la izquierda, comida
  // completamente por debajo del marco.
  { key: 'comida_familiar', label: 'Comida familiar', gradient: 'linear-gradient(160deg, #FBBF24, #166534)', text: '#1f2233', artKey: 'confeti', image: invitaComidaFamiliar, imageAspect: 0.6667, textArea: { x: 0.23, y: 0.08, width: 0.58, height: 0.62 } },
  // GRUPO A — certificada ("CENA EN CASA: funciona correctamente"). No tocar salvo necesidad real.
  // Plantilla certificada (grupo A) — excepción autorizada explícitamente por el usuario 2026-09-26 SOLO
  // para el bug real de solape con el texto de certificación de 4 líneas tras subir AVG_CHAR_WIDTH_RATIO
  // a 0.6: se amplía únicamente el alto (x/y/width intactos) al mínimo necesario para overflowed=false.
  { key: 'cena_hogar', label: 'Cena en casa', gradient: 'linear-gradient(160deg, #7F1D1D, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaCenaHogar, imageAspect: 1.188, textArea: { x: 0.2284, y: 0.1074, width: 0.532, height: 0.6 } },
  { key: 'tapas', label: 'Tapas con amigos', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaTapas, imageAspect: 1.1861, textArea: { x: 0.3244, y: 0.1142, width: 0.6067, height: 0.6 } },
  // FASE 2 — fondo rediseñado (2026-09): cartel de madera, señal fuera a la derecha, jarra con texto abajo-izq.
  { key: 'desayuno', label: 'Desayuno / Brunch', gradient: 'linear-gradient(160deg, #FDE9D9, #FBBF24)', text: '#7C2D12', artKey: 'confeti', image: invitaDesayuno, imageAspect: 0.6667, textArea: { x: 0.23, y: 0.08, width: 0.56, height: 0.62 } },
  // FASE 2 — fondo rediseñado (2026-09): cartel de madera, pizarra/señal fuera a los lados, farol abajo-izq.
  { key: 'jubilacion_brindis', label: 'Jubilación brindis', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaJubilacionBrindis, imageAspect: 0.6667, textArea: { x: 0.32, y: 0.14, width: 0.42, height: 0.55 } },
  { key: 'jubilacion_viaje', label: 'Jubilación viaje', gradient: 'linear-gradient(160deg, #0EA5E9, #78350F)', text: '#ffffff', artKey: 'confeti', image: invitaJubilacionViaje, imageAspect: 1, textArea: { x: 0.2862, y: 0.2009, width: 0.4387, height: 0.476 } },
  { key: 'jubilacion_relax', label: 'Jubilación tranquila', gradient: 'linear-gradient(160deg, #FDE9D9, #D6A574)', text: '#5C3A1E', artKey: 'confeti', image: invitaJubilacionRelax, imageAspect: 1, textArea: { x: 0.3827, y: 0.1173, width: 0.4013, height: 0.56 } },
  { key: 'jubilacion_cena', label: 'Jubilación cena', gradient: 'linear-gradient(160deg, #7F1D1D, #1E1B4B)', text: '#FFF7ED', artKey: 'confeti', image: invitaJubilacionCena, imageAspect: 1, textArea: { x: 0.2564, y: 0.1498, width: 0.476, height: 0.68 } },
  { key: 'carnaval_bufon', label: 'Carnaval bufón', gradient: 'linear-gradient(160deg, #7C3AED, #DB2777)', text: '#ffffff', artKey: 'confeti', image: invitaCarnavalBufon, imageAspect: 1, textArea: { x: 0.3449, y: 0.2564, width: 0.588, height: 0.6 } },
  // GRUPO C — marcada para futuro rediseño. NO tocar ahora.
  // FASE 2 — fondo rediseñado (2026-09): plumas de colores arriba-izq y en toda la columna derecha —
  // franja central estrecha realmente libre.
  // Zona intencionadamente <0.45 de ancho: activa el modo "compact" (fuente más pequeña automática). Los
  // bordes de plumas a ambos lados son gruesos y reales, límite geométrico ya documentado en FASE 1 — no hay
  // más ancho limpio real que ganar sin invadirlos.
  { key: 'carnaval_plumas', label: 'Carnaval plumas', gradient: 'linear-gradient(160deg, #0EA5E9, #DB2777)', text: '#ffffff', artKey: 'confeti', image: invitaCarnavalPlumas, imageAspect: 0.6667, textArea: { x: 0.3, y: 0.26, width: 0.38, height: 0.5541 } },
  // GRUPO C — marcada para futuro rediseño. NO tocar ahora.
  // FASE 2 — fondo rediseñado (2026-09): sombrero arriba-izq, señal fuera a la izquierda, pajarita/nariz y
  // antifaz abajo.
  { key: 'carnaval_payaso', label: 'Carnaval payaso', gradient: 'linear-gradient(160deg, #FBBF24, #7C3AED)', text: '#1f2233', artKey: 'confeti', image: invitaCarnavalPayaso, imageAspect: 0.6667, textArea: { x: 0.25, y: 0.2, width: 0.5, height: 0.6807 } },
  // GRUPO C — marcada para futuro rediseño. NO tocar ahora ni compensar con cambios globales del motor.
  // FASE 2 — fondo rediseñado (2026-09): marco de confeti, señal/pizarra fuera del marco, sombrero/gafas abajo.
  { key: 'carnaval_confeti', label: 'Carnaval confeti', gradient: 'linear-gradient(160deg, #FBBF24, #0EA5E9)', text: '#1f2233', artKey: 'confeti', image: invitaCarnavalConfeti, imageAspect: 0.6667, textArea: { x: 0.24, y: 0.1, width: 0.6, height: 0.6 } },
  { key: 'otono_acogedor', label: 'Otoño acogedor', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaOtonoAcogedor, imageAspect: 1, textArea: { x: 0.3, y: 0.1, width: 0.52, height: 0.6807 } },
  // Zona intencionadamente <0.45 de ancho: activa el modo "compact" (fuente más pequeña automática). El
  // sendero real deja una franja vertical estrecha entre los árboles a ambos lados — ya documentado en FASE 1
  // como límite físico genuino de esta imagen, no hay más ancho limpio real que ganar ampliando.
  { key: 'otono_senderismo', label: 'Otoño senderismo', gradient: 'linear-gradient(160deg, #B45309, #166534)', text: '#FFF7ED', artKey: 'confeti', image: invitaOtonoSenderismo, imageAspect: 1, textArea: { x: 0.29, y: 0.04, width: 0.44, height: 0.68 } },
  { key: 'otono_hogar', label: 'Otoño en casa', gradient: 'linear-gradient(160deg, #7F1D1D, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaOtonoHogar, imageAspect: 1, textArea: { x: 0.26, y: 0.04, width: 0.66, height: 0.5976 } },
  // GRUPO C — marcada para futuro rediseño ("necesita más espacio limpio, decoración invade demasiado").
  // FASE 2 — fondo rediseñado (2026-09): cartel de madera, señal fuera a la izquierda, girasoles/calabazas
  // completamente por debajo del marco.
  { key: 'otono_cosecha', label: 'Otoño cosecha', gradient: 'linear-gradient(160deg, #FBBF24, #B45309)', text: '#7C2D12', artKey: 'confeti', image: invitaOtonoCosecha, imageAspect: 0.6667, textArea: { x: 0.3, y: 0.15, width: 0.58, height: 0.5976 } },
  // GRUPO A — certificada ("CORAZONES ACUARELA: funciona correctamente"). No tocar salvo necesidad real.
  { key: 'corazones_acuarela', label: 'Corazones acuarela', gradient: 'linear-gradient(160deg, #FDA4AF, #FFE4E6)', text: '#9D174D', artKey: 'corazones', image: invitaCorazonesAcuarela, imageAspect: 1.2287, textArea: { x: 0.304, y: 0.1436, width: 0.6253, height: 0.6444 } },
  { key: 'corazones_madera', label: 'Corazones rústico', gradient: 'linear-gradient(160deg, #E11D48, #78350F)', text: '#FFF7ED', artKey: 'corazones', image: invitaCorazonesMadera, imageAspect: 1.2306, textArea: { x: 0.16, y: 0.06, width: 0.62, height: 0.6 } },
  { key: 'corazones_terraza', label: 'Corazones terraza', gradient: 'linear-gradient(160deg, #FB923C, #7C2D12)', text: '#FFF7ED', artKey: 'corazones', image: invitaCorazonesTerraza, imageAspect: 1.1861, textArea: { x: 0.22, y: 0.14, width: 0.56, height: 0.5976 } },
  { key: 'corazones_dorado', label: 'Corazones dorado', gradient: 'linear-gradient(160deg, #F5F0E6, #E7DFC6)', text: '#9D174D', artKey: 'corazones', image: invitaCorazonesDorado, imageAspect: 1.188, textArea: { x: 0.14, y: 0.06, width: 0.56, height: 0.6 } },
  { key: 'celebracion_dorada', label: 'Celebración dorada', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaCelebracionDorada, imageAspect: 1.188, textArea: { x: 0.28, y: 0.17, width: 0.5, height: 0.6807 } },
  { key: 'fiesta_acuarela', label: 'Fiesta acuarela', gradient: 'linear-gradient(160deg, #FDE9D9, #F3E8FF)', text: '#6B21A8', artKey: 'confeti', image: invitaFiestaAcuarela, imageAspect: 1.1861, textArea: { x: 0.22, y: 0.18, width: 0.56, height: 0.5976 } },
  // Lote 12 — repaso visual de la familia: sustituye SVG o fotos que
  // "quedan borrosas o no quedan bien" en Robots, Ositos, Gatitos,
  // Kpop, Superheroína y Estrellitas (ya no dibujo/foto vieja, ahora
  // foto real a juego), y también en Hadas/Granja/Boda/Safari/Obras/
  // Bautizo (mejor foto que la que había). Sirena, Delfín y tortuga,
  // Mago y Bruja son temas nuevos.
  // GRUPO C — marcada para futuro rediseño de fondo ("crear tarjeta/zona limpia de escritura mucho mayor").
  // FASE 2 — fondo rediseñado (2026-09): marco ondulado, tortuga arriba-dcha, sirena abajo-izq — tarjeta
  // realmente mucho más grande y clara.
  { key: 'sirena', label: 'Sirena', gradient: 'linear-gradient(160deg, #0EA5E9, #075985)', text: '#ffffff', artKey: 'confeti', image: invitaSirena, imageAspect: 0.6667, textArea: { x: 0.2, y: 0.2, width: 0.55, height: 0.5976 } },
  { key: 'delfin_tortuga', label: 'Delfín y tortuga', gradient: 'linear-gradient(160deg, #0EA5E9, #0369A1)', text: '#ffffff', artKey: 'confeti', image: invitaDelfinTortuga, imageAspect: 1.2163, textArea: { x: 0.12, y: 0.12, width: 0.72, height: 0.6 } },
  { key: 'mago', label: 'Mago', gradient: 'linear-gradient(160deg, #4C1D95, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaMago, imageAspect: 1.214, textArea: { x: 0.36, y: 0.26, width: 0.4, height: 0.5541 } },
  { key: 'bruja', label: 'Bruja', gradient: 'linear-gradient(160deg, #4C1D95, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaBruja, imageAspect: 1.2163, textArea: { x: 0.4, y: 0.04, width: 0.5, height: 0.68 } },
]

// Petición real: "quiero evitar que tengan que repasar las 97 [temas],
// que son muchos" — en vez de filtrar/ocultar (perdería temas que a
// alguien le puede apetecer igual, p. ej. Halloween en un cumpleaños),
// se reordena la lista de más a menos probable según el evento, dejando
// siempre los 96 disponibles. Un tema puede llevar varias etiquetas
// (p. ej. un atardecer de playa sirve de aniversario romántico).
type InvitationTag =
  | 'cumple_infantil'
  | 'cumple_adulto'
  | 'cumple_generico'
  | 'boda'
  | 'romantico'
  | 'bautizo'
  | 'comunion'
  | 'bebe'
  | 'graduacion'
  | 'jubilacion'
  | 'despedida_soltero'
  | 'nueva_casa'
  | 'navidad'
  | 'halloween'
  | 'carnaval'
  | 'nochevieja'
  | 'otono'
  | 'playa'
  | 'reunion_familiar'
  | 'generico'

const INVITATION_TEMPLATE_TAGS: Record<string, InvitationTag[]> = {
  clasico: ['generico', 'cumple_generico'],
  alegre: ['cumple_generico', 'generico'],
  monstruo: ['cumple_infantil'],
  futbol: ['cumple_infantil'],
  unicornio: ['cumple_infantil'],
  elegante: ['romantico', 'generico'],
  floral: ['romantico', 'boda', 'generico'],
  bautizo: ['bautizo'],
  disco: ['despedida_soltero', 'generico'],
  dinosaurios: ['cumple_infantil'],
  videojuegos: ['cumple_infantil'],
  corazones: ['romantico', 'generico'],
  ositos: ['cumple_infantil', 'bebe'],
  gatitos: ['cumple_infantil'],
  coches: ['cumple_infantil'],
  robots: ['cumple_infantil'],
  superheroe: ['cumple_infantil'],
  superheroina: ['cumple_infantil'],
  pijamas: ['cumple_infantil'],
  kpop: ['cumple_infantil'],
  princesa: ['cumple_infantil'],
  espacio: ['cumple_infantil'],
  piratas: ['cumple_infantil'],
  safari: ['cumple_infantil'],
  acampada: ['cumple_infantil'],
  oceano: ['cumple_infantil'],
  hadas: ['cumple_infantil'],
  granja: ['cumple_infantil'],
  alienigenas: ['cumple_infantil'],
  playa: ['playa', 'cumple_generico', 'generico'],
  concierto: ['despedida_soltero', 'generico'],
  boda: ['boda'],
  obras: ['cumple_infantil'],
  nochevieja: ['nochevieja'],
  comunion: ['comunion'],
  bebe_nino: ['bebe'],
  barbacoa: ['reunion_familiar', 'generico'],
  bautizo_nina: ['bautizo'],
  navidad: ['navidad'],
  cumpleanos_elegante: ['cumple_adulto'],
  navidad_hogar: ['navidad'],
  navidad_muneco: ['navidad'],
  navidad_dorada: ['navidad'],
  navidad_papanoel: ['navidad'],
  navidad_galletas: ['navidad'],
  navidad_farolillos: ['navidad'],
  halloween_calabaza: ['halloween'],
  halloween_casa: ['halloween'],
  halloween_bruja: ['halloween'],
  halloween_fantasmas: ['halloween'],
  cumpleanos_rosa: ['cumple_generico'],
  cumpleanos_fiesta: ['cumple_adulto', 'cumple_generico'],
  graduacion_esfuerzo: ['graduacion'],
  graduacion_suena: ['graduacion'],
  graduacion_disciplina: ['graduacion'],
  graduacion_explorar: ['graduacion'],
  bebe_nina: ['bebe'],
  bebe_neutro: ['bebe'],
  bebe_arcoiris: ['bebe'],
  casa_bienvenida: ['nueva_casa'],
  casa_llaves: ['nueva_casa'],
  casa_terraza: ['nueva_casa'],
  casa_cajas: ['nueva_casa'],
  despedida_novia: ['despedida_soltero'],
  despedida_novio: ['despedida_soltero'],
  despedida_viaje: ['despedida_soltero'],
  despedida_noche: ['despedida_soltero'],
  floral_picnic: ['romantico', 'reunion_familiar', 'generico'],
  floral_primavera: ['romantico', 'generico'],
  floral_noche: ['romantico', 'generico'],
  playa_piscina: ['playa', 'cumple_infantil'],
  playa_pina: ['playa'],
  playa_atardecer: ['playa', 'romantico'],
  playa_terraza: ['playa', 'romantico'],
  comida_familiar: ['reunion_familiar'],
  cena_hogar: ['reunion_familiar', 'romantico'],
  tapas: ['reunion_familiar'],
  desayuno: ['reunion_familiar'],
  jubilacion_brindis: ['jubilacion'],
  jubilacion_viaje: ['jubilacion'],
  jubilacion_relax: ['jubilacion'],
  jubilacion_cena: ['jubilacion'],
  carnaval_bufon: ['carnaval'],
  carnaval_plumas: ['carnaval'],
  carnaval_payaso: ['carnaval', 'cumple_infantil'],
  carnaval_confeti: ['carnaval', 'cumple_infantil'],
  otono_acogedor: ['otono'],
  otono_senderismo: ['otono'],
  otono_hogar: ['otono'],
  otono_cosecha: ['otono'],
  corazones_acuarela: ['romantico', 'generico'],
  corazones_madera: ['romantico'],
  corazones_terraza: ['romantico'],
  corazones_dorado: ['romantico'],
  celebracion_dorada: ['generico'],
  fiesta_acuarela: ['cumple_generico', 'generico'],
  sirena: ['cumple_infantil'],
  delfin_tortuga: ['cumple_infantil'],
  mago: ['cumple_infantil'],
  bruja: ['cumple_infantil', 'halloween'],
}

// Palabras del propio título/tema del evento — la señal más útil en
// "Personalizado", donde el tipo de evento no da ninguna pista (p. ej.
// "Fiesta de Halloween de Eric" debe enseñar los temas de Halloween
// primero aunque el tipo sea "personalizado").
const INVITATION_TITLE_KEYWORD_TAGS: [RegExp, InvitationTag[]][] = [
  [/halloween/i, ['halloween']],
  [/navidad/i, ['navidad']],
  [/carnaval/i, ['carnaval']],
  [/nochevieja|a[nñ]o nuevo/i, ['nochevieja']],
  [/oto[nñ]o/i, ['otono']],
  [/playa|piscina/i, ['playa']],
  [/boda/i, ['boda']],
  [/bautizo/i, ['bautizo']],
  [/comuni[oó]n/i, ['comunion']],
  [/graduaci[oó]n/i, ['graduacion']],
  [/jubilaci[oó]n/i, ['jubilacion']],
  [/despedida de solter/i, ['despedida_soltero']],
  [/estreno de casa|nueva casa|mudanza/i, ['nueva_casa']],
  [/beb[eé]/i, ['bebe']],
]

// Da el orden de etiquetas más a menos probable para un evento
// concreto — p. ej. cumpleaños infantil (< 13 años, dato ya guardado en
// details.ageTurning): infantiles de cumple, luego genéricos de
// cumple; boda: temas de boda, luego románticos.
function getInvitationPriorityTags(event: FamilyEvent): InvitationTag[] {
  const tags: InvitationTag[] = []
  const push = (...more: InvitationTag[]) => {
    for (const t of more) if (!tags.includes(t)) tags.push(t)
  }

  if (event.type === 'cumpleanos') {
    const age = typeof event.details.ageTurning === 'number' ? event.details.ageTurning : null
    if (age !== null && age < 13) push('cumple_infantil', 'cumple_generico')
    else push('cumple_adulto', 'cumple_generico')
  } else if (event.type === 'boda') {
    push('boda', 'romantico')
  } else if (event.type === 'comunion') {
    push('comunion')
  } else if (event.type === 'bautizo') {
    push('bautizo')
  } else if (event.type === 'celebracion') {
    switch (event.subtype) {
      case 'Jubilación':
        push('jubilacion')
        break
      case 'Despedida de soltero/a':
        push('despedida_soltero')
        break
      case 'Estreno de casa':
        push('nueva_casa')
        break
      case 'Reunión familiar':
        push('reunion_familiar', 'generico')
        break
      case 'Graduación':
        push('graduacion')
        break
      case 'Aniversario':
        push('romantico', 'generico')
        break
      case 'Compromiso':
        push('romantico', 'boda', 'generico')
        break
      default:
        push('generico')
    }
  }

  const text = `${event.title} ${event.theme ?? ''}`.toLowerCase()
  for (const [pattern, matchTags] of INVITATION_TITLE_KEYWORD_TAGS) {
    if (pattern.test(text)) push(...matchTags)
  }

  push('generico')
  return tags
}

// Reordena (nunca oculta) los 96 temas de más a menos probable para un
// evento concreto, para que el usuario no tenga que repasarlos todos.
export function sortInvitationTemplatesForEvent(templates: InvitationTemplateMeta[], event: FamilyEvent): InvitationTemplateMeta[] {
  const priority = getInvitationPriorityTags(event)
  const rank = (key: string): number => {
    const templateTags = INVITATION_TEMPLATE_TAGS[key]
    if (!templateTags) return priority.length
    for (let i = 0; i < priority.length; i++) {
      if (templateTags.includes(priority[i])) return i
    }
    return priority.length
  }
  return templates.map((t, i) => ({ t, i, r: rank(t.key) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.t)
}

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

// Exportada (petición real: rediseño del dashboard de un evento —
// cuenta atrás "X días para celebrarlo" junto al título, reutilizando
// este mismo cálculo en vez de reescribirlo).
export function daysUntil(dateStr: string): number {
  const today = new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`)
  const target = new Date(`${dateStr}T00:00:00`)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

export interface EventConclusion {
  id: string
  icon: string
  text: string
}

// Fase 2 — única definición de "tarea atrasada" de todo el módulo:
// reutilizada tanto por computeEventConclusions (el aviso de texto)
// como por computeEventStatusSummary (el contador del panel "Estado
// del evento") para que nunca puedan divergir sobre qué cuenta como
// atrasada.
export function isOverdueTask(task: Pick<EventTask, 'done' | 'dueDate'>): boolean {
  return !task.done && !!task.dueDate && daysUntil(task.dueDate) < 0
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

  const overdueTasks = input.tasks.filter(isOverdueTask).length
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

// Petición real: dashboard nuevo, widget "Pepa recomienda" — a
// diferencia de computeEventConclusions (un aviso de texto por evento
// entero), aquí hace falta CADA tarea pendiente por separado, con su
// propia urgencia, para poder ordenarlas y pintar el punto de color
// correcto (🔴 vencida, 🟠 próxima, ⚪ sin prisa/sin fecha).
export interface RankedEventTask {
  task: EventTask
  priority: 'alta' | 'media' | 'baja'
  daysUntil: number | null
}

export function rankUpcomingTasks(tasks: EventTask[]): RankedEventTask[] {
  return tasks
    .filter((t) => !t.done)
    .map((task) => {
      const days = task.dueDate ? daysUntil(task.dueDate) : null
      const priority: RankedEventTask['priority'] = days !== null && days < 0 ? 'alta' : days !== null && days <= 7 ? 'media' : 'baja'
      return { task, priority, daysUntil: days }
    })
    .sort((a, b) => {
      // Sin fecha se queda al final; con fecha, la más próxima (o la
      // más vencida) va primero.
      if (a.daysUntil === null && b.daysUntil === null) return 0
      if (a.daysUntil === null) return 1
      if (b.daysUntil === null) return -1
      return a.daysUntil - b.daysUntil
    })
}

// Fase 2 — auditoría: "0/6 tareas + 16/16 invitados = 50%" no
// representa cuán preparado está un evento (media de dos proporciones
// sin relación entre sí, que puede esconder tareas vencidas detrás de
// un número tranquilizador). Sustituye ese porcentaje agregado por
// indicadores independientes y verificables — reutiliza isOverdueTask
// (misma definición que computeEventConclusions) y rankUpcomingTasks,
// nunca una segunda lógica paralela para decidir qué está atrasado.
export interface EventMilestone {
  kind: 'tarea' | 'pago'
  label: string
  dueDate: string
  daysUntil: number
}

// Fase 7 — extraída de computeEventStatusSummary para que
// computeEventHealth (más abajo) reutilice exactamente el mismo
// "próximo hito" en vez de recalcularlo con otro criterio.
export function pickNextMilestone(
  tasks: EventTask[],
  payments: Pick<EventPayment, 'concept' | 'totalAmount' | 'depositPaid' | 'dueDate' | 'status'>[],
): EventMilestone | null {
  // La tarea o el pago no resuelto más próximo con fecha (nunca uno ya
  // vencido — eso ya lo cubre "N atrasadas"/el aviso de pago vencido
  // por su lado, para no repetir la misma información dos veces).
  const nextTask = rankUpcomingTasks(tasks).find((t) => t.daysUntil !== null && t.daysUntil >= 0)
  const nextPayment = payments
    .filter((p) => p.status !== 'pagado' && p.dueDate && p.totalAmount - p.depositPaid > 0)
    .map((p) => ({ payment: p, daysUntil: daysUntil(p.dueDate as string) }))
    .filter((p) => p.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)[0]

  if (nextTask && (!nextPayment || (nextTask.daysUntil as number) <= nextPayment.daysUntil)) {
    return { kind: 'tarea', label: nextTask.task.title, dueDate: nextTask.task.dueDate as string, daysUntil: nextTask.daysUntil as number }
  }
  if (nextPayment) {
    return { kind: 'pago', label: nextPayment.payment.concept, dueDate: nextPayment.payment.dueDate as string, daysUntil: nextPayment.daysUntil }
  }
  return null
}

export interface EventStatusSummary {
  tasksTotal: number
  tasksDone: number
  tasksOverdue: number
  guestsTotalPeople: number
  guestsConfirmedPeople: number
  guestsPendingCount: number
  budgetPlanned: number
  budgetSpent: number | null
  nextMilestone: EventMilestone | null
}

export function computeEventStatusSummary(input: {
  tasks: EventTask[]
  guests: Pick<EventGuest, 'rsvpStatus' | 'adultsCount' | 'childrenCount' | 'rsvpAdultsCount' | 'rsvpChildrenCount'>[]
  payments: Pick<EventPayment, 'concept' | 'totalAmount' | 'depositPaid' | 'dueDate' | 'status'>[]
  plannedBudget: number
  spentBudget: number | null
}): EventStatusSummary {
  const tasksTotal = input.tasks.length
  const tasksDone = input.tasks.filter((t) => t.done).length
  const tasksOverdue = input.tasks.filter(isOverdueTask).length

  const guestsTotalPeople = input.guests.reduce((sum, g) => sum + g.adultsCount + g.childrenCount, 0)
  const guestsConfirmedPeople = input.guests
    .filter((g) => g.rsvpStatus === 'confirmado')
    .reduce((sum, g) => sum + (g.rsvpAdultsCount ?? g.adultsCount) + (g.rsvpChildrenCount ?? g.childrenCount), 0)
  const guestsPendingCount = input.guests.filter((g) => g.rsvpStatus === 'pendiente' || g.rsvpStatus === 'no_seguro').length

  return {
    tasksTotal,
    tasksDone,
    tasksOverdue,
    guestsTotalPeople,
    guestsConfirmedPeople,
    guestsPendingCount,
    budgetPlanned: input.plannedBudget,
    budgetSpent: input.spentBudget,
    nextMilestone: pickNextMilestone(input.tasks, input.payments),
  }
}

// ---------------------------------------------------------------------
// Fase 7 — barra dinámica de "Estado del evento". NO vuelve a ser un
// porcentaje mostrado al usuario (eso es justo lo que la Fase 2 quitó):
// `progress` es un valor interno para elegir el color/posición de la
// barra, nunca se enseña como cifra. `level` es lo único que decide
// el color, y las incidencias importantes (tareas/pagos atrasados)
// pueden fijar el nivel directamente, sin pasar por la media — "no
// basar el color únicamente en la puntuación". Reglas deterministas,
// sin IA, sobre datos ya calculados en otro sitio (isOverdueTask,
// pickNextMilestone) — nunca una segunda definición de "atrasado".
// ---------------------------------------------------------------------
export type EventHealthLevel = 'danger' | 'warning' | 'progress' | 'good'

export interface EventHealth {
  progress: number
  level: EventHealthLevel
  label: string
  message: string
}

const EVENT_HEALTH_LEVEL_LABEL: Record<EventHealthLevel, string> = {
  danger: 'Necesita atención',
  warning: 'Hay cosas que revisar',
  progress: 'En marcha',
  good: 'Todo va al día',
}

function milestoneMessage(m: EventMilestone | null): string {
  if (!m) return 'Sin nada urgente por ahora'
  const when = m.daysUntil === 0 ? 'hoy' : m.daysUntil === 1 ? 'mañana' : `en ${m.daysUntil} días`
  return `Próximo hito: ${m.label} — ${when}`
}

// Misma definición de "vencido"/"vence pronto" que ya usa
// computeEventConclusions para los pagos (días<0 con saldo pendiente =
// vencido; 0-7 días con saldo pendiente = vence pronto) — un solo
// sitio que decide esto, reutilizado aquí para no inventar un segundo
// criterio de cuándo un pago es preocupante.
export function countPaymentAlerts(payments: Pick<EventPayment, 'totalAmount' | 'depositPaid' | 'dueDate' | 'status'>[]): {
  overdue: number
  dueSoon: number
} {
  let overdue = 0
  let dueSoon = 0
  for (const p of payments) {
    if (p.status === 'pagado' || !p.dueDate) continue
    const remaining = p.totalAmount - p.depositPaid
    if (remaining <= 0) continue
    const days = daysUntil(p.dueDate)
    if (days < 0) overdue += 1
    else if (days <= 7) dueSoon += 1
  }
  return { overdue, dueSoon }
}

export function computeEventHealth(input: {
  hasTasksModule: boolean
  tasksTotal: number
  tasksDone: number
  tasksOverdue: number
  hasGuestsModule: boolean
  guestsTotalPeople: number
  guestsConfirmedPeople: number
  guestsPendingCount: number
  hasBudgetModule: boolean
  budgetPlanned: number
  budgetSpent: number | null
  hasPaymentsModule: boolean
  paymentsOverdueCount: number
  paymentsDueSoonCount: number
  // "si corresponde": solo se evalúa cuando el evento ya tiene un
  // lugar en texto (venueLabel/ceremonyLocationLabel/...) — un evento
  // que todavía no ha decidido dónde será no debe verse penalizado por
  // no tener coordenadas de algo que ni siquiera existe todavía.
  locationApplicable: boolean
  hasExactLocation: boolean
  hasMenuModule: boolean
  menuItemsTotal: number
  menuItemsTransferred: number
  nextMilestone: EventMilestone | null
}): EventHealth {
  // 1) Progreso interno: media de las dimensiones aplicables (solo las
  // de módulos activos con datos reales) — nunca se enseña como cifra.
  // El presupuesto/pagos quedan fuera de esta media a propósito (Fase
  // 2: "gastar más no es estar más preparado"): solo participan más
  // abajo como señales de alarma, nunca sumando progreso.
  const ratios: number[] = []
  if (input.hasTasksModule && input.tasksTotal > 0) ratios.push(input.tasksDone / input.tasksTotal)
  if (input.hasGuestsModule && input.guestsTotalPeople > 0) ratios.push(input.guestsConfirmedPeople / input.guestsTotalPeople)
  if (input.hasMenuModule && input.menuItemsTotal > 0) ratios.push(input.menuItemsTransferred / input.menuItemsTotal)
  if (input.locationApplicable) ratios.push(input.hasExactLocation ? 1 : 0)
  const progress = ratios.length > 0 ? Math.round((ratios.reduce((sum, r) => sum + r, 0) / ratios.length) * 100) : 0

  // 2) Señales de alarma, en orden de severidad — la primera que
  // aplica decide el nivel y el mensaje, sin importar el progreso.
  if (input.hasTasksModule && input.tasksOverdue > 0) {
    return {
      progress,
      level: 'danger',
      label: EVENT_HEALTH_LEVEL_LABEL.danger,
      message: `${input.tasksOverdue} ${input.tasksOverdue === 1 ? 'tarea atrasada' : 'tareas atrasadas'}`,
    }
  }
  if (input.hasPaymentsModule && input.paymentsOverdueCount > 0) {
    return {
      progress,
      level: 'danger',
      label: EVENT_HEALTH_LEVEL_LABEL.danger,
      message: `${input.paymentsOverdueCount} ${input.paymentsOverdueCount === 1 ? 'pago vencido' : 'pagos vencidos'}`,
    }
  }
  if (input.hasBudgetModule && input.budgetSpent !== null && input.budgetPlanned > 0 && input.budgetSpent > input.budgetPlanned) {
    return { progress, level: 'warning', label: EVENT_HEALTH_LEVEL_LABEL.warning, message: 'El gasto ya supera lo planeado' }
  }
  if (input.hasPaymentsModule && input.paymentsDueSoonCount > 0) {
    return {
      progress,
      level: 'warning',
      label: EVENT_HEALTH_LEVEL_LABEL.warning,
      message: `${input.paymentsDueSoonCount} ${input.paymentsDueSoonCount === 1 ? 'pago vence pronto' : 'pagos vencen pronto'}`,
    }
  }
  if (input.hasGuestsModule && input.guestsPendingCount > 0) {
    return {
      progress,
      level: 'warning',
      label: EVENT_HEALTH_LEVEL_LABEL.warning,
      message: `${input.guestsPendingCount} ${input.guestsPendingCount === 1 ? 'invitado pendiente' : 'invitados pendientes'}`,
    }
  }

  // 3) Sin ninguna incidencia: el color sube o baja entre "en marcha" y
  // "todo va al día" solo según el progreso interno.
  if (progress >= 80) {
    return { progress, level: 'good', label: EVENT_HEALTH_LEVEL_LABEL.good, message: milestoneMessage(input.nextMilestone) }
  }
  return { progress, level: 'progress', label: EVENT_HEALTH_LEVEL_LABEL.progress, message: milestoneMessage(input.nextMilestone) }
}

// Fase 3 — avisos fuera del evento: computeEventConclusions() ya es el
// motor determinista (sin IA) que decide qué es una alerta; esto solo
// lo ejecuta para TODOS los eventos de la familia a la vez y agrupa el
// resultado por evento, para que un evento con varias incidencias
// produzca un único aviso (nunca una colección de avisos sueltos del
// mismo evento). Es pura: sin persistir nada, un aviso "desaparece"
// solo con volver a calcular sobre el estado actual — la condición que
// ya no se cumple simplemente deja de producir una conclusión.
// El llamador es responsable de pasar solo eventos activos/en
// planificación (ver loadAllEventAlerts en data/events.ts, que ya
// filtra por listEvents() sin incluir archivados).
export interface EventAlertInput {
  eventId: string
  eventTitle: string
  eventIcon: string
  rsvpDeadline: string | null
  guests: Pick<EventGuest, 'rsvpStatus'>[]
  tasks: Pick<EventTask, 'done' | 'dueDate'>[]
  payments: Pick<EventPayment, 'concept' | 'totalAmount' | 'depositPaid' | 'dueDate' | 'status'>[]
  plannedBudget: number
  spentBudget: number | null
}

export interface EventAlertSummary {
  eventId: string
  eventTitle: string
  eventIcon: string
  conclusions: EventConclusion[]
  // A qué sección del evento debería llevar el deep-link — la más
  // urgente/accionable cuando hay varias incidencias a la vez, para no
  // tener que elegir entre ellas en el punto de destino.
  primaryModule: EventModuleKey | null
}

const ALERT_PRIMARY_MODULE_BY_CONCLUSION_PREFIX: { prefix: string; module: EventModuleKey }[] = [
  { prefix: 'overdue-tasks', module: 'tareas' },
  { prefix: 'payment-', module: 'pagos' },
  { prefix: 'rsvp-deadline', module: 'invitados' },
  { prefix: 'budget-over', module: 'presupuesto' },
]

function primaryModuleForConclusions(conclusions: EventConclusion[]): EventModuleKey | null {
  for (const { prefix, module } of ALERT_PRIMARY_MODULE_BY_CONCLUSION_PREFIX) {
    if (conclusions.some((c) => c.id.startsWith(prefix))) return module
  }
  return null
}

export function computeAllEventAlerts(events: EventAlertInput[]): EventAlertSummary[] {
  const summaries: EventAlertSummary[] = []
  for (const ev of events) {
    const conclusions = computeEventConclusions({
      rsvpDeadline: ev.rsvpDeadline,
      guests: ev.guests,
      tasks: ev.tasks,
      payments: ev.payments,
      plannedBudget: ev.plannedBudget,
      spentBudget: ev.spentBudget,
    })
    if (conclusions.length === 0) continue
    summaries.push({
      eventId: ev.eventId,
      eventTitle: ev.eventTitle,
      eventIcon: ev.eventIcon,
      conclusions,
      primaryModule: primaryModuleForConclusions(conclusions),
    })
  }
  return summaries
}

// Traduce los avisos de Eventos al patrón genérico de "atención" (ver
// domain/attention.ts) — el único sitio que sabe que la URL de Eventos
// se construye con ?event=&modulo=, ver Fase 4 (deep-link) en
// EventosScreen.tsx.
export function eventAlertsToAttentionItems(alerts: EventAlertSummary[]): AttentionItem[] {
  return alerts.map((a) => ({
    id: `evento-${a.eventId}`,
    icon: a.eventIcon,
    title: a.eventTitle,
    lines: a.conclusions.map((c) => `${c.icon} ${c.text}`),
    to: `/eventos?event=${a.eventId}${a.primaryModule ? `&modulo=${a.primaryModule}` : ''}`,
  }))
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
  { key: 'brillos', label: '✨ Brillos' },
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
// Petición real: "me refiero a esa parte de cada tarjeta (círculo azul)
// no las tarjetas enteras. No quiero que el texto se salga de ese
// área, habrá que ajustarlo tarjeta por tarjeta" — las capas por
// defecto se colocan dentro de template.textArea (el hueco real de esa
// plantilla, ver InvitationTemplateMeta) en vez de en las mismas tres
// posiciones fijas para las 100. Sin template (o sin textArea propio,
// p. ej. un tema sin foto todavía), cae a una caja genérica centrada
// parecida a la de antes.
export type SafeZone = { x: number; y: number; width: number; height: number }

export const DEFAULT_TEXT_AREA: SafeZone = { x: 0.1, y: 0.15, width: 0.8, height: 0.7 }

export function buildInvitationTemplateLayers(event: FamilyEvent, template?: InvitationTemplateMeta): InvitationLayer[] {
  const zone = template?.textArea ?? DEFAULT_TEXT_AREA
  const cx = zone.x + zone.width / 2
  // Zonas pequeñas (p. ej. comunion, bebe_nino) usan letra más chica
  // para no desbordar.
  const compact = zone.height < 0.45 || zone.width < 0.45
  const iconSize = compact ? 40 : 56
  const titleSize = compact ? 19 : 24
  const messageSize = compact ? 12 : 14

  return [
    { id: newLayerId(), type: 'emoji', x: cx, y: zone.y + zone.height * 0.14, rotation: 0, scale: 1, zIndex: 1, text: EVENT_TYPE_META[event.type].icon, fontSize: iconSize },
    { id: newLayerId(), type: 'text', x: cx, y: zone.y + zone.height * 0.36, rotation: 0, scale: 1, zIndex: 2, text: event.title, color: '#ffffff', fontSize: titleSize, fontFamily: 'inherit' },
    {
      id: newLayerId(),
      type: 'event_data',
      x: cx,
      y: zone.y + zone.height * 0.68,
      rotation: 0,
      scale: 1,
      zIndex: 3,
      text: buildInvitationMessage(event),
      color: '#ffffff',
      fontSize: messageSize,
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

function clampFraction(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function isInsideZone(x: number, y: number, zone: SafeZone): boolean {
  return x >= zone.x && x <= zone.x + zone.width && y >= zone.y && y <= zone.y + zone.height
}

// INV-EDITOR-2 — una forma/decoración que "Pepa, hazla bonita" recoloca nunca debe quedar DENTRO de la
// zona de texto de la plantilla: si el punto candidato cae ahí, se aleja hacia el borde exterior más
// cercano del lienzo (geometría determinista, sin IA ni visión artificial).
function pushOutsideZone(x: number, y: number, zone: SafeZone): { x: number; y: number } {
  if (!isInsideZone(x, y, zone)) return { x, y }
  const distLeft = x - zone.x
  const distRight = zone.x + zone.width - x
  const distTop = y - zone.y
  const distBottom = zone.y + zone.height - y
  const min = Math.min(distLeft, distRight, distTop, distBottom)
  if (min === distLeft) return { x: clampFraction(zone.x - 0.06, 0.02, 0.98), y }
  if (min === distRight) return { x: clampFraction(zone.x + zone.width + 0.06, 0.02, 0.98), y }
  if (min === distTop) return { x, y: clampFraction(zone.y - 0.06, 0.02, 0.98) }
  return { x, y: clampFraction(zone.y + zone.height + 0.06, 0.02, 0.98) }
}

// INV-EDITOR-2 (corrección tras certificación iPhone) — cuánto lienzo (en px) se asume para convertir
// tamaños de fuente (px, fijos — ver InvitationLayerVisual) en fracciones del lienzo. El lienzo real es
// responsive (aspect-ratio + ancho variable según el dispositivo); domain/ no tiene acceso al DOM para
// medirlo de verdad, así que esto es una aproximación deliberada y documentada — mismo orden de magnitud
// que .invitation-designer-sheet (max-width 420px) menos el padding del editor — nunca una medida exacta.
const ASSUMED_CANVAS_SIZE_PX = 380
// Exportada (no solo interna a esta estimación): InvitationLayerVisual (ui/InvitationDesigner.tsx) la fija
// como line-height REAL del texto renderizado, para que la caja que aquí se calcula ya no sea una mera
// aproximación del alto real, sino la garantía de él — antes el <div> de texto no fijaba line-height
// ninguno (heredaba el "normal" del navegador/fuente, que varía según la tipografía), así que en algunas
// plantillas el texto real podía ser más alto o más bajo que lo estimado aquí y acabar solapando con la
// capa siguiente, o al revés, disparar un aviso de "no cabe" siendo mentira.
export const LINE_HEIGHT_RATIO = 1.25
// Bug real reportado en vivo (iPhone, plantilla "boda", texto de certificación real de 4 líneas): título y
// cuerpo se veían solapados aunque autoArrangeLayers calculaba overflowed=false, con un hueco estimado de
// apenas el 1,4% del alto del lienzo. Causa: 0.55 asumía un carácter medio más estrecho del que realmente
// pinta system-ui/-apple-system (San Francisco en iOS) para texto en español con tildes y mayúsculas — el
// ajuste de línea real ocupa más líneas de las que estimateWrappedLineCount predecía, así que el cuerpo
// pintado de verdad era más alto que el estimado y su borde superior invadía el título. Subido a 0.6 (nunca
// una medida exacta — igual que ASSUMED_CANVAS_SIZE_PX, aproximación deliberada y documentada) para que la
// estimación sea más conservadora en las 100 plantillas; las zonas que con este valor pasan a dar
// overflowed=true se han revisado y ampliado una por una (ver commits de esta misma fecha).
const AVG_CHAR_WIDTH_RATIO = 0.6

// Cuántas líneas ocupará un texto: saltos de línea explícitos (\n, los que ya trae buildInvitationMessage
// o los que escribe el usuario) + una estimación de ajuste de línea dentro del ancho disponible — sin
// medir el DOM real, una aproximación determinista basada en caracteres/ancho medio de carácter.
function estimateWrappedLineCount(text: string, fontSize: number, availableWidthFrac: number): number {
  const availablePx = Math.max(60, availableWidthFrac * ASSUMED_CANVAS_SIZE_PX)
  const avgCharWidthPx = Math.max(1, fontSize * AVG_CHAR_WIDTH_RATIO)
  const charsPerLine = Math.max(4, Math.floor(availablePx / avgCharWidthPx))
  const segments = (text || '').split('\n')
  let lines = 0
  for (const seg of segments) {
    const len = seg.trim().length
    lines += Math.max(1, Math.ceil(len / charsPerLine))
  }
  return Math.max(1, lines)
}

export interface LayerBoxFraction {
  halfWidth: number
  halfHeight: number
}

// INV-EDITOR-2 (corrección) — estima, en fracción del lienzo (0..1), la MITAD del ancho/alto real con el
// que se renderiza una capa — la misma función que usa autoArrangeLayers para colocarla y que los tests
// usan para comprobar que su caja completa (no solo su centro) queda dentro de la zona segura. El texto
// curvado reutiliza las mismas fórmulas que su propio SVG (ver InvitationLayerVisual en
// ui/InvitationDesigner.tsx) para que la estimación no se desvíe de lo que de verdad se pinta.
export function estimateLayerBoxFraction(layer: InvitationLayer, zoneWidthFrac: number): LayerBoxFraction {
  if (layer.type === 'text' && layer.curve) {
    const fontSize = layer.fontSize ?? 16
    const text = (layer.text ?? '').replace(/\n/g, ' ')
    const widthPx = Math.max(220, text.length * fontSize * 0.62)
    const heightPx = Math.max(80, Math.abs(layer.curve) * 0.9 + fontSize * 1.6)
    return { halfWidth: widthPx / 2 / ASSUMED_CANVAS_SIZE_PX, halfHeight: heightPx / 2 / ASSUMED_CANVAS_SIZE_PX }
  }
  if (layer.type === 'text' || layer.type === 'event_data') {
    const fontSize = layer.fontSize ?? 16
    const lines = estimateWrappedLineCount(layer.text ?? '', fontSize, zoneWidthFrac)
    const heightPx = lines * fontSize * LINE_HEIGHT_RATIO
    // Ancho estimado: el de la línea más larga, acotado por la propia zona (el texto se centra dentro de
    // ella) — nunca más ancho que la zona, nunca más que su contenido real.
    const segments = (layer.text ?? '').split('\n')
    const longest = segments.reduce((m, s) => Math.max(m, s.trim().length), 0)
    const widthPx = Math.min(zoneWidthFrac * ASSUMED_CANVAS_SIZE_PX, longest * fontSize * AVG_CHAR_WIDTH_RATIO)
    return { halfWidth: widthPx / 2 / ASSUMED_CANVAS_SIZE_PX, halfHeight: heightPx / 2 / ASSUMED_CANVAS_SIZE_PX }
  }
  // emoji | shape | photo — cuadrado de lado fontSize, igual que se renderizan (ver InvitationLayerVisual).
  const size = layer.fontSize ?? (layer.type === 'photo' ? 120 : layer.type === 'shape' ? 60 : 48)
  return { halfWidth: size / 2 / ASSUMED_CANVAS_SIZE_PX, halfHeight: size / 2 / ASSUMED_CANVAS_SIZE_PX }
}

export interface AutoArrangeResult {
  layers: InvitationLayer[]
  // INV-EDITOR-2 (corrección) — true si, incluso comprimiendo los huecos al mínimo, el contenido de
  // texto no cabe entero dentro de la zona segura: se coloca en el mejor orden posible (icono → título →
  // mensaje, sin huecos) pero alguna capa se sale de la zona — NUNCA se reduce el fontSize ni se inventa
  // una zona más grande para ocultarlo. Queda documentado aquí para decidir después cómo resolverlo
  // (¿fontSize automático menor? ¿avisar a la familia? ¿recortar el texto?) — esta corrección no lo hace.
  overflowed: boolean
}

// "Pepa, hazla bonita" (opcional, Skill 07 punto 2) — reglas deterministas, no IA de verdad: reparte las
// capas de texto en vertical, centra la foto y las formas, sin tocar el contenido de nadie. Nunca se
// llama sola, solo cuando el usuario la pide.
//
// INV-EDITOR-2 — antes colocaba texto/icono con coordenadas genéricas del lienzo entero, ignorando
// dónde está el hueco real de la plantilla (template.textArea, ya usado por buildInvitationTemplateLayers
// más arriba) — en plantillas con decoración pesada (p. ej. un tema floral tipo "Bodas de plata") el
// texto/icono podía acabar encima de las flores. Ahora SIEMPRE recibe la `textArea` real de la plantilla
// (o DEFAULT_TEXT_AREA si no hay ninguna aplicable — foto de fondo propia, o plantilla sin zona propia).
//
// Corrección tras certificación iPhone (caso real "Bodas de plata"): colocar por el CENTRO no basta si no
// se conoce el ancho/alto real de la capa — un centro pegado al borde de la zona garantiza que la mitad
// de un bloque de texto multilínea se salga. Ahora cada capa de texto se APILA por su alto real
// (estimateLayerBoxFraction — la misma función que comprueban los tests), con un hueco razonable entre
// icono/título/mensaje que se comprime primero si hace falta, antes de aceptar que no cabe (ver
// `overflowed`). Las formas/decoraciones se mantienen fuera de la zona cuando es posible (pushOutsideZone).
// Es la MISMA fuente de verdad que ya usan las capas por defecto — no se crea un segundo sistema de
// "zonas seguras", ni valores especiales para ninguna plantilla concreta.
export function autoArrangeLayers(layers: InvitationLayer[], textArea: SafeZone = DEFAULT_TEXT_AREA): AutoArrangeResult {
  const zone = textArea ?? DEFAULT_TEXT_AREA
  const photos = layers.filter((l) => l.type === 'photo')
  const texts = layers.filter((l) => l.type === 'text' || l.type === 'event_data')
  const emojis = layers.filter((l) => l.type === 'emoji')
  const shapes = layers.filter((l) => l.type === 'shape')

  const cx = zone.x + zone.width / 2
  const zoneTop = zone.y
  const zoneBottom = zone.y + zone.height
  const arranged: InvitationLayer[] = []
  let overflowed = false

  // La foto (si el usuario ha añadido una) sigue siendo el elemento principal, centrada en el lienzo —
  // suele ser más grande que la zona de texto de la plantilla, así que no se confina a ella.
  photos.forEach((l) => arranged.push({ ...l, x: 0.5, y: 0.4, rotation: 0, scale: Math.min(l.scale, 1.4) }))

  // 1) Icono/emoji principal, arriba de la zona segura — su propia caja también se mantiene dentro.
  let iconsBottom = zoneTop
  emojis.forEach((l, i) => {
    const box = estimateLayerBoxFraction(l, zone.width)
    const target = zoneTop + zone.height * clampFraction(0.1 + i * 0.05, 0, 0.3)
    const y = clampFraction(target, zoneTop + box.halfHeight, Math.max(zoneTop + box.halfHeight, zoneBottom - box.halfHeight))
    arranged.push({ ...l, x: cx, y, rotation: 0 })
    iconsBottom = Math.max(iconsBottom, y + box.halfHeight)
  })

  // 2)/3) Título y mensaje/datos: apilados por su alto REAL (nunca un reparto ciego de N centros), con
  // una separación razonable entre capas que se comprime si hace falta — nunca reduce el fontSize.
  const GAP_FRACTION = 0.03 // hueco "natural" entre capas, como fracción de la altura de la zona.
  const BOTTOM_MARGIN_FRACTION = 0.02 // pequeño margen inferior dentro de la zona, para no pegar el texto al borde.
  const naturalGap = GAP_FRACTION * zone.height
  const availableTop = emojis.length > 0 ? iconsBottom + naturalGap : zoneTop
  const availableBottom = zoneBottom - BOTTOM_MARGIN_FRACTION * zone.height
  const availableHeight = Math.max(0, availableBottom - availableTop)

  const textBoxes = texts.map((l) => estimateLayerBoxFraction(l, zone.width))
  const totalHeights = textBoxes.reduce((sum, b) => sum + b.halfHeight * 2, 0)
  const gapCount = Math.max(0, texts.length - 1)

  // Se comprimen primero los huecos hacia 0 — nunca el fontSize — antes de aceptar que no cabe.
  let gap = naturalGap
  if (gapCount > 0 && totalHeights + naturalGap * gapCount > availableHeight) {
    gap = Math.max(0, (availableHeight - totalHeights) / gapCount)
  }
  const totalWithCompressedGaps = totalHeights + gap * gapCount
  if (totalWithCompressedGaps > availableHeight + 1e-9) overflowed = true

  // Con hueco de sobra, el bloque completo se centra en el espacio disponible (más equilibrado
  // visualmente); si no cabe ni comprimido, se apila desde arriba tal cual, sin forzarlo a caber.
  const extraSpace = Math.max(0, availableHeight - totalWithCompressedGaps)
  let cursor = availableTop + (overflowed ? 0 : extraSpace / 2)
  texts.forEach((l, i) => {
    if (i > 0) cursor += gap
    const half = textBoxes[i].halfHeight
    const centerY = cursor + half
    arranged.push({ ...l, x: cx, y: centerY, rotation: 0 })
    cursor += half * 2
  })

  // 4) Formas/decoraciones: las 4 esquinas del lienzo de siempre, apartadas de la zona de texto si hiciera falta.
  const corners: [number, number][] = [
    [0.15, 0.12],
    [0.85, 0.12],
    [0.15, 0.88],
    [0.85, 0.88],
  ]
  shapes.forEach((l, i) => {
    const [cornerX, cornerY] = corners[i % corners.length]
    const { x, y } = pushOutsideZone(cornerX, cornerY, zone)
    arranged.push({ ...l, x, y })
  })

  return { layers: arranged, overflowed }
}
