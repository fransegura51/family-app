import type { TourDef } from '@/help/tours/types'

// Familia → Añadir un miembro (capítulo 1 de «Gestionar las fichas de la familia»). Controles reales: «+ Añadir miembro», nombre, tipo, los datos opcionales (color, nacimiento, sexo y, para niños
// e invitados, las secciones), «Añadir» y la pantalla que sale justo después: «Ficha creada: … ¿Quieres darle acceso a PEPA ahora?» (no sale para bebés). Crear una ficha NO crea ninguna cuenta ni
// envía ninguna invitación y el tutorial NO da acceso por la persona. Solo la administración de la familia ve «+ Añadir miembro»: por eso el capítulo lleva `access: familyAdmin`.
// Qué significa cada tipo de miembro NO se repite aquí: vive en «Entiende cómo funciona» (exp-familia-tipos-de-miembro).
export const famAnadirMiembro: TourDef = {
  id: 'fam-anadir-miembro',
  module: 'familia',
  summary: 'Crear la ficha de una persona de la familia (sin crear ninguna cuenta ni enviar invitaciones).',
  group: 'Fichas',
  access: { familyAdmin: true },
  version: 3,
  title: 'Añadir un miembro a la familia',
  cardId: 'fam-anadir-miembro',
  durationSec: 100,
  startPath: '/familia',
  startDest: 'familia.anadir-miembro',
  steps: [
    {
      id: 'abrir',
      text: 'Vamos a añadir a alguien a la familia. Pulsa «+ Añadir miembro». La ficha se crea de verdad cuando pulses «Añadir» al final; si solo estás practicando, sal del tutorial antes.',
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
      text: 'Elige qué es esta persona: Administrador/a, Adulto, Niño/a, Bebé o Invitado/a. Un bebé solo tiene ficha, sin cuenta. A un niño/a o un invitado/a se le pueden limitar las secciones. Si ya es el correcto, pulsa «Siguiente».',
      target: 'family.member-type',
      completeOn: [{ type: 'change', target: 'family.member-type' }],
      manualNext: true,
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
    // Lo que PEPA pregunta justo después (no sale para bebés): se explica sin pulsar nada por la persona.
    {
      id: 'oferta',
      text: 'La ficha está creada. PEPA pregunta si quieres darle acceso ahora. «Ahora no» lo deja para luego; «Sí, dar acceso» crea una invitación de 24 horas. Yo no la creo por ti: eliges tú. Cuando termines, «Siguiente».',
      target: 'family.member-offer',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
  ],
  finishText:
    '¡Listo! La ficha está creada y yo no envío ninguna invitación por ti. Si ya hay otra persona adulta en la familia, PEPA puede preguntarte «¿Cómo lleváis las cuentas?» (Compartidas o Separadas): se cambia luego en Configuración.',
  next: ['fam-codigo-acceso', 'fam-editar-ficha'],
}
