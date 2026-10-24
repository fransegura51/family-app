import type { TourDef } from '@/help/tours/types'

// Familia (grupo g9): dar acceso con un código de invitación, ver la actividad reciente y, para Comunidad, completar la fecha de nacimiento. Marcas `data-help-id` en
// src/ui/FamilyScreen.tsx, src/ui/AccessInvitePanel.tsx y src/ui/ActivityScreen.tsx.
// «Dar acceso» SOLO se señala: generar el código crea una invitación real, así que lo pulsa siempre la administración (el tutorial no espera ni exige ese clic; solo avanza con «Siguiente»
// o cuando el código aparece). Lo de la fecha de nacimiento sí guarda, y espera el aviso `family.member-updated` que lanza la pantalla tras guardar.

export const tutFamiliaCodigoAcceso: TourDef = {
  id: 'tut-familia-codigo-acceso',
  module: 'familia',
  group: 'Familia',
  summary: 'Dónde se genera el código de invitación para que un familiar cree su cuenta (sin generarlo por ti).',
  access: { familyAdmin: true },
  version: 1,
  title: 'Dar acceso a PEPA a un miembro',
  cardId: 'fam-codigo-acceso',
  durationSec: 100,
  startPath: '/familia',
  startDest: 'familia.miembros',
  steps: [
    {
      id: 'fichas',
      text: 'Para dar acceso, la persona primero tiene que tener su ficha (si no, usa «+ Añadir miembro»). Las que aún no tienen cuenta ponen «Sin acceso a PEPA». Aquí solo señalo: no genero ningún código.',
      target: 'family.member-list',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'boton',
      text: 'En su ficha sale «🔑 Dar acceso a PEPA» (también en su ⋯, como «🔑 Generar código de acceso»). Crea un código de invitación de un solo uso. Púlsalo tú si quieres; si no, «Siguiente».',
      target: 'family.give-access',
      completeOn: [{ type: 'appear', target: 'family.access-code' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'codigo',
      text: 'Este es el código: caduca a las 24 horas y vale una sola vez. Si ves «Copiar», «Compartir» o «WhatsApp», sirven para mandárselo a esa persona. Pulsa «Siguiente».',
      target: 'family.access-code',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cuenta',
      text: 'La otra persona abre PEPA, elige «¿No tienes cuenta? Tengo una invitación», escribe el código y crea su correo y contraseña. Su cuenta queda enlazada a su ficha, sin compartir contraseñas.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Si todas las fichas ya tienen cuenta, no sale el botón. Cuando quieras invitar a alguien, genera el código tú desde su ficha.',
  next: ['fam-anadir-miembro', 'fam-invitado-limitado', 'fam-actividad'],
}

export const tutFamiliaActividad: TourDef = {
  id: 'tut-familia-actividad',
  module: 'familia',
  group: 'Familia',
  summary: 'Mira quién ha hecho qué y cuándo en la app.',
  version: 1,
  title: 'Ver la actividad reciente',
  cardId: 'fam-actividad',
  durationSec: 80,
  startPath: '/familia',
  startDest: 'familia.miembros',
  paths: ['/familia', '/actividad'],
  steps: [
    {
      id: 'enlace',
      text: 'Pulsa «🕘 Actividad reciente».',
      target: 'family.activity-link',
      completeOn: [
        { type: 'click', target: 'family.activity-link' },
        { type: 'route', path: '/actividad' },
      ],
    },
    {
      id: 'intro',
      text: 'Aquí ves quién hizo qué y cuándo. Los cambios seguidos de lo mismo se juntan en una sola línea.',
      target: 'actividad.intro',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'lista',
      text: 'Cada tarjeta es una acción reciente. Se nombra el evento, el producto o la persona cuando tu cuenta puede verlo; lo que ya se borró o es privado de otra persona no se puede nombrar.',
      target: 'actividad.lista',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'mas',
      text: '«Ver más antiguas» carga las acciones anteriores, si las hay.',
      target: 'actividad.mas',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'limites',
      text: 'Solo se registran miembros, eventos, tareas, productos de la lista, gastos y reglas de automatización. Lo que hace un proceso automático, como la sincronización con Google, sale como «Un proceso automático de PEPA».',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: '¡Listo! Ya sabes dónde mirar qué ha pasado en la app. Puedes volver a Familia cuando quieras desde el menú.',
  next: ['fam-anadir-miembro', 'fam-editar-ficha'],
}

export const tutComunidadSinAcceso: TourDef = {
  id: 'tut-comunidad-sin-acceso',
  module: 'comunidad',
  group: 'Comunidad',
  summary: 'Si Comunidad no te deja entrar, añade tu fecha de nacimiento en tu ficha de Familia.',
  version: 1,
  title: 'Completar la fecha de nacimiento para Comunidad',
  cardId: 'com2-sin-acceso',
  durationSec: 100,
  startPath: '/familia',
  startDest: 'familia.miembros',
  steps: [
    {
      id: 'motivo',
      text: 'Comunidad PEPA es solo para mayores de 18 años, y sin fecha de nacimiento en tu ficha no se entra. Vamos a ver si la tienes. Si eres menor de 18, Comunidad no está disponible para tu cuenta.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'abrir-acciones',
      text: 'Pulsa el ⋯ de tu propia ficha.',
      target: 'family.member-actions',
      completeOn: [
        { type: 'click', target: 'family.member-actions' },
        { type: 'click', target: 'family.member-actions-limited' },
        { type: 'appear', target: 'family.member-edit' },
      ],
      skipIf: [{ type: 'appear', target: 'family.edit-birth' }],
    },
    {
      id: 'editar',
      text: 'Pulsa «✏️ Editar».',
      target: 'family.member-edit',
      completeOn: [
        { type: 'click', target: 'family.member-edit' },
        { type: 'appear', target: 'family.edit-birth' },
      ],
      skipIf: [{ type: 'appear', target: 'family.edit-birth' }],
    },
    {
      id: 'nacimiento',
      text: 'Pon tu fecha de nacimiento. Cuando la hayas elegido, pulsa «Siguiente». No se guarda nada hasta el último paso.',
      target: 'family.edit-birth',
      completeOn: [{ type: 'confirmed', target: 'family.edit-birth' }],
      manualNext: true,
    },
    {
      id: 'guardar',
      text: 'Cuando quieras, pulsa «Guardar». Lo pulsas tú. Si prefieres dejarlo como estaba, pulsa «Cancelar» o sal del tutorial.',
      target: 'family.edit-save',
      completeOn: [{ type: 'event', name: 'family.member-updated' }],
      sensitive: true,
    },
  ],
  finishText: '¡Guardado! Si ya tienes 18 años cumplidos, Comunidad debería poder abrirse en cuanto se guarde la fecha.',
  next: ['com2-que-es', 'fam-editar-ficha'],
}

export const TOURS_G9_FAMILIA: TourDef[] = [tutFamiliaCodigoAcceso, tutFamiliaActividad, tutComunidadSinAcceso]
