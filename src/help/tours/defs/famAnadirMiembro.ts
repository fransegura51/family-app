import type { TourDef } from '@/help/tours/types'

// Familia → Añadir un miembro. Controles reales: «+ Añadir miembro», nombre, tipo (con la explicación de cada tipo), los datos opcionales (color, nacimiento, sexo y, para niños e
// invitados, las secciones) y «Añadir». Crear una ficha NO crea ninguna cuenta ni envía ninguna invitación: tras guardar, la propia pantalla pregunta si se quiere dar acceso y el
// tutorial NO lo hace por la persona. Solo la administración de la familia ve «+ Añadir miembro»: para el resto el tutorial lo dice en vez de fingir.
// Lo que se dice de cada tipo está comprobado contra el código de Familia (qué hace cada rol y qué secciones se pueden limitar); no se inventa nada.
export const famAnadirMiembro: TourDef = {
  id: 'fam-anadir-miembro',
  version: 2,
  title: 'Añadir un miembro a la familia',
  cardId: 'fam-anadir-miembro',
  durationSec: 90,
  startPath: '/familia',
  startDest: 'familia.anadir-miembro',
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
      text: 'Escribe su nombre. Cuando termines, pulsa ✓ en el teclado o «Siguiente».',
      target: 'family.member-name',
      completeOn: [{ type: 'entered', target: 'family.member-name', min: 2 }],
      manualNext: true,
    },
    {
      id: 'tipo',
      text: 'Elige qué es esta persona. Si ya es el correcto, pulsa «Siguiente». Despliega «Qué significa cada tipo» para verlo.',
      target: 'family.member-type',
      completeOn: [{ type: 'change', target: 'family.member-type' }],
      manualNext: true,
      detailsLabel: 'Qué significa cada tipo',
      details: [
        {
          title: 'Administrador/a',
          text: 'administra la familia en PEPA: añade y borra miembros, edita cualquier ficha, crea los códigos de invitación y decide a qué secciones entran los niños y los invitados. No es lo mismo que administrar la aplicación PEPA, que es otra cosa.',
        },
        { title: 'Adulto', text: 'tiene su cuenta con acceso a todas las secciones y gestiona puntos y recompensas, pero no administra la familia (no añade ni borra miembros ni crea invitaciones).' },
        { title: 'Niño/a', text: 'puede tener su cuenta propia; la administración puede limitar a qué secciones entra. Algunas funciones son solo para personas adultas.' },
        { title: 'Bebé', text: 'solo tiene ficha (peso, medidas…): no tiene cuenta propia, así que no se le ofrece dar acceso a PEPA.' },
        { title: 'Invitado/a', text: 'acceso limitado: solo entra en las secciones que elijas, por ejemplo para abuelos o canguros.' },
      ],
    },
    // ── Datos opcionales: se pueden recorrer o saltar de golpe
    {
      id: 'color',
      text: 'El color identifica a esta persona en el calendario y en las listas. Es opcional; puedes dejar el que viene.',
      target: 'family.member-color',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'nacimiento',
      text: 'La fecha de nacimiento es opcional. Sirve para los cumpleaños y para Comunidad PEPA, que es solo para mayores de 18 años: sin fecha no se entra en Comunidad (nunca se supone que alguien es adulto).',
      target: 'family.member-birth',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'sexo',
      text: 'El sexo es opcional y solo se usa para las curvas de crecimiento del peso y las medidas.',
      target: 'family.member-sex',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
    },
    {
      id: 'secciones',
      text: 'Como es Niño/a o Invitado/a, aquí marcas las secciones a las que podrá entrar. Inicio siempre está disponible.',
      target: 'family.member-sections',
      completeOn: [],
      manualNext: true,
      optional: true,
      group: 'datos',
      skipGroupLabel: 'Saltar datos opcionales',
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
