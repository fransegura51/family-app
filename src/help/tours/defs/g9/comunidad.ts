import type { TourDef } from '@/help/tours/types'

// Comunidad PEPA (grupo g9): cómo denunciar o bloquear. Marcas `data-help-id` en src/ui/community/* (PostCardView, PostActions, ContentMenu). Solo se ofrece a quien puede entrar en Comunidad
// (`access: { community: true }`). «Por qué no puedo entrar» está en defs/g9/familia.ts (tutComunidadSinAcceso): quien no tiene acceso no puede recorrer Comunidad, así que ese recorrido se hace
// en su ficha de Familia. «Qué es Comunidad PEPA» ya no es un tutorial: lo cubre la visita «Conoce Comunidad» (alias → tut-comunidad-elegir-alias).
// El de denunciar NUNCA denuncia ni bloquea: abre el menú «Más» de una publicación (que solo despliega opciones) y explica «Denunciar» y «Bloquear a esta persona» sin pulsarlas.

export const tutComunidadDenunciar: TourDef = {
  id: 'tut-comunidad-denunciar',
  module: 'comunidad',
  summary: 'Dónde se denuncia una publicación o se bloquea a una persona (sin denunciar ni bloquear a nadie).',
  access: { community: true },
  version: 2,
  title: 'Denunciar o bloquear en Comunidad',
  cardId: 'com2-denunciar',
  durationSec: 90,
  startPath: '/comunidad',
  paths: ['/comunidad/*'],
  readyOn: ['comunidad.post-card'],
  needs: [{ target: 'comunidad.post-card', message: 'Para practicar este capítulo necesitas ver alguna publicación en la portada de Comunidad, y ahora no hay ninguna. Puedes verlo solo leyendo o salir y volver cuando haya alguna.' }],
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
      text: 'Debajo de la publicación pulsa «Más». Solo despliega opciones; no hace nada más. Si la publicación es tuya, saldrán Editar y Eliminar y no habrá «Denunciar»: abre otra.',
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
      text: 'También puedes bloquear o denunciar a alguien desde su perfil. Con tres advertencias, una persona queda sin acceso a Comunidad durante 30 días y puede pedir volver; su cuenta familiar no se toca.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. No he denunciado ni bloqueado a nadie: si lo necesitas, hazlo tú desde el menú «Más» de la publicación.',
  next: ['com2-que-es', 'com2-publicar'],
}

export const TOURS_G9_COMUNIDAD: TourDef[] = [tutComunidadDenunciar]
