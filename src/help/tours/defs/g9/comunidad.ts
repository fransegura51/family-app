import type { TourDef } from '@/help/tours/types'

// Comunidad PEPA (grupo g9): qué es y quién puede entrar, y cómo denunciar o bloquear. Marcas `data-help-id` en src/ui/community/* (CommunityHome, PostActions, ContentMenu).
// Los dos se ofrecen solo a quien puede entrar en Comunidad (`access: { community: true }`). «Por qué no puedo entrar» está en defs/g9/familia.ts (tutComunidadSinAcceso): quien no
// tiene acceso no puede recorrer Comunidad, así que ese recorrido se hace en su ficha de Familia.
// El de denunciar NUNCA denuncia ni bloquea: abre el menú «Más» de una publicación (que solo despliega opciones) y explica «Denunciar» y «Bloquear a esta persona» sin pulsarlas.

export const tutComunidadQueEs: TourDef = {
  id: 'tut-comunidad-que-es',
  module: 'comunidad',
  group: 'Comunidad',
  summary: 'Qué es Comunidad PEPA, quién puede entrar y cómo se protege tu identidad.',
  access: { community: true },
  version: 1,
  title: 'Qué es Comunidad PEPA y quién puede entrar',
  cardId: 'com2-que-es',
  durationSec: 90,
  startPath: '/comunidad',
  steps: [
    {
      id: 'intro',
      text: 'Comunidad PEPA es una red de recetas, consejos y conversación entre familias. Es solo para personas con cuenta de PEPA y 18 años cumplidos. Aquí no publico nada por ti.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'secciones',
      text: 'Hay dos secciones: «Recetas y cocina» y «Hogar y familia». Toca una para ver sus publicaciones cuando quieras.',
      target: 'comunidad.sections',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'alias',
      text: 'No apareces con tu nombre, sino con un alias y un icono, que eliges la primera vez que participas. Para leer y buscar no hace falta alias.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'normas',
      text: 'Aquí están las normas: qué se puede publicar y qué no. Lo que publiques lo puede leer más gente, así que no pongas datos privados.',
      target: 'comunidad.rules-link',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'sin-acceso',
      text: 'Si Comunidad no sale en el menú de otra persona de tu familia, es que su cuenta aún no tiene acceso: necesita fecha de nacimiento en su ficha y tener 18 años cumplidos.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: '¡Eso es Comunidad PEPA! Si quieres, te enseño a elegir tu alias o a denunciar un contenido.',
  next: ['com2-alias', 'com2-publicar', 'com2-denunciar'],
}

export const tutComunidadDenunciar: TourDef = {
  id: 'tut-comunidad-denunciar',
  module: 'comunidad',
  group: 'Comunidad',
  summary: 'Dónde se denuncia una publicación o se bloquea a una persona (sin denunciar ni bloquear a nadie).',
  access: { community: true },
  version: 1,
  title: 'Denunciar o bloquear en Comunidad',
  cardId: 'com2-denunciar',
  durationSec: 90,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  steps: [
    {
      id: 'abrir',
      text: 'Abre una publicación de otra persona tocando su tarjeta. Solo vamos a mirar el menú: no denuncio ni bloqueo a nadie.',
      target: 'comunidad.post-card',
      completeOn: [{ type: 'click', target: 'comunidad.post-card' }],
      skipIf: [{ type: 'appear', target: 'comunidad.post-menu' }],
    },
    {
      id: 'menu',
      text: 'Debajo de la publicación pulsa «Más». Solo despliega opciones; no hace nada más. Si la publicación es tuya, saldrán Editar y Eliminar y no habrá «Denunciar».',
      target: 'comunidad.post-menu',
      completeOn: [
        { type: 'click', target: 'comunidad.post-menu' },
        { type: 'appear', target: 'comunidad.post-report' },
      ],
      optional: true,
    },
    {
      id: 'opciones',
      text: '«Denunciar» pide un motivo y la administración revisa la denuncia; por sí sola no borra nada. Si puedes participar, también sale «Bloquear a esta persona»: no os veréis y no se le avisa. Yo no pulso nada.',
      target: 'comunidad.post-report',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'perfil',
      text: 'También puedes bloquear o denunciar a alguien desde su perfil. Con tres advertencias, una persona pierde el acceso a Comunidad, pero no a su cuenta familiar.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he denunciado ni bloqueado a nadie: si lo necesitas, hazlo tú desde el menú «Más» de la publicación.',
  next: ['com2-que-es', 'com2-publicar'],
}

export const TOURS_G9_COMUNIDAD: TourDef[] = [tutComunidadQueEs, tutComunidadDenunciar]
