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
  { key: 'clasico', label: 'Clásico', gradient: 'linear-gradient(135deg, #4C6EF5, #7C3AED)', text: '#ffffff', artKey: 'confeti', image: invitaClasico, imageAspect: 1.1861, textArea: { x: 0.32, y: 0.18, width: 0.58, height: 0.6 } },
  { key: 'alegre', label: 'Globos', gradient: 'linear-gradient(160deg, #FBBF24, #FB923C)', text: '#1f2233', artKey: 'globos', image: invitaAlegre, imageAspect: 0.6531, textArea: { x: 0.2284, y: 0.1571, width: 0.532, height: 0.5843 } },
  { key: 'monstruo', label: 'Monstruo', gradient: 'linear-gradient(160deg, #2DD4BF, #059669)', text: '#ffffff', artKey: 'monstruo', image: invitaMonstruo, imageAspect: 0.8333, textArea: { x: 0.0756, y: 0.2804, width: 0.7933, height: 0.5133 } },
  { key: 'futbol', label: 'Fútbol', gradient: 'linear-gradient(160deg, #3B82F6, #1E3A8A)', text: '#ffffff', artKey: 'futbol', image: invitaFutbol, imageAspect: 0.4361, textArea: { x: 0.0764, y: 0.1823, width: 0.8027, height: 0.5383 } },
  { key: 'unicornio', label: 'Unicornio', gradient: 'linear-gradient(160deg, #F5D0FE, #C4B5FD)', text: '#4C1D95', artKey: 'unicornio', image: invitaUnicornio, imageAspect: 0.4322, textArea: { x: 0.2, y: 0.1, width: 0.6, height: 0.5 } },
  { key: 'elegante', label: 'Dorado', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'dorado', image: invitaElegante, imageAspect: 1.1861, textArea: { x: 0.1876, y: 0.13, width: 0.5693, height: 0.6742 } },
  { key: 'floral', label: 'Floral', gradient: 'linear-gradient(160deg, #FFE4E6, #FED7AA)', text: '#7C2D12', artKey: 'floral', image: invitaFloralJardin, imageAspect: 1, textArea: { x: 0.2542, y: 0.204, width: 0.5693, height: 0.6253 } },
  { key: 'bautizo', label: 'Celeste', gradient: 'linear-gradient(160deg, #DBEAFE, #BFDBFE)', text: '#1E3A8A', artKey: 'celeste', image: invitaBautizo, imageAspect: 1.2163, textArea: { x: 0.35, y: 0.1, width: 0.55, height: 0.7 } },
  { key: 'disco', label: 'Disco', gradient: 'linear-gradient(160deg, #581C87, #1E1B4B)', text: '#ffffff', artKey: 'disco', image: invitaDisco, imageAspect: 1.188, textArea: { x: 0.15, y: 0.1, width: 0.7, height: 0.72 } },
  // Lote 2 — petición real, lista de 26 temas; 3 no se hacen por ser
  // personajes/estilos con derechos de terceros (Minecraft, Mario Bros,
  // Spiderman — ver INVITATION_ART en EventosScreen.tsx). El resto se
  // reparte en varios lotes.
  { key: 'dinosaurios', label: 'Dinosaurios', gradient: 'linear-gradient(160deg, #84CC16, #166534)', text: '#ffffff', artKey: 'dinosaurios', image: invitaDinosaurios, imageAspect: 0.4361, textArea: { x: 0.1453, y: 0.2474, width: 0.7093, height: 0.5586 } },
  { key: 'videojuegos', label: 'Videojuegos', gradient: 'linear-gradient(160deg, #312E81, #4C1D95)', text: '#ffffff', artKey: 'videojuegos', image: invitaVideojuegos, imageAspect: 0.499, textArea: { x: 0.0787, y: 0.274, width: 0.7093, height: 0.4853 } },
  { key: 'corazones', label: 'Corazones', gradient: 'linear-gradient(160deg, #FDA4AF, #E11D48)', text: '#ffffff', artKey: 'corazones', image: invitaCorazones, imageAspect: 0.4512, textArea: { x: 0.0791, y: 0.1791, width: 0.8307, height: 0.4559 } },
  { key: 'ositos', label: 'Ositos', gradient: 'linear-gradient(160deg, #FDE9D9, #D6A574)', text: '#5C3A1E', artKey: 'ositos', image: invitaOsitos, imageAspect: 1.214, textArea: { x: 0.2031, y: 0.1346, width: 0.616, height: 0.7038 } },
  { key: 'gatitos', label: 'Gatitos', gradient: 'linear-gradient(160deg, #F3E8FF, #E9D5FF)', text: '#6B21A8', artKey: 'gatitos', image: invitaGatitos, imageAspect: 1.2163, textArea: { x: 0.308, y: 0.4195, width: 0.5507, height: 0.4314 } },
  { key: 'coches', label: 'Coches de carreras', gradient: 'linear-gradient(160deg, #1F2937, #7F1D1D)', text: '#ffffff', artKey: 'coches', image: invitaCoches, imageAspect: 0.4829, textArea: { x: 0.108, y: 0.2155, width: 0.784, height: 0.569 } },
  // Lote 3.
  { key: 'robots', label: 'Robots', gradient: 'linear-gradient(160deg, #64748B, #1E293B)', text: '#ffffff', artKey: 'robots', image: invitaRobots, imageAspect: 1.214, textArea: { x: 0.2836, y: 0.1189, width: 0.644, height: 0.6811 } },
  { key: 'superheroe', label: 'Superhéroe', gradient: 'linear-gradient(160deg, #DC2626, #1E3A8A)', text: '#ffffff', artKey: 'superheroe', image: invitaSuperheroe, imageAspect: 0.4844, textArea: { x: 0.0978, y: 0.3606, width: 0.7933, height: 0.4561 } },
  { key: 'superheroina', label: 'Superheroína', gradient: 'linear-gradient(160deg, #EC4899, #7C3AED)', text: '#ffffff', artKey: 'superheroina', image: invitaSuperheroina, imageAspect: 1.2163, textArea: { x: 0.2391, y: 0.1043, width: 0.644, height: 0.6697 } },
  { key: 'pijamas', label: 'Estrellitas', gradient: 'linear-gradient(160deg, #312E81, #0F172A)', text: '#ffffff', artKey: 'pijamas', image: invitaPijamas, imageAspect: 1.214, textArea: { x: 0.3507, y: 0.1649, width: 0.532, height: 0.4541 } },
  // "Guerreras Kpop" — ambiente genérico de concierto/idol (neón,
  // micro, focos), sin ningún grupo, cara ni persona real de por medio.
  { key: 'kpop', label: 'Kpop', gradient: 'linear-gradient(160deg, #DB2777, #6D28D9)', text: '#ffffff', artKey: 'kpop', image: invitaKpop, imageAspect: 1.2163, textArea: { x: 0.396, y: 0.0746, width: 0.5413, height: 0.7832 } },
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
  { key: 'princesa', label: 'Princesa', gradient: 'linear-gradient(160deg, #FBCFE8, #F9A8D4)', text: '#9D174D', artKey: 'confeti', image: invitaPrincesa, imageAspect: 0.5, textArea: { x: 0.1787, y: 0.3442, width: 0.7093, height: 0.5227 } },
  { key: 'espacio', label: 'Espacio', gradient: 'linear-gradient(160deg, #1E3A8A, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaEspacio, imageAspect: 0.4322, textArea: { x: 0.1062, y: 0.2323, width: 0.7653, height: 0.521 } },
  { key: 'piratas', label: 'Piratas', gradient: 'linear-gradient(160deg, #38BDF8, #D6A574)', text: '#5C3A1E', artKey: 'confeti', image: invitaPiratas, imageAspect: 0.4355, textArea: { x: 0.1507, y: 0.2122, width: 0.7653, height: 0.5032 } },
  { key: 'safari', label: 'Safari', gradient: 'linear-gradient(160deg, #84CC16, #166534)', text: '#ffffff', artKey: 'confeti', image: invitaSafari, imageAspect: 1.214, textArea: { x: 0.1387, y: 0.2773, width: 0.756, height: 0.4995 } },
  { key: 'acampada', label: 'Acampada', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaAcampada, imageAspect: 0.5565, textArea: { x: 0.38, y: 0.18, width: 0.55, height: 0.62 } },
  { key: 'oceano', label: 'Fondo del mar', gradient: 'linear-gradient(160deg, #0EA5E9, #075985)', text: '#ffffff', artKey: 'confeti', image: invitaOceano, imageAspect: 0.5011, textArea: { x: 0.0773, y: 0.2976, width: 0.812, height: 0.4993 } },
  { key: 'hadas', label: 'Hadas', gradient: 'linear-gradient(160deg, #FBCFE8, #BBF7D0)', text: '#BE185D', artKey: 'confeti', image: invitaHadas, imageAspect: 1.214, textArea: { x: 0.2876, y: 0.207, width: 0.5693, height: 0.613 } },
  { key: 'granja', label: 'Granja', gradient: 'linear-gradient(160deg, #FDE9D9, #DC2626)', text: '#7C2D12', artKey: 'confeti', image: invitaGranja, imageAspect: 1.214, textArea: { x: 0.1782, y: 0.5324, width: 0.588, height: 0.3405 } },
  { key: 'alienigenas', label: 'Alienígenas', gradient: 'linear-gradient(160deg, #312E81, #020617)', text: '#ffffff', artKey: 'confeti', image: invitaAlienigenas, imageAspect: 0.5, textArea: { x: 0.1164, y: 0.1436, width: 0.756, height: 0.574 } },
  { key: 'playa', label: 'Playa tropical', gradient: 'linear-gradient(160deg, #FDBA74, #FB7185)', text: '#7C2D12', artKey: 'confeti', image: invitaPlaya, imageAspect: 0.4492, textArea: { x: 0.1, y: 0.08, width: 0.65, height: 0.35 } },
  { key: 'concierto', label: 'Concierto', gradient: 'linear-gradient(160deg, #7C3AED, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaConcierto, imageAspect: 0.4688, textArea: { x: 0.1156, y: 0.1425, width: 0.7467, height: 0.5119 } },
  { key: 'boda', label: 'Boda', gradient: 'linear-gradient(160deg, #F5F0E6, #E7DFC6)', text: '#4A5D23', artKey: 'confeti', image: invitaBoda, imageAspect: 1.2163, textArea: { x: 0.08, y: 0.12, width: 0.55, height: 0.7 } },
  // Lote 5 — segunda hoja de arte real. Se descartan los repetidos de
  // temas que ya tenían imagen (fútbol, dinosaurios, espacio, unicornio)
  // y una sirena que se parece demasiado a un personaje Disney conocido
  // (pelo rojo, top de concha, mismo silueta) — misma regla de siempre.
  { key: 'obras', label: 'Obras', gradient: 'linear-gradient(160deg, #FBBF24, #78350F)', text: '#1f2233', artKey: 'confeti', image: invitaObras, imageAspect: 1.214, textArea: { x: 0.1689, y: 0.2157, width: 0.6067, height: 0.7038 } },
  { key: 'nochevieja', label: 'Nochevieja', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaNochevieja, imageAspect: 0.5, textArea: { x: 0.0991, y: 0.1622, width: 0.6907, height: 0.5367 } },
  { key: 'comunion', label: 'Comunión', gradient: 'linear-gradient(160deg, #ECFDF5, #D1FAE5)', text: '#166534', artKey: 'confeti', image: invitaComunion, imageAspect: 1.188, textArea: { x: 0.3, y: 0.1, width: 0.6, height: 0.45 } },
  { key: 'bebe_nino', label: 'Bebé niño', gradient: 'linear-gradient(160deg, #DBEAFE, #BFDBFE)', text: '#1E3A8A', artKey: 'confeti', image: invitaBebeNino, imageAspect: 0.4844, textArea: { x: 0.15, y: 0.1, width: 0.7, height: 0.4 } },
  // Lote 6 — tercera hoja de arte real. Se descartan los repetidos
  // (Nochevieja, Playa, los 5 de boda que ya teníamos cubiertos, la
  // variante rosa de comunión, el barco de bautizo y el osito de luna
  // que repetía Bebé niño) y se sustituye el comunion.jpg del lote 5
  // (floral verde) por este cáliz, más reconocible.
  { key: 'barbacoa', label: 'Barbacoa', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaBarbacoa, imageAspect: 1.1861, textArea: { x: 0.2311, y: 0.1447, width: 0.56, height: 0.5526 } },
  // Lote 7 — cuarta hoja. Se descartan los repetidos (Nochevieja, un
  // marco de luces de jardín parecido a Barbacoa, y rosas/corazones que
  // ya teníamos) y se añaden Bautizo niña, Navidad y un Cumpleaños más
  // elegante/adulto (pastel de chocolate y cóctel, distinto del
  // Cumpleaños infantil de "Globos").
  { key: 'bautizo_nina', label: 'Bautizo niña', gradient: 'linear-gradient(160deg, #FCE7F3, #FBCFE8)', text: '#9D174D', artKey: 'confeti', image: invitaBautizoNina, imageAspect: 0.4214, textArea: { x: 0.18, y: 0.14, width: 0.55, height: 0.48 } },
  { key: 'navidad', label: 'Navidad', gradient: 'linear-gradient(160deg, #166534, #7F1D1D)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidad, imageAspect: 0.4214, textArea: { x: 0.16, y: 0.1809, width: 0.7467, height: 0.526 } },
  { key: 'cumpleanos_elegante', label: 'Cumpleaños elegante', gradient: 'linear-gradient(160deg, #134E4A, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaCumpleanosElegante, imageAspect: 0.4214, textArea: { x: 0.1711, y: 0.1232, width: 0.7467, height: 0.5574 } },
  // Lote 8 — "Navidad varias" (pedido explícito en la lista de 26
  // temas: varias variantes navideñas, no solo una) + una hoja extra de
  // Halloween que no estaba en la lista pero encaja igual de bien en
  // Celebración/Personalizado — nada con copyright, calabazas/fantasmas
  // genéricos.
  { key: 'navidad_hogar', label: 'Navidad junto al fuego', gradient: 'linear-gradient(160deg, #7F1D1D, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidadHogar, imageAspect: 0.5911, textArea: { x: 0.3293, y: 0.1134, width: 0.5413, height: 0.4311 } },
  { key: 'navidad_muneco', label: 'Navidad muñeco de nieve', gradient: 'linear-gradient(160deg, #1E3A8A, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaNavidadMuneco, imageAspect: 0.5911, textArea: { x: 0.3493, y: 0.2368, width: 0.4013, height: 0.4145 } },
  { key: 'navidad_dorada', label: 'Navidad dorada', gradient: 'linear-gradient(160deg, #F5F0E6, #E7DFC6)', text: '#7C2D12', artKey: 'confeti', image: invitaNavidadDorada, imageAspect: 0.5895, textArea: { x: 0.32, y: 0.08, width: 0.6, height: 0.5 } },
  { key: 'navidad_papanoel', label: 'Navidad Papá Noel', gradient: 'linear-gradient(160deg, #7F1D1D, #1E3A8A)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidadPapanoel, imageAspect: 0.5911, textArea: { x: 0.4778, y: 0.1911, width: 0.4667, height: 0.6245 } },
  { key: 'navidad_galletas', label: 'Navidad galletas', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaNavidadGalletas, imageAspect: 0.5911, textArea: { x: 0.1836, y: 0.1403, width: 0.644, height: 0.5747 } },
  { key: 'navidad_farolillos', label: 'Navidad farolillos', gradient: 'linear-gradient(160deg, #1E3A8A, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaNavidadFarolillos, imageAspect: 0.5895, textArea: { x: 0.5124, y: 0.2737, width: 0.364, height: 0.3349 } },
  { key: 'halloween_calabaza', label: 'Halloween calabaza', gradient: 'linear-gradient(160deg, #C2410C, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaHalloweenCalabaza, imageAspect: 0.6531, textArea: { x: 0.1556, y: 0.3, width: 0.7, height: 0.487 } },
  { key: 'halloween_casa', label: 'Halloween casa encantada', gradient: 'linear-gradient(160deg, #1E1B4B, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaHalloweenCasa, imageAspect: 0.6531, textArea: { x: 0.2387, y: 0.3212, width: 0.5227, height: 0.4809 } },
  { key: 'halloween_bruja', label: 'Halloween bruja', gradient: 'linear-gradient(160deg, #166534, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaHalloweenBruja, imageAspect: 0.6531, textArea: { x: 0.0853, y: 0.2064, width: 0.6627, height: 0.493 } },
  { key: 'halloween_fantasmas', label: 'Halloween fantasmas', gradient: 'linear-gradient(160deg, #C2410C, #1E1B4B)', text: '#FFF7ED', artKey: 'confeti', image: invitaHalloweenFantasmas, imageAspect: 0.6531, textArea: { x: 0.0729, y: 0.1965, width: 0.7653, height: 0.5417 } },
  // Lote 9 — más variantes de cumpleaños; se descarta una cuarta
  // (señal de madera "Buena compañía/Risas/Momentos inolvidables" en
  // playa) por quedar demasiado parecida a Playa tropical.
  { key: 'cumpleanos_rosa', label: 'Cumpleaños rosa', gradient: 'linear-gradient(160deg, #FBCFE8, #FDA4AF)', text: '#9D174D', artKey: 'confeti', image: invitaCumpleanosRosa, imageAspect: 0.6531, textArea: { x: 0.2702, y: 0.2026, width: 0.504, height: 0.5296 } },
  { key: 'cumpleanos_fiesta', label: 'Cumpleaños fiesta', gradient: 'linear-gradient(160deg, #FBBF24, #0EA5E9)', text: '#1f2233', artKey: 'confeti', image: invitaCumpleanosFiesta, imageAspect: 0.6531, textArea: { x: 0.1911, y: 0.0907, width: 0.6067, height: 0.7243 } },
  // Lote 10 — "Ribete (Graduación)" de la lista de 26 (varias
  // variantes), Bebé chica/Cuna neutral/variante arcoíris (completa la
  // pareja con Bebé niño), y tres categorías nuevas que no estaban en la
  // lista pero encajan en Celebración/Personalizado: estrenar casa,
  // despedida de soltero/a y más variantes de Floral y Playa tropical
  // ("varias", igual que Navidad).
  { key: 'graduacion_esfuerzo', label: 'Graduación esfuerzo', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaGraduacionEsfuerzo, imageAspect: 1.5311, textArea: { x: 0.2987, y: 0.1525, width: 0.5693, height: 0.7119 } },
  { key: 'graduacion_suena', label: 'Graduación sueña', gradient: 'linear-gradient(160deg, #166534, #0F172A)', text: '#ffffff', artKey: 'confeti', image: invitaGraduacionSuena, imageAspect: 1.5311, textArea: { x: 0.2622, y: 0.1173, width: 0.42, height: 0.6976 } },
  { key: 'graduacion_disciplina', label: 'Graduación disciplina', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaGraduacionDisciplina, imageAspect: 1.5311, textArea: { x: 0.3084, y: 0.1627, width: 0.4387, height: 0.6407 } },
  { key: 'graduacion_explorar', label: 'Graduación explorar', gradient: 'linear-gradient(160deg, #166534, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaGraduacionExplorar, imageAspect: 1.5311, textArea: { x: 0.2036, y: 0.1464, width: 0.504, height: 0.4698 } },
  { key: 'bebe_nina', label: 'Bebé niña', gradient: 'linear-gradient(160deg, #FBCFE8, #FDA4AF)', text: '#9D174D', artKey: 'confeti', image: invitaBebeNina, imageAspect: 0.9526, textArea: { x: 0.2444, y: 0.1238, width: 0.4667, height: 0.5183 } },
  { key: 'bebe_neutro', label: 'Cuna neutral', gradient: 'linear-gradient(160deg, #D9F99D, #FDE9D9)', text: '#3F6212', artKey: 'confeti', image: invitaBebeNeutro, imageAspect: 0.9526, textArea: { x: 0.1036, y: 0.1413, width: 0.7373, height: 0.5898 } },
  { key: 'bebe_arcoiris', label: 'Bebé arcoíris', gradient: 'linear-gradient(160deg, #FBCFE8, #BFDBFE)', text: '#9D174D', artKey: 'confeti', image: invitaBebeArcoiris, imageAspect: 0.951, textArea: { x: 0.0724, y: 0.0497, width: 0.644, height: 0.5217 } },
  { key: 'casa_bienvenida', label: 'Nueva casa bienvenida', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaBienvenida, imageAspect: 1, textArea: { x: 0.4102, y: 0.1524, width: 0.4573, height: 0.5507 } },
  { key: 'casa_llaves', label: 'Nueva casa llaves', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaLlaves, imageAspect: 1, textArea: { x: 0.2244, y: 0.0631, width: 0.6067, height: 0.6627 } },
  { key: 'casa_terraza', label: 'Nueva casa terraza', gradient: 'linear-gradient(160deg, #166534, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaTerraza, imageAspect: 1, textArea: { x: 0.2476, y: 0.0853, width: 0.616, height: 0.6627 } },
  { key: 'casa_cajas', label: 'Nueva casa mudanza', gradient: 'linear-gradient(160deg, #B45309, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaCasaCajas, imageAspect: 1, textArea: { x: 0.2138, y: 0.1231, width: 0.4947, height: 0.7093 } },
  { key: 'despedida_novia', label: 'Despedida de soltera', gradient: 'linear-gradient(160deg, #EC4899, #9D174D)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaNovia, imageAspect: 1, textArea: { x: 0.2582, y: 0.1116, width: 0.4947, height: 0.588 } },
  { key: 'despedida_novio', label: 'Despedida de soltero', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaNovio, imageAspect: 1, textArea: { x: 0.1587, y: 0.2107, width: 0.616, height: 0.5787 } },
  { key: 'despedida_viaje', label: 'Despedida de viaje', gradient: 'linear-gradient(160deg, #0EA5E9, #78350F)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaViaje, imageAspect: 1, textArea: { x: 0.2787, y: 0.1858, width: 0.476, height: 0.5507 } },
  { key: 'despedida_noche', label: 'Despedida de noche', gradient: 'linear-gradient(160deg, #7C3AED, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaDespedidaNoche, imageAspect: 1, textArea: { x: 0.2893, y: 0.148, width: 0.588, height: 0.7373 } },
  { key: 'floral_picnic', label: 'Floral picnic', gradient: 'linear-gradient(160deg, #FFE4E6, #FED7AA)', text: '#7C2D12', artKey: 'floral', image: invitaFloralPicnic, imageAspect: 1, textArea: { x: 0.1964, y: 0.0987, width: 0.6627, height: 0.5693 } },
  { key: 'floral_primavera', label: 'Floral primavera', gradient: 'linear-gradient(160deg, #FFE4E6, #D9F99D)', text: '#3F6212', artKey: 'floral', image: invitaFloralPrimavera, imageAspect: 1, textArea: { x: 0.2836, y: 0.0622, width: 0.644, height: 0.6533 } },
  { key: 'floral_noche', label: 'Floral noche de jardín', gradient: 'linear-gradient(160deg, #B45309, #451A03)', text: '#FFF7ED', artKey: 'floral', image: invitaFloralNoche, imageAspect: 1, textArea: { x: 0.0667, y: 0.1364, width: 0.7, height: 0.616 } },
  { key: 'playa_piscina', label: 'Playa piscina', gradient: 'linear-gradient(160deg, #0EA5E9, #FB7185)', text: '#7C2D12', artKey: 'confeti', image: invitaPlayaPiscina, imageAspect: 1, textArea: { x: 0.28, y: 0.12, width: 0.55, height: 0.6 } },
  { key: 'playa_pina', label: 'Playa piña colada', gradient: 'linear-gradient(160deg, #FBBF24, #0EA5E9)', text: '#7C2D12', artKey: 'confeti', image: invitaPlayaPina, imageAspect: 1, textArea: { x: 0.2529, y: 0.2116, width: 0.672, height: 0.588 } },
  { key: 'playa_atardecer', label: 'Playa atardecer', gradient: 'linear-gradient(160deg, #FB923C, #7C2D12)', text: '#FFF7ED', artKey: 'confeti', image: invitaPlayaAtardecer, imageAspect: 1, textArea: { x: 0.2458, y: 0.1813, width: 0.5973, height: 0.7373 } },
  { key: 'playa_terraza', label: 'Playa noche de verano', gradient: 'linear-gradient(160deg, #B45309, #1E1B4B)', text: '#FFF7ED', artKey: 'confeti', image: invitaPlayaTerraza, imageAspect: 1, textArea: { x: 0.212, y: 0.1849, width: 0.476, height: 0.5413 } },
  // Lote 11 — Clásico (SVG→foto), Reunión familiar (ya existe como
  // subtipo de Celebración) con varias escenas de comida, Jubilación
  // (también subtipo ya existente) y más variantes de Carnaval, Otoño y
  // Corazones. Se descarta una última hoja recibida por repetir Dorado,
  // Disco, Barbacoa y Comunión.
  { key: 'comida_familiar', label: 'Comida familiar', gradient: 'linear-gradient(160deg, #FBBF24, #166534)', text: '#1f2233', artKey: 'confeti', image: invitaComidaFamiliar, imageAspect: 1.1861, textArea: { x: 0.3031, y: 0.0495, width: 0.616, height: 0.5195 } },
  { key: 'cena_hogar', label: 'Cena en casa', gradient: 'linear-gradient(160deg, #7F1D1D, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaCenaHogar, imageAspect: 1.188, textArea: { x: 0.2284, y: 0.1074, width: 0.532, height: 0.5747 } },
  { key: 'tapas', label: 'Tapas con amigos', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaTapas, imageAspect: 1.1861, textArea: { x: 0.3244, y: 0.1142, width: 0.6067, height: 0.5084 } },
  { key: 'desayuno', label: 'Desayuno / Brunch', gradient: 'linear-gradient(160deg, #FDE9D9, #FBBF24)', text: '#7C2D12', artKey: 'confeti', image: invitaDesayuno, imageAspect: 1.188, textArea: { x: 0.0613, y: 0.06, width: 0.644, height: 0.63 } },
  { key: 'jubilacion_brindis', label: 'Jubilación brindis', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaJubilacionBrindis, imageAspect: 1, textArea: { x: 0.3111, y: 0.2027, width: 0.4667, height: 0.4947 } },
  { key: 'jubilacion_viaje', label: 'Jubilación viaje', gradient: 'linear-gradient(160deg, #0EA5E9, #78350F)', text: '#ffffff', artKey: 'confeti', image: invitaJubilacionViaje, imageAspect: 1, textArea: { x: 0.2862, y: 0.2009, width: 0.4387, height: 0.476 } },
  { key: 'jubilacion_relax', label: 'Jubilación tranquila', gradient: 'linear-gradient(160deg, #FDE9D9, #D6A574)', text: '#5C3A1E', artKey: 'confeti', image: invitaJubilacionRelax, imageAspect: 1, textArea: { x: 0.3827, y: 0.1173, width: 0.4013, height: 0.2987 } },
  { key: 'jubilacion_cena', label: 'Jubilación cena', gradient: 'linear-gradient(160deg, #7F1D1D, #1E1B4B)', text: '#FFF7ED', artKey: 'confeti', image: invitaJubilacionCena, imageAspect: 1, textArea: { x: 0.2564, y: 0.1498, width: 0.476, height: 0.5227 } },
  { key: 'carnaval_bufon', label: 'Carnaval bufón', gradient: 'linear-gradient(160deg, #7C3AED, #DB2777)', text: '#ffffff', artKey: 'confeti', image: invitaCarnavalBufon, imageAspect: 1, textArea: { x: 0.3449, y: 0.2564, width: 0.588, height: 0.476 } },
  { key: 'carnaval_plumas', label: 'Carnaval plumas', gradient: 'linear-gradient(160deg, #0EA5E9, #DB2777)', text: '#ffffff', artKey: 'confeti', image: invitaCarnavalPlumas, imageAspect: 1, textArea: { x: 0.2902, y: 0.0676, width: 0.5973, height: 0.7093 } },
  { key: 'carnaval_payaso', label: 'Carnaval payaso', gradient: 'linear-gradient(160deg, #FBBF24, #7C3AED)', text: '#1f2233', artKey: 'confeti', image: invitaCarnavalPayaso, imageAspect: 1, textArea: { x: 0.0667, y: 0.2556, width: 0.7, height: 0.4667 } },
  { key: 'carnaval_confeti', label: 'Carnaval confeti', gradient: 'linear-gradient(160deg, #FBBF24, #0EA5E9)', text: '#1f2233', artKey: 'confeti', image: invitaCarnavalConfeti, imageAspect: 1, textArea: { x: 0.2551, y: 0.0587, width: 0.5787, height: 0.616 } },
  { key: 'otono_acogedor', label: 'Otoño acogedor', gradient: 'linear-gradient(160deg, #B45309, #78350F)', text: '#FFF7ED', artKey: 'confeti', image: invitaOtonoAcogedor, imageAspect: 1, textArea: { x: 0.0756, y: 0.1387, width: 0.7933, height: 0.5227 } },
  { key: 'otono_senderismo', label: 'Otoño senderismo', gradient: 'linear-gradient(160deg, #B45309, #166534)', text: '#FFF7ED', artKey: 'confeti', image: invitaOtonoSenderismo, imageAspect: 1, textArea: { x: 0.0964, y: 0.1729, width: 0.6627, height: 0.532 } },
  { key: 'otono_hogar', label: 'Otoño en casa', gradient: 'linear-gradient(160deg, #7F1D1D, #451A03)', text: '#FFF7ED', artKey: 'confeti', image: invitaOtonoHogar, imageAspect: 1, textArea: { x: 0.3653, y: 0.1942, width: 0.5693, height: 0.5227 } },
  { key: 'otono_cosecha', label: 'Otoño cosecha', gradient: 'linear-gradient(160deg, #FBBF24, #B45309)', text: '#7C2D12', artKey: 'confeti', image: invitaOtonoCosecha, imageAspect: 1, textArea: { x: 0.3098, y: 0.056, width: 0.5693, height: 0.588 } },
  { key: 'corazones_acuarela', label: 'Corazones acuarela', gradient: 'linear-gradient(160deg, #FDA4AF, #FFE4E6)', text: '#9D174D', artKey: 'corazones', image: invitaCorazonesAcuarela, imageAspect: 1.2287, textArea: { x: 0.304, y: 0.1436, width: 0.6253, height: 0.6444 } },
  { key: 'corazones_madera', label: 'Corazones rústico', gradient: 'linear-gradient(160deg, #E11D48, #78350F)', text: '#FFF7ED', artKey: 'corazones', image: invitaCorazonesMadera, imageAspect: 1.2306, textArea: { x: 0.1596, y: 0.1195, width: 0.6253, height: 0.6789 } },
  { key: 'corazones_terraza', label: 'Corazones terraza', gradient: 'linear-gradient(160deg, #FB923C, #7C2D12)', text: '#FFF7ED', artKey: 'corazones', image: invitaCorazonesTerraza, imageAspect: 1.1861, textArea: { x: 0.2351, y: 0.0947, width: 0.4853, height: 0.7184 } },
  { key: 'corazones_dorado', label: 'Corazones dorado', gradient: 'linear-gradient(160deg, #F5F0E6, #E7DFC6)', text: '#9D174D', artKey: 'corazones', image: invitaCorazonesDorado, imageAspect: 1.188, textArea: { x: 0.1827, y: 0.1058, width: 0.6347, height: 0.6963 } },
  { key: 'celebracion_dorada', label: 'Celebración dorada', gradient: 'linear-gradient(160deg, #1F2937, #111827)', text: '#F5D57A', artKey: 'confeti', image: invitaCelebracionDorada, imageAspect: 1.188, textArea: { x: 0.2551, y: 0.0916, width: 0.5787, height: 0.6853 } },
  { key: 'fiesta_acuarela', label: 'Fiesta acuarela', gradient: 'linear-gradient(160deg, #FDE9D9, #F3E8FF)', text: '#6B21A8', artKey: 'confeti', image: invitaFiestaAcuarela, imageAspect: 1.1861, textArea: { x: 0.15, y: 0.15, width: 0.6, height: 0.5 } },
  // Lote 12 — repaso visual de la familia: sustituye SVG o fotos que
  // "quedan borrosas o no quedan bien" en Robots, Ositos, Gatitos,
  // Kpop, Superheroína y Estrellitas (ya no dibujo/foto vieja, ahora
  // foto real a juego), y también en Hadas/Granja/Boda/Safari/Obras/
  // Bautizo (mejor foto que la que había). Sirena, Delfín y tortuga,
  // Mago y Bruja son temas nuevos.
  { key: 'sirena', label: 'Sirena', gradient: 'linear-gradient(160deg, #0EA5E9, #075985)', text: '#ffffff', artKey: 'confeti', image: invitaSirena, imageAspect: 1.2163, textArea: { x: 0.344, y: 0.1535, width: 0.5787, height: 0.7605 } },
  { key: 'delfin_tortuga', label: 'Delfín y tortuga', gradient: 'linear-gradient(160deg, #0EA5E9, #0369A1)', text: '#ffffff', artKey: 'confeti', image: invitaDelfinTortuga, imageAspect: 1.2163, textArea: { x: 0.1036, y: 0.1519, width: 0.7373, height: 0.6016 } },
  { key: 'mago', label: 'Mago', gradient: 'linear-gradient(160deg, #4C1D95, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaMago, imageAspect: 1.214, textArea: { x: 0.2996, y: 0.1416, width: 0.5787, height: 0.6357 } },
  { key: 'bruja', label: 'Bruja', gradient: 'linear-gradient(160deg, #4C1D95, #1E1B4B)', text: '#ffffff', artKey: 'confeti', image: invitaBruja, imageAspect: 1.2163, textArea: { x: 0.4222, y: 0.1508, width: 0.4667, height: 0.5903 } },
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
const DEFAULT_TEXT_AREA = { x: 0.1, y: 0.15, width: 0.8, height: 0.7 }

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
