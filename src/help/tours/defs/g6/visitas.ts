import type { TourDef } from '@/help/tours/types'

// Visitas guiadas («Conoce esta sección») del grupo g6: Inicio, Documentos, Galería, Contactos y Cumpleaños. Todas son SOLO informativas: ningún paso guarda, crea ni borra nada,
// ninguno espera un clic ni un aviso de guardado, y los controles que pueden no estar (por datos vacíos, plataforma o ventana cerrada) van como `optional`. Los textos describen lo que
// la pantalla hace de verdad (comprobado contra src/ui/HomeScreen.tsx, DocumentsScreen.tsx, GalleryScreen.tsx, ContactsScreen.tsx y BirthdaysScreen.tsx el 23/10/2026).

const info = { completeOn: [] as never[], manualNext: true }

export const visitaInicio: TourDef = {
  id: 'visita-inicio',
  kind: 'visit',
  module: 'inicio',
  title: 'Conoce Inicio',
  summary: 'La portada de PEPA: avisos, carrusel y accesos a cada sección.',
  version: 2,
  cardId: 'ini-que-veo',
  durationSec: 100,
  startPath: '/',
  steps: [
    {
      id: 'cabecera',
      text: 'Esta es Inicio, la portada de PEPA. Arriba te saludo con tu nombre. Desde aquí llegas a todas las secciones de la aplicación.',
      target: 'inicio.cabecera',
      ...info,
    },
    {
      id: 'campana',
      text: 'La campana 🔔 guarda tus avisos. El número que lleva encima son los que aún no has leído. Tócala para abrir el panel; abrirlo no marca nada como leído.',
      target: 'notificaciones.campana',
      ...info,
      optional: true,
    },
    {
      id: 'pepa-te-avisa',
      text: 'Esta tarjeta, «PEPA te avisa», solo sale cuando algo de Eventos necesita atención: tareas atrasadas, pagos que vencen, invitados sin responder, gastos sobre el presupuesto o necesidades alimentarias. Enseña hasta 3. Si no hay nada, no la verás.',
      target: 'inicio.pepa-te-avisa',
      ...info,
      optional: true,
    },
    {
      id: 'carrusel',
      text: 'El carrusel va pasando solo: la compra pendiente, lo de hoy en el calendario, Comunidad (si la tienes abierta) y fotos de la Galería. Pon el dedo encima para pararlo; desliza para pasar.',
      target: 'inicio.carrusel',
      ...info,
      optional: true,
    },
    {
      id: 'carrusel-ajustes',
      text: 'El engranaje ⚙️ abre «Carrusel de Inicio»: ahí eliges qué diapositivas quieres ver y si las fotos salen al azar o las eliges tú. No se borra nada, solo se esconde.',
      target: 'inicio.carrusel-ajustes',
      ...info,
      optional: true,
    },
    {
      id: 'organizar',
      text: '«↕️ Organizar» te deja cambiar el orden de las tarjetas de abajo. Cada persona tiene su propio orden. Paso a paso, en la Ayuda: «Moverme y ordenar PEPA».',
      target: 'inicio.organizar',
      ...info,
    },
    {
      id: 'tarjetas',
      text: 'Cada tarjeta lleva a una sección: Calendario, Compras, Familia, Documentos… Tócala para entrar. Mientras estás en «Organizar», tocarlas no abre la sección.',
      target: 'inicio.tarjetas',
      ...info,
    },
  ],
  finishText: 'Eso es Inicio. Cuando quieras, aprende a ordenar las tarjetas o a entender tus avisos.',
  next: ['ini-organizar', 'not-campana', 'ini-menu-y-barra'],
}

export const visitaDocumentos: TourDef = {
  id: 'visita-documentos',
  kind: 'visit',
  module: 'documentos',
  title: 'Conoce Documentos',
  summary: 'Tus documentos importantes en carpetas, con fecha de vencimiento, avisos y control de quién los ve.',
  version: 2,
  cardId: 'doc-subir',
  durationSec: 80,
  startPath: '/documentos',
  steps: [
    {
      id: 'carpetas',
      text: 'Aquí están las carpetas, una por categoría. Toca una para abrirla: dentro hay una subcarpeta por cada miembro de la familia y otra llamada «Sin especificar».',
      target: 'documentos.carpetas',
      ...info,
    },
    {
      id: 'nueva-carpeta',
      text: '«Nueva carpeta» sirve para crear otra categoría, por ejemplo «Coche». No se crea nada hasta que escribas un nombre y pulses «+ Añadir categoría».',
      target: 'documentos.nueva-carpeta',
      ...info,
    },
    {
      id: 'subir',
      text: 'Con «+ Subir foto» guardas una foto o un PDF. Eliges el archivo, le pones título, la carpeta y de quién es. Si le pones fecha de vencimiento, PEPA lo apunta en el Calendario y avisa 30, 7 y 1 día antes.',
      target: 'documentos.subir',
      ...info,
    },
    {
      id: 'quien-ve',
      text: 'Al subir un documento eliges quién puede verlo: toda la familia, solo tú o las personas que marques. Un documento restringido lleva el candado 🔒 en su fila, y solo lo cambia o borra quien lo subió; la administración tampoco lo ve si no la incluyes.',
      ...info,
    },
    {
      id: 'acciones',
      text: 'Cuando abres una carpeta con documentos, cada uno tiene 👁 para verlo, 📤 para compartirlo, ✏️ para cambiar su título, su fecha de vencimiento o quién lo ve, y ✕ para eliminarlo. Yo no pulso ninguno por ti.',
      target: 'documentos.acciones',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es Documentos. Si quieres practicar, prueba el «Enséñame»: crear una carpeta, subir un documento, ponerle vencimiento o decidir quién lo ve.',
  next: ['doc-subir', 'doc-vencimiento'],
}

export const visitaGaleria: TourDef = {
  id: 'visita-galeria',
  kind: 'visit',
  module: 'galeria',
  title: 'Conoce Galería',
  summary: 'Las fotos de la familia: subirlas, compartirlas y verlas en Inicio.',
  version: 1,
  cardId: 'gal-subir',
  durationSec: 70,
  startPath: '/galeria',
  steps: [
    {
      id: 'fotos',
      text: 'Aquí están las fotos de la familia, de la más nueva a la más antigua, con su fecha y su descripción. Toca una para verla en grande y cambiar su descripción. Si todavía no hay ninguna, la pantalla lo dice.',
      target: 'gallery.grid',
      ...info,
    },
    {
      id: 'compartir',
      text: '«📤 Compartir varias» te deja marcar fotos y mandarlas juntas. Se abre el menú de compartir de tu móvil y eres tú quien elige con quién. Cada foto tiene además su propio 📤 y un botón para borrarla.',
      target: 'gallery.share-many',
      ...info,
    },
    {
      id: 'subir',
      text: 'Más abajo está «Subir foto»: eliges la foto, escribes una descripción si quieres y pulsas «Subir». No se guarda nada hasta que lo pulses tú.',
      target: 'gallery.upload-form',
      ...info,
    },
    {
      id: 'carrusel',
      text: 'Las fotos de la Galería son las que pueden salir en el carrusel de Inicio (hasta 5). Allí eliges si salen al azar o las fijas, con el engranaje del carrusel.',
      ...info,
    },
  ],
  finishText: 'Eso es Galería. Para practicar, prueba el «Enséñame» de subir una foto.',
  next: ['gal-subir', 'gal-compartir'],
}

export const visitaContactos: TourDef = {
  id: 'visita-contactos',
  kind: 'visit',
  module: 'contactos',
  title: 'Conoce Contactos',
  summary: 'La agenda de la familia: colegio, médico, emergencias y más.',
  version: 1,
  cardId: 'con-agenda',
  durationSec: 100,
  startPath: '/contactos',
  steps: [
    {
      id: 'buscar',
      text: 'En el buscador escribes parte de un nombre y la lista se acorta al momento. Busca solo por nombre, y da igual si usas mayúsculas o tildes.',
      target: 'contactos.buscar',
      ...info,
    },
    {
      id: 'categorias',
      text: 'Los botones de categoría filtran la lista: «Todas» o solo Colegio, Médico, Emergencia, Familia, Otros y las que hayas creado. Se pueden combinar con el buscador.',
      target: 'contactos.categorias',
      ...info,
    },
    {
      id: 'acciones',
      text: 'En cada contacto: 📞 llama (solo si tiene teléfono), 📤 lo comparte, ✏️ lo edita y ✕ lo elimina. Yo no pulso ninguno por ti. Debajo del nombre puedes añadir su cumpleaños.',
      target: 'contactos.acciones',
      ...info,
      optional: true,
    },
    {
      id: 'compartir-varios',
      text: '«📤 Compartir varios» te deja marcar varios contactos y mandarlos juntos como texto (nombre, teléfono y email). Eres tú quien elige a dónde se envían.',
      target: 'contactos.compartir-varios',
      ...info,
    },
    {
      id: 'nuevo',
      text: '«+ Nuevo contacto» abre un formulario con nombre, categoría, teléfono, email, cumpleaños y notas. No se guarda hasta que pulses «Añadir».',
      target: 'contactos.nuevo',
      ...info,
    },
    {
      id: 'importar-telefono',
      text: 'Esta tarjeta importa contactos de la agenda de tu teléfono. Solo sale en navegadores que lo permiten (normalmente Chrome o Edge en Android). Tú marcas cuáles guardar.',
      target: 'contactos.importar-telefono',
      ...info,
      optional: true,
    },
    {
      id: 'importar-vcf',
      text: 'También puedes subir un archivo .vcf exportado de tu agenda (por ejemplo del iPhone) para añadir muchos de golpe. Los que ya existen con el mismo nombre se completan sin pisar lo que tenían.',
      target: 'contactos.importar-vcf',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es Contactos. Para practicar, prueba el «Enséñame» de añadir un contacto o de buscar y filtrar.',
  next: ['con-agenda', 'con-importar', 'con-compartir'],
}

export const visitaCumpleanos: TourDef = {
  id: 'visita-cumpleanos',
  kind: 'visit',
  module: 'cumpleanos',
  title: 'Conoce Cumpleaños',
  summary: 'Los próximos cumpleaños de la familia y de tus contactos, y el aviso diario de las 09:00.',
  version: 2,
  cardId: 'cum-ver',
  durationSec: 80,
  startPath: '/cumpleanos',
  steps: [
    {
      id: 'filtros',
      text: '«Próximos» enseña todos los cumpleaños; «Favoritos» solo los que hayas marcado con ⭐. Es un filtro sobre la misma lista, no dos listas distintas.',
      target: 'cumpleanos.filtros',
      ...info,
    },
    {
      id: 'lista',
      text: 'La lista junta a la familia y a tus contactos, ordenada por lo que falta. Cada uno dice «¡Hoy!», «Mañana» o «En N días», la edad que cumple y la fecha.',
      target: 'cumpleanos.lista',
      ...info,
    },
    {
      id: 'acciones',
      text: '⭐ marca o quita un favorito, ✏️ cambia la fecha y ✕ quita el cumpleaños (te pregunta antes). Yo no pulso ninguno. En las personas de Familia, estos cambios solo los guarda la administración de la familia.',
      target: 'cumpleanos.acciones',
      ...info,
      optional: true,
    },
    {
      id: 'fechas',
      text: 'Aquí no hay botón para añadir un cumpleaños: la fecha se pone en la ficha de Familia o en Contactos. Cada día a las 09:00 te llega un aviso con los cumpleaños de hoy y de mañana, si los hay. También se ven en el Calendario.',
      ...info,
    },
  ],
  finishText: 'Eso es Cumpleaños. Si eres administrador o administradora, puedes practicar a marcar un favorito o cambiar una fecha.',
  next: ['cum-ver'],
}
