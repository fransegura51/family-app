import type { TourDef } from '@/help/tours/types'

// Ubicación (grupo g9): ver a la familia en el mapa, compartir la ubicación desde este móvil y el permiso «Permitir todo el tiempo» de Android. Marcas `data-help-id` en
// src/ui/LocationScreen.tsx y src/ui/BackgroundLocationCard.tsx.
// Ninguno activa el consentimiento de nadie, ni elige quién lleva el móvil, ni empieza a compartir posición: «Activar/Desactivar» y los nombres de «Este dispositivo» solo se señalan.
// El permiso de Android se concede en los ajustes del sistema, fuera de PEPA: el tutorial llega hasta el botón «Abrir ajustes de PEPA» y explica el resto.

export const tutUbicacionVerMiembros: TourDef = {
  id: 'tut-ubicacion-ver-miembros',
  module: 'ubicacion',
  group: 'Ubicación',
  summary: 'Mira dónde está cada persona que comparte su ubicación y su recorrido de las últimas 24 horas.',
  version: 1,
  title: 'Ver dónde está cada miembro',
  cardId: 'ubi-ver',
  durationSec: 90,
  startPath: '/ubicacion',
  startDest: 'ubicacion.mapa',
  steps: [
    {
      id: 'mapa',
      text: 'Este es el mapa de la familia. Solo salen las personas que han activado compartir su ubicación, con su recorrido de las últimas 24 horas. Esta visita no comparte nada.',
      target: 'ubicacion.map',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'personas',
      text: 'Arriba están las personas de la familia. Toca una para ver su información debajo del mapa. El símbolo ⏸ significa que esa persona no comparte su ubicación.',
      target: 'ubicacion.member-chips',
      completeOn: [
        { type: 'click', target: 'ubicacion.member-chips' },
        { type: 'appear', target: 'ubicacion.member-info' },
      ],
      manualNext: true,
      optional: true,
    },
    {
      id: 'info',
      text: 'Aquí ves si comparte, cuándo se actualizó su posición y «📍 Abrir en Google Maps». Si puedes cambiar su permiso, también sale «Activar» o «Desactivar»: eso lo decides tú, yo no lo toco.',
      target: 'ubicacion.member-info',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'lineas',
      text: 'Línea continua: recorrido registrado. Línea de rayas: tramo sin datos, porque el móvil solo manda su posición con la app abierta. Pasadas 24 horas, el recorrido se borra solo.',
      target: 'ubicacion.intro',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Si alguien no sale en el mapa, es que todavía no ha activado su ubicación; se hace en «Compartir ubicación».',
  next: ['ubi-lugares', 'ubi-compartir-movil'],
}

export const tutUbicacionCompartirMovil: TourDef = {
  id: 'tut-ubicacion-compartir-movil',
  module: 'ubicacion',
  group: 'Ubicación',
  summary: 'Dónde se activa el consentimiento y se elige quién lleva este móvil (sin activar nada por ti).',
  version: 1,
  title: 'Compartir mi ubicación desde este móvil',
  cardId: 'ubi-compartir-movil',
  durationSec: 100,
  startPath: '/ubicacion',
  startDest: 'ubicacion.mapa',
  steps: [
    {
      id: 'pestana',
      text: 'Pulsa la pestaña «👥 Compartir ubicación», debajo del mapa.',
      target: 'ubicacion.tab-share',
      completeOn: [{ type: 'appear', target: 'ubicacion.consent-list' }],
      skipIf: [{ type: 'appear', target: 'ubicacion.consent-list' }],
    },
    {
      id: 'consentimiento',
      text: 'En «¿Quién puede compartir?» cada persona se activa con su botón. Tú solo puedes activar la tuya; la administración, la de los demás. Mientras esté en «Desactivado», no se guarda ninguna posición. Yo no lo pulso.',
      target: 'ubicacion.consent-list',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'dispositivo',
      text: 'En «Este dispositivo» eliges quién lleva este móvil, entre las personas con la ubicación activada. Desde ahí, el móvil empieza a mandar su posición como esa persona. Si activas la tuya, el móvil te pedirá permiso.',
      target: 'ubicacion.device-picker',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'limite',
      text: 'La posición se manda mientras PEPA está abierta. Con la app cerrada solo funciona en las apps de Android e iPhone, no en la web.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he activado nada: cuando quieras compartir tu ubicación, hazlo tú desde tu botón y elige este móvil en «Este dispositivo».',
  next: ['ubi-ver', 'ubi-lugares', 'ubi-permiso-android'],
}

export const tutUbicacionPermisoAndroid: TourDef = {
  id: 'tut-ubicacion-permiso-android',
  module: 'ubicacion',
  group: 'Ubicación',
  summary: 'Qué hacer cuando PEPA avisa de que falta el permiso «Permitir todo el tiempo» en Android.',
  access: { platforms: ['android'] },
  version: 1,
  title: 'Permiso de ubicación con la app cerrada en Android',
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
      text: 'Al volver a PEPA, la tarjeta desaparece sola. Si no la ves, o ya tienes el permiso o no estás en la app de Android: no hay nada más que hacer.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he cambiado ningún permiso: se concede en los ajustes de tu móvil.',
  next: ['ubi-lugares', 'ubi-compartir-movil'],
}

export const TOURS_G9_UBICACION: TourDef[] = [tutUbicacionVerMiembros, tutUbicacionCompartirMovil, tutUbicacionPermisoAndroid]
