import type { TourDef } from '@/help/tours/types'

// Tutoriales del grupo g10: reseñas de la Ayuda (capítulo de la serie «Dar tu opinión»). (Los avisos y Cuentas —activar avisos, PIN, contraseña, correo y las visitas— pasaron a src/help/tours/defs/f/.)
// Comprobado contra src/ui/ReviewsScreen.tsx. Cada toque en las estrellas guarda y la reseña se ve en el panel de la administración de PEPA; el capítulo nunca valora por la persona.

const info = { completeOn: [] as never[], manualNext: true }

// ───────────────────────────── Ayuda: reseñas
export const tutAyudaResenas: TourDef = {
  id: 'tut-ayuda-resenas',
  module: 'ayuda',
  summary: 'Valorar PEPA de 1 a 5 estrellas, contar qué te gusta y qué no, y quitar tu valoración.',
  version: 2,
  title: 'Valorar PEPA con estrellas',
  cardId: 'ini-resenas',
  durationSec: 80,
  startPath: '/resenas',
  readyOn: ['resenas.general'],
  steps: [
    {
      id: 'general',
      text: 'Aquí valoras PEPA en general, de 1 a 5 estrellas. Es tu valoración: cada persona tiene la suya y puedes cambiarla o quitarla cuando quieras. Cada toque en las estrellas guarda de verdad.',
      target: 'resenas.general',
      ...info,
    },
    {
      id: 'estrellas',
      text: 'Toca las estrellas que quieras dar. Se guarda al momento. Yo no valoro por ti; si prefieres no hacerlo ahora, pulsa «Salir».',
      target: 'resenas.general',
      completeOn: [{ type: 'event', name: 'resenas.review-saved' }],
      sensitive: true,
    },
    {
      id: 'comentario',
      text: 'Ya está guardada. Si quieres añadir un comentario, toca «Contar qué me gusta y qué no» (si ya lo tenías, pone «Mi comentario»). Es opcional: o pulsa «Siguiente».',
      target: 'resenas.comentario',
      completeOn: [{ type: 'click', target: 'resenas.comentario' }],
      manualNext: true,
    },
    {
      id: 'cuadros',
      text: 'Se abren dos cuadros: «Lo que me gusta» y «Lo que no me gusta». «Guardar comentario» los guarda; no se guardan solos. Aquí no escribo ni pulso nada por ti.',
      target: 'resenas.comentario-guardar',
      ...info,
      optional: true,
    },
    {
      id: 'quitar',
      text: '«Quitar mi valoración» borra la tuya cuando quieras. Aquí solo te lo enseño: yo no lo pulso.',
      target: 'resenas.quitar',
      ...info,
      optional: true,
    },
    {
      id: 'secciones',
      text: 'Y aquí, si quieres, puedes valorar cada sección por separado: Compras, Economía, Galería… También es opcional.',
      target: 'resenas.secciones',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Gracias por tu opinión. Si quieres proponer un cambio concreto, usa «Sugerencias» en el menú ☰.',
  next: ['ini-sugerencias', 'ayu-usar'],
}
