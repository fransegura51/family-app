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

export const expCuentasEntrarConInvitacion: HelpExplainer = {
  id: 'exp-cuentas-entrar-con-invitacion',
  module: 'cuentas',
  title: 'Cómo se entra en PEPA y por qué hace falta una invitación',
  summary: 'Entrar es con tu correo y tu contraseña. Para crear una cuenta nueva hace falta una invitación: primero se comprueba la invitación y solo después se crea la cuenta.',
  sections: [
    {
      heading: 'Si ya tienes cuenta',
      paragraphs: [
        'En la pantalla de entrada escribes tu correo y tu contraseña y pulsas «Entrar». Esa pantalla solo se ve con la sesión cerrada: por eso no se puede recorrer desde dentro de la app.',
        'Si no recuerdas la contraseña, pulsa «¿Olvidaste tu contraseña?»: te mandamos un código de 6 cifras al correo y, al escribirlo, eliges una contraseña nueva.',
      ],
    },
    {
      heading: 'Si no tienes cuenta: primero la invitación',
      paragraphs: [
        'PEPA es privada: sin una invitación válida no se crea ninguna cuenta. En la pantalla de entrada toca «¿No tienes cuenta? Tengo una invitación» y escribe el «Código de invitación» que te hayan dado.',
        'PEPA comprueba el código antes de pedirte nada más. Si es válido, te dice si vas a crear el espacio de tu familia o a unirte a la tuya, y solo entonces te pide el correo y la contraseña. Después te manda un código de 6 cifras al correo para confirmarlo (ese código no es la invitación).',
      ],
      example: 'Ejemplo inventado: Marta recibe de su hermano la invitación «ABCD1234». La escribe, PEPA le dice que va a unirse a su familia, pone su correo y una contraseña, confirma el código de 6 cifras que le llega y ya está dentro.',
    },
    {
      heading: 'Quién da la invitación',
      paragraphs: [
        'Para unirte a una familia, la genera la persona que la administra desde Familia, con «Dar acceso a PEPA» en tu ficha (o una madre o un padre vinculado, solo para su hijo o hija menor). Es de un solo uso y la de familiar caduca a las 24 horas.',
        'Para crear una familia nueva, la invitación la da la administración de PEPA.',
      ],
    },
  ],
  limits: [
    'Sin una invitación válida no se puede crear la cuenta: lo comprueba también el servidor, no solo la pantalla.',
    'La invitación es de un solo uso. Si ya se usó o ha caducado, hace falta una nueva.',
    'Invitar a amigos desde dentro de la app todavía no está disponible.',
  ],
  ifWrong: [
    'Si dice que la invitación no es válida o ha caducado, pídele una nueva a quien te invitó.',
    'Si te sale un aviso de demasiados intentos, espera unos minutos antes de probar otra vez.',
    'Si no te llega el código de 6 cifras, mira en «no deseado» y usa «Reenviar código» pasados 60 segundos. Si sigue sin llegar, escribe a info@pepafamilyapp.es.',
  ],
  verified: '2026-10-25',
  basedOn: ['src/ui/LoginScreen.tsx', 'src/domain/invitations.ts', 'src/ui/AccessInvitePanel.tsx', 'supabase/migrations/0301_invitation_hardening.sql', 'supabase/migrations/0302_signup_gate_invitation_first.sql'],
  tour: 'visita-cuentas',
  go: { path: '/familia' },
  labels: ['¿No tienes cuenta? Tengo una invitación', 'Código de invitación', '¿Olvidaste tu contraseña?', '🔑 Dar acceso a PEPA', 'Reenviar código'],
  cardIds: ['cue-entrar', 'cue-invitar-amigos'],
  synonyms: ['no tengo cuenta', 'crear cuenta', 'registrarme', 'código de invitación', 'invitación caducada', 'pantalla de entrada', 'iniciar sesión'],
}

export const expCuentasRecuperarPin: HelpExplainer = {
  id: 'exp-cuentas-recuperar-pin',
  module: 'cuentas',
  title: 'Si olvido mi PIN: cómo se recupera',
  summary: 'Te identificas tú con tu contraseña o con un código del correo, se quita el PIN antiguo (y las huellas) y eliges uno nuevo. Nadie de la familia interviene.',
  sections: [
    {
      heading: 'Dónde se pide',
      paragraphs: [
        'Con la app bloqueada, pulsa «¿Has olvidado tu PIN?» en la pantalla de bloqueo. Dentro de la app, con un PIN ya puesto, el mismo camino es «He olvidado mi PIN» en Configuración → Seguridad.',
        'La pantalla de bloqueo solo sale con la app bloqueada, así que no se puede recorrer desde dentro.',
      ],
    },
    {
      heading: 'Cómo demuestras que eres tú',
      paragraphs: [
        'Eliges «Con mi contraseña» o «Con un código que me llega al correo» (un código de 6 cifras). El servidor solo acepta quitar el PIN si te has identificado en los últimos 5 minutos.',
        'Ninguna persona de la familia ni de la administración puede ver ni cambiar tu PIN: lo recuperas tú con tu cuenta.',
      ],
    },
    {
      heading: 'Qué pasa después',
      paragraphs: [
        'Se quita el PIN antiguo y, por seguridad, también se borran las huellas y Face ID que tenías registrados. Puedes elegir un PIN nuevo en ese momento o pulsar «Ahora no» y ponerlo más tarde en Configuración → Seguridad.',
        'Si fallas el PIN 5 veces seguidas, PEPA te bloquea 5 minutos antes de dejarte probar otra vez.',
      ],
      example: 'Ejemplo inventado: Luis vuelve de vacaciones y no recuerda su PIN. Pulsa «¿Has olvidado tu PIN?», pide el código al correo, lo escribe, elige un PIN nuevo y vuelve a entrar. Su huella hay que registrarla de nuevo.',
    },
  ],
  limits: [
    'Hace falta poder usar tu contraseña o recibir el correo de tu cuenta.',
    'Con la huella o Face ID solos no se recupera el PIN: hace falta tu contraseña o el código del correo.',
  ],
  ifWrong: [
    'Si dice «No hemos podido confirmar que eres tú», vuelve a elegir contraseña o código y hazlo del tirón, sin esperar.',
    'Si el código no llega, mira en «no deseado» y usa «Reenviar código» pasados 60 segundos.',
    'Si no recuerdas tampoco la contraseña ni puedes abrir tu correo, cuéntalo en Sugerencias o escribe a info@pepafamilyapp.es.',
  ],
  verified: '2026-10-25',
  basedOn: ['src/ui/PinRecoveryPanel.tsx', 'src/ui/AppLockScreen.tsx', 'src/ui/SecuritySettings.tsx', 'supabase/migrations/0083_profile_app_lock.sql', 'src/domain/appLockPolicy.ts'],
  tour: 'tut-cuentas-pin',
  go: { path: '/menu-organizar', dest: 'config.seguridad' },
  labels: ['¿Has olvidado tu PIN?', 'He olvidado mi PIN', 'Con mi contraseña', 'Con un código que me llega al correo', 'Quitar el PIN antiguo', 'Ahora no'],
  cardIds: ['cue-olvide-pin', 'cue-pin'],
  synonyms: ['olvidé el pin', 'no recuerdo el pin', 'recuperar pin', 'pin bloqueado', 'demasiados intentos', 'huella dejó de funcionar'],
}

export const expCuentasBorrarCuenta: HelpExplainer = {
  id: 'exp-cuentas-borrar-cuenta',
  module: 'cuentas',
  title: 'Qué pasa si borro mi cuenta',
  summary: 'Borrar tu cuenta no se puede deshacer. Qué se borra, qué se queda para la familia, qué ocurre con lo que publicaste en Comunidad y cuándo PEPA no te deja.',
  sections: [
    {
      heading: 'Borrar solo mi cuenta',
      paragraphs: [
        'Se borran tu acceso, tu perfil, tus avisos y tu ubicación. La familia sigue con todo lo suyo: tu ficha de familiar se queda, pero sin cuenta.',
        'Si solo quieres dejar de usar PEPA en este móvil, basta con «Cerrar sesión»: no borra nada y solo cierra la sesión en ese aparato.',
      ],
      example: 'Ejemplo inventado: Ana borra solo su cuenta. Sus hermanos siguen viendo el calendario, las compras y las fotos de la familia; la ficha «Ana» sigue en Familia, pero ya no puede entrar nadie con esa cuenta.',
    },
    {
      heading: 'Borrar toda la familia',
      paragraphs: [
        'Solo lo ofrece PEPA a quien administra la familia. Borra todo: los datos de la familia, sus fotos y documentos, y el acceso de todas las cuentas. Nadie podrá recuperarlo.',
      ],
    },
    {
      heading: 'Lo que publicaste en Comunidad',
      paragraphs: [
        'Si borras tu cuenta, lo que publicaste o comentaste en Comunidad queda como «Usuario eliminado», sin perfil ni identidad.',
        'Si tienes perfil en Comunidad, al borrar sale una casilla: «También borrar mis publicaciones y comentarios de Comunidad». Si la marcas, se borran también.',
      ],
    },
    {
      heading: 'Cuándo PEPA no te deja',
      paragraphs: [
        'Si eres la única administradora, antes tienes que nombrar a otra (en Familia, editando a esa persona). Si eres la única cuenta de la familia, solo puedes borrar toda la familia.',
        'Siempre hay que escribir la palabra BORRAR para confirmar, y puedes cancelar antes.',
      ],
    },
  ],
  limits: [
    'No se puede deshacer: una cuenta borrada no se recupera.',
    'Borrar solo tu cuenta no borra tu ficha de familiar: se queda en Familia, sin cuenta.',
    'El tutorial «Enséñame» no te guía por el borrado a propósito: solo se explica.',
  ],
  ifWrong: [
    'Si el borrado no termina y sale «No he podido borrarlo del todo», inténtalo de nuevo; si sigue fallando, escribe a info@pepafamilyapp.es y lo hacemos nosotros.',
    'Si lo que querías era salir del móvil, usa «Cerrar sesión»; si quieres que alguien deje de ver una cosa, pídeselo a la administración de la familia antes de borrar nada.',
  ],
  verified: '2026-10-25',
  basedOn: ['src/ui/DeleteAccountCard.tsx', 'src/data/accountDeletion.ts', 'src/ui/MenuSettingsScreen.tsx', 'supabase/migrations/0256_account_deletion.sql'],
  tour: 'visita-cuentas',
  go: { path: '/menu-organizar', dest: 'config.cuenta' },
  labels: ['🗑️ Borrar mi cuenta', 'Borrar solo mi cuenta', 'Borrar toda la familia', 'También borrar mis publicaciones y comentarios de Comunidad', '🚪 Cerrar sesión', 'Usuario eliminado'],
  cardIds: ['cue-borrar-cuenta', 'cue-cerrar-sesion'],
  synonyms: ['eliminar mi cuenta', 'darme de baja', 'borrar mis datos', 'qué se borra', 'borrar la familia', 'se puede deshacer'],
}

export const EXPLAINERS_CUENTAS: HelpExplainer[] = [expCuentasCompartidasSeparadas, expCuentasQueVeCadaPersona, expCuentasEntrarConInvitacion, expCuentasRecuperarPin, expCuentasBorrarCuenta]
