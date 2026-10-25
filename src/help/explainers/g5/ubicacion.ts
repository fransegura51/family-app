import type { HelpExplainer } from '@/help/explainers/types'

// Ubicación: consentimiento, avisos de llegada y salida, y qué pasa con la app cerrada. Comprobado contra LocationScreen.tsx, data/location.ts, BackgroundLocationCard.tsx,
// docs/APP_NATIVA.md, docs/APP_IOS.md y las migraciones 0010, 0029, 0058, 0178, 0186, 0243, 0263, 0297 y 0298.

export const expUbicacionCompartir: HelpExplainer = {
  id: 'exp-ubicacion-compartir',
  module: 'ubicacion',
  title: 'Cómo funciona compartir la ubicación y el permiso de cada persona',
  summary: 'La ubicación está apagada hasta que alguien la activa. Aquí se explica quién puede activarla, qué se guarda, durante cuánto tiempo y quién lo ve.',
  sections: [
    {
      heading: 'Apagada hasta que alguien la active',
      paragraphs: [
        'Cada persona tiene su propio permiso de ubicación, desactivado por defecto. Mientras esté apagado, PEPA no guarda su posición actual (el servidor rechaza guardarla) ni la muestra en el mapa.',
        'Para activarlo hay que ir a la pestaña «👥 Compartir ubicación». Si te activas tú, PEPA empieza a compartir desde ese móvil y el móvil puede pedirte su permiso de ubicación.',
      ],
    },
    {
      heading: 'Quién puede activar qué',
      paragraphs: [
        'Cada persona puede activar o desactivar la suya. La administración de la familia puede activar o desactivar la de cualquiera, por ejemplo la de un menor sin cuenta.',
        'Activar el permiso de otra persona no la localiza por sí solo: solo lo habilita. La posición la manda el móvil de esa persona, en «Este dispositivo», eligiendo «¿Quién lleva este dispositivo?».',
      ],
      example: 'Ejemplo inventado: Ana (administradora) activa el permiso de Marta, que aún no tiene cuenta. No pasa nada hasta que, en el móvil que lleva Marta, se elija a Marta en «Este dispositivo».',
    },
    {
      heading: 'Qué se guarda y cuánto tiempo',
      paragraphs: [
        'La última posición de cada persona (la nueva sustituye a la anterior) y el recorrido de las últimas 24 horas; pasado ese tiempo se borra solo. Si desactivas el permiso, se borran la última posición y ese recorrido.',
        'Aparte hay un historial de sitios: guarda una fila por cada parada real («estuvo en X desde tal hora hasta tal hora»), no la ruta completa, y se conserva 90 días.',
      ],
    },
    {
      heading: 'Quién lo ve',
      paragraphs: [
        'Las personas de tu familia que tengan acceso a la sección Ubicación ven en el mapa a quien comparte. Otra familia no. Si alguien no comparte, aparece con el símbolo ⏸ y «Ubicación no compartida».',
      ],
    },
  ],
  limits: [
    'La posición solo existe si el móvil la manda. Si el móvil no la envía (app cerrada, sin conexión…), verás «Última posición conocida…» con su antigüedad.',
    'El rastro del mapa tiene tramos con rayas cuando faltan datos: no es un fallo, es que el móvil no mandó posición en ese rato.',
  ],
  ifWrong: [
    'Si alguien no aparece en el mapa: mira si tiene el símbolo ⏸ (permiso desactivado) y, si no, si en su móvil está elegido en «Este dispositivo».',
    'Si quieres dejar de compartir, pulsa «Dejar de compartir» en ese móvil y, para borrar lo guardado, desactiva el permiso.',
    'Si sale una posición claramente equivocada o la ubicación no funciona aunque todo esté activado, cuéntalo en Sugerencias indicando el móvil y la hora.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/LocationScreen.tsx',
    'src/data/location.ts',
    'supabase/migrations/0010_geolocation_automation_schema.sql',
    'supabase/migrations/0029_location_history_and_member_photos.sql',
    'supabase/migrations/0058_place_visits.sql',
  ],
  tour: 'tut-ubicacion-compartir-movil',
  go: { path: '/ubicacion', dest: 'ubicacion.mapa' },
  labels: ['👥 Compartir ubicación', '¿Quién puede compartir?', 'Este dispositivo', '¿Quién lleva este dispositivo?', 'Dejar de compartir', 'Ubicación no compartida', 'Última posición conocida'],
  cardIds: ['ubi-ver', 'ubi-compartir-movil'],
  synonyms: ['quién ve mi ubicación', 'cómo se comparte la ubicación', 'consentimiento', 'desactivar ubicación', 'por qué no aparece en el mapa', 'cuánto tiempo guarda mi ubicación', 'ubicación de mi hijo'],
}

export const expUbicacionAvisos: HelpExplainer = {
  id: 'exp-ubicacion-avisos',
  module: 'ubicacion',
  title: 'Cómo funcionan los avisos de llegada y salida',
  summary: 'PEPA avisa a la familia cuando alguien llega a un lugar guardado o se va de él. El aviso lo calcula el servidor y no es instantáneo: necesita confirmar el cambio.',
  sections: [
    {
      heading: 'Qué hace PEPA',
      paragraphs: [
        'Cuando un lugar tiene marcado «🔔 Avisarme cuando alguien llegue o se vaya de aquí», PEPA crea por dentro una regla de llegada y otra de salida. Cada vez que el móvil de alguien con la ubicación activada manda su posición, el servidor la compara con el lugar, aunque nadie tenga la app abierta.',
        'El aviso llega a la campana y al móvil de las cuentas de la familia, menos a quien se ha movido. Usa el nombre de la categoría del lugar si la tiene; si no, su nombre.',
      ],
    },
    {
      heading: 'Con qué decide',
      paragraphs: [
        'Con la distancia al lugar y su radio («Nuevo lugar» propone 50 metros). Para dar por hecha una salida, la persona tiene que alejarse algo más que el radio (un 25 % más y 20 metros de margen), para que no salten avisos por pequeñas oscilaciones.',
        'Un cambio no avisa con una sola lectura: hace falta una segunda lectura que lo confirme y que hayan pasado al menos 60 segundos desde la primera. Si entre medias la posición vuelve al lado de antes, se descarta como un rebote del GPS.',
      ],
      example: 'Ejemplo inventado: «Colegio» tiene radio 50 m. Marta sale del recinto a las 15:00; el móvil manda una lectura fuera y, un minuto después, otra que lo confirma. Entonces llega «Marta ha salido de Colegio» a Ana y a Luis, no a Marta.',
    },
    {
      heading: 'Las reglas de la pestaña Reglas',
      paragraphs: [
        'En «Nueva regla» eliges «Al llegar a un lugar», «Al salir de un lugar» o «Todos los días a una hora», un mensaje y, si quieres, «Para quién». En las reglas de lugar, «Para quién» filtra de quién es el movimiento que dispara el aviso; el aviso llega a la familia igualmente. En la de hora diaria, «Para quién» no filtra nada: el aviso llega a toda la familia.',
        'La regla de hora diaria se comprueba en hora de España peninsular y avisa dentro de los 30 minutos siguientes a la hora fijada, una vez al día. «Silenciar 1h» la calla una hora; «Activa/Pausada» la pausa sin borrarla.',
        'Las reglas que crea el interruptor 🔔 de cada lugar no salen en «Reglas»: se gestionan desde el propio lugar.',
      ],
    },
  ],
  limits: [
    'No es instantáneo: necesita al menos dos lecturas separadas por 60 segundos o más, y el móvil debe estar mandando su posición.',
    'La primera vez que PEPA recibe la posición de alguien para una regla, solo apunta dónde está; no avisa.',
    'No avisa si la persona no tiene la ubicación activada, ni si su móvil no manda posición (por ejemplo, con la web cerrada).',
    'Para mover un lugar no hace falta borrarlo: edítalo con «✎ Editar» y usa «📍 Mover el lugar a donde estoy ahora» estando en el sitio (no se mueve hasta «Guardar cambios»).',
    'Si el aviso no se entrega a la primera, PEPA lo reintenta varias veces durante unos 30 minutos.',
  ],
  ifWrong: [
    'Si llega un aviso falso o tardío, aumenta el radio del lugar con «✎ Editar» y comprueba que el móvil de esa persona tiene la ubicación activada y manda su posición (en Android, «Permitir todo el tiempo»).',
    'Si no llega ningún aviso, comprueba que el lugar tiene la casilla 🔔 marcada y que tus avisos están activados en «🔔 Avisos en este móvil».',
    'Si todo está bien y falla de forma repetida, cuéntalo en Sugerencias con el lugar, la persona y la hora aproximada.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/LocationScreen.tsx',
    'src/data/location.ts',
    'supabase/migrations/0178_location_places_notify_arrivals.sql',
    'supabase/migrations/0186_server_side_automations.sql',
    'supabase/migrations/0243_location_alerts_reliability.sql',
    'supabase/migrations/0263_notification_history_for_existing_alerts.sql',
    'supabase/migrations/0297_location_alert_confirmation.sql',
  ],
  tour: 'tut-ubicacion-guardar-lugar',
  go: { path: '/ubicacion', dest: 'ubicacion.mapa' },
  labels: [
    '🔔 Avisarme cuando alguien llegue o se vaya de aquí',
    'Nueva regla',
    'Al llegar a un lugar',
    'Al salir de un lugar',
    'Todos los días a una hora',
    'Silenciar 1h',
    'Crear regla',
    '✎ Editar',
    '📍 Mover el lugar a donde estoy ahora',
    '🔔 Avisos en este móvil',
  ],
  cardIds: ['ubi-lugares', 'ubi-permiso-android', 'not-activar'],
  synonyms: ['aviso cuando llegue a casa', 'aviso falso de ubicación', 'por qué no me avisa', 'aviso de salida del colegio', 'cuánto tarda el aviso', 'reglas de ubicación', 'geovalla'],
}

export const expUbicacionAppCerrada: HelpExplainer = {
  id: 'exp-ubicacion-app-cerrada',
  module: 'ubicacion',
  title: 'La ubicación con la app abierta o cerrada: web, Android e iPhone',
  summary: 'Que PEPA reciba tu posición con la app cerrada depende de si usas la web o la app de Android. Aquí se dice qué sabemos y qué todavía no está comprobado.',
  sections: [
    {
      heading: 'En la web (PWA)',
      paragraphs: [
        'El móvil solo manda su posición con PEPA abierta. Con la web cerrada o en segundo plano, los demás verán «Última posición conocida…» y los avisos de llegada y salida de esa persona no se calcularán.',
      ],
    },
    {
      heading: 'En la app de Android',
      paragraphs: [
        'La app mantiene un servicio en primer plano, con una notificación fija, que sigue mandando la posición aunque cierres PEPA. Para que Android no lo corte hace falta el permiso de ubicación «Permitir todo el tiempo».',
        'Si falta, en Configuración → «Avisos» aparece la tarjeta «📍 Falta un permiso para los avisos con la app cerrada», con el botón «Abrir ajustes de PEPA». Con ahorro de batería agresivo (por ejemplo Xiaomi) también hay que permitir el inicio en segundo plano.',
      ],
      example: 'Un hijo sale del colegio con el móvil en el bolsillo y PEPA cerrada (ejemplo inventado). Con la web, no llega el aviso de salida porque nadie recibe su posición; con la app de Android y el permiso «Permitir todo el tiempo», sí.',
    },
    {
      heading: 'En la app de iPhone',
      paragraphs: [
        'La app de iPhone está preparada pero sin probar en un iPhone real. No se puede asegurar que mande la posición con la app cerrada: lo más incierto de iOS es relanzar el servicio en segundo plano.',
      ],
    },
  ],
  limits: [
    'El envío con la app cerrada en Android no está comprobado en todos los modelos de móvil, y no sobrevive a «Forzar detención» de la app.',
    'En iPhone no se garantiza todavía el envío con la app cerrada.',
    'Cuando la posición no llega, PEPA no la inventa: muestra la última conocida con su antigüedad.',
  ],
  ifWrong: [
    'En Android, abre Configuración → «Avisos»: si ves la tarjeta del permiso, ábrela, entra en Permisos → Ubicación y elige «Permitir todo el tiempo». Vuelve a PEPA y la tarjeta desaparece sola.',
    'Si sigue sin llegar con la app cerrada, revisa la guía de batería de esa misma pantalla y cuéntalo en Sugerencias con la marca y el modelo del móvil.',
  ],
  verified: '2026-10-23',
  basedOn: [
    'src/ui/BackgroundLocationCard.tsx',
    'src/ui/BatteryGuideCard.tsx',
    'src/ui/LocationScreen.tsx',
    'docs/APP_NATIVA.md',
    'docs/APP_IOS.md',
  ],
  tour: 'tut-ubicacion-permiso-android',
  go: { path: '/menu-organizar', dest: 'config.avisos' },
  labels: ['📍 Falta un permiso para los avisos con la app cerrada', 'Abrir ajustes de PEPA', 'Última posición conocida'],
  cardIds: ['ubi-permiso-android', 'ubi-lugares'],
  synonyms: ['ubicación con la app cerrada', 'permitir todo el tiempo', 'no se actualiza mi ubicación', 'android o iphone', 'xiaomi batería', 'ubicación en segundo plano'],
}

export const EXPLAINERS_UBICACION: HelpExplainer[] = [expUbicacionCompartir, expUbicacionAvisos, expUbicacionAppCerrada]
