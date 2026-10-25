import type { TourDef } from '@/help/tours/types'

// Ubicación (grupo g9): compartir la ubicación desde este móvil y el permiso «Permitir todo el tiempo» de Android. Marcas `data-help-id` en src/ui/LocationScreen.tsx y src/ui/BackgroundLocationCard.tsx.
// Ninguno activa el consentimiento de nadie, ni elige quién lleva el móvil, ni empieza a compartir posición: «Activar/Desactivar» y los nombres de «Este dispositivo» solo se señalan.
// El permiso de Android se concede en los ajustes del sistema, fuera de PEPA: el capítulo llega hasta el botón «Abrir ajustes de PEPA» y explica el resto.
// «Ver dónde está cada miembro» ya no es un tutorial: lo cubre la visita «Conoce Ubicación» (alias → tut-ubicacion-compartir-movil).
// Sobre la ubicación con la app CERRADA: Android sí (con «Permitir todo el tiempo»); iPhone SIN PROBAR en un iPhone real (docs/APP_IOS.md): no se afirma que funcione.

export const tutUbicacionCompartirMovil: TourDef = {
  id: 'tut-ubicacion-compartir-movil',
  module: 'ubicacion',
  summary: 'Dónde se activa el permiso de cada persona, quién lleva este móvil y qué pasa con la app cerrada (sin activar nada por ti).',
  version: 2,
  title: 'Compartir mi ubicación',
  cardId: 'ubi-compartir-movil',
  durationSec: 100,
  startPath: '/ubicacion',
  startDest: 'ubicacion.compartir',
  readyOn: ['ubicacion.consent-list'],
  steps: [
    {
      id: 'consentimiento',
      text: 'En «¿Quién puede compartir?» cada persona se activa con su botón: tú solo la tuya; la administración, la de todos. Mientras diga «Desactivado», no se guarda ninguna posición. Si te activas tú, este móvil empieza a compartir como tú. Yo no lo pulso.',
      target: 'ubicacion.consent-list',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'dispositivo',
      text: 'En «Este dispositivo» eliges quién lleva este móvil, entre las personas con la ubicación activada. Desde ahí el móvil manda su posición como esa persona. Para parar, «Dejar de compartir». El móvil puede pedirte permiso.',
      target: 'ubicacion.device-picker',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'limite',
      text: 'En la web, la posición se manda solo con PEPA abierta. Con la app cerrada: en la app de Android sí (con «Permitir todo el tiempo»); en la de iPhone todavía no está comprobado, así que no cuentes con ello.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'estoy-aqui',
      text: 'Si solo quieres decir dónde estás ahora, sin activar nada, abre la pestaña «📍 ¡Estoy aquí!».',
      target: 'ubicacion.tab-here',
      completeOn: [
        { type: 'click', target: 'ubicacion.tab-here' },
        { type: 'appear', target: 'ubicacion.estoy-aqui-boton' },
      ],
      manualNext: true,
      optional: true,
    },
    {
      id: 'compartir-aqui',
      text: '«📍 Compartir mi ubicación actual» abre el menú de compartir de tu móvil con un enlace de Google Maps: no activa nada. Debajo puedes guardar este sitio como «Casa» o «Trabajo» (eso sí se guarda). Yo no pulso nada.',
      target: 'ubicacion.estoy-aqui-boton',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he activado nada: cuando quieras compartir tu ubicación, hazlo tú desde tu botón y elige este móvil en «Este dispositivo».',
  next: ['ubi-ver', 'ubi-lugares', 'ubi-permiso-android'],
}

export const tutUbicacionPermisoAndroid: TourDef = {
  id: 'tut-ubicacion-permiso-android',
  module: 'ubicacion',
  summary: 'Qué hacer cuando PEPA avisa de que falta el permiso «Permitir todo el tiempo» en Android.',
  access: { platforms: ['android'] },
  version: 2,
  title: 'Con la app cerrada (solo Android)',
  cardId: 'ubi-permiso-android',
  durationSec: 80,
  startPath: '/menu-organizar',
  startDest: 'config.avisos',
  steps: [
    {
      id: 'avisos',
      text: 'Estamos en Configuración, en el tema «Avisos». Aquí aparece la tarjeta del permiso de ubicación cuando falta.',
      target: 'config.group-avisos',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'tarjeta',
      text: 'Esta tarjeta avisa de que falta «Permitir todo el tiempo». Sin él, si Android reinicia PEPA en segundo plano, los avisos de llegada y salida llegan tarde, al abrir la app.',
      target: 'config.background-location',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'boton',
      text: '«Abrir ajustes de PEPA» te lleva a los ajustes de Android: Permisos, Ubicación, «Permitir todo el tiempo» (y «Usar ubicación precisa» activada). Eso lo haces tú, fuera de PEPA.',
      target: 'config.background-location-open',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'sin-tarjeta',
      text: 'Al volver a PEPA, la tarjeta desaparece sola. Si no la ves, o ya tienes el permiso o no estás en la app de Android: no hay nada más que hacer. En iPhone, la ubicación con la app cerrada todavía no está comprobada.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he cambiado ningún permiso: se concede en los ajustes de tu móvil.',
  next: ['ubi-lugares', 'ubi-compartir-movil'],
}

export const TOURS_G9_UBICACION: TourDef[] = [tutUbicacionCompartirMovil, tutUbicacionPermisoAndroid]
