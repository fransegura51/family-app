import type { TourDef } from '@/help/tours/types'

// Tutoriales «Enséñame» del grupo g7 · Inicio: la tarjeta «PEPA te avisa», moverse por la barra y el menú ☰, y las reseñas. Comprobado contra src/ui/HomeScreen.tsx, AttentionCard.tsx,
// NavShell.tsx, MenuSettingsScreen.tsx y ReviewsScreen.tsx. Ninguno guarda nada ni pulsa por la persona: señalan y esperan. («Qué veo en Inicio» usa la visita guiada «visita-inicio».)

const info = { completeOn: [] as never[], manualNext: true }

export const tutIniPepaTeAvisa: TourDef = {
  id: 'tut-ini-pepa-te-avisa',
  module: 'inicio',
  group: 'Inicio',
  summary: 'Dónde sale la tarjeta «PEPA te avisa» y qué hacer cuando aparece.',
  version: 1,
  title: 'La tarjeta «PEPA te avisa»',
  cardId: 'ini-pepa-te-avisa',
  durationSec: 60,
  startPath: '/',
  steps: [
    {
      id: 'donde',
      text: 'La tarjeta «PEPA te avisa» sale arriba de Inicio, justo debajo del saludo, y solo cuando hay algo que necesita atención. Si no ves ninguna, es buena señal: no hay nada pendiente.',
      target: 'inicio.cabecera',
      ...info,
    },
    {
      id: 'tarjeta',
      text: 'Esta es la tuya ahora mismo. Hoy solo avisa de Eventos: tareas atrasadas, pagos que vencen o invitados sin responder. Enseña como máximo 3 avisos; si hay más, lo dice debajo.',
      target: 'inicio.pepa-te-avisa',
      ...info,
      optional: true,
    },
    {
      id: 'tocar',
      text: 'Toca cualquier aviso y te llevo directo a ese evento. Cuando lo resuelves, la tarjeta desaparece sola. No hace falta cerrarla.',
      target: 'inicio.pepa-te-avisa',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Recuerda: si la tarjeta no aparece, es que Eventos no necesita nada de ti. Otras secciones todavía no generan este aviso.',
  next: ['ini-que-veo', 'not-campana'],
}

export const tutIniMenuYBarra: TourDef = {
  id: 'tut-ini-menu-y-barra',
  module: 'inicio',
  group: 'Inicio',
  summary: 'Cómo moverte con la barra de abajo y el menú ☰, y dónde elegir qué queda fijo.',
  version: 1,
  title: 'Moverme por PEPA: barra y menú',
  cardId: 'ini-menu-y-barra',
  durationSec: 90,
  startPath: '/',
  paths: ['/', '/menu-organizar'],
  steps: [
    {
      id: 'barra',
      text: 'Esta es la barra de abajo: el botón Menú ☰ y tus cuatro secciones fijas. Tócalas para cambiar de sección en un momento.',
      target: 'nav.menu',
      ...info,
    },
    {
      id: 'abrir',
      text: 'Las demás secciones están dentro del menú. Pulsa «☰ Menú» para verlas.',
      target: 'nav.menu',
      completeOn: [
        { type: 'click', target: 'nav.menu' },
        { type: 'appear', target: 'nav.flyout' },
      ],
      skipIf: [{ type: 'appear', target: 'nav.flyout' }],
    },
    {
      id: 'lista',
      text: 'Aquí tienes el resto de secciones, además de Ayuda, Sugerencias y Reseñas. Tócala y vas allí. Para cerrar el menú, vuelve a pulsar ✕ o toca fuera.',
      target: 'nav.flyout',
      ...info,
      optional: true,
    },
    {
      id: 'configuracion',
      text: 'Para elegir cuáles quedan fijas abajo, entra en «Configuración». Pulsa ese botón.',
      target: 'nav.config',
      completeOn: [
        { type: 'click', target: 'nav.config' },
        { type: 'route', path: '/menu-organizar' },
      ],
      skipIf: [{ type: 'route', path: '/menu-organizar' }],
      optional: true,
    },
    {
      id: 'grupo',
      text: 'Abre el grupo «🧭 Organizar menú» tocándolo.',
      target: 'config.group-menu',
      completeOn: [
        { type: 'click', target: 'config.group-menu' },
        { type: 'appear', target: 'config.menu-order' },
      ],
      skipIf: [{ type: 'appear', target: 'config.menu-order' }],
    },
    {
      id: 'orden',
      text: 'Esta lista es tu menú. Las cuatro primeras (📌) quedan fijas abajo; con ↑ y ↓ las cambias de sitio. Aquí no cambio nada por ti: mueve las que quieras o déjalo como está.',
      target: 'config.menu-order',
      ...info,
    },
  ],
  finishText: 'Listo. El orden es solo tuyo y se guarda en tu cuenta. Cuando quieras cambiarlo, vuelve a Configuración → «Organizar menú».',
  next: ['ini-que-veo', 'ini-organizar'],
}

export const tutIniResenas: TourDef = {
  id: 'tut-ini-resenas',
  module: 'ayuda',
  group: 'Opinión',
  summary: 'Dónde valorar PEPA con estrellas y contar qué te gusta y qué no.',
  version: 1,
  title: 'Valorar PEPA y dejar una reseña',
  cardId: 'ini-resenas',
  durationSec: 80,
  startPath: '/',
  paths: ['/', '/resenas'],
  steps: [
    {
      id: 'abrir',
      text: 'Las reseñas están dentro del menú. Pulsa «☰ Menú».',
      target: 'nav.menu',
      completeOn: [
        { type: 'click', target: 'nav.menu' },
        { type: 'appear', target: 'nav.flyout' },
        { type: 'route', path: '/resenas' },
      ],
      skipIf: [
        { type: 'appear', target: 'nav.flyout' },
        { type: 'route', path: '/resenas' },
      ],
    },
    {
      id: 'entrar',
      text: 'Ahora pulsa «⭐ Reseñas y opiniones».',
      target: 'nav.resenas',
      completeOn: [
        { type: 'click', target: 'nav.resenas' },
        { type: 'route', path: '/resenas' },
      ],
      skipIf: [{ type: 'route', path: '/resenas' }],
    },
    {
      id: 'estrellas',
      text: 'Aquí valoras PEPA de 1 a 5 estrellas. Ojo: cada toque en una estrella guarda tu valoración al momento, así que elígela cuando lo tengas claro. Yo no las toco por ti. Puedes cambiarla cuando quieras.',
      target: 'resenas.general',
      ...info,
    },
    {
      id: 'comentario',
      text: 'Si quieres, abre «Contar qué me gusta y qué no» y escribe tu opinión. Primero hay que elegir las estrellas; el comentario se guarda con «Guardar comentario».',
      target: 'resenas.comentario',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Gracias por pensar en ello. Si lo que quieres es proponer un cambio, usa «Sugerencias» en el mismo menú.',
  next: ['ini-sugerencias', 'ini-que-veo'],
}
