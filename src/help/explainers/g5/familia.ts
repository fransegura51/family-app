import type { HelpExplainer } from '@/help/explainers/types'

// Familia: qué puede hacer cada tipo de miembro y cómo se da acceso a PEPA. Comprobado contra FamilyScreen.tsx, domain/guardianship.ts, domain/invitations.ts,
// AccessInvitePanel.tsx y las migraciones 0001, 0070, 0097, 0300, 0301 y 0304 (más docs/CUENTAS_PADRES_HIJOS_E_INVITACIONES.md).

export const expFamiliaTiposDeMiembro: HelpExplainer = {
  id: 'exp-familia-tipos-de-miembro',
  module: 'familia',
  title: 'Qué ve y qué puede hacer cada tipo de miembro',
  summary: 'Administrador/a, adulto, niño/a, bebé e invitado/a no ven ni pueden lo mismo. Aquí se explica qué cambia en cada caso y por qué administrar la familia no es administrar PEPA.',
  sections: [
    {
      heading: 'Administrar la familia no es administrar PEPA',
      paragraphs: [
        'El tipo «Administrador/a» manda en TU familia: añade y borra fichas, edita cualquier ficha, da acceso con invitaciones, elige a qué secciones entran los niños y los invitados, y cambia ajustes de toda la familia (el nombre, el modo de cuentas, cuándo un bebé pasa a niño, a quién se avisa de tareas y eventos).',
        'Administrar la aplicación PEPA es otra cosa: son unas pocas cuentas marcadas por quien opera PEPA. Solo ellas ven el «Centro de Administración PEPA» en Configuración y las sugerencias y reseñas de todas las familias. Ser administrador/a de una familia no da ese poder.',
      ],
    },
    {
      heading: 'Qué cambia en cada tipo',
      paragraphs: [
        'Adulto: entra en todas las secciones y gestiona puntos y recompensas, pero no administra la familia. Puede editar su propia ficha y la de sus hijos/as menores si ha indicado «👪 Es mi hijo/a».',
        'Niño/a: puede tener cuenta propia, y la administración limita a qué secciones entra. No edita fichas. Algunas funciones son solo para personas adultas.',
        'Bebé: solo tiene ficha (peso, medidas…), sin cuenta propia. Pasa solo a «Niño/a» al cumplir la edad que la familia elija en Configuración → «👶 De bebé a niño» (por defecto, 2 años).',
        'Invitado/a: acceso limitado a las secciones que se elijan, por ejemplo para abuelos o canguros.',
      ],
      example: 'Ejemplo inventado: en la familia Ejemplo, Ana es administradora, Luis es adulto, Marta (10 años) es niña con acceso solo a Calendario y Compras, y el abuelo Pepe es invitado con acceso solo a Galería.',
    },
    {
      heading: 'Qué secciones se ven',
      paragraphs: [
        'A un niño/a o a un invitado/a el menú le oculta las secciones que la administración no ha marcado. Inicio, Ayuda, Sugerencias, Reseñas, Configuración y Actividad reciente se ven siempre.',
        'Ocultar un botón no es la seguridad: en secciones como Calendario o Economía el servidor vuelve a comprobar el permiso y no entrega los datos si la cuenta no tiene acceso.',
      ],
    },
  ],
  limits: [
    'Las secciones que se eligen en la ficha se copian a la cuenta cuando la persona la crea con su invitación. Cambiarlas en la ficha de alguien que ya tiene cuenta no actualiza lo que esa cuenta ve.',
    'Un niño/a sin fecha de nacimiento en su ficha no puede recibir invitación: la fecha la pone quien invita.',
    'El tipo lo cambia solo la administración de la familia; un adulto puede editar nombre, color, fecha de nacimiento y sexo, pero no el tipo.',
  ],
  ifWrong: [
    'Si no ves un botón (por ejemplo «+ Añadir miembro»), normalmente es porque tu tipo no lo permite: pídeselo a la administración de tu familia.',
    'Si una persona ve una sección que no debería, o no ve una que sí, comprueba su tipo y sus secciones en su ficha. Si crees que es un fallo de PEPA y no un ajuste, cuéntalo en Sugerencias con el máximo detalle.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/FamilyScreen.tsx',
    'src/domain/guardianship.ts',
    'src/domain/navTabs.ts',
    'src/help/access.ts',
    'src/ui/admin/AdminCenterCard.tsx',
    'src/ui/MenuSettingsScreen.tsx',
    'supabase/migrations/0001_init.sql',
    'supabase/migrations/0070_guest_users.sql',
    'supabase/migrations/0097_child_section_restrictions.sql',
    'supabase/migrations/0304_member_self_and_guardian_edit.sql',
    'docs/AUDITORIA_ROLES_Y_PERMISOS_2026-10-21.md',
  ],
  tour: 'tut-familia-editar-ficha',
  go: { path: '/familia', dest: 'familia.miembros' },
  labels: ['Administrador/a', 'Niño/a', 'Invitado/a', '👪 Es mi hijo/a', 'Secciones a las que puede entrar', '👶 De bebé a niño', 'Centro de Administración PEPA'],
  cardIds: ['fam-anadir-miembro', 'fam-editar-ficha', 'fam-invitado-limitado'],
  synonyms: ['qué puede hacer un niño', 'qué ve un invitado', 'diferencia entre administrador y adulto', 'permisos', 'roles', 'por qué no veo una sección', 'quién es administrador', 'administrador de pepa'],
}

export const expFamiliaDarAcceso: HelpExplainer = {
  id: 'exp-familia-dar-acceso',
  module: 'familia',
  title: 'Cómo se da acceso a PEPA a alguien de la familia',
  summary: 'Crear una ficha no crea una cuenta. Para que alguien entre en PEPA hace falta una invitación de un solo uso, y no todo el mundo puede crearla.',
  sections: [
    {
      heading: 'Ficha y cuenta son cosas distintas',
      paragraphs: [
        'Una ficha es la tarjeta de la persona en Familia (nombre, color, foto…). Una cuenta es el acceso con su correo. Puedes tener fichas sin cuenta: es lo normal con bebés y con niños pequeños.',
        'Las fichas sin cuenta dicen «Sin acceso a PEPA». Los bebés no tienen cuenta propia.',
      ],
    },
    {
      heading: 'La invitación',
      paragraphs: [
        'PEPA es privada: sin una invitación válida no se puede crear ninguna cuenta. En la ficha, «🔑 Dar acceso a PEPA» genera un código de un solo uso que caduca a las 24 horas; lo puedes copiar, compartir o mandar por WhatsApp. La persona lo escribe al crear su cuenta y queda unida a su ficha.',
        'Si ya había una invitación vigente, PEPA te enseña esa en lugar de crear otra. «Generar otra» pide confirmación y deja sin valor la anterior.',
        'La cuenta nace con el tipo y las secciones de su ficha. La fecha de nacimiento que vale es la de la ficha.',
      ],
      example: 'Ejemplo inventado: Ana crea la ficha de su hijo Marta, de 10 años, con fecha de nacimiento. Pulsa «🔑 Dar acceso a PEPA» y le pasa el código; Marta lo usa al crear su cuenta y queda con acceso de niña.',
    },
    {
      heading: 'Quién puede dar acceso',
      paragraphs: [
        'La administración de la familia, en cualquier ficha sin cuenta (menos bebés). Y una madre, padre o tutor que ha indicado «👪 Es mi hijo/a», solo en la ficha de su hijo/a menor de 18 años.',
        'Una persona adulta sin ese vínculo no puede invitar a nadie. El servidor lo comprueba siempre: ocultar o enseñar un botón no es la seguridad.',
      ],
    },
    {
      heading: '«Es mi hijo/a»: qué es y qué no es',
      paragraphs: [
        'Es una declaración tuya: PEPA te pide aceptarla y confirmar que eres tú, y la guarda con tu nombre y la fecha. PEPA no comprueba el vínculo con documentos.',
        'Cada persona solo puede retirar su propio vínculo, con «Dejar de figurar como…» en la ficha. Nadie puede retirar el de otra persona desde la app, ni la administración de la familia. A los 18 años del menor, ese poder deja de valer solo.',
      ],
    },
  ],
  limits: [
    'La invitación no se puede ampliar: pasadas las 24 horas hay que generar otra.',
    'El código de invitación no es el código de 6 cifras del correo: ese solo confirma un correo.',
    'En el menú ⋯ de las fichas sin cuenta sigue existiendo el método antiguo «🔑 Generar código de acceso» (solo administración); funciona igual: un código de un solo uso de 24 horas.',
  ],
  ifWrong: [
    'Si el código «no es válido o ha caducado», pide otro a quien te invitó: caducan a las 24 horas y solo valen una vez.',
    'Si te dice que falta la fecha de nacimiento, ponla en la ficha (⋯ → Editar) y vuelve a intentarlo.',
    'Si crees que un vínculo «Es mi hijo/a» es incorrecto, no se puede quitar desde la app por otra persona: cuéntalo en Sugerencias para que lo revise quien administra PEPA.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/AccessInvitePanel.tsx',
    'src/ui/FamilyScreen.tsx',
    'src/domain/invitations.ts',
    'src/domain/guardianship.ts',
    'supabase/migrations/0300_family_member_guardians.sql',
    'supabase/migrations/0301_invitation_hardening.sql',
    'docs/CUENTAS_PADRES_HIJOS_E_INVITACIONES.md',
  ],
  tour: 'fam-anadir-miembro',
  go: { path: '/familia', dest: 'familia.miembros' },
  labels: ['🔑 Dar acceso a PEPA', '🔑 Generar código de acceso', '👪 Es mi hijo/a', 'Sin acceso a PEPA', 'Dejar de figurar como', 'Generar otra'],
  cardIds: ['fam-codigo-acceso', 'fam-anadir-miembro', 'fam-invitado-limitado'],
  synonyms: ['invitar a mi pareja', 'dar acceso', 'código de invitación', 'crear cuenta para mi hijo', 'sin invitación no puedo entrar', 'código caducado', 'es mi hijo'],
}

export const EXPLAINERS_FAMILIA: HelpExplainer[] = [expFamiliaTiposDeMiembro, expFamiliaDarAcceso]
