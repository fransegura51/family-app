import type { TourDef } from '@/help/tours/types'

// Pequeños Grandes (grupo g9): «Mi Camino» y el monedero de Educación financiera. Marcas `data-help-id` en src/ui/RewardsScreen.tsx, src/ui/MiCamino.tsx, src/ui/PequenosGrandesScreen.tsx
// y src/ui/FinanceScreen.tsx (KidsFinanceTab). Los dos son solo de mirar: Mi Camino es de solo lectura y en el monedero no se apunta ningún ingreso, gasto ni objetivo.

export const tutPequenosMiCamino: TourDef = {
  id: 'tut-pequenos-mi-camino',
  module: 'pequenos',
  group: 'Puntos',
  summary: 'Entiende Mi Camino: el viaje por tres mundos con los puntos ganados.',
  version: 1,
  title: 'Mi Camino: el viaje por los tres mundos',
  cardId: 'pg-mi-camino',
  durationSec: 100,
  startPath: '/puntos',
  startDest: 'pequenos.recompensas',
  steps: [
    {
      id: 'puntos',
      text: 'Aquí están los puntos de cada niño o niña. Con el «Camino de recompensas» activado, la pista es Mi Camino. Esta visita solo mira: no cambia puntos.',
      target: 'pequenos.puntos-por-persona',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'modo',
      text: 'Si eres adulto, este botón elige entre «Camino» y «Carrera mensual». Es un ajuste de toda la familia. Yo no lo cambio: si quieres, mira las opciones y pulsa «Siguiente».',
      target: 'pequenos.camino-modo',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'camino',
      text: 'Esto es Mi Camino: un viaje por tres mundos de 150 puntos cada uno (Pueblo de las Golosinas, Reino submarino y Planeta Espacial). A los 450 puntos vuelve a empezar, sin perder nada.',
      target: 'pequenos.camino',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'ninos',
      text: 'Debajo hay una tarjeta por niño o niña, con sus puntos y lo que le falta para el siguiente mundo. Toca la de uno para ver su camino.',
      target: 'pequenos.camino-ninos',
      completeOn: [{ type: 'click', target: 'pequenos.camino-ninos' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'disponibles',
      text: 'El Camino cuenta lo ganado y nunca baja al canjear un premio. Lo que sí baja al canjear son los «Puntos disponibles», que son los que se pueden gastar.',
      target: 'pequenos.puntos-disponibles',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'espacio',
      text: 'Cuando llega al Planeta Espacial, se pueden tocar los planetas para leer curiosidades. Mi Camino es solo para mirar: no da premios ni cambia nada.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: '¡Eso es Mi Camino! Para dar puntos o canjear premios, pídeme los tutoriales de Puntos y recompensas.',
  next: ['pg-puntos', 'pg-recompensas', 'pg-monedero'],
}

export const tutPequenosMonedero: TourDef = {
  id: 'tut-pequenos-monedero',
  module: 'pequenos',
  group: 'Educación financiera',
  summary: 'Conoce el monedero de los niños: las cuatro tarjetas, el reparto y los objetivos de ahorro.',
  version: 1,
  title: 'El monedero y los objetivos de ahorro',
  cardId: 'pg-monedero',
  durationSec: 110,
  startPath: '/puntos',
  startDest: 'pequenos.inicio',
  steps: [
    {
      id: 'entrar',
      text: 'Toca la tarjeta «Educación financiera». Esta visita solo mira: no apunta ningún ingreso ni gasto.',
      target: 'pequenos.tarjeta-educacion',
      completeOn: [
        { type: 'click', target: 'pequenos.tarjeta-educacion' },
        { type: 'appear', target: 'finance.kids-ninos' },
      ],
      skipIf: [{ type: 'appear', target: 'finance.kids-ninos' }],
    },
    {
      id: 'ninos',
      text: 'Arriba eliges a qué niño o niña miras: cada uno tiene su propio monedero.',
      target: 'finance.kids-ninos',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'objetivo',
      text: '«+ Nuevo objetivo de ahorro»: se pone un título, cuánto cuesta y, si quieres, un emoji o una foto. Cuando lo ahorrado llega al coste, hay una pequeña celebración. Aquí no creo ninguno.',
      target: 'finance.kids-objetivo',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'dinero',
      text: '«Mi dinero ahora» suma lo que hay en la hucha y lo que queda para gastar.',
      target: 'finance.kids-dinero',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'tarjetas',
      text: 'Las cuatro tarjetas son Recibido, Ahorro, Para gastar e Impuestos. Toca «Recibido» para ver su historial y el reparto automático, o pulsa «Siguiente».',
      target: 'finance.kids-tarjetas',
      completeOn: [{ type: 'appear', target: 'finance.kids-reparto' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'reparto',
      text: 'Cada ingreso se reparte solo entre ahorro, impuestos y lo que queda disponible. Un adulto puede cambiarlo con «✏️ Editar reparto», y solo afecta a los ingresos futuros.',
      target: 'finance.kids-reparto',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'aparte',
      text: 'Recuerda: es un monedero de aprendizaje, aparte de las cuentas bancarias reales. Nada de lo que se apunta aquí mueve dinero de verdad.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: '¡Listo! Ya conoces el monedero de los niños. Si quieres crear un objetivo de ahorro, hazlo tú desde «+ Nuevo objetivo de ahorro».',
  next: ['pg-mi-camino', 'pg-puntos', 'pg-lista-deseos'],
}

export const TOURS_G9_PEQUENOS: TourDef[] = [tutPequenosMiCamino, tutPequenosMonedero]
