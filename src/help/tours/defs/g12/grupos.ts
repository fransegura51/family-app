import type { TourDef } from '@/help/tours/types'

// Gestión de grupos (g12): visita «Conoce Gestión de grupos» y siete capítulos «Enséñame» (crear · participantes · bote · WhatsApp · vincular · cerrar · copiar).
// Cada control señalado lleva su `data-help-id` en src/ui/groups/*. Ningún paso guarda, envía, comparte ni borra por la persona: los que guardan son `sensitive` y esperan el
// aviso de guardado, y los que abren WhatsApp o copian datos solo se señalan. Todos se pueden abandonar con «Salir».

const info = { completeOn: [] as never[], manualNext: true }
const PATHS = ['/grupos/*']

export const visitaGrupos: TourDef = {
  id: 'visita-grupos',
  kind: 'visit',
  module: 'grupos',
  title: 'Conoce Gestión de grupos',
  summary: 'Tus clases, equipos o grupos de amigos: participantes, botes compartidos para recaudar dinero, eventos y listas, todo en un sitio.',
  version: 1,
  cardId: 'grupos-crear',
  durationSec: 75,
  startPath: '/grupos',
  steps: [
    {
      id: 'buscar',
      text: 'Aquí buscas un grupo por su nombre, también dentro de las carpetas.',
      target: 'grupos.buscador',
      ...info,
    },
    {
      id: 'nuevo-grupo',
      text: '«Nuevo grupo» solo pide un nombre (por ejemplo «Clase de Eric»). Lo demás —participantes, botes, eventos— lo añades cuando lo necesites.',
      target: 'grupos.nuevo-grupo',
      ...info,
    },
    {
      id: 'nueva-carpeta',
      text: 'Las carpetas son opcionales y sirven para ordenar (Cole, Guardería, Fútbol…). Aparecen cerradas y no cambian quién ve cada grupo.',
      target: 'grupos.nueva-carpeta',
      ...info,
    },
    {
      id: 'recibir',
      text: 'Si otra persona de PEPA te pasa un grupo, aquí escribes su código, ves qué te llega y lo aceptas.',
      target: 'grupos.recibir',
      ...info,
    },
    {
      id: 'lista',
      text: 'Toca un grupo para abrirlo: verás sus participantes, sus botes y lo que tenga vinculado.',
      target: 'grupos.lista',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es Gestión de grupos. Para practicar, prueba el «Enséñame»: crear un grupo, añadir participantes, montar un bote o compartir los pendientes por WhatsApp.',
  next: ['grupos-crear', 'grupos-participantes', 'grupos-bote'],
}

export const tutGruposCrear: TourDef = {
  id: 'tut-grupos-crear',
  module: 'grupos',
  group: 'Empezar',
  summary: 'Crea un grupo con solo su nombre y ordénalo, si quieres, en carpetas.',
  version: 1,
  title: 'Crear un grupo y ordenarlo en carpetas',
  cardId: 'grupos-crear',
  durationSec: 70,
  startPath: '/grupos',
  paths: PATHS,
  readyOn: ['grupos.nuevo-grupo'],
  steps: [
    {
      id: 'carpetas',
      text: 'Las carpetas son opcionales: «Nueva carpeta» crea una para agrupar (Cole, Guardería…). Aparecen cerradas y se abren al tocarlas. Pulsa «Siguiente».',
      target: 'grupos.nueva-carpeta',
      ...info,
    },
    {
      id: 'nuevo',
      text: 'Vamos a crear un grupo. No se crea nada hasta que lo confirmes. Pulsa «Nuevo grupo».',
      target: 'grupos.nuevo-grupo',
      completeOn: [{ type: 'click', target: 'grupos.nuevo-grupo' }],
    },
    {
      id: 'crear',
      text: 'Escribe el nombre y pulsa «Crear grupo» (se guarda de verdad). Yo no lo creo por ti. Si no quieres crearlo ahora, pulsa «Salir».',
      target: 'grupos.crear-grupo',
      completeOn: [{ type: 'event', name: 'grupos.group-created' }],
      sensitive: true,
    },
    {
      id: 'dentro',
      text: 'Ya estás dentro del grupo. Desde aquí gestionas a sus participantes y, con «Añadir», creas botes, eventos o listas. Pulsa «Siguiente».',
      target: 'grupos.gestionar-participantes',
      ...info,
    },
  ],
  finishText: '¡Listo! Un grupo puede empezar vacío: añade lo que necesites cuando quieras.',
  next: ['grupos-participantes', 'grupos-bote'],
}

export const tutGruposParticipantes: TourDef = {
  id: 'tut-grupos-participantes',
  module: 'grupos',
  group: 'Empezar',
  summary: 'Añade personas una a una o importa toda la lista desde foto, PDF, Excel o texto.',
  version: 1,
  title: 'Añadir e importar participantes',
  cardId: 'grupos-participantes',
  durationSec: 90,
  startPath: '/grupos',
  paths: PATHS,
  readyOn: ['grupos.nuevo-grupo'],
  steps: [
    {
      id: 'abre-grupo',
      text: 'Abre un grupo (o créalo). Cuando estés dentro, seguiré.',
      completeOn: [{ type: 'appear', target: 'grupos.gestionar-participantes' }],
    },
    {
      id: 'gestionar',
      text: 'Pulsa «Gestionar participantes».',
      target: 'grupos.gestionar-participantes',
      completeOn: [{ type: 'click', target: 'grupos.gestionar-participantes' }, { type: 'appear', target: 'grupos.importar-participantes' }],
      skipIf: [{ type: 'appear', target: 'grupos.importar-participantes' }],
    },
    {
      id: 'importar',
      text: '«Importar lista» lee una foto, un PDF, un Excel o CSV o texto pegado, y también copia de otro de tus grupos. Si trae nombre y teléfono, los relaciona. Nada se guarda todavía.',
      target: 'grupos.importar-participantes',
      ...info,
    },
    {
      id: 'revisar',
      text: 'Antes de guardar ves una vista previa que puedes corregir; lo dudoso sale marcado y hay que revisarlo, y si alguien ya existe te ofrece completar su ficha. Yo no importo nada por ti.',
      ...info,
    },
    {
      id: 'una-a-una',
      text: '«Añadir persona» crea una ficha: solo el nombre es obligatorio; teléfono, madre/padre, correo y alias de Bizum son opcionales.',
      target: 'grupos.anadir-participante',
      ...info,
    },
  ],
  finishText: 'Ya sabes cómo llenar un grupo. Las fichas se pueden completar más tarde y no hace falta que la persona tenga cuenta de PEPA.',
  next: ['grupos-bote', 'grupos-vincular'],
}

export const tutGruposBote: TourDef = {
  id: 'tut-grupos-bote',
  module: 'grupos',
  group: 'Botes',
  summary: 'Crea un bote, excluye a quien no participa y anota los pagos.',
  version: 1,
  title: 'Crear un bote y anotar los pagos',
  cardId: 'grupos-bote',
  durationSec: 110,
  startPath: '/grupos',
  paths: PATHS,
  readyOn: ['grupos.nuevo-grupo'],
  steps: [
    {
      id: 'abre-grupo',
      text: 'Abre un grupo. Cuando estés dentro, seguiré.',
      completeOn: [{ type: 'appear', target: 'grupos.anadir' }],
    },
    {
      id: 'anadir',
      text: 'Pulsa «Añadir» y elige «Bote compartido».',
      target: 'grupos.anadir',
      completeOn: [{ type: 'click', target: 'grupos.anadir' }, { type: 'appear', target: 'grupos.anadir-bote' }],
      skipIf: [{ type: 'appear', target: 'grupos.anadir-bote' }],
    },
    {
      id: 'bote',
      text: 'Elige «Bote compartido». Se pide el nombre, cómo se aporta (misma cantidad, cantidades distintas o voluntaria) y, si procede, el importe. Entran todos los participantes.',
      target: 'grupos.anadir-bote',
      completeOn: [{ type: 'click', target: 'grupos.anadir-bote' }, { type: 'appear', target: 'grupos.bote-crear' }],
      skipIf: [{ type: 'appear', target: 'grupos.bote-crear' }],
    },
    {
      id: 'crear',
      text: 'Rellena los datos y pulsa «Crear bote» (se guarda de verdad). Yo no lo creo por ti.',
      target: 'grupos.bote-crear',
      completeOn: [{ type: 'event', name: 'grupos.fund-created' }],
      sensitive: true,
    },
    {
      id: 'resumen',
      text: 'Aquí ves lo previsto, lo recaudado, lo pendiente y el saldo. Se actualiza solo con cada pago o gasto. Pulsa «Siguiente».',
      target: 'grupos.bote-resumen',
      ...info,
    },
    {
      id: 'no-participan',
      text: '«Seleccionar varios» sirve para marcar quién no participa o está exento, solo en este bote: su ficha y los demás botes no cambian.',
      target: 'grupos.seleccionar-varios',
      ...info,
      optional: true,
    },
    {
      id: 'registrar',
      text: '«Registrar» anota un pago recibido, un gasto, una entrega, un reembolso o una devolución. Un Bizum puede repartirse entre hermanos y, si no sabes de quién es, queda «sin identificar».',
      target: 'grupos.registrar',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Ya tienes tu bote. Cada pago queda anotado y nada se borra: un apunte equivocado se anula con su motivo.',
  next: ['grupos-compartir', 'grupos-cerrar'],
}

export const tutGruposWhatsapp: TourDef = {
  id: 'tut-grupos-whatsapp',
  module: 'grupos',
  group: 'Botes',
  summary: 'Comparte la lista de pagados o de pendientes por WhatsApp, sin teléfonos ni datos privados.',
  version: 1,
  title: 'Compartir pendientes por WhatsApp',
  cardId: 'grupos-compartir',
  durationSec: 70,
  startPath: '/grupos',
  paths: PATHS,
  readyOn: ['grupos.nuevo-grupo'],
  steps: [
    {
      id: 'abre-bote',
      text: 'Abre un grupo y, dentro, uno de sus botes. Cuando estés en el bote, seguiré.',
      completeOn: [{ type: 'appear', target: 'grupos.whatsapp' }],
    },
    {
      id: 'boton',
      text: 'Pulsa «Compartir por WhatsApp».',
      target: 'grupos.whatsapp',
      completeOn: [{ type: 'click', target: 'grupos.whatsapp' }, { type: 'appear', target: 'grupos.informe-tipo' }],
      skipIf: [{ type: 'appear', target: 'grupos.informe-tipo' }],
    },
    {
      id: 'tipo',
      text: 'Elige qué compartir: pendientes, pagados, resumen o un informe detallado. Salen los nombres de los niños, no los de quienes hicieron el Bizum.',
      target: 'grupos.informe-tipo',
      ...info,
    },
    {
      id: 'texto',
      text: 'Aquí ves el mensaje antes de enviarlo y puedes editarlo. Nunca lleva teléfonos, correos ni alias de pago.',
      target: 'grupos.informe-texto',
      ...info,
    },
    {
      id: 'enviar',
      text: '«Abrir WhatsApp» lo prepara para que tú elijas el chat y lo envíes. Yo no envío nada. Para terminar, pulsa «Siguiente».',
      target: 'grupos.informe-whatsapp',
      ...info,
    },
  ],
  finishText: 'En «⋯» → «Enlaces de consulta» también puedes dar a cada familia un enlace revocable para ver solo lo suyo y avisar «Ya he pagado».',
  next: ['grupos-bote', 'grupos-cerrar'],
}

export const tutGruposVincular: TourDef = {
  id: 'tut-grupos-vincular',
  module: 'grupos',
  group: 'Empezar',
  summary: 'Vincula un evento o una lista que ya tienes, o crea uno nuevo, sin duplicar nada.',
  version: 1,
  title: 'Vincular un evento o una lista',
  cardId: 'grupos-vincular',
  durationSec: 80,
  startPath: '/grupos',
  paths: PATHS,
  readyOn: ['grupos.nuevo-grupo'],
  steps: [
    {
      id: 'abre-grupo',
      text: 'Abre un grupo. Cuando estés dentro, seguiré.',
      completeOn: [{ type: 'appear', target: 'grupos.anadir' }],
    },
    {
      id: 'anadir',
      text: 'Pulsa «Añadir».',
      target: 'grupos.anadir',
      completeOn: [{ type: 'click', target: 'grupos.anadir' }, { type: 'appear', target: 'grupos.anadir-evento' }],
      skipIf: [{ type: 'appear', target: 'grupos.anadir-evento' }],
    },
    {
      id: 'evento',
      text: '«Evento»: creas uno nuevo en Eventos o vinculas uno que ya existe. El grupo muestra un acceso directo al evento real; un evento puede estar en varios grupos.',
      target: 'grupos.anadir-evento',
      ...info,
    },
    {
      id: 'lista',
      text: '«Lista vinculada»: lo mismo con Mis listas. Se abre la lista real, con todas sus funciones, y los cambios se ven en los dos sitios porque es la misma lista.',
      target: 'grupos.anadir-lista',
      ...info,
    },
    {
      id: 'invitados',
      text: 'En Eventos → Invitados, «Desde un grupo» trae a los participantes como invitados, y «Actualizar invitados» revisa los cambios del grupo cuando tú lo pides. No cambia invitaciones ya enviadas.',
      ...info,
    },
  ],
  finishText: 'Vincular no copia nada: el evento y la lista siguen siendo los de siempre.',
  next: ['grupos-crear', 'grupos-copiar'],
}

export const tutGruposCerrar: TourDef = {
  id: 'tut-grupos-cerrar',
  module: 'grupos',
  group: 'Botes',
  summary: 'Cierra un bote, decide qué hacer con el sobrante y reábrelo si hay que corregir algo.',
  version: 1,
  title: 'Cerrar, reabrir y archivar',
  cardId: 'grupos-cerrar',
  durationSec: 80,
  startPath: '/grupos',
  paths: PATHS,
  readyOn: ['grupos.nuevo-grupo'],
  steps: [
    {
      id: 'abre-bote',
      text: 'Abre un grupo y, dentro, uno de sus botes. Cuando estés en el bote, seguiré.',
      completeOn: [{ type: 'appear', target: 'grupos.bote-menu' }],
    },
    {
      id: 'menu',
      text: 'Pulsa «⋯» para ver las opciones del bote.',
      target: 'grupos.bote-menu',
      completeOn: [{ type: 'click', target: 'grupos.bote-menu' }, { type: 'appear', target: 'grupos.cerrar-bote' }],
      skipIf: [{ type: 'appear', target: 'grupos.cerrar-bote' }],
    },
    {
      id: 'cerrar',
      text: '«Cerrar el bote» avisa de los pagos pendientes y de los ingresos sin identificar. No hace falta saldo cero: si sobra, lo traspasas a otro bote, lo registras como devuelto o lo dejas archivado con constancia. No cierro nada por ti.',
      target: 'grupos.cerrar-bote',
      ...info,
    },
    {
      id: 'reabrir',
      text: 'Un bote cerrado muestra «Reabrir para corregir» (queda registrado quién y cuándo). Un historial recibido de otra persona nunca se puede reabrir.',
      target: 'grupos.reabrir',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Al terminar el curso, «Más» → «Archivar el grupo» lo deja consultable sin perder justificantes ni cuentas.',
  next: ['grupos-bote', 'grupos-copiar'],
}

export const tutGruposCopiar: TourDef = {
  id: 'tut-grupos-copiar',
  module: 'grupos',
  group: 'Empezar',
  summary: 'Pasa el grupo a otra persona de PEPA, solo con los integrantes o con el historial en solo lectura.',
  version: 1,
  title: 'Copiar un grupo a otra persona',
  cardId: 'grupos-copiar',
  durationSec: 80,
  startPath: '/grupos',
  paths: PATHS,
  readyOn: ['grupos.nuevo-grupo'],
  steps: [
    {
      id: 'abre-grupo',
      text: 'Abre el grupo que quieres pasar. Cuando estés dentro, seguiré.',
      completeOn: [{ type: 'appear', target: 'grupos.mas' }],
    },
    {
      id: 'mas',
      text: 'Pulsa «Más».',
      target: 'grupos.mas',
      completeOn: [{ type: 'click', target: 'grupos.mas' }, { type: 'appear', target: 'grupos.copiar-grupo' }],
      skipIf: [{ type: 'appear', target: 'grupos.copiar-grupo' }],
    },
    {
      id: 'copiar',
      text: '«Copiar a otra persona» crea un código. Eliges «Solo integrantes» o «Integrantes e historial» (botes y pagos como «Gestión anterior», de solo lectura). Antes confirmas que puedes compartir esos datos. No genero ningún código por ti.',
      target: 'grupos.copiar-grupo',
      ...info,
    },
    {
      id: 'recibir',
      text: 'La otra persona escribe el código en «Recibir un grupo», ve qué le llega y lo acepta. Hasta entonces no recibe nada; después tiene su propia copia, independiente de la tuya.',
      ...info,
    },
  ],
  finishText: 'Tu grupo original se queda contigo. La copia no crea ingresos ni gastos en la Economía de nadie.',
  next: ['grupos-crear', 'grupos-cerrar'],
}

export const TOURS_GRUPOS: TourDef[] = [visitaGrupos, tutGruposCrear, tutGruposParticipantes, tutGruposBote, tutGruposWhatsapp, tutGruposVincular, tutGruposCerrar, tutGruposCopiar]
