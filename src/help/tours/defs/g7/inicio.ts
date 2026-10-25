import type { TourDef } from '@/help/tours/types'

// Inicio (g7): capítulos de la serie «Moverme y ordenar PEPA» (src/help/tours/series/e.ts): la barra y el menú ☰, elegir las cuatro secciones fijas y el carrusel. «Ordenar las tarjetas de Inicio» está en
// defs/g6/tutoriales.ts. Comprobado contra src/ui/HomeScreen.tsx, HomeCarouselSettings.tsx, NavShell.tsx y MenuSettingsScreen.tsx. Ninguno guarda nada ni pulsa por la persona: señalan y esperan.
// «PEPA te avisa» ya no es un tutorial (lo cubren la visita «Conoce Inicio» y la explicación «Cómo funciona»); su identificador antiguo apunta a «bienvenida» (aliases/e.ts).

const info = { completeOn: [] as never[], manualNext: true }

export const tutIniMenuYBarra: TourDef = {
  id: 'tut-ini-menu-y-barra',
  module: 'inicio',
  summary: 'La barra de abajo, el botón ☰ Menú y qué secciones hay dentro.',
  version: 2,
  title: 'La barra y el menú ☰',
  cardId: 'ini-menu-y-barra',
  durationSec: 60,
  startPath: '/',
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
      text: 'Aquí está el resto de secciones, además de Comunidad PEPA (si la tienes abierta), Ayuda, Sugerencias, Reseñas y opiniones y Configuración. Tócala y vas allí. Para cerrar el menú, pulsa ✕ o toca fuera.',
      target: 'nav.flyout',
      ...info,
    },
    {
      id: 'configuracion',
      text: '«Configuración» es la última de la lista: ahí se ajusta PEPA a tu gusto, por ejemplo cuáles son las cuatro secciones fijas de la barra. Te lo enseño en el siguiente capítulo.',
      target: 'nav.config',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Listo. La barra tiene tus cuatro secciones fijas y todo lo demás está detrás de «☰ Menú».',
  next: ['ini-que-veo', 'ini-menu-y-barra'],
}

export const tutIniSeccionesFijas: TourDef = {
  id: 'tut-ini-secciones-fijas',
  module: 'inicio',
  summary: 'Elegir cuáles son las cuatro secciones fijas de la barra de abajo y en qué orden van.',
  version: 1,
  title: 'Elegir las 4 secciones fijas',
  cardId: 'ini-menu-y-barra',
  durationSec: 80,
  startPath: '/menu-organizar',
  startDest: 'config.menu',
  readyOn: ['config.menu-order'],
  steps: [
    {
      id: 'lista',
      text: 'Esta lista es tu menú. Las cuatro primeras (📌) quedan fijas abajo; el resto aparece al tocar «☰ Menú». Con ↑ y ↓ cambias una sección de sitio.',
      target: 'config.menu-order',
      ...info,
    },
    {
      id: 'mover',
      text: 'Pulsa ↑ o ↓ junto a una sección para moverla (te señalo un ↑ de ejemplo). Se guarda al momento, en tu cuenta, y puedes volver a dejarlo como estaba. Si solo estás practicando, pulsa «Salir».',
      target: 'config.menu-move',
      completeOn: [{ type: 'event', name: 'config.menu-order-changed' }],
      sensitive: true,
    },
    {
      id: 'resultado',
      text: 'Ya está movida: la barra de abajo se actualiza sola. Mueve más si quieres; cuando termines, pulsa «Siguiente». Este orden es solo tuyo.',
      target: 'config.menu-order',
      ...info,
    },
  ],
  finishText: 'Listo. Tu menú queda como lo has dejado y lo ves igual en tus dispositivos. Cuando quieras cambiarlo, vuelve a Configuración → «Organizar menú».',
  next: ['ini-menu-y-barra', 'ini-organizar'],
}

export const tutIniCarrusel: TourDef = {
  id: 'tut-ini-carrusel',
  module: 'inicio',
  summary: 'Qué muestra el carrusel de Inicio y cómo elegir sus diapositivas y sus fotos.',
  version: 1,
  title: 'El carrusel de Inicio',
  cardId: 'ini-que-veo',
  durationSec: 80,
  startPath: '/',
  readyOn: ['inicio.carrusel-ajustes'],
  needs: [
    {
      target: 'inicio.carrusel-ajustes',
      message: 'No veo el carrusel en Inicio: está oculto o todavía no hay nada que enseñar. Para recuperarlo, abre Configuración → «Inicio» y marca «Mostrar el carrusel en Inicio». Puedes verlo solo leyendo.',
    },
  ],
  steps: [
    {
      id: 'carrusel',
      text: 'Este es el carrusel: va pasando solo por la compra pendiente, lo de hoy en el calendario, Comunidad (si la tienes abierta) y fotos de la Galería. Pon el dedo encima para pararlo; desliza para pasar.',
      target: 'inicio.carrusel',
      ...info,
    },
    {
      id: 'engranaje',
      text: 'Pulsa el engranaje ⚙️ de la esquina para elegir qué quieres ver. Aquí no se borra nada: solo se esconde.',
      target: 'inicio.carrusel-ajustes',
      completeOn: [
        { type: 'click', target: 'inicio.carrusel-ajustes' },
        { type: 'appear', target: 'inicio.carrusel-form' },
      ],
      skipIf: [{ type: 'appear', target: 'inicio.carrusel-form' }],
    },
    {
      id: 'piezas',
      text: 'Cada casilla se guarda al marcarla: puedes quitar o poner la lista de la compra, el calendario, Comunidad y las fotos, o esconder todo el carrusel. Es solo tuyo. Aquí no marco nada por ti.',
      target: 'inicio.carrusel-form',
      ...info,
    },
    {
      id: 'fotos',
      text: 'En «Qué fotografías se enseñan» eliges «Al azar» (hasta 5 de tu Galería PEPA, distintas cada vez) o «Elegir hasta 5 fijas». Solo salen fotos de la Galería PEPA, no de la galería del teléfono.',
      target: 'inicio.carrusel-fotos',
      ...info,
      optional: true,
    },
    {
      id: 'listo',
      text: 'Cuando termines, pulsa «Listo» para cerrar. Si algún día lo escondes todo, se recupera en Configuración → «Inicio».',
      target: 'inicio.carrusel-listo',
      completeOn: [{ type: 'click', target: 'inicio.carrusel-listo' }],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. El carrusel queda como lo has dejado, en tu cuenta.',
  next: ['ini-que-veo', 'ini-organizar'],
}

export const TOURS_INICIO_G7: TourDef[] = [tutIniMenuYBarra, tutIniSeccionesFijas, tutIniCarrusel]
