// Menú explicativo de cada sección — petición real: "menú explicativo
// para cada sección y lo que tiene que ofrecer", pensando sobre todo en
// quien se une a la app por primera vez (un invitado, o cualquier
// miembro nuevo de la familia) y no sabe para qué sirve cada pestaña.
//
// Ampliado más tarde a petición real: la versión inicial (una frase por
// sección) se quedaba corta — el usuario pidió el mismo nivel de
// detalle que el menú de ayuda de una app de referencia (Cozi), que
// explica cada función concreta una a una. Cada tarjeta es ahora un
// desplegable: la frase resumen se ve siempre, y al tocarla se abre el
// listado detallado de cada bloque/función de esa sección.
//
// IMPORTANTE para quien mantenga este archivo: HELP_DETAILS debe
// reflejar la app tal y como está de verdad. Cada vez que se añada,
// cambie o quite una función en cualquier sección, hay que actualizar
// aquí su entrada correspondiente en el mismo cambio — si no, la ayuda
// queda desactualizada y deja de ser fiable.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { NAV_TABS } from '@/domain/navTabs'
import ayudaHeaderImg from '@/assets/ayuda/ayuda-header.jpg'

const SUMMARIES: Record<string, string> = {
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

interface HelpItem {
  title: string
  text: string
}

const HELP_DETAILS: Record<string, HelpItem[]> = {
  '/': [
    { title: 'Portada de fotos', text: 'Va pasando las últimas fotos de la Galería como un carrusel; se detiene si la tocas.' },
    { title: 'Avisos del día', text: 'Si hoy hay algo en el Calendario o compra pendiente, aparece una diapositiva extra que te lleva directo allí.' },
    { title: 'Accesos rápidos', text: 'Una tarjeta por sección con un resumen de una línea — tócala para entrar directamente.' },
    { title: 'Organizar', text: 'Botón para reordenar las tarjetas de Inicio a tu gusto; cada uno puede tener su propio orden en su móvil.' },
    { title: 'Notificaciones', text: 'Aviso para activar los recordatorios push, para que te lleguen aunque tengas la app cerrada.' },
  ],
  '/familia': [
    { title: 'Miembros', text: 'Nombre, tipo (Adulto, Niño/a, Bebé, Invitado/a), color y foto de cada uno; arrastra para reordenar la lista.' },
    { title: 'Invitados con acceso limitado', text: 'Al crear un miembro "Invitado/a" eliges a qué secciones concretas de la app puede entrar.' },
    { title: 'Código de invitación', text: 'Genera un código de un solo uso (24h) para que alguien se cree su propia cuenta y quede enlazado a su ficha, sin compartir tu contraseña.' },
    { title: 'Reiniciar PIN', text: 'Si un miembro olvida su PIN de bloqueo, el admin puede reiniciarlo (nunca verlo) desde su ficha.' },
    { title: 'Actividad reciente', text: 'Registro de qué se ha hecho en la app y quién lo ha hecho.' },
    { title: 'Automatizaciones por email (solo admin)', text: 'Direcciones propias para reenviar pedidos de Amazon, tickets de Mercadona y correos con eventos, y que se apunten solos en la app.' },
  ],
  '/calendario': [
    { title: 'Menú ☰ y Vista general', text: 'Se abre por defecto en Vista general. El botón ☰ junto al título agrupa el resto de vistas (Mes, Semana, 3 días, Día, Familiar, Agenda, Personal, Externos) — sácalas para verlas siempre como chip, igual que en Economía. Los nombres de la familia para filtrar se quedan siempre visibles, fuera del desplegable.' },
    { title: 'Vistas', text: 'Mes, Semana, 3 días, Día, Familiar (una columna por persona), Agenda, Personal y Vista general — elige la que mejor te venga.' },
    { title: 'Personal', text: 'Notas privadas por día, solo para ti — ni el resto de la familia las ve, aunque compartáis cuenta. No lleva hora, foto ni recordatorios, solo lo que quieras apuntarte a ti mismo.' },
    { title: 'Crear evento', text: 'Título, hora, foto o archivo adjunto, repetición (con excluir festivos) y varios recordatorios por evento. Puedes marcarlo "🔒 Solo yo" para que aparezca mezclado con el resto del calendario pero solo tú lo veas — ni el resto de la familia.' },
    { title: 'Puntos por evento', text: 'Si el evento es de una sola persona, puedes ponerle puntos que se ganan al marcarlo "Hecho" — van a la sección Puntos.' },
    { title: 'Marcar hecho / borrar', text: 'Un evento hecho se queda tachado en su sitio. En los repetidos puedes borrar solo esa vez o toda la serie.' },
    { title: 'Calendarios enlazados', text: 'Pega la "URL secreta" de tu Google, Outlook, Apple o Android para traer tus citas de fuera (solo lectura).' },
    { title: 'Conectar con Google Calendar', text: 'Sincronización automática de verdad, sin tener que copiar ninguna URL.' },
    { title: 'Exportar a tu móvil', text: 'Tu propia URL para que Google o Apple Calendar lean lo que apuntéis en la app.' },
    { title: 'Apuntar por voz', text: 'Dile a Pepa que te cree un evento y lo hace por ti.' },
    { title: 'Compartir', text: 'El icono 📤 de cada evento manda un archivo .ics al menú de compartir del móvil, para que quien lo reciba pueda añadirlo a su propio calendario (Google, Apple...) aunque no use esta app. En Android o en ordenador, donde ese menú puede no funcionar, se abre en su lugar una ventana con el texto ya listo para copiar o mandar directo por WhatsApp/email.' },
  ],
  '/puntos': [
    { title: 'Saldo por miembro', text: 'Se gana marcando "Hecho" en eventos del Calendario que llevan puntos asignados.' },
    { title: 'Recompensas', text: 'Lista de premios canjeables por una cantidad de puntos; se pueden crear o borrar en cualquier momento.' },
    { title: 'Canjear', text: 'Descuenta puntos del saldo del miembro elegido — no deja canjear si no le llegan los puntos.' },
  ],
  '/compras': [
    { title: 'Menú ☰ e Inicio', text: 'El botón ☰ junto al título abre un desplegable con todas las pestañas de Compras — puedes sacar las que uses más para verlas siempre en pantalla, agruparlas y crear accesos nuevos (botón "✏️ Editar" dentro del desplegable), igual que en Economía.' },
    { title: 'Lista', text: 'Agrupada por tienda en carpetas que se pliegan; arrastra para reordenar, marca prioridad y cantidad, y usa "Modo compra" mientras estás en la tienda — ahí verás un total que va sumando lo que marcas como comprado, usando el último precio que recuerde de cada producto.' },
    { title: 'Tiendas', text: 'Tus propias tiendas (Mercadona, Aldi...) con su logo, para agrupar la lista y para que Pepa te entienda al dictar, por ejemplo, "Mercadona, patatas".' },
    { title: 'Historial', text: 'Se construye solo con lo que compras: sugiere recompra, compara el precio de este mes con el anterior y te dice en qué tienda sale más barato.' },
    { title: 'No alimentos', text: 'El mismo historial pero para ropa, electrónica y demás compras que no son de comida — nunca se mezcla con Alimentación.' },
    { title: 'Tickets', text: 'Sube la foto del ticket y Pepa lo lee sola; guarda el gasto por tienda y avisa con "falta ticket" si esa compra solo se conoce por el banco. El icono 📤 de cada ticket lo manda al menú de compartir del móvil.' },
    { title: 'Compartir la lista', text: 'El icono 📤 de cada tienda manda solo lo pendiente de esa tienda; "📤 Compartir todo" manda la lista entera, agrupada por tienda.' },
    { title: 'Registro Alimentación', text: 'Presupuesto y gasto de comida, con su propio gráfico — vive aquí porque tiene más que ver con la compra que con el dinero en sí.' },
  ],
  '/alimentacion': [
    { title: 'Menú ☰ e Inicio', text: 'El botón ☰ junto al título ("La cocina de Pepa") abre un desplegable con todas las pestañas — puedes sacar las que uses más para verlas siempre en pantalla, agruparlas y crear accesos nuevos (botón "✏️ Editar" dentro del desplegable), igual que en Economía.' },
    { title: 'Menú semanal', text: 'Planifica desayuno, comida, merienda y cena de toda la semana, con una receta guardada o texto libre.' },
    { title: 'Recetas', text: 'Con foto, etiquetas (Postres, Favoritos, Fáciles de preparar...), ingredientes y notas; un buscador arriba te lleva directo a las que ya tienes guardadas, y también puedes buscarla en internet (el campo Título recuerda tus búsquedas anteriores y las autocompleta) o importarla pegando su URL, y mandar los ingredientes que quieras a la lista de la compra. "📤 Compartir" manda el título, los ingredientes, la preparación y la foto (si tiene) al menú de compartir del móvil.' },
    { title: 'Registro', text: 'Apunta lo que ha comido cada uno (puedes marcar a varios a la vez), con calorías y macronutrientes si quieres.' },
    { title: 'Peso', text: 'Evolución del peso y las medidas de cada miembro, con gráfico y fotos de seguimiento.' },
  ],
  '/dinero': [
    { title: 'Resumen', text: 'Ingresos, gastos y ahorro del mes, más las "Conclusiones de Pepa": en su bocadillo se ve una frase a la vez señalando algo distinto (la categoría que más ha crecido, la tienda más frecuente...) — cambia sola cada vez que abres la pantalla, o deslizando con el dedo sobre la imagen para ver las demás. Cuando la conclusión se apoya en un criterio propio de la app (tasa de ahorro, Fijo/Variable, Debo/Necesito/Quiero, comparación con el periodo anterior), debajo de la imagen aparece un cuadro "💡" explicando qué significa y por qué importa. Debajo de "Mis cuentas" está "Tendencia del saldo": la evolución del saldo día a día, reconstruida a partir de los movimientos guardados (no puede ir más atrás de lo que haya sincronizado), con eje de euros y de fechas. Viendo "Todas" se dibuja como franjas apiladas, una por cuenta y con su color (el del miembro asignado, o gris "🏠 Común" si no tiene dueño) — así se ve de un vistazo cuánto aporta cada cuenta al total en cada momento. Chips para aislar una sola cuenta, y el mismo selector de fechas 📅 que el resto de la app para ampliar el plazo.' },
    { title: 'Estadísticas', text: 'Gráficos donut por categoría, etiqueta, Debo/Necesito/Quiero y Fijo/Variable — toca una porción para ver justo esos movimientos. "Evolución temporal" (últimos 6 meses) respeta el día de inicio del mes contable que hayas puesto en Configuración.' },
    { title: 'Movimientos', text: 'Todos los gastos e ingresos del mes, editables uno a uno.' },
    { title: 'Presupuesto Generales', text: 'Cuánto os habéis propuesto gastar por categoría este mes y cuánto lleváis gastado.' },
    { title: 'Banco', text: 'Los movimientos se traen y concilian solos varias veces al día, o pulsa "🔄 Sincronizar movimientos" para forzarlo (el desplegable de al lado amplía cuánto histórico pedir). Conectar un banco nuevo, desconectarlo o decir de quién es cada cuenta se hace desde "⚙️ Gestionar cuentas bancarias" — la misma ventana emergente a la que también se llega desde ☰ Menú → Configuración → 🏦 Cuentas bancarias.' },
    { title: 'Educación financiera', text: 'Un monedero para cada niño (Ingresos, Ahorro, Gastos, Impuestos) con objetivos de ahorro y su barra de progreso.' },
  ],
  '/ubicacion': [
    { title: 'Menú ☰ e Inicio', text: 'El botón ☰ junto al título abre un desplegable con las pestañas de Ubicación — puedes sacar las que uses más para verlas siempre en pantalla, igual que en Economía.' },
    { title: 'Ubicación en vivo', text: 'Mapa con dónde está cada uno que lo comparte (con su permiso), y el recorrido de las últimas 24h.' },
    { title: 'Activar en este móvil', text: 'Elige quién lleva el teléfono para que empiece a compartir su posición desde ese dispositivo.' },
    { title: 'Lugares frecuentes', text: 'Guarda sitios (casa, colegio...) para que la app los reconozca.' },
    { title: 'Reglas', text: 'Avisos automáticos al llegar o salir de un sitio guardado, o todos los días a una hora.' },
  ],
  '/cumpleanos': [
    { title: 'Próximos', text: 'Cumpleaños de la familia y de tus contactos juntos, ordenados por cuánto falta, con la edad que van a cumplir.' },
    { title: 'Favoritos', text: 'Los que marques con ⭐, para tenerlos más a mano.' },
  ],
  '/contactos': [
    { title: 'Categorías', text: 'Colegio, Médico, Emergencia, Familia, Otros, o las que tú escribas.' },
    { title: 'Ficha de contacto', text: 'Teléfono con botón de llamada directa, email, notas y cumpleaños.' },
    { title: 'Importar', text: 'Desde la agenda de tu móvil, desde un archivo .vcf exportado del iPhone, o los cumpleaños desde tu calendario de Google.' },
    { title: 'Compartir', text: 'El icono 📤 de cada ficha manda ese contacto al menú de compartir del móvil. "📤 Compartir varios" deja marcar varios con una casilla y mandarlos juntos en un único archivo. En Android o en ordenador, donde ese menú puede no funcionar, se abre en su lugar una ventana con el texto ya listo para copiar o mandar directo por WhatsApp/email.' },
  ],
  '/galeria': [
    { title: 'Fotos de la familia', text: 'Sube una foto con su descripción, o bórrala si ya no quieres tenerla.' },
    { title: 'Se usa también en Inicio', text: 'Es la misma galería que alimenta el carrusel de fotos de la pantalla de Inicio.' },
    { title: 'Compartir', text: 'El icono 📤 de cada foto la manda al menú de compartir del móvil. "📤 Compartir varias" deja marcar varias con una casilla y mandarlas juntas.' },
  ],
  '/documentos': [
    { title: 'Carpetas', text: 'Por categoría (Familia, Privado, Educación, Casa, Salud o una nueva que crees) y, dentro de cada una, una subcarpeta por miembro.' },
    { title: 'Subir documento', text: 'Foto o PDF, con título, carpeta y de quién es, desde un único botón flotante.' },
    { title: 'Compartir', text: 'El icono 📤 de cada documento lo manda al menú de compartir del móvil — útil para pasar, por ejemplo, la foto del DNI.' },
    { title: 'Vencimiento', text: 'Si le pones una fecha, se apunta en el Calendario y avisa 30, 7 y 1 día antes de que venza.' },
  ],
}

// Configuración no tiene entrada propia en NAV_TABS (se llega desde el
// icono ⚙️ dentro de "☰ Menú" → "Configuración", antes llamada
// "Organizar menú"), pero es igual de importante explicarlo — se añade
// como una tarjeta más, a mano.
const SETTINGS_ENTRY = {
  to: '/menu-organizar',
  icon: '⚙️',
  label: 'Configuración',
  summary: 'Nombre de familia, cuentas bancarias, bloqueo con PIN o huella, orden del menú y panel de uso — se llega desde ☰ Menú → Configuración.',
  details: [
    { title: 'Nombre de familia', text: 'Editable, solo por el admin.' },
    { title: 'Inicio del mes contable', text: 'El día en que empieza "Este mes" en toda Economía, por si lleváis las cuentas desde otra fecha que no sea el día 1.' },
    { title: 'Cuentas bancarias', text: 'Conectar un banco nuevo, desconectarlo o decir de quién es cada cuenta ("🏠 Común" si es de toda la familia). Por normativa (PSD2) cada banco pide renovar el permiso cada 90 días — se ve como "válido hasta" junto al nombre del banco; cuando se acerque esa fecha, vuelve aquí y conecta el mismo banco otra vez para que la sincronización no se corte. Le pasa igual a cualquier familia y a cualquier app de banca abierta, no es un fallo.' },
    { title: 'Bloqueo de la app', text: 'Pon un PIN de 4 a 6 dígitos que se pide cada vez que se abre la app.' },
    { title: 'Huella / Face ID', text: 'Capa opcional por encima del PIN, para no tener que teclearlo cada vez.' },
    { title: 'Reordenar el menú', text: 'Sube o baja cada sección; las 4 primeras se quedan fijas abajo y el resto vive dentro de "☰ Menú".' },
    { title: 'Panel de uso', text: 'Solo visible para los dueños de la app: quién se ha dado de alta, cuándo entró por última vez y si tiene las notificaciones activadas. Ahí también se ven los errores que haya sufrido cualquier familia (agrupados por mensaje, con su traza) y se generan los códigos de invitación de un solo uso para que una familia nueva pueda crear la suya.' },
    { title: 'Privacidad y términos', text: 'La política de privacidad y los términos de uso están enlazados abajo del todo en esta pantalla de Ayuda y en la pantalla de entrada, y se pueden leer sin tener cuenta. Al ser páginas propias fuera de la app, tienen su propio botón "← Volver a la app" arriba del todo para no quedarse atascado sin barra de navegador (por ejemplo, con la app instalada en la pantalla de inicio).' },
  ] as HelpItem[],
}

// Petición real: "quiero que me pongas un buscador para buscar
// directamente lo que necesito... que me lleve a la sección de ayuda
// donde te explica [eso]" — busca por palabra suelta en el título de
// cada sección y en el título/texto de cada punto de detalle, no solo
// coincidencia exacta: "banco" tiene que encontrar "bancaria" aunque
// no sea la misma palabra completa, comparando solo el principio de
// cada palabra (mismo criterio que ya se usaba para emparejar
// productos leídos de un ticket).
interface SearchEntry {
  to: string
  sectionIcon: string
  sectionLabel: string
  itemTitle: string
  itemText: string
}

function normalizeSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
}

const SEARCH_STOPWORDS = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'y', 'o', 'un', 'una', 'para', 'con', 'en', 'como', 'que', 'se', 'es', 'a', 'al', 'mi', 'tu', 'su',
])

function significantSearchWords(s: string): string[] {
  return normalizeSearch(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !SEARCH_STOPWORDS.has(w))
}

// Dos palabras "coinciden" si son iguales, o si ambas tienen 4+ letras
// y comparten las 4 primeras — así "banco" encuentra "bancaria",
// "instalar" encuentra "instalación", etc., sin depender de acertar
// la palabra exacta.
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  if (a.length < 4 || b.length < 4) return false
  return a.slice(0, 4) === b.slice(0, 4)
}

function searchMatchScore(queryWords: string[], haystack: string): number {
  const haystackWords = significantSearchWords(haystack)
  let score = 0
  for (const q of queryWords) {
    if (haystackWords.some((h) => wordsMatch(q, h))) score++
  }
  return score
}

const SEARCH_INDEX: SearchEntry[] = [
  ...NAV_TABS.flatMap((tab) =>
    (HELP_DETAILS[tab.to] ?? []).map((item) => ({
      to: tab.to,
      sectionIcon: tab.icon,
      sectionLabel: tab.label,
      itemTitle: item.title,
      itemText: item.text,
    })),
  ),
  ...SETTINGS_ENTRY.details.map((item) => ({
    to: SETTINGS_ENTRY.to,
    sectionIcon: SETTINGS_ENTRY.icon,
    sectionLabel: SETTINGS_ENTRY.label,
    itemTitle: item.title,
    itemText: item.text,
  })),
]

function HelpCard({
  to,
  icon,
  label,
  summary,
  details,
  expanded,
  onToggle,
  highlightedItem,
  cardRef,
}: {
  to: string
  icon: string
  label: string
  summary: string
  details: HelpItem[]
  expanded: boolean
  onToggle: () => void
  highlightedItem?: string | null
  cardRef?: (el: HTMLDivElement | null) => void
}) {
  return (
    <div className="card ayuda-card" ref={cardRef}>
      <button type="button" className="ayuda-card-header" onClick={onToggle} aria-expanded={expanded}>
        <div className="ayuda-card-main">
          <strong>
            {icon} {label}
          </strong>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            {summary}
          </p>
        </div>
        <span className="ayuda-card-chevron">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="ayuda-card-detail">
          {details.map((item) => (
            <div
              key={item.title}
              className={'ayuda-detail-item' + (item.title === highlightedItem ? ' ayuda-detail-item-highlight' : '')}
            >
              <strong>{item.title}</strong>
              <p className="muted" style={{ margin: '2px 0 0' }}>
                {item.text}
              </p>
            </div>
          ))}
          <Link to={to} className="ayuda-detail-link">
            Ir a esta sección →
          </Link>
        </div>
      )}
    </div>
  )
}

export function AyudaScreen() {
  const [expandedTo, setExpandedTo] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedItem, setHighlightedItem] = useState<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})

  const searchResults = useMemo(() => {
    const words = significantSearchWords(searchQuery)
    if (words.length === 0) return []
    return SEARCH_INDEX.map((entry) => ({
      entry,
      score: searchMatchScore(words, `${entry.sectionLabel} ${entry.itemTitle} ${entry.itemText}`),
    }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((r) => r.entry)
  }, [searchQuery])

  function goToResult(entry: SearchEntry) {
    setSearchQuery('')
    setExpandedTo(entry.to)
    setHighlightedItem(entry.itemTitle)
    requestAnimationFrame(() => {
      cardRefs.current[entry.to]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    setTimeout(() => setHighlightedItem(null), 2500)
  }

  return (
    <div className="screen">
      <div className="kitchen-header kitchen-header-familia">
        <img src={ayudaHeaderImg} alt="Ayuda" className="kitchen-header-img" />
      </div>
      <p className="muted">Para qué sirve cada sección de la app. Toca una para ver el detalle.</p>

      <label className="ayuda-search-label">
        Buscar en la ayuda
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="p. ej. «conectar banco», «importar contactos»…"
        />
      </label>

      {searchQuery.trim() ? (
        <div className="card" style={{ padding: 8, marginTop: 8 }}>
          {searchResults.length > 0 ? (
            searchResults.map((r) => (
              <button key={`${r.to}-${r.itemTitle}`} type="button" className="recipe-list-row" onClick={() => goToResult(r)}>
                <span>
                  <strong>{r.itemTitle}</strong>
                  <span className="muted" style={{ display: 'block', fontSize: 12 }}>
                    {r.sectionIcon} {r.sectionLabel}
                  </span>
                </span>
              </button>
            ))
          ) : (
            <p className="muted" style={{ margin: '4px 8px' }}>
              No he encontrado nada para "{searchQuery}".
            </p>
          )}
        </div>
      ) : (
        <div className="event-list">
          {NAV_TABS.map((tab) => (
            <HelpCard
              key={tab.to}
              to={tab.to}
              icon={tab.icon}
              label={tab.label}
              summary={SUMMARIES[tab.to] ?? ''}
              details={HELP_DETAILS[tab.to] ?? []}
              expanded={expandedTo === tab.to}
              onToggle={() => setExpandedTo((cur) => (cur === tab.to ? null : tab.to))}
              highlightedItem={expandedTo === tab.to ? highlightedItem : null}
              cardRef={(el) => {
                cardRefs.current[tab.to] = el
              }}
            />
          ))}
          <HelpCard
            to={SETTINGS_ENTRY.to}
            icon={SETTINGS_ENTRY.icon}
            label={SETTINGS_ENTRY.label}
            summary={SETTINGS_ENTRY.summary}
            details={SETTINGS_ENTRY.details}
            expanded={expandedTo === SETTINGS_ENTRY.to}
            onToggle={() => setExpandedTo((cur) => (cur === SETTINGS_ENTRY.to ? null : SETTINGS_ENTRY.to))}
            highlightedItem={expandedTo === SETTINGS_ENTRY.to ? highlightedItem : null}
            cardRef={(el) => {
              cardRefs.current[SETTINGS_ENTRY.to] = el
            }}
          />
        </div>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 24, textAlign: 'center' }}>
        <a href={`${import.meta.env.BASE_URL}privacidad.html`}>Política de privacidad</a>
        {' · '}
        <a href={`${import.meta.env.BASE_URL}terminos.html`}>Términos de uso</a>
      </p>
    </div>
  )
}
