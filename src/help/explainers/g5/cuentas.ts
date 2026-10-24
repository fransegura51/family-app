import type { HelpExplainer } from '@/help/explainers/types'

// Cuentas: modo de cuentas compartidas o separadas (Economía) y qué ve cada persona. Comprobado contra MenuSettingsScreen.tsx, FamilyScreen.tsx y las migraciones
// 0098, 0101, 0104 (modo de cuentas), 0089 (eventos privados), 0001, 0029, 0254 y 0290 (reglas de visibilidad).

export const expCuentasCompartidasSeparadas: HelpExplainer = {
  id: 'exp-cuentas-compartidas-separadas',
  module: 'economia',
  title: 'Cuentas compartidas o separadas: qué ve cada persona',
  summary: 'La familia elige si en Economía todo el mundo ve los movimientos y saldos de todos (compartidas) o cada uno ve solo los suyos, con una parte común (separadas).',
  sections: [
    {
      heading: 'Las dos formas',
      paragraphs: [
        'Compartidas: todas las personas con acceso a Economía ven los movimientos y saldos de todos, como siempre.',
        'Separadas: cada persona ve solo lo suyo, y hay una pestaña «Común» para lo que se comparte a propósito. PEPA lo dice sin rodeos: ni la administración ve los movimientos de otra persona.',
      ],
      example: 'Ejemplo inventado: Ana y Luis eligen «Separadas». Ana ve los movimientos de su cuenta y los de la cuenta común; no ve los de la cuenta de Luis, ni el saldo de esa cuenta.',
    },
    {
      heading: 'Qué cuenta como «Común»',
      paragraphs: [
        'Es lo que no tiene dueño y lo que se comparte a propósito (por ejemplo, con «Compartir a Común» en un movimiento tuyo, que crea una copia independiente: después cada una cambia por su lado).',
        'En modo separado, lo común solo se ve desde la fecha en que cada persona entró en la familia: quien llega después no ve el historial anterior.',
        'Los gastos del presupuesto de la cocina (Alimentación) no entran en este reparto: se ven siempre.',
      ],
    },
    {
      heading: 'Cuándo se elige y quién lo cambia',
      paragraphs: [
        'Cuando se añade la segunda persona adulta (o administradora) a la familia, PEPA pregunta «¿Cómo lleváis las cuentas?». Se puede cambiar después en Configuración → Economía → «🔐 Modo de cuentas».',
        'Solo la administración de la familia puede cambiarlo. Pulsar «Compartidas» o «Separadas» lo guarda al momento y afecta a toda la familia. Cambiar de modo solo cambia quién ve qué: los movimientos siguen donde estaban.',
      ],
    },
  ],
  limits: [
    'Quien no administra la familia ve los botones, pero el servidor solo acepta el cambio de la administración: si no lo eres, el cambio no se guarda aunque la pantalla lo muestre un momento.',
    'Los saldos de las cuentas bancarias de otra persona se ocultan en modo separado; lo demás de esa cuenta (conectar o desconectar) sigue pudiendo gestionarlo la administración.',
    'La copia a «Común» es independiente: si cambias el original, la copia no se actualiza.',
  ],
  ifWrong: [
    'Si en modo separado no ves un movimiento de otra persona, es lo esperado. Si crees que falta uno tuyo, comprueba que está en la pestaña Individual y no en Común.',
    'Si ves movimientos o saldos que no deberías ver, o al revés, cuéntalo en Sugerencias indicando en qué modo estáis y qué pestaña estabas mirando.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/MenuSettingsScreen.tsx',
    'src/ui/FamilyScreen.tsx',
    'src/data/family.ts',
    'supabase/migrations/0098_shared_accounts_mode.sql',
    'supabase/migrations/0101_expenses_null_owner_join_date_cutoff.sql',
    'supabase/migrations/0104_expenses_shared_join_date_cutoff.sql',
    'supabase/migrations/0001_init.sql',
  ],
  go: { path: '/menu-organizar', dest: 'config.economia' },
  labels: ['🔐 Modo de cuentas', 'Compartidas', 'Separadas', '¿Cómo lleváis las cuentas?', 'Compartir a Común', 'Individual'],
  cardIds: ['cfg-que-hay'],
  synonyms: ['cuentas separadas', 'cuentas compartidas', 'piso compartido', 'qué ve mi pareja en economía', 'por qué no veo los movimientos de otra persona', 'pestaña común', 'modo de cuentas'],
}

export const expCuentasQueVeCadaPersona: HelpExplainer = {
  id: 'exp-cuentas-que-ve-cada-persona',
  module: 'cuentas',
  title: 'Privacidad: qué ve cada persona de lo que guardas',
  summary: 'Qué ve toda tu familia, qué ves solo tú y qué ven las cuentas que administran PEPA.',
  sections: [
    {
      heading: 'Lo que ve toda la familia',
      paragraphs: [
        'Las fichas de Familia (nombre, color, foto, tipo) las lee toda la familia, también los niños y los invitados con acceso.',
        'Lo que apuntas en el calendario sin marcarlo como privado lo ven las personas de la familia que tienen acceso a Calendario.',
        'La ubicación de quien la comparte la ve la familia que tiene acceso a Ubicación. Y el Buzón de sugerencias muestra a toda tu familia las sugerencias de la familia.',
      ],
    },
    {
      heading: 'Lo que ves solo tú',
      paragraphs: [
        'Los eventos y tareas con «🔒 Privado — Solo yo puedo verlo»: ni siquiera se pueden leer desde otra cuenta de tu familia.',
        'Tus reseñas y opiniones, y tus ajustes personales (orden del menú, colores, horarios de avisos).',
      ],
      example: 'Apuntas «Cita con el médico» como privada (ejemplo inventado): tu pareja, que usa la misma familia, no la ve en su calendario. Si apuntas «Cena con los abuelos» sin marcarla, la ven todas las personas con acceso a Calendario.',
    },
    {
      heading: 'Lo que depende de tu tipo y de la familia',
      paragraphs: [
        'Un niño/a o un invitado/a solo entra en las secciones que la administración haya elegido.',
        'En Economía, si la familia usa cuentas separadas, cada persona ve solo lo suyo y lo común.',
        'En todo lo que cubre esta explicación, las reglas del servidor limitan los datos a la familia de quien pregunta: otra familia no ve lo tuyo.',
      ],
    },
    {
      heading: 'Lo que ven las cuentas que administran PEPA',
      paragraphs: [
        'Las sugerencias y las reseñas de todas las familias, con el nombre de la familia que las dejó. Por eso el Buzón pide no escribir datos privados.',
        'Si pones 1 o 2 estrellas en una reseña, esas cuentas reciben además un aviso con el nombre de tu familia y tu comentario.',
      ],
    },
  ],
  limits: [
    'Esta explicación cubre solo lo que se ha comprobado en el código y las reglas del servidor de estas pantallas. No es una lista completa de todo lo que PEPA guarda.',
    'Marcar algo como privado solo oculta el evento o la tarea: no oculta que existe un calendario compartido.',
  ],
  ifWrong: [
    'Si ves algo de otra persona que debería ser privado, o una familia ajena ve algo tuyo, es un fallo grave: cuéntalo cuanto antes en Sugerencias con el máximo detalle.',
    'Si no ves algo que esperabas, comprueba que no es privado de otra persona, que tu tipo tiene acceso a esa sección y, en Economía, el modo de cuentas.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/FamilyScreen.tsx',
    'src/ui/CalendarScreen.tsx',
    'src/ui/LocationScreen.tsx',
    'src/ui/SuggestionsScreen.tsx',
    'src/ui/ReviewsScreen.tsx',
    'supabase/migrations/0001_init.sql',
    'supabase/migrations/0089_calendar_event_private_visibility.sql',
    'supabase/migrations/0254_suggestions_owner_by_profile.sql',
    'supabase/migrations/0290_app_reviews.sql',
    'supabase/migrations/0291_app_reviews_low_star_alert.sql',
    'supabase/migrations/0279_family_dietary_restrictions.sql',
  ],
  go: { path: '/familia' },
  labels: ['🔒 Privado — Solo yo puedo verlo', 'Nueva sugerencia', 'Reseñas y opiniones'],
  cardIds: ['fam-invitado-limitado', 'ini-sugerencias', 'ini-resenas'],
  synonyms: ['quién ve lo que apunto', 'privacidad', 'puede ver mi pareja', 'qué ve mi familia', 'quién ve mi ubicación', 'es privado', 'otra familia puede ver'],
}

export const EXPLAINERS_CUENTAS: HelpExplainer[] = [expCuentasCompartidasSeparadas, expCuentasQueVeCadaPersona]
