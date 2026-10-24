# Ayuda «Pepa te acompaña» (B3) y tutoriales «Enséñame» (B4) — estado, interruptores y reversión

Documento vivo. Última actualización: 23/10/2026. Base de diseño: «Nueva Ayuda y Pepa te acompaña» v1.1 y los análisis de `auditoria-ayuda-pepa/` (fuera del repositorio).

## Qué hay

| Pieza | Dónde | Estado |
|---|---|---|
| Catálogo de módulos y fichas (95+ fichas, 19 módulos) | `src/help/catalog/` | Activo |
| Explicación ampliada histórica (no se ha tirado nada; corregidos los textos desfasados) | `src/help/legacy/legacyHelp.ts` | Activo |
| Buscador local (sinónimos, plurales, erratas, permisos) | `src/help/search/` | Activo |
| Pantalla de Ayuda nueva (`/ayuda`): buscador, acciones frecuentes, módulos, vídeos | `src/ui/AyudaScreen.tsx`, `src/help/ui/` | Activo |
| Panel contextual de Pepa («?» en cada módulo y en tres formularios) | `HelpPanel`, `HelpHint` | Activo |
| Voz de la Ayuda (Hablando / Por escrito), independiente de «Hablar con PEPA» | `src/help/prefs.ts`, `voice.ts` | Activo (local al dispositivo) |
| Permisos (rol, secciones, Comunidad 18+, plataforma) | `src/help/access.ts` | Activo |
| Conversación solo en memoria (no se guarda) | `src/help/session.ts` | Activo |
| Cobertura en el Centro de Administración (módulos, fichas, tutoriales, rutas rotas, prioridades) | `src/ui/admin/AreaAyuda.tsx`, `src/help/health.ts` | Activo |
| Regla AYUDA-01 + pruebas «trinquete» | `CLAUDE.md`, `src/help/helpDebt.ts`, `src/help/catalog/*.test.ts` | Activo |
| Valoraciones «¿Te ha servido?» (agregadas) | `src/help/feedback.ts` + migración 0306 | **Apagado** (`HELP_FEEDBACK_ENABLED = false`): necesita la migración 0306 |
| Sincronización entre dispositivos de las preferencias de Ayuda y del progreso de tutoriales | `src/state/prefs/prefsRegistry.ts` + migración 0306 | **Apagado** (`HELP_PREFS_SYNC_ENABLED = false`): necesita la migración 0306 |
| Tutoriales «Enséñame» sobre las pantallas reales (motor + 3 pilotos + bienvenida) | `src/help/tours/` (motor, definiciones, `TourRunner`, `helpBus`), marcas `data-help-id` en las pantallas | Activo con `HELP_CONTEXTUAL_ENABLED` (progreso local al dispositivo hasta aplicar 0306) |
| Bienvenida opcional y aviso de primera visita a un módulo | `src/help/ui/HelpNudges.tsx`, `offerWelcomeToNewAccount` (alta) | Activo, **solo cuentas nuevas**; una vez; «Ahora no» la omite |
| Búsqueda con IA (solo ELIGE entre fichas verificadas; cuentas adultas; solo si la búsqueda local no es clara) | `src/help/ai.ts`, `aiClient.ts`, `supabase/functions/help-search` | **Preparada y apagada** (`HELP_AI_ENABLED = false`): falta DESPLEGAR la función de servidor `help-search` |

## Interruptores (todos en el código; apagar = poner `false` y desplegar)

- `HELP_CONTEXTUAL_ENABLED` (`src/help/flags.ts`, **encendido**): los «?» de cada módulo y formulario y el panel flotante de Pepa. Apagado, solo queda la pantalla `/ayuda`.
- `HELP_FEEDBACK_ENABLED` (`src/help/feedback.ts`): muestra «¿Te ha servido?» y envía el sí/no agregado. Requiere 0306.
- `HELP_PREFS_SYNC_ENABLED` (`src/state/prefs/prefsRegistry.ts`): las claves `pepa:help-*` viajan con la cuenta. Requiere 0306. Una prueba impide encenderlo sin la migración aplicada.
- `HELP_AI_ENABLED` (`src/help/ai.ts`): búsqueda con IA. Preparada de extremo a extremo y probada con simulaciones, pero la función de servidor `help-search` NO está desplegada. Para activarla: `supabase functions deploy help-search` (usa la pasarela de IA existente: cuenta adulta, interruptor global `ai_config`, tope general, proveedor/modelo de `ai_config`, registro de uso), poner el interruptor a `true` y desplegar la web. Límites de consumo comprobados: tope diario propio de **40 llamadas por familia y día** (`HELP_SEARCH_DAILY_CAP`, aplicado por la pasarela antes de llamar al proveedor; si no puede leer el contador, no llama), en el cliente **1 llamada cada 2,5 s y 20 por sesión**, caché por pregunta y la IA solo se consulta cuando la búsqueda local no es clara. Se puede apagar sin desplegar nada: `update ai_config set value = '["help-search"]' where key = 'purposes_disabled'` (mecanismo existente de la pasarela) o con el interruptor general. Coste: mismo proveedor y nivel gratuito que el resto de la IA de PEPA; el techo de uso es el tope diario de arriba.

## Tutoriales «Enséñame» (B4)

- Tutoriales: **Calendario → Crear un evento** (`cal-crear-evento`), **Compras → Añadir un producto** (`com-anadir-producto`), **Familia → Añadir un miembro** (`fam-anadir-miembro`) y el **recorrido de bienvenida** (`bienvenida`, solo informativo). Se añaden nuevos en `src/help/tours/defs/` + `registry.ts` + `tour:` en la ficha + marcas `data-help-id` en la pantalla real.
- Se ejecutan sobre los formularios reales: la persona escribe y pulsa; el tutorial solo observa (clics, campos, cambio de ruta) y señala con un aro (`pointer-events:none`). Los pasos **sensibles** (guardar, crear) no avanzan con un clic ni tienen «Siguiente»: esperan el aviso `emitHelpEvent(...)` que la pantalla emite **después** de que el servidor confirme. Si el guardado falla, el tutorial no avanza. Nunca crea, borra ni envía nada por su cuenta (el de Familia no envía invitaciones).
- **Teclado y viewport (B4-UX01, 23/10/2026):** prueba en iPhone real detectó el marco desalineado y la tarjeta tapada por el teclado. Causa: en iOS el teclado reduce `visualViewport` pero no `innerHeight`; el marco y la tarjeta estaban anclados a la pantalla entera y se medían una sola vez. Ahora la capa del tutorial se ajusta al área visible (`src/help/tours/viewport.ts`), el marco se mide respecto a ella y se recoloca en cada fotograma durante el teclado/foco/desplazamiento/giro, rodea la etiqueta + el campo, la tarjeta se compacta (botones secundarios ocultos) y va al lado que no tapa el control, y si el control queda bajo el teclado se desplaza el contenido (nunca el formulario ni el foco). Pruebas: `tourViewport.test.tsx` (simula `visualViewport`) y dos casos en `tourPilotsReal.test.tsx`. Es simulación: la confirmación es la prueba en el iPhone.
- **Paquete de validación en iPhone (23/10/2026):**
  - **B4-UX02** señal `confirmed`: el paso de la fecha avanza cuando el valor es válido y el selector se ha cerrado (el campo pierde el foco) o, si conserva el foco (iPhone), tras 1,8 s sin más cambios; con la fecha predeterminada se ofrece «Siguiente».
  - **B4-UX03** el paso de «otras opciones» es un recorrido breve y saltable (`group` + «Saltar opciones»): hora, todo el día, privado, repetición, recordatorio, categoría y los iconos de ubicación/adjunto/nota, cada uno con SU marco; los controles que no existen en ese momento se omiten solos (`optional`, 350 ms) y «Atrás» no vuelve a un paso omitido.
  - **B4-UX04** «¿Para quién?» y los puntos tienen paso propio (fuera de los grupos) en los tutoriales de evento y de tarea (`cal-crear-tarea`, nuevo). Regla funcional intacta: puntos solo con UNA persona; «Toda la familia» los oculta; no hay reparto entre varias.
  - **CAL-01** causa: `AddEventForm` nunca recibía la ficha de la cuenta (solo la de la columna de Familiar) y arrancaba vacío = «Toda la familia»; `AddTaskForm` sí la recibía pero la perdía tras guardar. Ahora ambos usan `useAssignees` (selección inicial = persona autenticada, elección manual intocable, ficha tardía solo si no se ha tocado nada, reinicio al valor por defecto tras guardar, aviso claro si la cuenta no tiene ficha). Edición y datos guardados sin tocar. Nota: el autorrelleno por título (copiar «para quién» de un evento anterior igual) sigue funcionando mientras no se haya elegido a mano.
  - **B4-UX05/06** tarjeta compacta (ver B4-UX01), botones secundarios (`tour-btn-extra`) ocultos solo en modo compacto, «Saltar opciones» visible; el marco solo se dibuja si se midió para el paso actual (nunca un resaltado del paso anterior).
  - **B3 avatar/compartir** (`src/ui/fabSeparation.ts`, `FabSeparator`): si dos botones redondos de arriba (avatares de Pepa y el de redes) quedan superpuestos, el posterior se aparta con un margen VISUAL (no toca lo guardado); no se pudo reproducir la causa exacta sin captura, es una protección general.
- **Corrección integral de Ayuda B3/B4 (23/10/2026, tras la prueba en iPhone/Safari-PWA):**
  - **Destinos de «Llévame»** (`src/help/destinations.ts`, `HelpDestMark`): las pestañas de Cocina, Compras, Economía y Familia, los temas de Configuración y los formularios de Calendario NO son rutas.
    Causa raíz: navegar a la ruta solo abría la portada y la pestaña pedida se leía únicamente al montarse. Ahora cada ficha puede llevar `go.dest`, la pantalla lo atiende (`useHelpDestinations`), se cierran
    los menús abiertos y la llegada se COMPRUEBA por una marca en pantalla (sin pausas de cortesía); si no llega (cuenta sin acceso…) se dice con claridad. 30 fichas con destino exacto.
  - **Tutoriales**: `startDest` (el tutorial lleva a la vista exacta y espera a que esté en pantalla: Compras → pestaña «Lista»; Familia → «+ Añadir miembro», solo administración), cierre de menús al empezar,
    «Preparando…» / «No he podido abrir la pantalla» (reintentar, pasos escritos, salir) en vez de un falso «no encuentro este control».
  - **Escribir sin prisas**: los pasos de nombre/título ya no avanzan con 2 letras; avanzan al terminar (✓ del teclado, intro, salir del campo) o con «Siguiente» (`entered`); un toque en la tarjeta de Pepa no salta dos pasos.
  - **Familia**: explica cada tipo de miembro (comprobado contra el código: qué hace administrar la familia, el adulto, niño/a con secciones limitables, bebé sin cuenta, invitado/a limitado; y que administrar la familia no
    es administrar la aplicación PEPA) y los datos opcionales (color, nacimiento —Comunidad solo 18+—, sexo, secciones).
  - **Ayuda contextual en móvil**: abre por el principio (sin enfocar el buscador ni abrir el teclado), «Ayuda de [módulo]» desplegada y «Acciones frecuentes» plegada, cada consulta nueva se enseña desde su pregunta,
    el historial se conserva, la hoja sigue al área visible con el teclado (`useVisibleArea`).
  - **Visibilidad**: la etiqueta «Funciona, pero con limitaciones» y los motivos técnicos ya no se enseñan a las personas normales (antes SÍ se enseñaban a todo el mundo: `HelpAnswer` no comprobaba nada). La limitación que
    afecta al uso se dice como «Ten en cuenta: …»; el estado interno solo lo ve la administración de PEPA cuando la memoria de 10 minutos ya sabe que lo es (la Ayuda nunca suma una consulta a Supabase por esto) y,
    completo, en el Centro de Administración → Ayuda.
  - Ficha «Cómo usar la Ayuda de PEPA» ampliada (preguntas, sugerencias, temas, Llévame, Enséñame, voz, qué hacer si no hay tutorial).
- **Correcciones consolidadas (23/10/2026, 2.ª ronda en iPhone):**
  - **Marcador del tutorial con el teclado**: el marco ya NO es una capa con coordenadas (que se descolocaba al mover iOS el viewport); es un estilo del propio control (`data-tour-active`, ver `tours.css`), así que viaja con él
    pase lo que pase con el teclado, el scroll o el giro. Las medidas que quedan (dónde poner la tarjeta, cuándo desplazar) son relativas a la propia capa del tutorial. Además `textarea` pasa a 16 px solo en iOS (evita el zoom automático).
  - **Tarjeta**: «Salir» (✕) siempre arriba; Pausar/Reiniciar/Escuchar a la vista con espacio y recogidos tras «⋯ Más» en modo compacto (nada se elimina).
  - **Sugerencias al escribir** en el buscador (`suggestHelp`): fichas verificadas, prefijo en la última palabra, tildes/mayúsculas/erratas, máximo 4, encima del cuadro; sin IA ni servidor.
  - **Botones flotantes**: se esconden con suavidad mientras el teclado está abierto (`data-pepa-keyboard`) y se separan si se superponen.
  - **Actividad reciente**: diagnóstico y corrección en la sección siguiente.
- Siempre se puede cerrar («✕»/Salir) sin bloquear la app; si el control no está (otra pantalla, sin permiso) el panel lo dice y ofrece seguir con la Ayuda.
- Bienvenida: la marca `pepa:help-welcome = pending` la deja el alta (crear familia o unirse con código); una cuenta anterior no tiene valor y **no recibe ninguna sugerencia**. Está siempre a mano en Ayuda («Recorrido de bienvenida»).
- Pruebas: `engine.test.ts`, `tourDefs.test.ts` (AYUDA-01: las marcas y los avisos existen en el código de las pantallas), `tourRunner.test.tsx`, `tourPilotsReal.test.tsx` (formularios reales con datos simulados), `helpNudges.test.tsx`. **No sustituyen la prueba en dispositivos reales (ordenador y móvil).**
- Apagar solo los tutoriales sin tocar el resto de la Ayuda: quitar `tour:` de las fichas o `canStartTour` (hoy cuelgan de `HELP_CONTEXTUAL_ENABLED`).

## Actividad reciente: las «49 entradas» (diagnóstico por código; la consulta a la base de datos queda pendiente)

- **Qué se ve**: la pantalla pedía las últimas 50 filas de `activity_log`. «1 producto creado + 49 “Alguien modificó un evento”» = exactamente esas 50: las 49 son solo las que caben; puede haber muchas más detrás.
- **Causa demostrada en el código**: el disparador `log_activity()` (0011) anota CADA `update` de `calendar_events`, aunque no cambie nada, con `auth.uid()` (nulo si no hay sesión de persona → «Alguien»).
  `sync-calendar-from-google-cron` (cada hora, según su cabecera) hacía `update` de TODOS los eventos ya importados de Google en cada vuelta, con los mismos datos y con la clave de servicio → N filas idénticas por hora.
  No hay otro escritor masivo: los formularios, los tutoriales y la edición de eventos recurrentes escriben una fila por acción (revisado en `src/data/calendar.ts` y `events.ts`); los tutoriales no escriben nada.
- **Comprobado en producción (23/10/2026, solo lectura, desde el SQL Editor del panel)**: `activity_log` tenía 771.200 filas (desde el 31/08/2026); en las últimas 72 horas, 54.288 «modificó un evento» SIN persona: 754 filas CADA hora (la sincronización de Google, cron `5 * * * *`, actualizaba 754 eventos importados por vuelta); solo 3.511 filas del total tenían persona. La pantalla enseñaba 49 porque cabían 50. Consulta usada:
  `select date_trunc('hour', created_at) h, actor_id is null as sin_persona, count(*) n, count(distinct record_id) elementos from activity_log where table_name='calendar_events' and action='update' and created_at > now() - interval '3 days' group by 1,2 order by 1 desc;`
  Si salen ~N filas por hora con `sin_persona = true` y `elementos` = N, es esto.
- **Corrección (publicada, solo web)**: las líneas seguidas de lo mismo (misma persona/tabla/acción, ≤ 2 min) se juntan («Un proceso automático de PEPA modificó 49 eventos»), nunca se juntan cosas distintas; sin persona ya no dice «Alguien»;
  se nombra el evento/producto/miembro cuando la cuenta puede leerlo (3 lecturas pequeñas al abrir la pantalla; un evento privado de otra persona no se nombra); se piden 200 filas y hay «Ver más antiguas».
- **Corrección de la causa (APLICADA con autorización expresa el 23/10/2026)**: (1) `supabase/migrations/0307_activity_log_skip_noop_updates.sql` (+ reversión en `supabase/rollbacks/`): un `update` que no cambia nada salvo `updated_at` ya no se anota; aplicada con el editor SQL del panel; el recuento de filas antes y después fue idéntico (771.200: no borró nada).
  (2) `sync-calendar-from-google-cron` DESPLEGADA desde el editor de funciones del panel (index.ts + eventDiff.ts, código idéntico al del repositorio; la versión anterior es la de `git show ece1d15:supabase/functions/sync-calendar-from-google-cron/index.ts`): solo escribe lo que cambió. Probada ejecutando su código real con una base de datos y un Google simulados (`src/data/googleImportSync.test.ts`).
  Las filas ya acumuladas NO se borran (haría falta autorización expresa; 771.200 filas ocupan espacio y se podrían depurar más adelante con una decisión tuya).

## Privacidad

- La conversación de Ayuda vive en el estado de React: no va a `localStorage`, ni a la base de datos, ni a ningún servicio (una prueba lo comprueba). Al cerrar la Ayuda o recargar la app desaparece.
- Las valoraciones son contadores por ficha y día (sí/no), sin identidad ni texto.
- La IA (cuando exista) solo recibiría la pregunta y fichas candidatas ya filtradas por permisos (nunca datos de la familia) y solo podría **elegir** entre ellas.

## Migración pendiente 0306 (NO aplicada)

`supabase/pending-migrations/0306_help_feedback_and_prefs.sql` (deshacer: `supabase/rollbacks/0306_help_feedback_and_prefs_down.sql`). Probada en local con PGlite
(`cd supabase/local-sql-tests && npm test`, 86 pruebas): amplía la lista cerrada de claves de preferencias (4 claves de Ayuda), crea `help_feedback_daily` (sin políticas: nadie
accede directamente), `record_help_feedback` (cuentas con sesión; tope de 300 fichas distintas al día) y `help_feedback_summary` (solo `is_app_owner`).
Para activarla: aplicar 0306 (mover el archivo a `supabase/migrations/`), poner a `true` los dos interruptores, desplegar y comprobar con una cuenta propietaria y una normal.

## Reversión

1. **Ayuda nueva**: cada despliegue es un commit de `master`; el último estable antes de B3 es `a003376` (B2-UX); el último estable antes de B4 es `c788dba` (B3 documental/contextual). Revertir = `git revert <commit de B3>` y push (la web vuelve a la Ayuda anterior;
   no toca la base de datos). Si la pantalla falla, también se puede apagar el panel contextual quitando `<HelpPanel />` de `NavShell.tsx`.
2. **Interruptores**: para quitar solo una pieza, poner su interruptor a `false`.
3. **Base de datos**: revertir código **no** revierte la base de datos. Solo 0306 (si se aplica) añade objetos; se deshace con su script de reversión.
