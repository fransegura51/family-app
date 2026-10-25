import type { TourDef } from '@/help/tours/types'

// Familia (grupo g9): capítulo «Dar acceso a PEPA» de «Gestionar las fichas de la familia» y, para Comunidad, completar la fecha de nacimiento (tutComunidadSinAcceso, que es de Comunidad).
// Marcas `data-help-id` en src/ui/FamilyScreen.tsx y src/ui/AccessInvitePanel.tsx. El flujo REAL de entrada de la otra persona es «¿No tienes cuenta? Tengo una invitación»
// (LoginScreen): primero la invitación y después la cuenta.
// «Dar acceso» SOLO se señala: generar el código crea una invitación real, así que lo pulsa siempre la persona (el tutorial no espera ni exige ese clic; solo avanza con «Siguiente»
// o cuando el código aparece). Pueden darlo la administración de la familia (en cualquier ficha sin cuenta, menos bebés) y una madre/padre/tutor que haya indicado «👪 Es mi hijo/a»
// (solo en la ficha de su hijo/a menor): por eso el capítulo no se limita a la administración (domain/guardianship.ts · canGiveAccess). El servidor lo vuelve a comprobar.
// Lo de la fecha de nacimiento sí guarda, y espera el aviso `family.member-updated` que lanza la pantalla tras guardar.

export const tutFamiliaCodigoAcceso: TourDef = {
  id: 'tut-familia-codigo-acceso',
  module: 'familia',
  group: 'Fichas',
  summary: 'Dónde se crea la invitación para que un familiar cree su cuenta y qué hace esa persona con ella (sin crearla por ti).',
  access: { adultsOnly: true },
  version: 2,
  title: 'Dar acceso a PEPA',
  cardId: 'fam-codigo-acceso',
  durationSec: 100,
  startPath: '/familia',
  startDest: 'familia.miembros',
  readyOn: ['family.member-list'],
  steps: [
    {
      id: 'fichas',
      text: 'Dar acceso es crear una invitación de un solo uso para una ficha. La ficha tiene que existir antes (si no, «+ Añadir miembro»). Las que no tienen cuenta ponen «Sin acceso a PEPA». Aquí solo señalo: no creo ninguna invitación.',
      target: 'family.member-list',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'hijo',
      text: 'Si eres madre, padre o tutor de un menor, empieza por «👪 Es mi hijo/a» en su ficha. Es una declaración tuya que PEPA no comprueba con documentos, y te pide confirmar que eres tú. Después podrás darle acceso, aunque no administres la familia.',
      target: 'family.guardian-declare',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'boton',
      text: 'En su ficha sale «🔑 Dar acceso a PEPA». Crea una invitación real de un solo uso; si ya había una vigente, te enseña esa. Púlsalo tú si quieres; si no, «Siguiente».',
      target: 'family.give-access',
      completeOn: [{ type: 'appear', target: 'family.access-code' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'codigo',
      text: 'Este es el código: caduca a las 24 horas y vale una sola vez. «📋 Copiar», «📤 Compartir» y «💬 WhatsApp» lo mandan con las instrucciones. «🔄 Generar otra» deja sin valor esta (pide confirmación).',
      target: 'family.access-code',
      completeOn: [],
      manualNext: true,
      optional: true,
    },
    {
      id: 'cuenta',
      text: 'La otra persona abre PEPA y elige «¿No tienes cuenta? Tengo una invitación». Primero escribe el código y después crea su correo y su contraseña. Su cuenta queda unida a su ficha, sin compartir contraseñas.',
      completeOn: [],
      manualNext: true,
    },
  ],
  finishText: 'Eso es todo. Si todas las fichas ya tienen cuenta, no sale el botón. Cuando quieras invitar a alguien, hazlo tú desde su ficha: yo no creo ninguna invitación.',
  next: ['fam-anadir-miembro', 'fam-invitado-limitado', 'fam-editar-ficha'],
}

export const tutComunidadSinAcceso: TourDef = {
  id: 'tut-comunidad-sin-acceso',
  module: 'comunidad',
  summary: 'Si Comunidad no te deja entrar, añade tu fecha de nacimiento en tu ficha de Familia.',
  version: 2,
  title: 'Completar la fecha de nacimiento para Comunidad',
  cardId: 'com2-sin-acceso',
  durationSec: 100,
  startPath: '/familia',
  startDest: 'familia.miembros',
  steps: [
    {
      id: 'motivo',
      text: 'Comunidad PEPA es solo para personas de 18 años cumplidos, y sin fecha de nacimiento en tu ficha no se entra. Vamos a mirar tu ficha. Si eres menor de 18, Comunidad no está disponible para tu cuenta. La fecha se guarda de verdad al final.',
      completeOn: [],
      manualNext: true,
    },
    {
      id: 'abrir-acciones',
      text: 'Busca TU ficha, la que lleva tu nombre, y pulsa su ⋯ (no el de otra persona).',
      target: 'family.own-member-row',
      completeOn: [{ type: 'appear', target: 'family.member-edit' }],
      skipIf: [{ type: 'appear', target: 'family.edit-birth' }],
      missingText: 'No encuentro tu ficha enlazada a esta cuenta. Pídele a quien administra tu familia que revise tu fecha de nacimiento.',
    },
    {
      id: 'editar',
      text: 'Pulsa «✏️ Editar».',
      target: 'family.member-edit',
      missingText: 'Con esta cuenta no puedes editar tu propia ficha. Pídele a quien administra tu familia que ponga tu fecha de nacimiento.',
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

export const TOURS_G9_FAMILIA: TourDef[] = [tutFamiliaCodigoAcceso, tutComunidadSinAcceso]
