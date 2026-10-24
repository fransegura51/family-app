import type { TourDef } from '@/help/tours/types'

// Tutoriales y visitas del grupo g10: avisos del móvil, Cuenta (entrar, PIN, correo y contraseña, cerrar sesión, borrar cuenta) y reseñas de la Ayuda.
// Comprobado contra src/ui/NotificationsCard.tsx, SecuritySettings.tsx, PinRecoveryPanel.tsx, DeleteAccountCard.tsx, MenuSettingsScreen.tsx (SignOutCard) y ReviewsScreen.tsx.
// En PIN, contraseña, correo, cerrar sesión y borrar cuenta el recorrido SOLO señala y explica: nunca pulsa, escribe, cierra la sesión, borra ni pone o quita un PIN.

const info = { completeOn: [] as never[], manualNext: true }

// ───────────────────────────── Avisos
export const tutNotificacionesActivar: TourDef = {
  id: 'tut-notificaciones-activar',
  module: 'notificaciones',
  group: 'Avisos',
  summary: 'Activar los avisos en este móvil y mandarte uno de prueba.',
  version: 1,
  title: 'Activar los avisos en este móvil',
  cardId: 'not-activar',
  durationSec: 75,
  startPath: '/menu-organizar',
  startDest: 'config.avisos',
  steps: [
    {
      id: 'tarjeta',
      text: 'Los avisos se activan en cada móvil por separado. Esta tarjeta, «Avisos en este móvil», es la de este aparato y te dice si están activados o no.',
      target: 'notifications.device-card',
      ...info,
    },
    {
      id: 'activar',
      text: 'Pulsa «Activar avisos». El móvil te preguntará si permites los avisos: elige «Permitir». Yo no pulso nada por ti.',
      target: 'notifications.enable',
      completeOn: [{ type: 'event', name: 'notifications.push-enabled' }],
      skipIf: [{ type: 'appear', target: 'notifications.disable' }],
      sensitive: true,
      optional: true,
    },
    {
      id: 'prueba',
      text: 'Para comprobarlo, pulsa «Mandarme un aviso de prueba»: debería llegarte en unos segundos. Es opcional; si no quieres, pulsa «Siguiente».',
      target: 'notifications.test',
      completeOn: [{ type: 'event', name: 'notifications.test-sent' }],
      manualNext: true,
      optional: true,
    },
    {
      id: 'limites',
      text: 'Dos avisos: en iPhone hay que añadir PEPA a la pantalla de inicio para recibirlos, y en Android el ahorro de batería puede impedirlos con la app cerrada.',
      target: 'notifications.device-card',
      ...info,
    },
  ],
  finishText: 'Listo. Para elegir la hora de tus resúmenes de tareas, tienes el tutorial del horario de avisos.',
  next: ['not-resumen-tareas', 'not-campana'],
}

// ───────────────────────────── Cuenta
export const tutCuentasPin: TourDef = {
  id: 'tut-cuentas-pin',
  module: 'cuentas',
  group: 'Cuenta',
  summary: 'Dónde se pone, cambia o quita el PIN (y la huella) para abrir PEPA.',
  version: 1,
  title: 'Dónde poner un PIN o la huella',
  cardId: 'cue-pin',
  durationSec: 75,
  startPath: '/menu-organizar',
  startDest: 'config.seguridad',
  steps: [
    {
      id: 'bloqueo',
      text: 'Esta tarjeta es tu «Bloqueo personal»: un PIN de 4 a 6 dígitos que se pide al abrir PEPA. Es opcional y solo de tu cuenta.',
      target: 'seguridad.bloqueo',
      ...info,
    },
    {
      id: 'botones',
      text: 'Aquí están los botones: «Activar PIN» si aún no tienes uno; si ya lo tienes, «Cambiar PIN», «Desactivar PIN» y «He olvidado mi PIN». Yo no los pulso ni escribo ningún PIN por ti.',
      target: 'seguridad.pin-acciones',
      ...info,
    },
    {
      id: 'huella',
      text: 'Con un PIN activado, debajo puedes añadir la huella o Face ID de este dispositivo. Es un extra: el PIN siempre sirve.',
      target: 'seguridad.huella',
      ...info,
      optional: true,
    },
    {
      id: 'cambiar',
      text: 'Cambiar o quitar el PIN te pide el PIN actual. Al desactivarlo se quitan también las huellas registradas.',
      target: 'seguridad.pin-acciones',
      ...info,
    },
  ],
  finishText: 'No he cambiado nada. Cuando quieras, pulsa tú «Activar PIN» y elige uno que recuerdes.',
  next: ['cue-olvide-pin', 'cue-correo-contrasena'],
}

export const tutCuentasOlvidePin: TourDef = {
  id: 'tut-cuentas-olvide-pin',
  module: 'cuentas',
  group: 'Cuenta',
  summary: 'Qué hacer si olvidas el PIN: cómo se recupera con tu contraseña o un código del correo.',
  version: 1,
  title: 'Qué hacer si olvido mi PIN',
  cardId: 'cue-olvide-pin',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.seguridad',
  steps: [
    {
      id: 'pantalla',
      text: 'Si al abrir PEPA no te acuerdas del PIN, en la pantalla de bloqueo pulsa «¿Has olvidado tu PIN?». Esa pantalla solo sale con la app bloqueada, así que no puedo mostrártela desde aquí.',
      ...info,
    },
    {
      id: 'identidad',
      text: 'Te pedirá que demuestres que eres tú con tu contraseña o con un código de 6 cifras que te llega al correo. Se borran el PIN antiguo y las huellas registradas, y eliges un PIN nuevo.',
      ...info,
    },
    {
      id: 'dentro',
      text: 'Dentro de la app, con un PIN ya puesto, tienes lo mismo en este botón: «He olvidado mi PIN». Solo te lo señalo, no lo pulso.',
      target: 'seguridad.pin-acciones',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. Nadie más, ni la administración, puede ver ni cambiar tu PIN: lo recuperas tú con tu cuenta.',
  next: ['cue-pin', 'cue-correo-contrasena'],
}

export const tutCuentasCorreoContrasena: TourDef = {
  id: 'tut-cuentas-correo-contrasena',
  module: 'cuentas',
  group: 'Cuenta',
  summary: 'Dónde se cambia el correo de acceso y la contraseña.',
  version: 1,
  title: 'Dónde cambiar mi correo o mi contraseña',
  cardId: 'cue-correo-contrasena',
  durationSec: 75,
  startPath: '/menu-organizar',
  startDest: 'config.seguridad',
  steps: [
    {
      id: 'tarjeta',
      text: 'Esta tarjeta, «Correo y contraseña», muestra con qué correo entras y si está confirmado. Cada persona gestiona lo suyo: nadie puede cambiar el correo o la contraseña de otra.',
      target: 'seguridad.correo-contrasena',
      ...info,
    },
    {
      id: 'correo',
      text: 'Para cambiar el correo se pulsa «✉️ Cambiar correo». Te pedirá tu contraseña y te llegarán códigos de 6 cifras para confirmarlo. Yo no escribo nada por ti.',
      target: 'seguridad.cambiar-correo',
      ...info,
      optional: true,
    },
    {
      id: 'contrasena',
      text: 'Para la contraseña se pulsa «🔑 Cambiar contraseña»: pide la actual y la nueva. Si no recuerdas la actual, hay un botón para recibir un código por correo. Solo te lo señalo: lo haces tú.',
      target: 'seguridad.cambiar-contrasena',
      ...info,
      optional: true,
    },
  ],
  finishText: 'No he tocado nada. Elige siempre una contraseña que no uses en otros sitios.',
  next: ['cue-pin', 'cue-cerrar-sesion'],
}

export const tutCuentasCerrarSesion: TourDef = {
  id: 'tut-cuentas-cerrar-sesion',
  module: 'cuentas',
  group: 'Cuenta',
  summary: 'Dónde está «Cerrar sesión» y qué hace.',
  version: 1,
  title: 'Dónde cerrar la sesión',
  cardId: 'cue-cerrar-sesion',
  durationSec: 45,
  startPath: '/menu-organizar',
  startDest: 'config.cuenta',
  steps: [
    {
      id: 'tarjeta',
      text: 'En «Mi cuenta» está «🚪 Cerrar sesión». Sirve para salir de tu cuenta solo en este móvil; en tus otros dispositivos la sesión sigue abierta.',
      target: 'cuenta.cerrar-sesion',
      ...info,
    },
    {
      id: 'boton',
      text: 'Este es el botón. Al pulsarlo vuelves a la pantalla de entrada y para volver a entrar necesitarás tu correo y tu contraseña. Yo no lo pulso: cerrar la sesión lo decides tú.',
      target: 'cuenta.cerrar-sesion-boton',
      ...info,
    },
  ],
  finishText: 'No he cerrado nada: sigues dentro. Si algún día lo necesitas, ya sabes dónde está.',
  next: ['cue-entrar', 'cue-correo-contrasena'],
}

export const tutCuentasBorrarCuenta: TourDef = {
  id: 'tut-cuentas-borrar-cuenta',
  module: 'cuentas',
  group: 'Cuenta',
  summary: 'Dónde está «Borrar mi cuenta», qué borra y por qué hay que tener cuidado.',
  version: 1,
  title: 'Dónde está «Borrar mi cuenta»',
  cardId: 'cue-borrar-cuenta',
  durationSec: 60,
  startPath: '/menu-organizar',
  startDest: 'config.cuenta',
  steps: [
    {
      id: 'tarjeta',
      text: 'Esta tarjeta permite borrar tu cuenta. Cuidado: no se puede deshacer. Te la enseño solo para que sepas qué hace; no te animo a usarla.',
      target: 'cuenta.borrar-tarjeta',
      ...info,
    },
    {
      id: 'solo-yo',
      text: '«Borrar solo mi cuenta» borra tu acceso, tu perfil, tus avisos y tu ubicación. La familia sigue con todo lo suyo. Si administras la familia, hay otra opción que borra TODA la familia: es mucho más grave.',
      target: 'cuenta.borrar-solo-yo',
      ...info,
    },
    {
      id: 'confirmar',
      text: 'Antes de borrar nada se te pide escribir BORRAR, y puedes cancelar. Yo no pulso ni escribo nada. Si solo quieres dejar de usar PEPA en este móvil, basta con «Cerrar sesión».',
      target: 'cuenta.borrar-tarjeta',
      ...info,
    },
  ],
  finishText: 'No se ha borrado nada. Si tienes dudas antes de decidir, consúltalo con quien administra la familia.',
  next: ['cue-cerrar-sesion'],
}

export const tutCuentasEntrar: TourDef = {
  id: 'tut-cuentas-entrar',
  module: 'cuentas',
  group: 'Cuenta',
  summary: 'Cómo se entra en PEPA y qué hacer si no tienes cuenta (con una invitación).',
  version: 1,
  title: 'Entrar en PEPA y qué hacer sin cuenta',
  cardId: 'cue-entrar',
  durationSec: 75,
  startPath: '/menu-organizar',
  startDest: 'config.cuenta',
  steps: [
    {
      id: 'entrada',
      text: 'La pantalla de entrada solo se ve con la sesión cerrada, así que no puedo recorrerla contigo estando dentro. Allí entras con tu correo y tu contraseña.',
      ...info,
    },
    {
      id: 'invitacion',
      text: 'PEPA es privada: para crear una cuenta hace falta una invitación. En la pantalla de entrada toca «¿No tienes cuenta? Tengo una invitación» y escribe el código que te hayan dado.',
      ...info,
    },
    {
      id: 'codigo',
      text: 'Si te une un familiar a su familia, te genera el código desde Familia. Si eres de una familia nueva, te lo da la persona que administra PEPA.',
      ...info,
    },
    {
      id: 'cerrar',
      text: 'Desde dentro, el camino a esa pantalla es «Cerrar sesión». Solo te lo señalo: no lo pulso por ti.',
      target: 'cuenta.cerrar-sesion-boton',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Eso es todo. No he cerrado tu sesión ni he cambiado nada.',
  next: ['cue-cerrar-sesion', 'cue-pin'],
}

// ───────────────────────────── Ayuda: reseñas
export const tutAyudaResenas: TourDef = {
  id: 'tut-ayuda-resenas',
  module: 'ayuda',
  group: 'Ayuda',
  summary: 'Valorar PEPA de 1 a 5 estrellas.',
  version: 1,
  title: 'Valorar PEPA con estrellas',
  cardId: 'ini-resenas',
  durationSec: 60,
  startPath: '/resenas',
  steps: [
    {
      id: 'general',
      text: 'Aquí valoras PEPA en general, de 1 a 5 estrellas. Es tu valoración: cada persona tiene la suya y puedes cambiarla cuando quieras.',
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
      text: 'Ya está guardada. Con «Contar qué me gusta y qué no» puedes añadir un comentario, y «Guardar comentario» lo guarda. Es opcional.',
      target: 'resenas.general',
      ...info,
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

// ───────────────────────────── Visitas guiadas
export const visitaNotificaciones: TourDef = {
  id: 'visita-notificaciones',
  kind: 'visit',
  module: 'notificaciones',
  title: 'Conoce los avisos',
  summary: 'La campana de Inicio y dónde se ajustan los avisos del móvil y los resúmenes de tareas.',
  version: 1,
  cardId: 'not-campana',
  durationSec: 80,
  startPath: '/menu-organizar',
  startDest: 'config.avisos',
  steps: [
    {
      id: 'dos-cosas',
      text: 'Los avisos de PEPA son dos cosas: la campana 🔔 de Inicio, que guarda tus avisos, y los avisos del móvil, que te llegan aunque la app esté cerrada. Aquí se ajusta lo segundo. Esta visita no cambia nada.',
      ...info,
    },
    {
      id: 'movil',
      text: '«Avisos en este móvil»: activas o desactivas los avisos de este aparato y puedes mandarte uno de prueba. Cada móvil se activa por separado.',
      target: 'notifications.device-card',
      ...info,
      optional: true,
    },
    {
      id: 'horarios',
      text: '«Horarios de tus avisos»: tu zona horaria y la hora de los resúmenes de tareas de hoy y de las atrasadas. Son solo tuyos.',
      target: 'notifications.prefs-card',
      ...info,
      optional: true,
    },
    {
      id: 'quien',
      text: '«¿A quién avisamos de tareas y eventos?»: a todos los miembros activos o solo a los asignados. Solo la administración de la familia puede cambiarlo.',
      target: 'notifications.task-mode',
      ...info,
      optional: true,
    },
  ],
  finishText: 'Ya sabes dónde están los avisos. Para abrir la campana, mírala arriba a la derecha en Inicio. Si quieres practicar, pídeme el tutorial de activar los avisos.',
  next: ['not-activar', 'not-resumen-tareas', 'not-campana'],
}

export const visitaCuentas: TourDef = {
  id: 'visita-cuentas',
  kind: 'visit',
  module: 'cuentas',
  title: 'Conoce tu cuenta',
  summary: 'Dónde están el correo, la contraseña, el PIN, cerrar sesión y borrar la cuenta.',
  version: 1,
  cardId: 'cue-entrar',
  durationSec: 80,
  startPath: '/menu-organizar',
  startDest: 'config.seguridad',
  steps: [
    {
      id: 'tema',
      text: 'Lo de tu cuenta está en dos temas de Configuración: «Seguridad» (el que tienes abierto) y «Mi cuenta». Esta visita solo te enseña dónde está cada cosa; no cambia nada.',
      target: 'config.group-seguridad',
      ...info,
    },
    {
      id: 'correo',
      text: '«Correo y contraseña»: con qué correo entras y cómo cambiarlos. Cada persona gestiona lo suyo.',
      target: 'seguridad.correo-contrasena',
      ...info,
      optional: true,
    },
    {
      id: 'bloqueo',
      text: '«Bloqueo personal»: un PIN opcional de 4 a 6 dígitos para abrir PEPA, y la huella o Face ID si tu dispositivo la admite.',
      target: 'seguridad.bloqueo',
      ...info,
      optional: true,
    },
    {
      id: 'mi-cuenta',
      text: '«Mi cuenta», un poco más abajo: «Cerrar sesión» (solo en este móvil) y «Borrar mi cuenta», que no se puede deshacer y pide escribir una palabra de confirmación.',
      target: 'config.group-cuenta',
      ...info,
    },
    {
      id: 'entrar',
      text: 'Para entrar en PEPA hace falta cuenta, y se crea con una invitación en la pantalla de entrada. Esa pantalla solo se ve con la sesión cerrada.',
      ...info,
    },
  ],
  finishText: 'Eso es todo. Si quieres, pídeme un tutorial: dónde poner el PIN, cambiar la contraseña o cerrar la sesión.',
  next: ['cue-pin', 'cue-correo-contrasena', 'cue-cerrar-sesion'],
}
