import type { TourDef } from '@/help/tours/types'

// Familia → Añadir un miembro. Controles reales: «+ Añadir miembro», nombre, tipo y «Añadir». Crear una ficha NO crea ninguna cuenta ni envía ninguna invitación: tras guardar, la
// propia pantalla pregunta si se quiere dar acceso y el tutorial NO lo hace por la persona (el mensaje final lo explica).
export const famAnadirMiembro: TourDef = {
  id: 'fam-anadir-miembro',
  version: 1,
  title: 'Añadir un miembro a la familia',
  cardId: 'fam-anadir-miembro',
  durationSec: 60,
  startPath: '/familia',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a añadir a alguien a la familia. Pulsa «+ Añadir miembro».',
      target: 'family.add-member',
      completeOn: [
        { type: 'click', target: 'family.add-member' },
        { type: 'appear', target: 'family.member-name' },
      ],
      skipIf: [{ type: 'appear', target: 'family.member-name' }],
    },
    {
      id: 'nombre',
      text: 'Escribe su nombre.',
      target: 'family.member-name',
      completeOn: [{ type: 'filled', target: 'family.member-name', min: 2 }],
    },
    {
      id: 'tipo',
      text: 'Elige qué es: Administrador/a, Adulto, Niño/a, Bebé o Invitado/a. Si ya es el correcto, pulsa «Siguiente».',
      target: 'family.member-type',
      completeOn: [{ type: 'change', target: 'family.member-type' }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «Añadir». Crear la ficha no crea ninguna cuenta ni manda ninguna invitación.',
      target: 'family.member-save',
      completeOn: [{ type: 'event', name: 'family.member-added' }],
      sensitive: true,
    },
  ],
  finishText:
    '¡Listo! La ficha está creada. Ahora PEPA te preguntará si quieres darle acceso: puedes pulsar «Ahora no» y hacerlo más tarde desde el ⋯ de su ficha. Yo no envío ninguna invitación por ti.',
  next: ['fam-codigo-acceso', 'fam-editar-ficha'],
}
