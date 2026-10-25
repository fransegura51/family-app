import type { TourDef } from '@/help/tours/types'

// Cumpleaños (g6): tutorial principal «Favoritos y fechas» con dos capítulos (ver src/help/tours/series/d.ts). Solo administración de la familia: en las fichas de FAMILIA la base de
// datos solo deja modificar a quien administra la familia (política «family_members: admin update», 0001); a las demás personas adultas el cambio no se les guardaría (la consulta no da
// error pero no actualiza nada). Con los contactos sí puede cualquiera, pero la lista mezcla ambas cosas. Es un hallazgo de PRODUCTO (la pantalla muestra ⭐ y ✏️ a todo el mundo): aquí
// solo se declara el acceso y no se cambia la pantalla.
// Cada capítulo espera a que cargue la lista (`readyOn`) y avisa si todavía no hay ningún cumpleaños guardado (`needs`), en vez de romperse.

const info = { completeOn: [] as never[], manualNext: true }

export const tutCumpleanosFavorito: TourDef = {
  id: 'tut-cumpleanos-favorito',
  module: 'cumpleanos',
  group: 'Cumpleaños',
  access: { familyAdmin: true },
  summary: 'Marca un cumpleaños como favorito con la estrella.',
  version: 2,
  title: 'Marcar un cumpleaños como favorito',
  cardId: 'cum-ver',
  durationSec: 60,
  startPath: '/cumpleanos',
  readyOn: ['cumpleanos.lista'],
  needs: [{ target: 'cumpleanos.favorito', message: 'Para este capítulo necesitas al menos un cumpleaños en la lista: falta poner la fecha de nacimiento en Familia o en Contactos. Mientras tanto puedes verlo solo leyendo.' }],
  steps: [
    {
      id: 'lista',
      text: 'Aquí están los próximos cumpleaños de la familia y de tus contactos. La ⭐ se guarda de verdad al tocarla y la ve toda la familia; si solo practicas, sal del tutorial antes.',
      target: 'cumpleanos.lista',
      ...info,
    },
    {
      id: 'favorito',
      text: 'Toca la estrella de la persona que quieras tener a mano: ☆ la marca como favorita y ⭐ (si ya lo era) le quita la marca. Se guarda al momento.',
      target: 'cumpleanos.favorito',
      completeOn: [{ type: 'event', name: 'birthdays.favorite-saved' }],
      sensitive: true,
    },
    {
      id: 'filtro',
      text: 'Pulsa «Favoritos» para ver solo las personas marcadas con ⭐. Con «Próximos» vuelves a verlas todas.',
      target: 'cumpleanos.filtros',
      completeOn: [{ type: 'click', target: 'cumpleanos.filtros' }],
      manualNext: true,
    },
  ],
  finishText: '¡Listo! Los favoritos quedan guardados para toda la familia. Para quitar uno, vuelve a tocar su ⭐. El aviso diario de las 09:00 es para todos los cumpleaños de hoy y de mañana, no solo para los favoritos.',
  next: ['cum-ver'],
}

export const tutCumpleanosCambiarFecha: TourDef = {
  id: 'tut-cumpleanos-cambiar-fecha',
  module: 'cumpleanos',
  group: 'Cumpleaños',
  access: { familyAdmin: true },
  summary: 'Cambia la fecha de un cumpleaños.',
  version: 2,
  title: 'Cambiar la fecha de un cumpleaños',
  cardId: 'cum-ver',
  durationSec: 70,
  startPath: '/cumpleanos',
  readyOn: ['cumpleanos.lista'],
  needs: [{ target: 'cumpleanos.editar', message: 'Para este capítulo necesitas al menos un cumpleaños en la lista: falta poner la fecha de nacimiento en Familia o en Contactos. Mientras tanto puedes verlo solo leyendo.' }],
  steps: [
    {
      id: 'editar',
      text: 'Pulsa ✏️ en la persona cuya fecha quieras cambiar. La fecha nueva se guarda de verdad al pulsar «Guardar»; si no quieres cambiar nada, sal del tutorial o pulsa «Cancelar».',
      target: 'cumpleanos.editar',
      completeOn: [
        { type: 'click', target: 'cumpleanos.editar' },
        { type: 'appear', target: 'cumpleanos.fecha' },
      ],
      skipIf: [{ type: 'appear', target: 'cumpleanos.fecha' }],
    },
    {
      id: 'fecha',
      text: 'Elige la fecha correcta. Cuando la hayas elegido seguiré yo. La edad que cumple se recalcula sola. Todavía no se guarda nada.',
      target: 'cumpleanos.fecha',
      native: true,
      completeOn: [{ type: 'confirmed', target: 'cumpleanos.fecha' }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «Guardar»: la fecha se guarda de verdad. Yo no lo pulso por ti. Si no quieres cambiar nada, pulsa «Cancelar» y sal del tutorial.',
      target: 'cumpleanos.fecha-guardar',
      completeOn: [{ type: 'event', name: 'birthdays.date-saved' }],
      sensitive: true,
    },
  ],
  finishText: '¡Listo! La fecha queda guardada y la lista se reordena según lo que falte para el cumpleaños.',
  next: ['cum-ver'],
}

export const TOURS_CUMPLEANOS: TourDef[] = [tutCumpleanosFavorito, tutCumpleanosCambiarFecha]
