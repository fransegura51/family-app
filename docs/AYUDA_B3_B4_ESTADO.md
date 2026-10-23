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
- Siempre se puede cerrar («✕»/Salir) sin bloquear la app; si el control no está (otra pantalla, sin permiso) el panel lo dice y ofrece seguir con la Ayuda.
- Bienvenida: la marca `pepa:help-welcome = pending` la deja el alta (crear familia o unirse con código); una cuenta anterior no tiene valor y **no recibe ninguna sugerencia**. Está siempre a mano en Ayuda («Recorrido de bienvenida»).
- Pruebas: `engine.test.ts`, `tourDefs.test.ts` (AYUDA-01: las marcas y los avisos existen en el código de las pantallas), `tourRunner.test.tsx`, `tourPilotsReal.test.tsx` (formularios reales con datos simulados), `helpNudges.test.tsx`. **No sustituyen la prueba en dispositivos reales (ordenador y móvil).**
- Apagar solo los tutoriales sin tocar el resto de la Ayuda: quitar `tour:` de las fichas o `canStartTour` (hoy cuelgan de `HELP_CONTEXTUAL_ENABLED`).

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
