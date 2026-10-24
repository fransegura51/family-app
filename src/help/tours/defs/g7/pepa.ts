import type { TourDef, TourStep } from '@/help/tours/types'

// Visita y tutoriales «Enséñame» del grupo g7 · Hablar con PEPA. Comprobado contra src/ui/VoiceCapture.tsx (botón 💬 y su panel) y src/ui/ActionConfirmSheet.tsx (la tarjeta de revisión).
// Ningún recorrido escribe, envía ni confirma por la persona: señalan y esperan. La tarjeta de confirmación solo se explica (nunca se espera «Guardar»): lo que se guarda lo decide la persona.

const info = { completeOn: [] as never[], manualNext: true }

const abrirBoton: TourStep = {
  id: 'boton',
  text: 'Este es el botón verde 💬 «Hablar con PEPA», arriba. Púlsalo para abrir el panel.',
  target: 'pepa.boton',
  completeOn: [
    { type: 'click', target: 'pepa.boton' },
    { type: 'appear', target: 'pepa.panel' },
  ],
  skipIf: [{ type: 'appear', target: 'pepa.panel' }],
}

export const visitaPepa: TourDef = {
  id: 'visita-pepa',
  kind: 'visit',
  module: 'pepa',
  title: 'Conoce «Hablar con PEPA»',
  summary: 'El botón 💬 y su panel: hablar o escribir, ejemplos y cómo respondo.',
  version: 1,
  cardId: 'pepa-hablar',
  durationSec: 90,
  startPath: '/',
  steps: [
    {
      id: 'boton',
      text: 'Este botón 💬 es la forma de hablar conmigo: me preguntas o me pides que apunte cosas, con la voz o escribiendo. Para ver el panel abierto, tócalo y vuelve a esta visita.',
      target: 'pepa.boton',
      ...info,
    },
    {
      id: 'microfono',
      text: 'Con «🎤 Toca y habla» me dictas la frase. Si tu navegador no admite dictado, no sale y escribes abajo.',
      target: 'pepa.microfono',
      ...info,
      optional: true,
    },
    {
      id: 'ejemplos',
      text: 'Estos ejemplos te dicen cómo pedirme las cosas. Tocas uno y se pone en el cuadro de escribir.',
      target: 'pepa.ejemplos',
      ...info,
      optional: true,
    },
    {
      id: 'texto',
      text: 'Aquí también puedes escribirme, y «Enviar» manda la frase. Las preguntas las contesto directamente.',
      target: 'pepa.texto',
      ...info,
      optional: true,
    },
    {
      id: 'modo',
      text: 'Abajo eliges si te contesto «🔊 Hablando» (escribo y leo la respuesta) o «💬 Por escrito» (solo escribo).',
      target: 'pepa.modo',
      ...info,
      optional: true,
    },
    {
      id: 'tarjeta',
      text: 'Cuando me pides apuntar algo, no lo guardo a ciegas: te enseño una tarjeta para revisarlo y solo se guarda cuando pulsas el botón de guardar. Borrar por voz no lo hago.',
      ...info,
    },
  ],
  finishText: 'Eso es Hablar con PEPA. Para practicar, prueba los «Enséñame»: hablar, apuntar algo o pedir ayuda.',
  next: ['pepa-hablar', 'pepa-apuntar', 'pepa-preguntas'],
}

export const tutPepaHablar: TourDef = {
  id: 'tut-pepa-hablar',
  module: 'pepa',
  group: 'Hablar con PEPA',
  summary: 'Abre el panel de Pepa y háblale o escríbele.',
  version: 1,
  title: 'Hablar con PEPA (voz o texto)',
  cardId: 'pepa-hablar',
  durationSec: 80,
  startPath: '/',
  steps: [
    abrirBoton,
    {
      id: 'microfono',
      text: 'Para hablar, pulsa «🎤 Toca y habla» y di tu frase. Si no te sale este botón, tu navegador no admite dictado: escribe en el cuadro de abajo.',
      target: 'pepa.microfono',
      ...info,
      optional: true,
    },
    {
      id: 'ejemplos',
      text: 'Si no sabes qué decir, toca un ejemplo y se pone en el cuadro. Fíjate en cómo están dichos: así te entiendo seguro.',
      target: 'pepa.ejemplos',
      ...info,
    },
    {
      id: 'texto',
      text: 'Escribe tu frase aquí, por ejemplo «¿Qué tengo mañana?». Cuando acabes, deja el teclado.',
      target: 'pepa.texto',
      completeOn: [{ type: 'entered', target: 'pepa.texto', min: 3 }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'Ahora pulsa «Enviar» y te contesto. Si solo quieres mirar, pulsa «Siguiente» y no envío nada.',
      target: 'pepa.enviar',
      ...info,
    },
  ],
  finishText: 'Eso es todo. Las preguntas las contesto al momento; si me pides apuntar algo, te enseño antes una tarjeta y solo se guarda si lo confirmas.',
  next: ['pepa-preguntas', 'pepa-apuntar'],
}

export const tutPepaApuntar: TourDef = {
  id: 'tut-pepa-apuntar',
  module: 'pepa',
  group: 'Hablar con PEPA',
  summary: 'Pídele a Pepa que apunte algo a la compra o al calendario y revisa la tarjeta.',
  version: 1,
  title: 'Apuntar algo hablando con PEPA',
  cardId: 'pepa-apuntar',
  durationSec: 110,
  startPath: '/',
  steps: [
    abrirBoton,
    {
      id: 'texto',
      text: 'Dime qué apuntar, con la voz o escribiendo aquí. Por ejemplo: «Añade leche, huevos y pan a Mercadona» o «El viernes a las cinco dentista de Eric».',
      target: 'pepa.texto',
      completeOn: [{ type: 'entered', target: 'pepa.texto', min: 5 }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'Pulsa «Enviar». Todavía no se guarda nada: te saldrá una tarjeta para que lo revises.',
      target: 'pepa.enviar',
      completeOn: [{ type: 'appear', target: 'pepa.tarjeta' }],
      manualNext: true,
    },
    {
      id: 'tarjeta',
      text: 'Esta es la tarjeta: te cuenta qué voy a hacer. Léela con calma.',
      target: 'pepa.tarjeta',
      ...info,
      optional: true,
    },
    {
      id: 'guardar-como',
      text: 'Si apunto un evento y querías una tarea (o al revés), cámbialo en «Guardar como». Una tarea se guarda sin hora, sin repetición y sin avisos.',
      target: 'pepa.tarjeta-opciones',
      ...info,
      optional: true,
    },
    {
      id: 'confirmar',
      text: 'Solo se guarda cuando tú pulsas este botón. Yo no lo pulso. Si no es lo que querías, pulsa «Cancelar» y no se guarda nada.',
      target: 'pepa.tarjeta-confirmar',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Recuerda: nada se guarda hasta que confirmas en la tarjeta, y cancelar no guarda nada.',
  next: ['pepa-preguntas', 'pepa-sin-tarjeta'],
}

export const tutPepaPedirAyuda: TourDef = {
  id: 'tut-pepa-pedir-ayuda',
  module: 'pepa',
  group: 'Hablar con PEPA',
  summary: 'Pídele ayuda a Pepa por voz («necesito ayuda con compras») y te lleva y te explica.',
  version: 1,
  title: 'Pedirle ayuda a Pepa por voz',
  cardId: 'pepa-pedir-ayuda',
  durationSec: 80,
  startPath: '/',
  steps: [
    abrirBoton,
    {
      id: 'frases',
      text: 'Para pedirme ayuda, di o escribe aquí «necesito ayuda con compras», «cómo funciona el calendario» o «necesito ayuda para crear un evento».',
      target: 'pepa.texto',
      ...info,
    },
    {
      id: 'enviar',
      text: 'Al enviarlo, te llevo a esa pantalla y te lo explico por voz, o te enseño paso a paso si hay tutorial. Si pides ayuda sin decir con qué, te pregunto. Pulsa «Siguiente»: yo no lo envío por ti.',
      target: 'pepa.enviar',
      ...info,
    },
    {
      id: 'limites',
      text: 'Solo explico las secciones y funciones que tu cuenta puede usar. Y si prefieres leer, esta misma Ayuda lo cuenta con calma.',
      target: 'pepa.panel',
      ...info,
    },
  ],
  finishText: 'Cuando quieras ayuda, dime «necesito ayuda con…» y la sección que sea.',
  next: ['pepa-hablar', 'ayu-usar'],
}

export const tutPepaPreguntas: TourDef = {
  id: 'tut-pepa-preguntas',
  module: 'pepa',
  group: 'Hablar con PEPA',
  summary: 'Qué le puedes preguntar a Pepa: calendario, compra, menú, tiempo, tráfico y economía.',
  version: 1,
  title: 'Qué le puedo preguntar a PEPA',
  cardId: 'pepa-preguntas',
  durationSec: 90,
  startPath: '/',
  steps: [
    abrirBoton,
    {
      id: 'ejemplos',
      text: 'Estos ejemplos son preguntas que entiendo seguro, como «¿Qué tengo mañana?» o «¿Qué cenamos hoy?». Toca uno para ponerlo en el cuadro.',
      target: 'pepa.ejemplos',
      ...info,
    },
    {
      id: 'temas',
      text: 'Puedes preguntarme por tu calendario, la lista de la compra, el menú, el tiempo, el tráfico hasta un sitio, la hora y tu economía.',
      target: 'pepa.panel',
      ...info,
      details: [{ title: 'Economía', text: 'Tu economía la calculo con tus datos, sin enviarlos a ningún sitio.' }],
      detailsLabel: 'Más detalles',
    },
    {
      id: 'texto',
      text: 'Escribe aquí tu pregunta, o dila con el micrófono, y pulsa «Enviar». Las preguntas las contesto directamente.',
      target: 'pepa.texto',
      ...info,
    },
  ],
  finishText: 'Eso es lo que sé contestar. Si algo no lo entiendo, te lo digo.',
  next: ['pepa-apuntar', 'pepa-modo-respuesta'],
}

export const tutPepaModoRespuesta: TourDef = {
  id: 'tut-pepa-modo-respuesta',
  module: 'pepa',
  group: 'Hablar con PEPA',
  summary: 'Elige si Pepa te contesta en voz alta o solo por escrito.',
  version: 1,
  title: 'Que Pepa me conteste en voz alta o por escrito',
  cardId: 'pepa-modo-respuesta',
  durationSec: 60,
  startPath: '/',
  steps: [
    abrirBoton,
    {
      id: 'modo',
      text: 'Abajo del panel eliges cómo prefieres que te conteste: «🔊 Hablando» escribe y lee la respuesta; «💬 Por escrito» solo escribe. Toca el que quieras o pulsa «Siguiente».',
      target: 'pepa.modo',
      completeOn: [{ type: 'click', target: 'pepa.modo' }],
      manualNext: true,
    },
    {
      id: 'aparte',
      text: 'Esta opción es solo de «Hablar con PEPA». La voz con la que te explico la Ayuda se elige aparte, en la propia Ayuda.',
      ...info,
    },
  ],
  finishText: 'Hecho. Puedes cambiarlo siempre que quieras desde el mismo sitio.',
  next: ['pepa-hablar', 'pepa-botones'],
}

export const TOURS_PEPA: TourDef[] = [visitaPepa, tutPepaHablar, tutPepaApuntar, tutPepaPedirAyuda, tutPepaPreguntas, tutPepaModoRespuesta]
