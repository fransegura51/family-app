import type { TourDef } from '@/help/tours/types'

// Contactos y Galería (grupo g9). Dos tutoriales principales de Contactos («Tu agenda familiar»: añadir · buscar y filtrar · editar, llamar y cumpleaños; e «Importar y compartir contactos»)
// y uno de Galería («Las fotos de la familia»: subir · ver grande y descripción · compartir), organizados en src/help/tours/series/d.ts. Marcas `data-help-id` en src/ui/ContactsScreen.tsx
// y src/ui/GalleryScreen.tsx. Los pasos que guardan son `sensitive` y esperan el aviso `emitHelpEvent(...)` de la pantalla DESPUÉS de que el servidor confirma. NINGÚN capítulo elige
// archivos, importa ni comparte por la persona: se señalan las tarjetas de importación y los botones de compartir y se explica; el botón que de verdad manda («📤 Compartir N…») solo se
// señala. «Compartir varios» sí se puede pulsar (solo activa las casillas, no manda nada) y el capítulo recuerda cómo cancelar la selección.

const info = { completeOn: [] as never[], manualNext: true }

// ───────────────────────────── Contactos · Tu agenda familiar
export const tutContactosAnadir: TourDef = {
  id: 'tut-contactos-anadir',
  module: 'contactos',
  group: 'Agenda',
  summary: 'Añade un contacto a la agenda de la familia.',
  version: 2,
  title: 'Añadir un contacto',
  cardId: 'con-agenda',
  durationSec: 100,
  startPath: '/contactos',
  readyOn: ['contactos.nuevo'],
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a añadir un contacto. Se guarda de verdad cuando pulses «Añadir» al final; si solo practicas, sal del tutorial antes. Ahora pulsa «+ Nuevo contacto».',
      target: 'contactos.nuevo',
      completeOn: [
        { type: 'click', target: 'contactos.nuevo' },
        { type: 'appear', target: 'contactos.nombre' },
      ],
      skipIf: [{ type: 'appear', target: 'contactos.nombre' }],
    },
    {
      id: 'nombre',
      text: 'Escribe el nombre, por ejemplo «Colegio Los Álamos». Si ya existe un contacto con ese mismo nombre, PEPA rellena el resto con sus datos y aún puedes cambiarlos. Cuando termines, pulsa ✓ o «Siguiente».',
      target: 'contactos.nombre',
      completeOn: [{ type: 'entered', target: 'contactos.nombre', min: 2 }],
      manualNext: true,
    },
    {
      id: 'categoria',
      text: 'La categoría agrupa los contactos: Colegio, Médico, Emergencia, Familia, Otros… o una nueva que escribas. Ojo: viene ya puesta «Colegio»; si no la cambias, el contacto se guarda en Colegio.',
      target: 'contactos.categoria',
      ...info,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'telefono',
      text: 'Con un teléfono, la ficha tendrá el botón 📞 para llamar directamente. Es opcional.',
      target: 'contactos.telefono',
      ...info,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'email',
      text: 'El email también es opcional; se verá en la ficha.',
      target: 'contactos.email',
      ...info,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'cumpleanos',
      text: 'Si pones su cumpleaños, saldrá también en Cumpleaños y en el Calendario, y entrará en el aviso diario de las 09:00 (cumpleaños de hoy y de mañana). Es opcional.',
      target: 'contactos.cumpleanos',
      native: true,
      ...info,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'notas',
      text: 'En notas puedes apuntar lo que quieras recordar, como un horario o una extensión. Es opcional.',
      target: 'contactos.notas',
      ...info,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Añadir»: el contacto se guarda de verdad. Yo no lo pulso por ti.',
      target: 'contactos.anadir',
      completeOn: [{ type: 'event', name: 'contacts.contact-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El contacto ya está en la agenda. Para cambiarlo más tarde, usa ✏️ en su ficha.',
  next: ['con-agenda', 'con-importar', 'con-compartir'],
}

export const tutContactosBuscar: TourDef = {
  id: 'tut-contactos-buscar',
  module: 'contactos',
  group: 'Agenda',
  summary: 'Busca un contacto por nombre y filtra por categoría.',
  version: 2,
  title: 'Buscar y filtrar contactos',
  cardId: 'con-agenda',
  durationSec: 60,
  startPath: '/contactos',
  readyOn: ['contactos.buscar'],
  steps: [
    {
      id: 'buscar',
      text: 'Escribe parte de un nombre en el buscador. Busca solo por nombre (no por teléfono) y no distingue mayúsculas ni tildes. Cuando termines, pulsa ✓ o «Siguiente».',
      target: 'contactos.buscar',
      completeOn: [{ type: 'entered', target: 'contactos.buscar', min: 1 }],
      manualNext: true,
    },
    {
      id: 'categorias',
      text: 'Estos botones filtran por categoría: «Todas» o solo una. Se combinan con el buscador. Toca uno para probar, o pulsa «Siguiente».',
      target: 'contactos.categorias',
      completeOn: [{ type: 'click', target: 'contactos.categorias' }],
      manualNext: true,
    },
    {
      id: 'lista',
      text: 'Aquí salen los contactos que cumplen las dos cosas. Si no hay ninguno, dice «No hay contactos que coincidan.». Para verlos todos, borra el buscador y pulsa «Todas».',
      target: 'contactos.lista',
      ...info,
    },
  ],
  finishText: '¡Listo! No se ha guardado nada: buscar y filtrar solo cambian lo que ves.',
  next: ['con-agenda', 'con-importar'],
}

export const tutContactosAcciones: TourDef = {
  id: 'tut-contactos-acciones',
  module: 'contactos',
  group: 'Agenda',
  summary: 'Llamar a un contacto, ponerle cumpleaños y editar sus datos.',
  version: 1,
  title: 'Editar, llamar y añadir cumpleaños',
  cardId: 'con-agenda',
  durationSec: 90,
  startPath: '/contactos',
  readyOn: ['contactos.lista'],
  needs: [{ target: 'contactos.editar', message: 'Para este capítulo necesitas al menos un contacto en la agenda. Añade uno con el capítulo «Añadir un contacto» y vuelve aquí. Mientras tanto puedes verlo solo leyendo.' }],
  steps: [
    {
      id: 'acciones',
      text: 'En cada contacto: 📞 llama (solo si tiene teléfono), 📤 lo comparte, ✏️ lo edita y ✕ lo elimina (te pregunta antes). Yo no pulso ninguno. Si al final guardas un cambio, se guarda de verdad.',
      target: 'contactos.acciones',
      ...info,
    },
    {
      id: 'cumple',
      text: 'Debajo del nombre, «🎂 Añadir cumpleaños» (o su fecha) lo pone o lo cambia ahí mismo. Con cumpleaños, el contacto sale en Cumpleaños y en el Calendario y entra en el aviso diario de las 09:00.',
      target: 'contactos.cumple-ficha',
      ...info,
    },
    {
      id: 'editar',
      text: 'Para cambiar sus datos, pulsa ✏️ en el contacto.',
      target: 'contactos.editar',
      completeOn: [
        { type: 'click', target: 'contactos.editar' },
        { type: 'appear', target: 'contactos.editar-form' },
      ],
      skipIf: [{ type: 'appear', target: 'contactos.editar-form' }],
    },
    {
      id: 'formulario',
      text: 'Cambia lo que necesites: nombre, categoría, teléfono, email, cumpleaños o notas. Todavía no se guarda nada.',
      target: 'contactos.editar-form',
      ...info,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Guardar» para guardar los cambios de verdad. Yo no lo pulso por ti. Si no quieres cambiar nada, pulsa «Cancelar» y sal del tutorial.',
      target: 'contactos.editar-guardar',
      completeOn: [{ type: 'event', name: 'contacts.contact-edited' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! Los cambios del contacto están guardados. Para llamarle, pulsa 📞 en su ficha (solo sale si tiene teléfono).',
  next: ['con-agenda', 'cum-ver'],
}

// ───────────────────────────── Contactos · Importar y compartir contactos
export const tutContactosImportar: TourDef = {
  id: 'tut-contactos-importar',
  module: 'contactos',
  group: 'Importar y compartir',
  summary: 'Trae contactos de la agenda del móvil, de un archivo .vcf o los cumpleaños de Google.',
  version: 2,
  title: 'Importar contactos',
  cardId: 'con-importar',
  durationSec: 100,
  startPath: '/contactos',
  readyOn: ['contactos.importar-vcf'],
  steps: [
    {
      id: 'vcf',
      text: 'Con un archivo .vcf (por ejemplo, exportado de Contactos del iPhone) eliges el archivo aquí y marcas cuáles añadir. Los que ya tienes salen sin marcar; si los marcas, solo se completan los datos que les falten.',
      target: 'contactos.importar-vcf',
      ...info,
    },
    {
      id: 'ics',
      text: 'Para los cumpleaños, exporta el calendario «Cumpleaños» de Google Calendar a un archivo .ics, súbelo aquí y marca los que quieras añadir.',
      target: 'contactos.importar-ics',
      ...info,
    },
    {
      id: 'telefono',
      text: '«Importar del teléfono» abre la agenda de tu móvil para que marques los que quieras traer. Solo sale en navegadores que lo permiten, normalmente Chrome o Edge en Android. Aquí solo lo miramos.',
      target: 'contactos.importar-telefono',
      ...info,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Primero salen los contactos encontrados con casillas, y un botón los guarda: «Importar N» con el .vcf y con los cumpleaños, y «Añadir N contactos» con la agenda del teléfono. Ese botón lo pulsas tú; yo no importo nada.',
      ...info,
    },
  ],
  finishText: 'Eso es todo. No he importado nada: cuando quieras traer contactos, elige el archivo tú y revisa las casillas antes de importar.',
  next: ['con-agenda', 'con-compartir', 'cum-ver'],
}

export const tutContactosCompartir: TourDef = {
  id: 'tut-contactos-compartir',
  module: 'contactos',
  group: 'Importar y compartir',
  summary: 'Comparte un contacto o varios a la vez (sin mandar nada por ti).',
  version: 2,
  title: 'Compartir contactos',
  cardId: 'con-compartir',
  durationSec: 90,
  startPath: '/contactos',
  readyOn: ['contactos.lista'],
  needs: [{ target: 'contactos.compartir-uno', message: 'Para este capítulo necesitas al menos un contacto en la agenda. Añade uno con el capítulo «Añadir un contacto» y vuelve aquí. Mientras tanto puedes verlo solo leyendo.' }],
  steps: [
    {
      id: 'uno',
      text: 'El icono 📤 de cada ficha manda ese contacto (nombre, teléfono y email) con el menú de compartir del móvil. Aquí solo te lo señalo: yo no lo pulso. En este capítulo no se manda nada por ti.',
      target: 'contactos.compartir-uno',
      ...info,
    },
    {
      id: 'varios',
      text: 'Para mandar varios juntos, pulsa «📤 Compartir varios». Aparecen casillas en cada contacto; todavía no se manda nada.',
      target: 'contactos.compartir-varios',
      completeOn: [{ type: 'appear', target: 'contactos.casilla' }],
      manualNext: true,
    },
    {
      id: 'marcar',
      text: 'Marca las casillas de los contactos que quieras mandar. Al marcar el primero aparece el botón de enviar y sigo yo; si no quieres marcar ninguno, pulsa «Siguiente».',
      target: 'contactos.lista',
      completeOn: [{ type: 'appear', target: 'contactos.mandar-seleccion' }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'Este botón («📤 Compartir N contactos») es el que manda. Lo pulsas tú y eliges por dónde enviarlos. Yo no lo pulso. Para dejarlo, pulsa «Cancelar selección».',
      target: 'contactos.mandar-seleccion',
      keepVisible: ['contactos.compartir-varios'],
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he compartido nada. Si te quedas con las casillas puestas, pulsa «Cancelar selección» para volver a la lista normal.',
  next: ['con-agenda', 'con-importar'],
}

// ───────────────────────────── Galería · Las fotos de la familia
export const tutGaleriaSubirFoto: TourDef = {
  id: 'tut-galeria-subir-foto',
  module: 'galeria',
  group: 'Fotos',
  summary: 'Sube una foto a la Galería de la familia.',
  version: 2,
  title: 'Subir una foto a la Galería',
  cardId: 'gal-subir',
  durationSec: 60,
  startPath: '/galeria',
  readyOn: ['gallery.upload-form'],
  steps: [
    {
      id: 'foto',
      text: 'Abajo está el formulario «Subir foto». Se sube de verdad cuando pulses «Subir»; si solo practicas, sal del tutorial antes. Toca el campo «Foto» y elige una imagen de tu móvil; cuando la elijas, seguiré yo.',
      target: 'gallery.photo-file',
      native: true,
      skipLabel: 'Continuar sin foto',
      completeOn: [
        { type: 'filled', target: 'gallery.photo-file' },
        { type: 'change', target: 'gallery.photo-file' },
      ],
    },
    {
      id: 'descripcion',
      text: 'Si quieres, escribe una descripción: saldrá bajo la foto. Es opcional y puedes cambiarla después. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'gallery.photo-caption',
      completeOn: [{ type: 'entered', target: 'gallery.photo-caption', min: 1 }],
      manualNext: true,
    },
    {
      id: 'subir',
      text: 'Cuando quieras, pulsa «Subir»: la foto se sube de verdad y la verá toda la familia. Yo no lo pulso por ti.',
      target: 'gallery.upload-save',
      completeOn: [{ type: 'event', name: 'gallery.photo-uploaded' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! Tu foto ya está en la Galería. También puede salir en el carrusel de Inicio (entran hasta 5 fotos). Para cambiar su descripción, ábrela en grande.',
  next: ['gal-ampliar', 'gal-compartir', 'ini-que-veo'],
}

export const tutGaleriaAmpliar: TourDef = {
  id: 'tut-galeria-ampliar',
  module: 'galeria',
  group: 'Fotos',
  summary: 'Abre una foto en grande, pasa a la siguiente y cámbiale la descripción.',
  version: 2,
  title: 'Ver una foto en grande y cambiar su descripción',
  cardId: 'gal-ampliar',
  durationSec: 70,
  startPath: '/galeria',
  readyOn: ['gallery.grid'],
  needs: [{ target: 'gallery.ampliar', message: 'Para este capítulo necesitas al menos una foto en la Galería. Sube una con el capítulo «Subir una foto» y vuelve aquí. Mientras tanto puedes verlo solo leyendo.' }],
  steps: [
    {
      id: 'tocar',
      text: 'Toca una foto de la galería para verla en grande. Al final, «Guardar descripción» cambia la descripción de verdad (la verá toda la familia); si solo practicas, sal del tutorial antes.',
      target: 'gallery.ampliar',
      completeOn: [{ type: 'appear', target: 'gallery.descripcion' }],
    },
    {
      id: 'navegar',
      text: 'Con «‹ Anterior» y «Siguiente ›» pasas a otra foto sin cerrar la ventana.',
      target: 'gallery.siguiente',
      keepVisible: ['gallery.anterior'],
      ...info,
      optional: true,
    },
    {
      id: 'descripcion',
      text: 'Escribe o cambia la descripción de la foto. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'gallery.descripcion',
      completeOn: [{ type: 'entered', target: 'gallery.descripcion', min: 1 }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Pulsa «Guardar descripción»: se guarda de verdad. Yo no lo pulso por ti. Si no quieres cambiar nada, cierra la ventana con la ✕ y sal del tutorial.',
      target: 'gallery.descripcion-guardar',
      completeOn: [{ type: 'event', name: 'gallery.caption-saved' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! La descripción queda guardada. Para volver a la galería, cierra la ventana con la ✕ de arriba a la derecha.',
  next: ['gal-compartir', 'gal-subir'],
}

export const tutGaleriaCompartir: TourDef = {
  id: 'tut-galeria-compartir',
  module: 'galeria',
  group: 'Fotos',
  summary: 'Comparte una foto o varias a la vez (sin mandar nada por ti).',
  version: 2,
  title: 'Compartir fotos de la Galería',
  cardId: 'gal-compartir',
  durationSec: 90,
  startPath: '/galeria',
  readyOn: ['gallery.grid'],
  needs: [{ target: 'gallery.share-one', message: 'Para este capítulo necesitas al menos una foto en la Galería. Sube una con el capítulo «Subir una foto» y vuelve aquí. Mientras tanto puedes verlo solo leyendo.' }],
  steps: [
    {
      id: 'uno',
      text: 'El icono 📤 de cada foto la manda al menú de compartir del móvil. Aquí solo te lo señalo: yo no lo pulso. En este capítulo no se manda nada por ti.',
      target: 'gallery.share-one',
      ...info,
    },
    {
      id: 'varios',
      text: 'Para mandar varias juntas, pulsa «📤 Compartir varias». Aparecen casillas en cada foto; todavía no se manda nada.',
      target: 'gallery.share-many',
      completeOn: [{ type: 'appear', target: 'gallery.casilla' }],
      manualNext: true,
    },
    {
      id: 'marcar',
      text: 'Marca las casillas de las fotos que quieras mandar. Al marcar la primera aparece el botón de enviar y sigo yo; si no quieres marcar ninguna, pulsa «Siguiente».',
      target: 'gallery.grid',
      completeOn: [{ type: 'appear', target: 'gallery.mandar-seleccion' }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'Este botón («📤 Compartir N fotos») es el que manda. Lo pulsas tú y eliges por dónde enviarlas. Yo no lo pulso. Para dejarlo, pulsa «Cancelar selección».',
      target: 'gallery.mandar-seleccion',
      keepVisible: ['gallery.share-many'],
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he compartido nada. Si te quedas con las casillas puestas, pulsa «Cancelar selección» para volver a la galería normal.',
  next: ['gal-subir', 'ini-que-veo'],
}

export const TOURS_G9_CONTACTOS_GALERIA: TourDef[] = [
  tutContactosAnadir,
  tutContactosBuscar,
  tutContactosAcciones,
  tutContactosImportar,
  tutContactosCompartir,
  tutGaleriaSubirFoto,
  tutGaleriaAmpliar,
  tutGaleriaCompartir,
]
