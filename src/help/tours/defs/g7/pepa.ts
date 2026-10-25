import type { TourDef, TourStep } from '@/help/tours/types'

// Visita y capítulos de la serie «Hablar con PEPA» (src/help/tours/series/e.ts). Comprobado contra src/ui/VoiceCapture.tsx (botón 💬 y su panel), src/ui/ActionConfirmSheet.tsx (la tarjeta de revisión),
// src/services/pepaPreferences.ts y src/pepa/autoConfirm.ts.
// IMPORTANTE (tarjeta o guardado directo): «nada se guarda hasta confirmar» NO es siempre cierto. El ajuste «Hacerlo directamente, sin tarjeta» (`getAutoConfirm()`) viene ACTIVADO por defecto en la
// app del móvil (isNativeApp) y desactivado en la web. Aun en directo, la tarjeta vuelve si es un presupuesto, si hay avisos (duplicado, choque de horario), si queda alguna elección sin hacer o si es una
// tarea sin persona. Por eso los textos hablan de los DOS modos y el capítulo «Apuntar» usa una frase que SIEMPRE deja la tarjeta (una tarea sin persona).
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
  summary: 'El botón 💬 y su panel: hablar o escribir, ejemplos, cómo respondo y cuándo se guarda lo que apunto.',
  version: 2,
  cardId: 'pepa-hablar',
  durationSec: 90,
  startPath: '/',
  steps: [
    {
      id: 'boton',
      text: 'Este botón 💬 es la forma de hablar conmigo: me preguntas o me pides que apunte cosas, con la voz o escribiendo.',
      target: 'pepa.boton',
      ...info,
    },
    {
      id: 'clasicos',
      text: 'Si no los has ocultado, junto a él hay cinco botones clásicos: Pepa Calendario y Pepa Compra (preguntan), Apuntar Calendario y Apuntar Compra, y Buscar sitio. Se ocultan en Configuración → Pepa.',
      target: 'pepa.botones-clasicos',
      ...info,
      optional: true,
    },
    {
      id: 'panel',
      // Se describe el panel SIN abrirlo: una visita no espera clics (y con el panel cerrado sus controles no existen). Dentro del panel se enseña en los tutoriales.
      text: 'Al tocarlo se abre el panel: arriba «🎤 Toca y habla» (si tu navegador admite dictado), unos ejemplos que se ponen en el cuadro al tocarlos, el cuadro para escribir con «Enviar», y abajo «🔊 Hablando» o «💬 Por escrito».',
      target: 'pepa.boton',
      ...info,
    },
    {
      id: 'modo',
      text: 'Con «🔊 Hablando» te contesto escribiendo y leyendo la respuesta; con «💬 Por escrito», solo escribo. Las preguntas las contesto directamente.',
      target: 'pepa.boton',
      ...info,
    },
    {
      id: 'tarjeta',
      text: 'Si me pides apuntar algo, a veces te enseño una tarjeta para revisarlo y se guarda al pulsar el botón de guardar. Con «sin tarjeta» activado (así viene en la app del móvil), se guarda al momento, salvo presupuestos, avisos o dudas. Borrar por voz no lo hago.',
      ...info,
    },
  ],
  finishText: 'Eso es Hablar con PEPA. Para practicar, prueba el tutorial «Hablar con PEPA»: preguntar, apuntar algo y pedir ayuda.',
  next: ['pepa-hablar', 'pepa-apuntar', 'pepa-sin-tarjeta'],
}

export const tutPepaHablar: TourDef = {
  id: 'tut-pepa-hablar',
  module: 'pepa',
  summary: 'Abre el panel de Pepa y hazle una pregunta, hablando o escribiendo: calendario, compra, menú, tiempo, tráfico, hora y economía.',
  version: 2,
  title: 'Preguntar a Pepa',
  cardId: 'pepa-hablar',
  durationSec: 90,
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
      text: 'Si no sabes qué decir, toca un ejemplo y se pone en el cuadro. Para preguntar, elige uno con ¿?: los que mandan apuntar algo (leche, el dentista…) pueden guardarse al enviarlos.',
      target: 'pepa.ejemplos',
      ...info,
    },
    {
      id: 'texto',
      text: 'Escribe tu pregunta aquí, por ejemplo «¿Qué tengo mañana?». Cuando acabes, deja el teclado.',
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
    {
      id: 'temas',
      text: 'Puedes preguntarme por tu calendario, la lista de la compra, el menú, el tiempo, el tráfico hasta un sitio, la hora y tu economía. Si algo no lo entiendo, te lo digo.',
      target: 'pepa.panel',
      ...info,
      optional: true,
      details: [{ title: 'Economía', text: 'Tu economía la calculo con tus datos, sin enviarlos a ningún sitio.' }],
      detailsLabel: 'Más detalles',
    },
  ],
  finishText: 'Eso es todo. Las preguntas las contesto al momento. Si me pides apuntar algo, mira el siguiente capítulo: puede salir una tarjeta para revisarlo o guardarse al momento.',
  next: ['pepa-apuntar', 'pepa-modo-respuesta'],
}

export const tutPepaApuntar: TourDef = {
  id: 'tut-pepa-apuntar',
  module: 'pepa',
  summary: 'Pídele a Pepa que apunte una tarea y revisa la tarjeta: «Para», «Guardar como» y guardar o cancelar.',
  version: 2,
  title: 'Apuntar y revisar la tarjeta',
  cardId: 'pepa-apuntar',
  durationSec: 110,
  startPath: '/',
  steps: [
    abrirBoton,
    {
      id: 'texto',
      text: 'Escribe esta frase tal cual: «Tengo que llamar al fontanero». Es una tarea sin persona, así que SIEMPRE enseña la tarjeta antes de guardar. Con otras frases y «sin tarjeta» activado, lo que apuntes se guarda al momento.',
      target: 'pepa.texto',
      completeOn: [{ type: 'entered', target: 'pepa.texto', min: 5 }],
      manualNext: true,
    },
    {
      id: 'enviar',
      text: 'Pulsa «Enviar». Con esa frase sale una tarjeta y todavía no se guarda nada. Si no quieres seguir, pulsa «Siguiente» sin enviar y borra el texto.',
      target: 'pepa.enviar',
      completeOn: [{ type: 'appear', target: 'pepa.tarjeta' }],
      manualNext: true,
    },
    {
      id: 'tarjeta',
      text: 'Esta es la tarjeta: te cuenta qué voy a hacer, con el título, el día y la hora. Léela con calma.',
      target: 'pepa.tarjeta',
      ...info,
      optional: true,
    },
    {
      id: 'para',
      text: '«Para» dice a quién va. Por defecto es «Toda la familia»; elige a una persona si la tarea es suya. Una tarea sin persona es justo lo que hace que salga siempre esta tarjeta.',
      target: 'pepa.tarjeta-opcion-member',
      ...info,
      optional: true,
    },
    {
      id: 'guardar-como',
      text: 'En «Guardar como» cambias entre Evento y Tarea. Una tarea se guarda sin hora, sin repetición y sin avisos.',
      target: 'pepa.tarjeta-opcion-kind',
      ...info,
      optional: true,
    },
    {
      id: 'confirmar',
      text: 'Solo se guarda cuando tú pulsas el botón de guardar («Guardar tarea»). Yo no lo pulso. Si solo estás practicando, pulsa «Cancelar» y no se guarda nada.',
      target: 'pepa.tarjeta-confirmar',
      ...info,
      optional: true,
    },
    {
      id: 'sin-tarjeta',
      text: 'Ojo: con «Hacerlo directamente, sin tarjeta» activado (así viene en la app del móvil), lo que apuntes se guarda al momento, salvo presupuestos, avisos, dudas y tareas sin persona. Se cambia en Configuración → Pepa.',
      ...info,
    },
  ],
  finishText: 'Eso es todo. Si ves la tarjeta, no se guarda nada hasta que pulses guardar; cancelar no guarda nada. Sin tarjeta, las frases sencillas se guardan al momento.',
  next: ['pepa-sin-tarjeta', 'pepa-pedir-ayuda'],
}

export const tutPepaPedirAyuda: TourDef = {
  id: 'tut-pepa-pedir-ayuda',
  module: 'pepa',
  summary: 'Pídele ayuda a Pepa por voz («necesito ayuda con compras») y te lleva y te explica.',
  version: 2,
  title: 'Pedir ayuda a Pepa',
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

export const tutPepaModoRespuesta: TourDef = {
  id: 'tut-pepa-modo-respuesta',
  module: 'pepa',
  summary: 'Elige si Pepa te contesta en voz alta o solo por escrito.',
  version: 2,
  title: 'Cómo quiero que me conteste',
  cardId: 'pepa-modo-respuesta',
  durationSec: 60,
  startPath: '/',
  steps: [
    abrirBoton,
    {
      id: 'modo',
      text: 'Abajo del panel eliges cómo prefieres que te conteste: «🔊 Hablando» escribe y lee la respuesta; «💬 Por escrito» solo escribe. Toca el que quieras (se guarda al momento, solo para ti) o pulsa «Siguiente».',
      target: 'pepa.modo',
      completeOn: [{ type: 'click', target: 'pepa.modo' }],
      manualNext: true,
    },
    {
      id: 'aparte',
      text: 'Esta opción es solo de «Hablar con PEPA». La voz con la que te explico la Ayuda se elige aparte, en la propia Ayuda. Y si quieres ver la tarjeta o no, o los botones clásicos, mira el siguiente capítulo.',
      ...info,
    },
  ],
  finishText: 'Hecho. Puedes cambiarlo siempre que quieras desde el mismo sitio.',
  next: ['pepa-hablar', 'pepa-sin-tarjeta'],
}

export const tutPepaSinTarjeta: TourDef = {
  id: 'tut-pepa-sin-tarjeta',
  module: 'pepa',
  summary: 'Elegir si Pepa te enseña una tarjeta antes de guardar o lo hace al momento, y dónde mostrar u ocultar los botones clásicos.',
  version: 2,
  title: 'Tarjeta y botones de Pepa',
  cardId: 'pepa-sin-tarjeta',
  durationSec: 90,
  startPath: '/menu-organizar',
  startDest: 'config.pepa',
  steps: [
    {
      id: 'tarjeta',
      text: 'Cuando me pides algo (apuntar leche, un evento…), puedo enseñarte antes una tarjeta para revisarlo o hacerlo al momento. En la app del móvil viene al momento (sin tarjeta); en la web, con tarjeta. Esta tarjeta de Configuración lo cambia.',
      target: 'pepa.auto-confirm',
      ...info,
    },
    {
      id: 'casilla',
      text: 'Marcada «Hacerlo directamente, sin tarjeta», lo que me pidas se hace al momento; sin marcar, ves antes la tarjeta. Se guarda al marcarla. Yo no la toco por ti; si prefieres dejarlo como está, pulsa «Salir».',
      target: 'pepa.auto-confirm',
      completeOn: [{ type: 'event', name: 'pepa.auto-confirm-changed' }],
      sensitive: true,
    },
    {
      id: 'limites',
      text: 'Aunque esté marcada, te enseño la tarjeta si toca dinero (presupuestos), si algo no cuadra (un duplicado, un choque de horario), si falta elegir algo o si es una tarea sin persona. Puedes volver a cambiarlo cuando quieras.',
      target: 'pepa.auto-confirm',
      ...info,
    },
    {
      id: 'botones',
      text: 'En esta otra tarjeta, «Mostrar botones clásicos» decide si arriba ves los cinco botones de siempre además del 💬. Se guarda al marcarla y no se borran, solo se esconden. Cámbiala tú si quieres, o pulsa «Siguiente».',
      target: 'pepa.classic-buttons',
      completeOn: [{ type: 'event', name: 'pepa.classic-buttons-changed' }],
      manualNext: true,
    },
  ],
  finishText: 'Listo. Son preferencias tuyas: se guardan en tu cuenta y no cambian lo de los demás. Cuando quieras cambiarlas, vuelve a Configuración → «Pepa».',
  next: ['pepa-hablar', 'pepa-apuntar'],
}

export const TOURS_PEPA: TourDef[] = [visitaPepa, tutPepaHablar, tutPepaApuntar, tutPepaPedirAyuda, tutPepaModoRespuesta, tutPepaSinTarjeta]
