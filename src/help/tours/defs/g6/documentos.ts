import type { TourDef } from '@/help/tours/types'

// Documentos (g6): tutorial principal «Guardar y cuidar tus documentos» con cuatro capítulos (ver src/help/tours/series/d.ts): crear una carpeta · subir un documento · fecha de vencimiento
// y avisos · quién puede ver el documento y el candado. Cada secuencia está comprobada contra src/ui/DocumentsScreen.tsx y DocumentVisibilityPicker.tsx. Los pasos que guardan datos son
// `sensitive` y solo avanzan con el aviso `emitHelpEvent(...)` que la pantalla lanza DESPUÉS de que el servidor confirma. Ninguno borra, comparte ni pulsa nada por la persona; todos se
// pueden abandonar con «Salir» sin guardar.

const info = { completeOn: [] as never[], manualNext: true }

export const tutDocumentosCarpeta: TourDef = {
  id: 'tut-documentos-carpeta',
  module: 'documentos',
  group: 'Guardar y cuidar',
  summary: 'Crea una carpeta (categoría) nueva para tus documentos.',
  version: 2,
  title: 'Crear una carpeta de documentos',
  cardId: 'doc-subir',
  durationSec: 60,
  startPath: '/documentos',
  readyOn: ['documentos.carpetas'],
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a crear una carpeta. Se crea de verdad cuando pulses «+ Añadir categoría»; si solo practicas, sal del tutorial antes. Ahora pulsa «Nueva carpeta».',
      target: 'documentos.nueva-carpeta',
      completeOn: [
        { type: 'click', target: 'documentos.nueva-carpeta' },
        { type: 'appear', target: 'documentos.carpeta-nombre' },
      ],
      skipIf: [{ type: 'appear', target: 'documentos.carpeta-nombre' }],
    },
    {
      id: 'nombre',
      text: 'Escribe cómo se llama, por ejemplo «Coche» o «Salud». No se crea nada hasta que pulses el botón. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'documentos.carpeta-nombre',
      completeOn: [{ type: 'entered', target: 'documentos.carpeta-nombre', min: 2 }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «+ Añadir categoría»: la carpeta se crea de verdad. Yo no lo pulso por ti.',
      target: 'documentos.carpeta-guardar',
      completeOn: [{ type: 'event', name: 'documents.folder-created' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! La carpeta ya está en la cuadrícula, vacía. Al abrirla verás una subcarpeta por cada miembro de la familia y «Sin especificar»; los documentos se suben con «+ Subir foto».',
  next: ['doc-subir', 'doc-vencimiento'],
}

export const tutDocumentosSubir: TourDef = {
  id: 'tut-documentos-subir',
  module: 'documentos',
  group: 'Guardar y cuidar',
  summary: 'Sube una foto o un PDF a Documentos, con su título, su carpeta y de quién es.',
  version: 1,
  title: 'Subir un documento',
  cardId: 'doc-subir',
  durationSec: 100,
  startPath: '/documentos',
  readyOn: ['documentos.carpetas'],
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a guardar un documento. Se sube de verdad cuando pulses «Guardar»; si solo practicas, sal del tutorial antes. Pulsa el botón «+ Subir foto»: sirve para fotos y también para PDF.',
      target: 'documentos.subir',
      completeOn: [
        { type: 'click', target: 'documentos.subir' },
        { type: 'appear', target: 'documentos.archivo' },
      ],
      skipIf: [{ type: 'appear', target: 'documentos.archivo' }],
    },
    {
      id: 'archivo',
      text: 'Bajo «Archivo», elige «📷 Foto» o «📄 PDF» y busca el documento. No se sube nada hasta que pulses «Guardar»; cuando lo elijas, seguiré yo.',
      target: 'documentos.archivo',
      native: true,
      skipLabel: 'Continuar sin archivo',
      completeOn: [{ type: 'appear', target: 'documentos.detectar' }],
    },
    {
      id: 'titulo',
      text: 'Ponle un título, por ejemplo «DNI de Ana». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'documentos.titulo',
      completeOn: [{ type: 'entered', target: 'documentos.titulo', min: 2 }],
      manualNext: true,
    },
    {
      id: 'carpeta',
      text: 'Elige en qué carpeta (categoría) va. Si no eliges ninguna, queda en «Sin categoría». Si ya está bien, pulsa «Siguiente».',
      target: 'documentos.categoria',
      completeOn: [{ type: 'change', target: 'documentos.categoria' }],
      manualNext: true,
    },
    {
      id: 'persona',
      text: '«A quién» es de quién es el documento. Si eliges a alguien, se guarda en su subcarpeta; con «Sin especificar» no se asigna a nadie. Si ya está bien, pulsa «Siguiente».',
      target: 'documentos.persona',
      completeOn: [{ type: 'change', target: 'documentos.persona' }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Guardar»: el documento se sube de verdad y lo verá toda la familia, salvo que elijas otra cosa en «¿Quién puede ver este documento?». Yo no lo pulso por ti.',
      target: 'documentos.guardar',
      completeOn: [{ type: 'event', name: 'documents.document-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El documento ya está guardado en su carpeta. En los siguientes capítulos te enseño a ponerle fecha de vencimiento y a decidir quién puede verlo.',
  next: ['doc-vencimiento', 'doc-subir'],
}

export const tutDocumentosSubirVencimiento: TourDef = {
  id: 'tut-documentos-subir-vencimiento',
  module: 'documentos',
  group: 'Guardar y cuidar',
  summary: 'Ponle fecha de vencimiento a un documento para que PEPA te avise antes de que caduque.',
  version: 2,
  title: 'Fecha de vencimiento y avisos',
  cardId: 'doc-vencimiento',
  durationSec: 110,
  startPath: '/documentos',
  readyOn: ['documentos.carpetas'],
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a subir un documento con fecha de vencimiento. Se guarda de verdad cuando pulses «Guardar»; si solo practicas, sal del tutorial antes. Pulsa «+ Subir foto».',
      target: 'documentos.subir',
      completeOn: [
        { type: 'click', target: 'documentos.subir' },
        { type: 'appear', target: 'documentos.archivo' },
      ],
      skipIf: [{ type: 'appear', target: 'documentos.archivo' }],
    },
    {
      id: 'archivo',
      text: 'Bajo «Archivo», elige «📷 Foto» o «📄 PDF» y busca el documento. No se sube nada hasta que pulses «Guardar»; cuando lo elijas, seguiré yo.',
      target: 'documentos.archivo',
      native: true,
      skipLabel: 'Continuar sin archivo',
      completeOn: [{ type: 'appear', target: 'documentos.detectar' }],
    },
    {
      id: 'detectar',
      text: '«🔍 Detectar caducidad» es opcional: envía el archivo a la IA de PEPA para que lea la fecha. Solo se usa si tú lo pulsas y debes revisar lo que rellene. Si prefieres, escribe la fecha tú.',
      target: 'documentos.detectar',
      ...info,
      optional: true,
    },
    {
      id: 'titulo',
      text: 'Ponle un título, por ejemplo «DNI de Ana». Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'documentos.titulo',
      completeOn: [{ type: 'entered', target: 'documentos.titulo', min: 2 }],
      manualNext: true,
    },
    {
      id: 'vencimiento',
      text: 'Pon la fecha de vencimiento del documento. Cuando la hayas elegido seguiré yo. Si este documento no caduca, déjala vacía y pulsa «Siguiente»: entonces no se crea ningún aviso.',
      target: 'documentos.vencimiento',
      native: true,
      completeOn: [{ type: 'confirmed', target: 'documentos.vencimiento' }],
      manualNext: true,
    },
    {
      id: 'aviso',
      text: 'Con fecha, PEPA crea en el Calendario un evento de todo el día llamado «Vence: (título)» y programa avisos 30, 7 y 1 día antes. Si el documento es restringido, ese evento es solo tuyo.',
      target: 'documentos.aviso-vencimiento',
      ...info,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Guardar»: el documento se sube de verdad y, si pusiste fecha, se crea el aviso. Yo no lo pulso por ti.',
      target: 'documentos.guardar',
      completeOn: [{ type: 'event', name: 'documents.document-added' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! El documento ya está guardado. Si pusiste fecha, la verás en el Calendario como «Vence: …» y recibirás los avisos si tienes las notificaciones activadas. Para cambiar la fecha más tarde, usa ✏️ en el documento.',
  next: ['doc-vencimiento', 'not-activar', 'doc-subir'],
}

export const tutDocumentosQuienVe: TourDef = {
  id: 'tut-documentos-quien-ve',
  module: 'documentos',
  group: 'Guardar y cuidar',
  summary: 'Elige quién puede ver un documento, entiende el candado 🔒 y quién puede cambiarlo o borrarlo.',
  version: 1,
  title: 'Quién puede ver el documento y el candado',
  cardId: 'doc-subir',
  durationSec: 110,
  startPath: '/documentos',
  readyOn: ['documentos.carpetas'],
  steps: [
    {
      id: 'abrir',
      text: 'Este capítulo solo enseña las opciones: no hace falta guardar nada. Pulsa «+ Subir foto» para ver el formulario.',
      target: 'documentos.subir',
      completeOn: [
        { type: 'click', target: 'documentos.subir' },
        { type: 'appear', target: 'documentos.quien-ve' },
      ],
      skipIf: [{ type: 'appear', target: 'documentos.quien-ve' }],
    },
    {
      id: 'quien-ve',
      text: '«¿Quién puede ver este documento?»: «Toda la familia», «Solo yo» o «Elegir personas» (marcas quién sí). Quien no figura no lo ve en ningún dispositivo. Cambia la opción para probar: todavía no se guarda nada.',
      target: 'documentos.quien-ve',
      completeOn: [{ type: 'change', target: 'documentos.quien-ve' }],
      manualNext: true,
    },
    {
      id: 'privado',
      text: 'Un documento restringido solo lo cambia o borra quien lo subió; la administración tampoco lo ve si no la has incluido. Y el aviso de vencimiento de un documento restringido es solo de quien lo sube.',
      target: 'documentos.quien-ve',
      ...info,
    },
    {
      id: 'cerrar',
      text: 'Cierra el formulario con la ✕ para no guardar nada.',
      target: 'documentos.subir-cerrar',
      completeOn: [{ type: 'click', target: 'documentos.subir-cerrar' }],
      manualNext: true,
    },
    {
      id: 'carpetas',
      text: 'Para ver el candado, abre una carpeta y, dentro, la subcarpeta de una persona: ahí salen sus documentos. Cuando los veas, pulsa «Siguiente».',
      target: 'documentos.carpetas',
      ...info,
    },
    {
      id: 'candado',
      text: 'Un documento restringido lleva el candado 🔒: «Solo quien lo subió» o «Lo ven: …». Los de toda la familia no llevan candado.',
      target: 'documentos.candado',
      ...info,
      optional: true,
    },
    {
      id: 'acciones',
      text: 'Cada documento tiene 👁 ver, 📤 compartir, ✏️ cambiar título, fecha y quién lo ve, y ✕ eliminar. ✏️ y ✕ solo salen si puedes gestionarlo. Yo no pulso ninguno.',
      target: 'documentos.acciones',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Para cambiar quién ve un documento tuyo más tarde, usa ✏️ en su fila. Yo no he guardado ni cambiado nada.',
  next: ['doc-subir', 'doc-vencimiento'],
}

export const TOURS_DOCUMENTOS: TourDef[] = [tutDocumentosCarpeta, tutDocumentosSubir, tutDocumentosSubirVencimiento, tutDocumentosQuienVe]
