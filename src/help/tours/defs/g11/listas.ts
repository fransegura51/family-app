import type { TourDef } from '@/help/tours/types'

// Mis listas (g11): visita «Conoce Mis listas» y tres tutoriales «Enséñame» (crear y escribir · importar · conectar con Calendario y Compras).
// Cada control señalado lleva su `data-help-id` en src/ui/lists/*. Ningún paso guarda, envía, comparte ni borra por la persona: los que
// escriben o guardan son `sensitive` o solo señalan y esperan, y todos se pueden abandonar con «Salir».

const info = { completeOn: [] as never[], manualNext: true }

export const visitaListas: TourDef = {
  id: 'visita-listas',
  kind: 'visit',
  module: 'listas',
  title: 'Conoce Mis listas',
  summary: 'Tus listas de tareas, ideas o comparativas, en carpetas, con formato y conectadas si quieres con el Calendario y la compra.',
  version: 1,
  cardId: 'listas-crear',
  durationSec: 80,
  startPath: '/listas',
  steps: [
    {
      id: 'buscar',
      text: 'Aquí buscas por título o por lo que hay escrito dentro de cualquier lista, también en las carpetas.',
      target: 'listas.buscar',
      ...info,
    },
    {
      id: 'nueva-lista',
      text: '«Nueva lista» crea una lista: le pones el título y eliges si es de tareas, de ideas o una comparativa (pros y contras u opciones en columnas). Empieza siendo privada: solo tú la ves.',
      target: 'listas.nueva-lista',
      ...info,
    },
    {
      id: 'nueva-carpeta',
      text: '«Nueva carpeta» sirve para agrupar listas. Arrastra una lista con ⠿ hasta la carpeta para meterla, o usa «Mover a…» en sus tres puntos. Meter una lista en una carpeta no cambia quién la ve.',
      target: 'listas.nueva-carpeta',
      ...info,
    },
    {
      id: 'lista',
      text: 'Toca una lista para abrirla. El candado 🔒 indica que es privada y 👪 que la ve la familia.',
      target: 'listas.lista',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es Mis listas. Para practicar, prueba el «Enséñame»: crear una lista y escribir en ella, importar de una foto o conectarla con el Calendario y la compra.',
  next: ['listas-crear', 'listas-importar', 'listas-conectar'],
}

export const tutListasCrear: TourDef = {
  id: 'tut-listas-crear',
  module: 'listas',
  group: 'Crear y escribir',
  summary: 'Crea una lista, añade elementos y dales formato.',
  version: 1,
  title: 'Crear una lista y escribir en ella',
  cardId: 'listas-crear',
  durationSec: 100,
  startPath: '/listas',
  readyOn: ['listas.nueva-lista'],
  steps: [
    {
      id: 'nueva',
      text: 'Vamos a crear una lista. No se crea nada hasta que pulses «Crear» en la ventana que se abre. Pulsa «Nueva lista».',
      target: 'listas.nueva-lista',
      completeOn: [{ type: 'click', target: 'listas.nueva-lista' }],
    },
    {
      id: 'abrir',
      text: 'Escribe el título, elige el tipo y pulsa «Crear». Yo no la creo por ti. Cuando se abra la lista, seguiré.',
      target: 'listas.crear',
      completeOn: [{ type: 'event', name: 'lists.list-created' }],
      sensitive: true,
    },
    {
      id: 'anadir',
      text: 'Pulsa «Añadir elemento» y escribe. Con Intro se guarda y empiezas otro debajo; al terminar, pulsa «Listo».',
      target: 'listas.anadir-elemento',
      completeOn: [{ type: 'appear', target: 'listas.editor' }],
    },
    {
      id: 'formato',
      text: 'Mientras editas aparece la barra de formato: N pone negrita, el círculo de colores cambia el color, «Tx» quita el formato y ⇥ ⇤ cambian la sangría para hacer subelementos. Se aplica a las palabras que selecciones. Para seguir, pulsa «Siguiente».',
      target: 'listas.editor',
      ...info,
    },
    {
      id: 'casilla',
      text: 'La casilla de la izquierda marca el elemento como hecho; tócalo otra vez para desmarcarlo. Para cambiar un texto, tócalo; para borrarlo, deslízalo hacia la izquierda (puedes deshacerlo unos segundos).',
      target: 'listas.casilla',
      ...info,
      optional: true,
    },
  ],
  finishText: '¡Listo! Los tres puntos de la lista tienen más opciones: importar, enviar a la compra, cambiar la privacidad, duplicar o archivar.',
  next: ['listas-importar', 'listas-conectar'],
}

export const tutListasImportar: TourDef = {
  id: 'tut-listas-importar',
  module: 'listas',
  group: 'Importar',
  summary: 'Importa elementos desde una foto, un PDF, la voz o texto pegado.',
  version: 1,
  title: 'Importar una lista desde una foto, un PDF o la voz',
  cardId: 'listas-importar',
  durationSec: 90,
  startPath: '/listas',
  readyOn: ['listas.nueva-lista'],
  steps: [
    {
      id: 'abre-lista',
      text: 'Abre una lista (o crea una). Cuando estés dentro, seguiré.',
      completeOn: [{ type: 'appear', target: 'listas.menu' }],
    },
    {
      id: 'menu',
      text: 'Pulsa los tres puntos de la lista.',
      target: 'listas.menu',
      completeOn: [{ type: 'click', target: 'listas.menu' }, { type: 'appear', target: 'listas.importar' }],
      skipIf: [{ type: 'appear', target: 'listas.importar' }],
    },
    {
      id: 'importar',
      text: 'Elige «Importar». Puedes hacer una foto, elegir una de la galería o un PDF; recuadras solo la parte de la lista y PEPA la lee. También puedes dictar o pegar texto. Nada se guarda todavía.',
      target: 'listas.importar',
      completeOn: [{ type: 'click', target: 'listas.importar' }],
    },
    {
      id: 'revisar',
      text: 'Antes de guardar siempre ves una vista previa que puedes corregir; lo que no se leyó con seguridad sale marcado «revisar». Después eliges si añadir a esta lista, sustituir lo que hay, crear una lista nueva o añadir a otra. «Cancelar» no cambia nada. Yo no guardo nada por ti.',
      ...info,
    },
  ],
  finishText: 'Eso es todo: PEPA solo propone, tú decides qué se guarda y dónde.',
  next: ['listas-crear', 'listas-conectar'],
}

export const tutListasConectar: TourDef = {
  id: 'tut-listas-conectar',
  module: 'listas',
  group: 'Conectar',
  summary: 'Decide quién ve la lista y conéctala, si quieres, con el Calendario y la Lista de la compra.',
  version: 1,
  title: 'Privacidad, Calendario y Lista de la compra',
  cardId: 'listas-conectar',
  durationSec: 100,
  startPath: '/listas',
  readyOn: ['listas.nueva-lista'],
  steps: [
    {
      id: 'abre-lista',
      text: 'Abre una de tus listas. Cuando estés dentro, seguiré.',
      completeOn: [{ type: 'appear', target: 'listas.privacidad' }],
    },
    {
      id: 'privacidad',
      text: 'Aquí ves si la lista es privada (solo tú) o familiar (la ve y edita la familia). Tócalo para cambiarlo cuando quieras; no se pierde nada. Para seguir, pulsa «Siguiente».',
      target: 'listas.privacidad',
      ...info,
    },
    {
      id: 'menu',
      text: 'Pulsa los tres puntos de la lista.',
      target: 'listas.menu',
      completeOn: [{ type: 'click', target: 'listas.menu' }],
      manualNext: true,
    },
    {
      id: 'compra',
      text: '«Enviar a Lista de la compra» te deja elegir qué elementos mandar. La lista original no cambia, y lo que marques como comprado allí se marca como hecho aquí. Marcarlo hecho aquí no toca la compra. Para seguir, pulsa «Siguiente».',
      target: 'listas.enviar-compra',
      ...info,
    },
    {
      id: 'calendario',
      text: '«Vincular con el Calendario» conecta la lista con eventos o tareas. En ese evento aparecerá como «Listas vinculadas», y solo la verá quien tenga acceso a la lista. No crea avisos nuevos.',
      target: 'listas.vincular-calendario',
      ...info,
    },
  ],
  finishText: 'Todo es opcional: una lista funciona igual de bien sin vínculos.',
  next: ['listas-crear', 'listas-importar'],
}

export const TOURS_LISTAS: TourDef[] = [visitaListas, tutListasCrear, tutListasImportar, tutListasConectar]
