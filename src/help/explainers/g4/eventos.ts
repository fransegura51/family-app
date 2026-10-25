import type { HelpExplainer } from '@/help/explainers/types'

// «Cómo funciona PEPA» · Eventos (g4). Comprobado contra el código el 23/10/2026: lo que no he podido confirmar en el código se dice como tal.

export const expEventosConfirmacionInvitados: HelpExplainer = {
  id: 'exp-eventos-confirmacion-invitados',
  module: 'eventos',
  title: 'Cómo funciona la confirmación de invitados',
  summary: 'Qué ve cada invitado al abrir su enlace, qué te llega a ti y qué cosas PEPA nunca envía por su cuenta.',
  synonyms: ['rsvp', 'confirmar asistencia', 'enlace de invitación', 'enlace abierto', 'recordar a pendientes', 'por qué no se envía la invitación', 'cómo responden los invitados', 'cómo funciona'],
  sections: [
    {
      heading: 'Qué ve la persona invitada',
      paragraphs: [
        'Cada invitado tiene su propio enlace. Se abre en el navegador, sin cuenta de PEPA y sin instalar nada. La página enseña el nombre del evento, la fecha y el lugar, y la fecha límite si has puesto una.',
        'La persona elige ✅ Confirmo, ❌ No podré ir, 🤔 No estoy seguro o ⏳ Todavía no sé, dice cuántos adultos y niños vienen, puede dejar una nota y pulsa «Enviar respuesta». Si hace falta, puede volver a abrir el mismo enlace y cambiar la respuesta.',
        'Según cómo hayas montado el evento, la página también puede pedir el menú de cada persona o contestar preguntas que hayas preparado.',
      ],
      example: 'La «Familia García» abre su enlace, pulsa «✅ Confirmo», pone 2 adultos y 1 niño y escribe «Sin gluten para el peque». En tu lista de Invitados pasa a Confirmado con esas cifras y aparece su nota.',
    },
    {
      heading: 'Qué te llega a ti',
      paragraphs: [
        'La respuesta se guarda en la lista de Invitados del evento: el estado (Pendiente, Confirmado, No asiste o No seguro), cuántos adultos y niños vienen y la nota. También puedes cambiar el estado tú a mano.',
        'No he encontrado en el código de la página de confirmación ningún aviso automático para ti cuando alguien responde: para verlo, abre Invitados.',
      ],
    },
    {
      heading: 'Qué NO se envía solo',
      paragraphs: [
        'PEPA no manda nada a tus invitados por su cuenta. «+ Añadir invitado» solo apunta a la persona en tu lista. «📤 Compartir invitación» y «🔔 Recordar a pendientes» preparan un texto con el enlace y abren el menú de compartir del móvil (o lo copian): el envío lo haces tú desde WhatsApp, correo o lo que elijas.',
        '«📤 Exportar invitados» abre un listado con vista previa (por mesas, familias o alfabético) que puedes imprimir, bajar como CSV o compartir: eso también lo decides tú. Guardar el diseño de una invitación tampoco la envía a nadie.',
      ],
    },
    {
      heading: 'El enlace abierto',
      paragraphs: [
        'Es opcional («Activar enlace abierto»). Sirve para invitar sin lista cerrada: quien lo abre escribe su nombre y cuántos vienen y se crea un invitado nuevo, ya como confirmado.',
        'Cualquiera que tenga ese enlace puede apuntarse, así que compártelo solo donde quieras. Puedes «🔄 Regenerar» (el anterior deja de funcionar) o «🚫 Desactivar».',
      ],
    },
  ],
  limits: [
    'Quien tenga el enlace personal de un invitado puede responder en su nombre; PEPA no comprueba quién es. Si se reenvía por error, usa «🔄 Regenerar enlace (invalida el anterior)».',
    'Hay un límite de intentos por enlace en un rato corto (30 cada 10 minutos); si se supera, la respuesta no se guarda y la página pide volver a intentarlo en un momento.',
    'Si el evento se archiva, el enlace solo enseña que el evento ya ha terminado.',
  ],
  ifWrong: [
    'Si una respuesta no es la correcta (alguien la puso por error), cambia el estado y las cifras tú mismo en Invitados: lo que pones tú manda.',
    'Si un invitado dice que su enlace no abre («Enlace no válido»), probablemente se regeneró o se desactivó: compártele el nuevo. Eso es normal, no un fallo.',
    'Si la página da error al responder y se repite pasados unos minutos, es un fallo técnico: cuéntalo en Sugerencias (o en Soporte técnico cuando exista).',
  ],
  verified: '2026-10-23',
  basedOn: ['src/ui/EventosScreen.tsx', 'src/ui/RsvpScreen.tsx', 'supabase/functions/event-rsvp/index.ts', 'src/domain/events.ts'],
  tour: 'tut-eventos-enviar-invitacion',
  go: { path: '/eventos' },
  labels: ['+ Añadir invitado', '📤 Compartir invitación', '📤 Exportar invitados', 'Activar enlace abierto', '🔄 Regenerar enlace (invalida el anterior)', '🚫 Desactivar', 'Enviar respuesta', '✅ Confirmo', '❌ No podré ir', '🤔 No estoy seguro', '⏳ Todavía no sé'],
  cardIds: ['eve-invitados'],
}

export const expEventosMenuComprasPresupuesto: HelpExplainer = {
  id: 'exp-eventos-menu-compras-presupuesto',
  module: 'eventos',
  title: 'Menú del evento, Compras y Presupuesto: qué se escribe dónde',
  summary: 'Los tres sitios guardan cosas distintas. Aquí ves qué hace PEPA con cada uno y qué nunca se rellena solo.',
  synonyms: ['pasar menú a compras', 'ingredientes del menú', 'preparar compra del menú', 'presupuesto del evento', 'gastado en economía', 'cuánto cuesta el menú', 'por qué no sale en compras', 'cómo funciona'],
  sections: [
    {
      heading: 'Tres sitios, tres cosas distintas',
      paragraphs: [
        '«🍽️ Menú del evento» es la lista de platos (nombre, sección, nota y, si quieres, una receta). «🛍️ Compras» del evento es lo que se ha pasado a la lista de la compra para ese evento. «💰 Presupuesto» son partidas de dinero que escribes tú.',
        'Añadir un plato solo lo guarda en el Menú. No toca Compras ni Presupuesto.',
      ],
    },
    {
      heading: 'Del Menú a Compras, solo si tú lo decides',
      paragraphs: [
        '«🛒 Preparar compra del menú» (o el 🛒 de un plato) solo sale cuando la comida la preparáis vosotros (en un evento mixto, solo para los platos vuestros). Si la pone un restaurante o catering, no hay botón.',
        'PEPA propone los ingredientes de las recetas enlazadas, escalados de forma orientativa a los comensales confirmados, o el nombre del plato si no tiene receta. No inventa ingredientes ni cantidades.',
        'Tú revisas la lista, desmarcas lo que no quieras y eliges tienda. No se añade nada hasta que pulses «Añadir … a Compras». Si algo falla, no queda nada a medias, y reintentar no duplica los productos.',
      ],
      example: 'Menú: «Tortilla de patata» con receta de 4 raciones y 8 comensales confirmados. La propuesta sugiere las cantidades escaladas (orientativas). Desmarcas «sal», eliges tienda y confirmas: en Compras aparecen esos productos ligados al evento.',
    },
    {
      heading: 'Presupuesto: lo pones tú',
      paragraphs: [
        'Las partidas se crean con «+ Añadir partida» (o las propone «🪄 Organízamelo Pepa», siempre sin importe: «Sin importe todavía»). El Menú y Compras no crean partidas ni importes.',
        'Arriba ves cuatro cifras que no se suman entre sí: «Planificado» (lo que has previsto), «Comprometido» y «Pagado» (salen de Pagos y fianzas) y «Gastado en Economía» (los gastos de Economía que llevan la etiqueta del evento).',
        'En el código de Compras no he visto que marcar algo como comprado cree un gasto en Economía por sí solo. Para que un gasto cuente en el evento, ponle la etiqueta del evento al apuntarlo en Economía.',
      ],
    },
  ],
  limits: [
    'La compra del menú depende de que los platos tengan receta con ingredientes; sin receta, PEPA solo propone el nombre del plato y tú decides qué comprar.',
    'Las cantidades escaladas son orientativas y solo donde la receta indica raciones.',
    'No he comprobado qué pasa en Compras si después cambias o borras el plato del menú: revisa la lista.',
  ],
  ifWrong: [
    'Si la propuesta de compra no te convence, desmarca líneas o cancela: no se ha guardado nada hasta confirmar. Si ya se añadió, bórralo desde Compras.',
    'Si el 🛒 no aparece, mira quién se encarga de la comida en el bloque «Comida y bebida»: es normal que no haya botón cuando la pone un proveedor.',
    'Si ves un error al pasar el menú a Compras y se repite, es un fallo técnico: cuéntalo en Sugerencias (o en Soporte técnico cuando exista).',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/EventMenu.tsx',
    'src/ui/MenuShoppingModal.tsx',
    'src/domain/menuShoppingPlan.ts',
    'src/domain/eventMenuHub.ts',
    'supabase/migrations/0203_menu_shopping_atomic_rpc.sql',
    'src/ui/EventosScreen.tsx',
    'src/data/shopping.ts',
  ],
  tour: 'tut-eventos-compra-menu',
  go: { path: '/eventos' },
  labels: ['🍽️ Menú del evento', '+ Añadir plato', '🛒 Preparar compra del menú', '🛍️ Compras', '+ Añadir partida', 'Planificado', 'Comprometido', 'Pagado', 'Gastado en Economía', 'Sin importe todavía'],
  cardIds: ['eve-menu', 'eve-presupuesto'],
}

export const expEventosOrganizamePepa: HelpExplainer = {
  id: 'exp-eventos-organizame-pepa',
  module: 'eventos',
  title: 'Qué es «Organízamelo Pepa» y qué cambia al aplicarlo',
  summary: 'Es una propuesta de partida según el tipo de evento. No usa inteligencia artificial externa y no escribe nada hasta que pulsas «Aplicar».',
  synonyms: ['organízamelo pepa', 'propuesta de pepa', 'qué hace aplicar', 'sugerencias automáticas del evento', 'plantilla del evento', 'por qué propone eso', 'cómo funciona'],
  sections: [
    {
      heading: 'Con qué decide',
      paragraphs: [
        'Con el tipo de evento (cumpleaños, comunión, bautizo, celebración, boda íntima o personalizado) y con los módulos que tiene activos. Además tiene en cuenta lo que el lugar ya incluye, si lo has contestado en «Cómo queréis que sea el evento»: así no te propone, por ejemplo, una partida de tarta si ya va en el paquete.',
        'Son listas fijas por tipo de evento, no una redacción libre ni una consulta a un servicio de inteligencia artificial.',
      ],
    },
    {
      heading: 'Qué te enseña',
      paragraphs: [
        'Una ventana con todo marcado y por secciones: módulos que hacen falta, Presupuesto, Menú, Decoración y Actividades. Puedes desmarcar cualquier línea. Abajo dice cuántos elementos va a añadir.',
        'No incluye tareas: esas ya se crean solas al crear el evento.',
      ],
      example: 'Para un cumpleaños propone, por ejemplo, partidas «Local o espacio», «Tarta» y «Decoración»; platos «Tarta», «Bebidas» y «Snacks»; ideas «Globos» y «Pancarta de cumpleaños»; y actividades «Juegos de fiesta» y «Piñata». Para una boda íntima no propone decoración ni actividades.',
    },
    {
      heading: 'Qué cambia al pulsar «Aplicar»',
      paragraphs: [
        'Se activan los módulos que marcaste, se crean las partidas de presupuesto marcadas (siempre «Sin importe todavía»: PEPA no inventa precios), los platos del menú (solo con su nombre), las ideas de decoración y las actividades.',
        'No envía nada a nadie, no toca Compras ni el Calendario.',
      ],
    },
  ],
  limits: [
    'La propuesta es genérica para ese tipo de evento: no conoce tus gustos ni tu presupuesto.',
    'Si lo vuelves a abrir, propone otra vez lo mismo. En el código no he visto que quite lo que ya añadiste, así que desmarca lo repetido para no duplicarlo.',
    'Si el evento ya no está «en marcha» (archivado), el botón no aparece.',
  ],
  ifWrong: [
    'Si añadió algo que no querías, bórralo con ✕ desde el módulo correspondiente (Presupuesto, Menú, Decoración o Actividades): es normal y no estropea nada más.',
    'Los importes los pones tú tocando la partida; PEPA nunca los rellena.',
    'Si sale «No se pudo aplicar la propuesta» y se repite, es un fallo técnico: cuéntalo en Sugerencias (o en Soporte técnico cuando exista).',
  ],
  verified: '2026-10-23',
  basedOn: ['src/ui/EventosScreen.tsx', 'src/domain/events.ts', 'src/data/events.ts'],
  tour: 'tut-eventos-panel',
  go: { path: '/eventos' },
  labels: ['🪄 Organízamelo Pepa', 'Aplicar', 'Módulos que hacen falta para esto', 'Sin importe todavía'],
  cardIds: ['eve-crear', 'eve-presupuesto'],
}

export const EXPLAINERS_EVENTOS: HelpExplainer[] = [expEventosConfirmacionInvitados, expEventosMenuComprasPresupuesto, expEventosOrganizamePepa]
