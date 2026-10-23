# «Pepa te acompaña» — ampliación (24/10/2026): Conoce esta sección, Enséñame, Cómo funciona PEPA y Soporte técnico

Estado: implementado y probado en local; publicación de lo ordinario según el informe final (ver §9). **Soporte técnico: preparado, probado en local y APAGADO** hasta revisar y aplicar la migración `0310`.
Distinción que se mantiene en todo el documento: **implementado** (existe en el código) · **probado** (pruebas automáticas/locales; nunca equivale a probado en un iPhone real) · **publicado** (en producción) · **pendiente de autorización**.

## 1. Fase 0 — auditoría del estado real

Lo que ya existía y se REUTILIZA (no se ha reconstruido): catálogo de fichas verificadas (`src/help/catalog`), buscador y sugerencias, respuestas verificadas con vídeos, motor de tutoriales B4 (`src/help/tours`: lector puro, capa sobre la pantalla real, señales `click/appear/filled/entered/change/confirmed/route/event`, marcas `data-help-id`, destinos `data-help-dest`), Llévame con destinos internos, avisos discretos de primera visita, ayuda contextual «?», cobertura en el Centro de Administración y el trinquete AYUDA-01. El sistema de marcas pegadas al control (publicado antes de este encargo) se ha verificado: la prueba `tourDefs.test.ts` comprueba que cada control señalado existe en el código.

Estado por sección (auditorías de solo lectura sobre el código; se revisaron también las funciones nuevas que no estaban en el inventario antiguo: Documentos con aviso de vencimiento, importación de menú de Comunidad, conciliación de pagos previstos, Cuentas separadas/compartidas, etc.). Los estados «operativa/parcial/no disponible» salen del catálogo (`src/help/master/inventory.ts`) y se ven en Centro de Administración → Ayuda → «Catálogo maestro por sección».

Hallazgos de producto descubiertos al auditar (NO corregidos en este encargo; se listan para decidir):
1. **Cumpleaños** (favorito, ✏️ fecha, ✕ quitar sobre personas de Familia): la política `family_members: admin update` solo permite a administración de la familia modificar fichas. Para un adulto no administrador el cambio no daría error pero no se guardaría.
2. **«Secciones a las que puede entrar»** de una ficha se copia a la cuenta (`profiles.allowed_sections`) solo al crear la cuenta; no se encontró nada que traslade un cambio posterior de la ficha a la cuenta (pendiente de confirmar en el servidor real).
3. **Editar ficha con acceso total** (`allowedSections` nulo): el formulario sale con todo sin marcar; guardar sin marcar la deja solo con Inicio.
4. **Modo de cuentas / “bebé pasa a niño”**: los botones los ve cualquier persona, el servidor solo deja a administración; el cliente no comprueba filas afectadas.
5. **Economía**: el comentario del código sobre candidatos de confianza baja contradice el comportamiento real; no hay forma de deshacer un «No es este»; «Desconciliar» no devuelve la categoría anterior.

## 2. Arquitectura (Bloque A)

- Cuatro áreas dentro del MISMO panel/pantalla de Ayuda (`src/help/ui/HelpAreas.tsx`, estado en `HelpProvider`): 💬 Preguntar (la conversación de siempre, con su buscador y sugerencias) · 🧭 Conoce esta sección · 🎓 Enséñame · ⚙️ Cómo funciona PEPA · 🛟 Soporte técnico (la pestaña ni existe mientras esté apagado). Accesibles desde la pantalla Ayuda y desde el «?» contextual de cada módulo (el panel abre en el módulo actual).
- **Un solo registro** (`src/help/tours/registry.ts`): una visita es un `TourDef` con `kind: 'visit'`; un tutorial, `kind: 'tutorial'`. Los defs viven por grupo de módulos (`defs/groups/g1..g6`). Las explicaciones: `src/help/explainers`.
- **Catálogo maestro** (`src/help/master/inventory.ts`): vincula sección ↔ fichas ↔ visitas ↔ tutoriales ↔ explicaciones. Se calcula; no se puede desfasar.
- **Permisos**: `canDoTour` / `canExplain` aplican el acceso del módulo (rol, secciones permitidas, Comunidad 18+, plataforma) y la regla propia de cada recorrido (`access`). Lo que la cuenta no puede usar ni se lista ni se ofrece.
- **Estado de presentación**: reutiliza `pepa:help-tour:<id>` (iniciado/completado con versión/descartado) y `pepa:help-hint:<módulo>`; viaja con la cuenta en cuanto se encienda la sincronización de preferencias (0306 pendiente); mientras tanto, por dispositivo.
- **Primera visita**: el aviso discreto de siempre (solo cuentas nuevas, una vez por módulo, nunca abre nada solo) ahora ofrece además «Conoce esta sección» cuando existe la visita y la cuenta puede hacerla.
- **Reglas de los recorridos** (las vigilan `tourDefs.test.ts` y `masterCatalog.test.ts`): control real marcado con `data-help-id`; avanza solo cuando la persona lo hace de verdad; un paso que guarda es `sensitive` y solo avanza con un aviso emitido por la pantalla tras la confirmación del servidor (`emitHelpEvent`); las visitas no cambian datos; ningún tutorial pulsa por la persona borrar/enviar/compartir/publicar/pagar/conectar banco/leer ticket con IA (esos tutoriales terminan antes y lo dicen); cada paso ≤ 300 caracteres y cada recorrido ≤ 2 minutos; los controles que pueden no existir (rol, plataforma, datos vacíos) son `optional`.
- iPhone (teclado, `visualViewport`, safe-area, scroll al control) lo resuelve el motor B4 ya existente (`viewport.ts`, `tours.css`); no se ha vuelto a tocar.

## 3. «Cómo funciona PEPA»

Cada explicación (`HelpExplainer`) declara los archivos en los que se apoya (`basedOn`), los textos de pantalla que cita (`labels`), un ejemplo con datos inventados, limitaciones reales, qué hacer si el resultado es incorrecto, distinción limitación/fallo, y —si existe— el tutorial «Enséñame a corregirlo». Una prueba comprueba que los archivos y los textos existen. Desde una ficha de Ayuda aparece «¿Cómo funciona?» si hay una explicación que la cita.

## 4. Soporte técnico (Bloque C) — APAGADO

- **Migración** `supabase/pending-migrations/0310_support_tickets.sql` (+ reversión `supabase/rollbacks/0310_support_tickets_down.sql`): tablas `support_tickets`, `support_messages`, `support_attachments`, `support_ticket_events`; RLS solo lectura; toda escritura por funciones `SECURITY DEFINER` (`search_path` vacío) con límites (5 incidencias/día, 30 mensajes/día, 5 adjuntos por mensaje, 15 por incidencia, 5 MB, tipos cerrados) y avisos sin duplicados (clave con id de mensaje); bucket privado `support-attachments` (ruta `<familia>/support/<incidencia>/…`; se borra con la familia por `delete-account`); la administración es `profiles.is_app_owner`, NO el rol «admin» de una familia.
- **Pruebas locales** (`supabase/local-sql-tests/support-tickets.mjs`, PGlite, 29 pruebas): quién ve qué, nadie escribe directo, notas internas invisibles, minimización del contexto, estados y reaperturas, adjuntos y políticas de Storage, cascada al borrar familia, reversión.
- **Web**: `src/support/*` (datos, validación, contexto mínimo, textos), `SupportArea` (lista, nueva incidencia con revisión del contexto y de los adjuntos, conversación, confirmar resolución) y `src/ui/admin/SupportAdminPanel.tsx` (bandeja con filtros y estadísticas, respuesta, notas internas, asignación, estado, prioridad, incidencias parecidas) dentro del bloque «Soporte técnico» del área **Sistema** del Centro de Administración existente (no hay un tercer panel; no se mezcla con Buzón).
- **Interruptor** `src/support/flags.ts → SUPPORT_ENABLED = false`. Con él apagado no hay pestaña, botón ni bloque, y nada llama al servidor. Una prueba impide encenderlo mientras la migración no esté en `supabase/migrations`.
- **Para activarlo** (tras revisar): aplicar 0310 (moverla a `supabase/migrations`), comprobar `get_advisors`, crear el bucket (la migración lo hace), probar con las dos cuentas propietarias y una familia de prueba, poner `SUPPORT_ENABLED = true`, subir el número esperado de migraciones en los tests de candado y publicar.

## 5. Preparado para IA (Bloque D) — NO activada

`src/support/responder.ts` define solo contratos (`KnowledgeSource`, `SupportResponder`, `AGENT_LIMITS_REQUIRED`). El modelo ya distingue autor `user | admin | ai | system`, `responder` y `meta` abiertos, y un único hilo por incidencia. Ninguna función del servidor crea mensajes `ai`, no hay Edge Function de soporte ni endpoint público de IA, y `getSupportResponder()` devuelve `null`. Límites exigidos antes de activar un agente: respuestas por incidencia y día, solo texto, traspaso a persona, rastro y fuentes citadas, sin datos de otras familias.

## 6. Pruebas

`tsc`, ESLint, Vitest (`TZ=UTC`, usar `--pool=threads` si se agota la memoria), build y `supabase/local-sql-tests` (`npm test` dentro de esa carpeta). Pruebas nuevas: `src/help/master/masterCatalog.test.ts`, `src/help/ui/helpAreas.test.tsx`, `src/support/support.test.tsx`, ampliación de `helpNudges.test.tsx` y de `tourDefs.test.ts`, y las de cada grupo.

## 7. Qué hay que comprobar a mano en un iPhone real

Teclado y recorridos con formularios largos (evento, tarea, producto, miembro, receta, documento), recorridos con modales (campana, ubicación, lugares), visitas con la barra inferior y el menú ☰, área de Ayuda en el panel con el teclado abierto, pestañas de áreas con scroll horizontal, y —cuando se encienda— adjuntar fotos en Soporte.
