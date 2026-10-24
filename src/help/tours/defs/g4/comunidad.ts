import type { TourDef, TourStep } from '@/help/tours/types'

// Comunidad PEPA (g4): visita guiada y tutorial del alias, registrados. Los tutoriales de las pantallas interiores (publicación, editor) están en comunidadPendientes.ts SIN registrar:
// el motor da por «fuera de ruta» todo lo que no sea exactamente la ruta de partida y la lista de rutas conocidas (src/help/routes.ts) solo trae '/comunidad' (no /comunidad/p/:id,
// /comunidad/nueva…). Hasta que eso se amplíe, esos recorridos se pausarían al primer toque. Nada de lo de aquí publica, comenta, valora, propone temas, borra, denuncia ni comparte.

export const comunidadVisita: TourDef = {
  id: 'visita-comunidad',
  kind: 'visit',
  module: 'comunidad',
  title: 'Conoce Comunidad',
  summary: 'Un paseo por Comunidad PEPA: secciones, buscador, barra de herramientas y qué es público.',
  access: { community: true },
  version: 1,
  cardId: 'com2-que-es',
  durationSec: 110,
  startPath: '/comunidad',
  steps: [
    {
      id: 'intro',
      text: 'Comunidad PEPA es un sitio para compartir recetas, consejos y conversación con otras familias. Es solo para personas adultas. Te enseño la portada; no voy a publicar nada.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'secciones',
      text: 'Hay dos secciones: «Recetas y cocina» y «Hogar y familia». Toca una para ver sus publicaciones.',
      target: 'comunidad.sections',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'buscar',
      text: 'Con el buscador encuentras publicaciones por palabras. Para leer y buscar no necesitas alias.',
      target: 'comunidad.search',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'barra',
      text: 'La barra de abajo da acceso rápido a Buscar, Guardados, Borradores, Novedades, Mi perfil y Publicar. Según tu permiso, algunos accesos pueden no salir.',
      target: 'comunidad.toolbar',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'crear',
      text: '«✍️ Crear publicación» abre el editor. La primera vez te pide elegir un alias y aceptar las normas. Nada se publica hasta que tú pulses «Publicar».',
      target: 'comunidad.create-post',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'bloques',
      text: 'Más abajo hay bloques como «Más recientes», «Más comentados» y «Preguntas sin responder». Si tienes alias, también «Para mí». Toca una tarjeta para abrir la publicación.',
      target: 'comunidad.home-block',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'normas',
      text: 'Aquí están las normas de Comunidad. Léelas con calma: te dicen qué se puede publicar y qué no, y cómo denunciar o bloquear.',
      target: 'comunidad.rules-link',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'publico',
      text: 'Ojo: en Comunidad no apareces con tu nombre, sino con un alias. Lo que publicas lo puede leer más gente, así que no pongas datos privados. Los borradores son solo tuyos.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: '¡Eso es la portada de Comunidad! Si quieres, te enseño a elegir tu alias.',
  next: ['com2-alias', 'com2-publicar', 'com2-que-es'],
}

const crearBoton = (id: string): TourStep => ({
  id,
  text: 'Pulsa «✍️ Crear publicación». La primera vez, PEPA te pide el alias antes de abrir el editor. Si ya tienes alias, te lleva directo a escribir: en ese caso pulsa «Salir».',
  target: 'comunidad.create-post',
  completeOn: [
    { type: 'click', target: 'comunidad.create-post' },
    { type: 'appear', target: 'comunidad.alias-input' },
  ],
  skipIf: [{ type: 'appear', target: 'comunidad.alias-input' }],
})

export const comunidadElegirAlias: TourDef = {
  id: 'tut-comunidad-elegir-alias',
  module: 'comunidad',
  summary: 'Elegir tu alias público y aceptar las normas de Comunidad (solo si aún no lo has hecho).',
  group: 'Mi perfil',
  access: { community: true },
  version: 1,
  title: 'Elegir mi alias y aceptar las normas',
  cardId: 'com2-alias',
  durationSec: 100,
  startPath: '/comunidad',
  steps: [
    crearBoton('crear'),
    {
      id: 'alias',
      text: 'Este es tu alias público: el nombre que verán las demás familias. No es tu nombre real. PEPA te propone uno; puedes quedártelo o escribir el tuyo (de 3 a 24 caracteres).',
      target: 'comunidad.alias-input',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'sugerir',
      text: '«🎲 Sugerir otro» te da otra propuesta cada vez que lo pulses. No se guarda nada hasta el final.',
      target: 'comunidad.alias-suggest',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'opciones',
    },
    {
      id: 'icono',
      text: 'Si quieres, elige un icono. Es opcional. Se ve junto a tu alias.',
      target: 'comunidad.alias-emoji',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'opciones',
    },
    {
      id: 'normas',
      text: 'Estas son las normas de Comunidad. Léelas con calma: dicen, por ejemplo, que no se comparten datos privados y que lo que publicas es público.',
      target: 'comunidad.alias-rules',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'aceptar',
      text: 'Para continuar tienes que marcar «He leído y acepto las normas». Hazlo tú cuando las hayas leído.',
      target: 'comunidad.alias-accept',
      completeOn: [{ type: 'change', target: 'comunidad.alias-accept' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'guardar',
      text: 'Cuando lo tengas, pulsa «Guardar y continuar». Yo no lo pulso por ti.',
      target: 'comunidad.alias-save',
      completeOn: [{ type: 'event', name: 'comunidad.alias-saved' }],
      sensitive: true,
    },
  ],
  finishText: 'Tu alias ya está guardado. Se abrirá el editor de una publicación nueva, pero no se publica nada hasta que tú pulses «Publicar». Puedes cambiar el alias cuando quieras desde Mi perfil.',
  next: ['com2-publicar', 'com2-alias'],
}

export const TOURS_COMUNIDAD: TourDef[] = [comunidadVisita, comunidadElegirAlias]
