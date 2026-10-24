# AUDITORÍA DE TUTORIALES — MÓDULO CALENDARIO (solo lectura)

Repositorio leído: `C:\Users\Usuario\Documents\proyectos claude\family-app-prefs` (master del 25/10/2026, último commit `d3641f5`).
Método: lectura de código (Read/Grep) y `git log/show`. No se ha ejecutado nada, ni tests, ni app, ni Supabase.
Todo lo que dependa de cómo se ve o se comporta en un iPhone real está marcado como **«no comprobado»**: lo que sí puedo dar es la causa en el código.

Abreviaturas de archivos:
- `CS` = `src/ui/CalendarScreen.tsx` (4743 líneas; cito líneas de esta versión)
- `TR` = `src/help/tours/TourRunner.tsx`
- `ENG` = `src/help/tours/engine.ts`
- `G1` = `src/help/tours/defs/g1/calendarTutorials.ts`
- `G8` = `src/help/tours/defs/g8/calendario.ts`
- `VIS` = `src/help/tours/defs/g1/visitaCalendario.ts`
- `PIL-E` = `src/help/tours/defs/calCrearEvento.ts`
- `PIL-T` = `src/help/tours/defs/calCrearTarea.ts`
- `EXP` = `src/help/explainers/g1/calendario.ts`
- `CARDS` = `src/help/catalog/cardsDiaADia.ts`
- `DC` = `src/data/calendar.ts`

---------------------------------------------------------------------------------------------

## 0. RESUMEN EJECUTIVO

1. **Incidencia 1 (tarjeta tapa los controles de fecha)**: el paso `dia` de «Marcar como hecho» resalta TODO el panel del día (`calendar.day-panel`), pero el texto manda usar «‹ y ›» y «otro día del mes», que están FUERA del marco. El motor coloca la tarjeta evitando solo el control resaltado, nunca los que el texto pide tocar. Además hay dos pares de «‹ ›» en pantalla y los de arriba (mes) NO cambian el día. Causa comprobada en código; el efecto concreto en iPhone no está comprobado. Prioridad ALTA.
2. **Incidencia 2 (siguiente paso)**: el control es `calendar.entry-complete` (el `<button>` del círculo, `CS:2726`). Existe en TODAS las vistas con tarjetas de apuntes, pero SOLO en apuntes pendientes de propia cuenta y solo si el día elegido tiene alguno. Si no hay ninguno, el paso falla a los 3,5 s con el mensaje genérico «No encuentro este control… otra versión». Hay además dos fallos latentes: (a) tocar el círculo antes de tiempo deja el tutorial atascado o roto, (b) el marco puede quedar recortado por `overflow:hidden` (CSS). Prioridad ALTA.
3. **Incidencia 3 (tarea que se repite)**: confirmado. `repeatSteps('task')` salta de «cerrar» a «guardar» y no explica ni siquiera que la tarea no lleva hora. Visibles y no explicados: Privado, Aviso a toda la familia (condicional), ¿Para quién?, Categoría, Puntos (condicional), Ubicación/Adjunto/Nota. Lo mismo ocurre con la versión de evento (falta hora, todo el día, recordatorio, etc.). Prioridad MEDIA.
4. **Discrepancias de texto vs. código detectadas (resumen)**:
   - «✏️ Editar» en el menú ☰ ya NO existe (retirado el 24/10/2026, commit `cd003bb`), pero `G1:43` lo sigue explicando. ALTA.
   - 📤 «manda título, fecha y nota»: el código manda título + fecha + **`description`**, y la pantalla nunca rellena `description` (la «Nota» se guarda en `note`). Es decir, la nota NO se comparte. ALTA (texto en `G8`, `CARDS`, `EXP`).
   - «Si no marcas a nadie, el evento es para Toda la familia» (`G8` para-quien, ficha): si el título contiene el nombre de un miembro, el código lo asigna solo (`findMemberInText`, `CS:4338`). MEDIA.
   - «Hora… es opcional» (`PIL-E`): si no pones hora y no marcas «Todo el día», el evento se guarda a las 00:00 y así se muestra. MEDIA.
   - «cambia de día con ‹ y ›» (`G1` marcar-hecho): los ‹ › del mes cambian de mes, no de día. ALTA (parte de la incidencia 1).
   - Orden de pasos «¿Para quién?» → Puntos → Categoría en los pilotos NO coincide con el orden de la pantalla (Para quién → Categoría → Puntos). BAJA.
5. **Hallazgo colateral (no es un tutorial)**: `EditEventForm` no envía `syncToGoogle` y `updateEvent` pone `sync_to_google = true` por defecto (`DC:307`); las tareas se crean con `false`. Es decir, al EDITAR una tarea pasa a poder sincronizarse con Google. Leído en código; no comprobado en producción. Ver §3.8.
6. **Estructura propuesta por la usuaria**: razonable, con tres ajustes: (a) el Tutorial 1 «Conoce tu calendario» duplica la visita «Conoce el Calendario» (nivel A), así que propongo que el T1 sea una versión interactiva de «moverse» y que la visita siga siendo el nivel A; (b) la intro de T2 debe decir que la tarea tampoco lleva recordatorio ni «Todo el día» (no solo «sin hora»); (c) los tests actuales limitan cada tutorial a 120 s y 300 caracteres por paso; unos «capítulos» de 8 min no caben en un solo `TourDef` sin cambiar el motor/tests (ver §6.4).

---------------------------------------------------------------------------------------------

## 1. INVENTARIO (16 entradas con module 'calendario')

Datos del volcado `tours_dump.json` y de las definiciones. Todos con `access: null` (sin restricción de rol/plataforma más allá de tener la sección Calendario).
Total 102 pasos (la visita tiene 8).

| id | tipo | título | pasos | dur. (s) | startPath / startDest | ficha (cardId) | ¿Es la ficha su `tour:` principal? | Funcionalidad que cubre |
|---|---|---|---|---|---|---|---|---|
| `cal-crear-evento` (PIL-E, v3) | tutorial | Crear un evento en el calendario | 13 | 100 | /calendario / — | cal-crear-evento | sí | Abrir «+ Nuevo evento», título, fecha, hora, todo el día, privado, repetición, recordatorio, ¿para quién?, puntos, categoría, extras, guardar |
| `cal-crear-tarea` (PIL-T, v1) | tutorial | Crear una tarea | 10 | 90 | /calendario / — | cal-crear-tarea | sí | Abrir «+ Nueva tarea», título, fecha, privado, repetición, ¿para quién?, puntos, categoría, extras, guardar |
| `visita-calendario` (VIS) | visita | Conoce el Calendario | 8 | 110 | /calendario / — | cal-vistas | (visita) | Menú ☰, filtro, navegación de mes, panel del día, círculo, editar/eliminar, «+ Nuevo evento», «+ Nueva tarea» (todo informativo) |
| `tut-calendario-cambiar-vista` | tutorial | Cambiar de vista en el calendario | 3 | 60 | /calendario / — | cal-vistas | no (cuelga) | Abrir ☰, elegir vista, resultado |
| `tut-calendario-filtrar-persona` | tutorial | Filtrar el calendario por persona | 4 | 70 | /calendario / — | cal-vistas | no | «Filtrar por», elegir personas, cerrar, quitar |
| `tut-calendario-marcar-hecho` | tutorial | Marcar un evento o una tarea como hecho | 3 | 70 | /calendario / — | cal-hecho | no (la ficha no tiene `tour:`) | Panel del día, círculo, marcar (sensible) |
| `tut-calendario-editar-evento` | tutorial | Editar un evento o una tarea | 9 | 115 | /calendario / — | **cal-repeticion** (ficha de otro tema) | no | Abrir apunte, título, fecha, hora, repetición, recordatorio, ¿para quién?, alcance de serie, guardar |
| `tut-calendario-evento-repetitivo` | tutorial | Crear un evento que se repite | 8 | 110 | /calendario / calendario.nuevo-evento | cal-repeticion | no | Título, fecha, ventana Repetición (presets, hasta, festivos), guardar |
| `tut-calendario-tarea-repetitiva` | tutorial | Crear una tarea que se repite | 8 | 110 | /calendario / calendario.nueva-tarea | cal-repeticion | no | Igual, para tarea (misma función `repeatSteps`) |
| `tut-calendario-evento-recordatorio` | tutorial | Crear un evento con recordatorio | 8 | 110 | /calendario / calendario.nuevo-evento | cal-recordatorio | no | Título, fecha, hora, ventana Recordatorio (ancla, presets), guardar |
| `tut-calendario-puntos` | tutorial | Crear una tarea que da puntos | 7 | 110 | /calendario / calendario.nueva-tarea | cal-puntos | no | Título, fecha, ¿para quién?, lista, puntos, guardar |
| `tut-calendario-nota-personal` | tutorial | Añadir una nota personal | 5 | 80 | /calendario / — | **cal-privado** (ficha de «evento privado») | no | ☰ → Personal, escribir nota, «+ Añadir» (sensible) |
| `tut-calendario-google` (G8) | tutorial | Conectar Google Calendar o un calendario por enlace | 5 | 100 | /calendario (+ /menu-organizar) / — | cal-google | sí | ☰ → «Gestionar calendarios» → Configuración: Google, exportar, enlazar |
| `tut-calendario-para-quien` (G8) | tutorial | Elegir para quién es un evento | 4 | 80 | /calendario / calendario.nuevo-evento | cal-para-quien | sí | ¿Para quién?, lista, cerrar, campo de puntos (sin guardar) |
| `tut-calendario-compartir` (G8) | tutorial | Compartir un evento con alguien | 3 | 60 | /calendario / — | cal-compartir | sí | Icono 📤 (solo señala; no pulsa) |
| `tut-calendario-saltar-fecha` (G8) | tutorial | Ir directamente a una fecha | 4 | 70 | /calendario / — | cal-saltar-fecha | sí | ☰ → Personal/Familiar → tocar la fecha → selector |

**Explicaciones «Cómo funciona PEPA» (nivel C) ya existentes** (EXP, verificadas 23/10/2026): `exp-calendario-repeticiones`, `-puntos`, `-recordatorios`, `-quien-recibe-avisos`, `-privado-familiar`. Cada una enlaza a un tutorial (`tour:`): repeticiones → `tut-calendario-editar-evento`; puntos → `tut-calendario-puntos`; recordatorios → `tut-calendario-evento-recordatorio`; las otras dos no enlazan.

**Fichas** (CARDS, módulo calendario, 12): `cal-crear-evento`, `cal-crear-tarea`, `cal-repeticion` (sin pasos ni `tour:`), `cal-recordatorio` (idem), `cal-hecho` (idem), `cal-vistas`, `cal-privado`, `cal-google` (estado `parcial`), `cal-puntos`, `cal-para-quien`, `cal-compartir`, `cal-saltar-fecha` (estado `parcial`).
En la ficha solo sale un botón «Enséñame» principal (`card.tour`) y hasta 3 más con `t.cardId === card.id` (`HelpAnswer.tsx:65`). `cal-repeticion` hospeda 3 tutoriales (cabe en el límite de 3); `cal-vistas` hospeda 2 + la visita.

**Dependencias por ID fuera de las definiciones** (si se reestructura hay que tocarlas): `CARDS` (`tour:`), `EXP` (`tour:`, `cardIds`), `bienvenida.ts:61` (`next: ['cal-crear-evento',…]`), `CS:4393` (`HelpHint cardId="cal-crear-evento"`, hoy oculto porque el modal pasa `hideHeading`), `__harness__/main.tsx:19`, y los tests (`tourDefs.test.ts`, `calendarG1.test.tsx`, `calendarTutorialsUx.test.tsx`, `tourPilotsReal.test.tsx`, `helpUi.test.tsx`, `masterCatalog.test.ts`, etc.). `next:` de los tutoriales usa IDs de FICHA, no de tutorial.

---------------------------------------------------------------------------------------------

## 2. MAPA FUNCIONAL REAL DE CALENDARIO

Leyenda: **E** = existe y funciona (según código) · **P** = parcial/limitado · **N** = no existe.

### 2.1 Zonas de la pantalla y navegación

| Elemento | Estado | Referencia | Notas reales |
|---|---|---|---|
| Cabecera con imagen y botón «☰ Menú» | E | `CS:911-921` (mark `calendar.menu`) | |
| Migas «Calendario / <vista>» | E | `CS:922` | «Calendario» vuelve a «Inicio» (`useSectionHome`, `CS:288`) |
| Menú ☰ con 8 vistas: Inicio, Mes, Semana, 3 días, Día, Familiar, Agenda, Personal | E | `CS:126`, `CS:4667-4743`, `calendarioMenu.ts:47` | Orden fijo por defecto |
| «📌 Sacar / 📍 Quitar» (vista como botón suelto sobre el filtro) | E | `CS:4716-4725`, chips `CS:942-967` | Se guarda con `prefSet` |
| «Editar» (reordenar vistas) y «Nuevo acceso» personalizado | **N (retirado 24/10/2026)** | comentario `CS:4689-4690`; commit `cd003bb` | `saveCalendarioMenuLayout` ya no lo llama ninguna pantalla (grep). Se respetan los órdenes ya guardados |
| «⭐ Al abrir» (insignia de la primera vista) | P | `CS:4659-4665`, `4713` | Sigue saliendo, pero ya no hay forma de cambiar cuál es la primera vista. Hoy todos abren «Inicio» salvo preferencias antiguas guardadas |
| «⚙️ Gestionar calendarios» | E | `CS:4737-4740` | Lleva a Configuración → Calendario (`state:{group:'calendario'}`) |
| Filtro «Filtrar por: …» (multi-selección; «Todos») | E | `MemberFilterDropdown` `CS:3190-3275` | No sale en la vista Personal (`CS:974`). El modal NO se cierra al tocar «Todos»; se cierra con ✕ o tocando fuera. Filtra eventos propios (por `memberIds`) y calendarios enlazados (por miembro del feed). **No** filtra cumpleaños. Un apunte «Toda la familia» desaparece con filtro puesto (`CS:454-460`). El filtro vive en el estado de la pantalla (se pierde al salir) y además se publica para Pepa (`CS:252-255`) |
| Navegación de **mes** ‹ › y «Hoy» | E (solo Inicio y Mes) | `CS:985-998`, `1072-1085`; `goToMonth` `CS:587` | **Cambia el mes visible, NO el día elegido** (`goToMonth` no toca `selectedDate`). «Hoy» (`goToToday` `CS:643`) sí cambia día y mes. No existe botón «Hoy» en las demás vistas |
| Deslizar en la cuadrícula del mes | E | `monthSwipe` `CS:606`, aplicado en `CS:1000`, `1090` | Cambia de mes (≥50 px, más horizontal que vertical) |
| Cuadrícula Mes (franjas de color) / Inicio (puntitos) | E | `CS:1006-1044` / `1096-1131` | Tocar un día lo elige (`setSelectedDate`) |
| **Panel del día** (`DayModal`): ‹ › de DÍA, fecha pulsable, lista | E (Inicio, Mes, 3 días, Día [solo apuntes «todo el día» y tareas]) | `CS:1643-1715`; flechas `1684`, `1696` | Mark `calendar.day-panel`. Deslizar cambia ±1 día (`daySwipe`); en «3 días» el deslizado sobre la cuadrícula es ±3 días; en «Semana» ±7 |
| Ir a una fecha (selector nativo) | P | `DateJumpControl` `CS:1608-1636` | Disponible en DayModal, Familiar y Personal. **No** en Semana ni Agenda (confirmado, coincide con el tutorial) |
| Semana: lista de 7 días plegables, flechas de semana | E | `WeekListView` `CS:2470-2572` | Se abre por defecto el día elegido (o hoy). Resumen «N citas» y puntitos de color |
| 3 días / Día: cuadrícula por horas, fila «Tareas», franja «todo el día» | E | `TimeGridView` `CS:2150-2461` | En «Día» tocar un bloque o una tarea abre la edición; en «3 días» solo selecciona el día. Las franjas «todo el día» son informativas (no se pueden tocar) |
| Familiar: una columna por miembro (+ «Toda la familia») | E | `FamilyDayView` `CS:1797-1959` | Tarjetas `EventCard` con ✏️ 📤 ✕ y botón «+ Añadir» por columna (**solo crea eventos**, `onQuickAdd`→`setAddingEvent`). Muestra el texto de la nota y el enlace «Ver mapa», que las filas de otras vistas no muestran |
| Agenda: lista continua de 30 días desde hoy (+ hoy siempre) | E | `AgendaListView` `CS:2601-2667` | Sin navegación de fechas |
| Personal: mis apuntes (asignados a mí o privados) + notas privadas | E | `PersonalView` `CS:1969-2102` | Si la cuenta no tiene ficha enlazada, NO muestra eventos/tareas (ni privados) y avisa; las notas siguen |
| Enlace profundo desde un aviso (`?evento=…&fecha=…`) | E | `CS:359-425` | Resalta el apunte 6 s. Sin tutorial |
| Cumpleaños 🎂 de familia y contactos | E (solo lectura) | `CS:571-585` | Sin círculo ni edición |
| Citas de calendarios enlazados 🔗 | P | `CS:843-867` | Se pueden marcar como hechas y «eliminar» (solo ocultan en PEPA); no se editan; sin 📤; sin marca de ayuda en su círculo (`helpMark={!entry.isExternal}`) |

### 2.2 Anatomía de un apunte (fila `AgendaRow`, `CS:2748-2915`)
Franja de color con **círculo** (24 px) · título con 🔒 (privado), emoji de categoría, 📷 📎 📝 (hay foto / archivo / nota) · segunda línea: «📍 lugar» si hay ubicación, si no «personas · ⭐ puntos» (solo con 1 persona y puntos>0) o la repetición/«Toda la familia» · a la derecha «hora», «Todo el día», «Tarea» o «No realizada» (`entryTimeLabel`, `domain/calendar.ts:470`) · miniatura de foto (abre visor) · 📤 · deslizar a la izquierda → «🗑 Eliminar».
- Eventos y tareas salen en bloques separados con cabecera «Eventos» / «Tareas» (`DayEntriesBody` `CS:1770-1788`); el orden lo decide una preferencia personal (Configuración).
- Una tarea pasada y sin hacer pone «No realizada» (`isTaskOccurrenceMissed`).
- El texto de la nota y los detalles de ubicación NO se leen en la fila (solo el icono); se ven al editar o en la vista Familiar.

### 2.3 Acciones sobre un apunte
| Acción | Estado | Dónde / cómo | Notas |
|---|---|---|---|
| Marcar hecho / pendiente | E | `CompletionCircle` `CS:2707`; `handleCompleteEvent` `CS:672`, `handleUncompleteEvent` `CS:688` | Por ocurrencia (día). Puntos: si hay 1 persona asignada y puntos>0 se guardan en `calendar_event_completions` (`DC:442`). Desmarcar borra la fila |
| Editar | E | tocar la fila / ✏️ (Familiar) / bloque o tarea en vista Día | `EditEventForm` `CS:3919` |
| Editar serie: «Toda la serie / Solo esta repetición / Esta y las siguientes» | E | `CS:4172-4188`; `DC:365`, `DC:386` | Solo si el apunte ya se repite. «Solo esta» y «Esta y siguientes» crean fichas nuevas |
| Compartir 📤 | P | `handleShareEvent` `CS:702` | Menú nativo de compartir → portapapeles (aviso «Copiado al portapapeles.») → ventana con copiar/WhatsApp/correo. **Texto compartido = título + fecha/hora + `description`** (ver §3.1). Disponible también en TAREAS y en eventos privados. No en externos ni cumpleaños. No en los bloques de la cuadrícula 3 días/Día |
| Borrar | E | Deslizar la fila a la izquierda → «🗑 Eliminar» (`AgendaRow` `CS:2825-2830`, `handleDeleteTap` `CS:2789`); en Familiar ✕ con «¿Seguro?» (`CS:3136-3178`) | Si se repite pregunta «Solo este día» / «Toda la serie» / «Cancelar» (en Familiar «Solo un día» pide fecha). Si no se repite, el botón «Eliminar» borra directamente (no hay segunda confirmación). Sin papelera ni deshacer. En citas externas solo las oculta |
| Foto: ver grande | E | `PhotoLightbox` `CS:2957` | |
| Convertir evento ↔ tarea | **N** | `EditEventForm` mantiene `kind: event.kind` (`CS:4048`) | |

### 2.4 Quién puede qué (permisos)
- Cualquiera con acceso a la sección Calendario puede crear, editar, marcar y borrar apuntes COMPARTIDOS (RLS `calendar_events` 0075/0089: `has_section_access('calendario')`); los PRIVADOS solo su creador (`visibility='shared' or created_by=auth.uid()`). No hay restricción por rol (niño/adulto) dentro de la sección. (Leído en migraciones 0075 y 0089; no hay políticas posteriores sobre `calendar_events` — grep.)
- Acceso a la sección: lo decide `allowedSections` del perfil; la Ayuda lo respeta (`help/access.ts`). Los tutoriales de Calendario no tienen `access`, así que se ofrecen a cualquiera con la sección.
- Configuración → Calendario (colores, categorías, Google, enlaces): sin restricción de administrador visible en el código leído (`MenuSettingsScreen.tsx:1817-1828`). No comprobé reglas de servidor para Google.

### 2.5 Formularios: campos y diferencias reales evento ↔ tarea (pedido concreto de la usuaria)

Fuentes: `AddEventForm` `CS:4238-4490`, `AddTaskForm` `CS:4504-4655`, `EditEventForm` `CS:3919-4200` (UN solo formulario de edición para ambos; `isTask = event.kind === 'task'`).

| Campo / control | Evento (alta) | Tarea (alta) | Edición (evento / tarea) | Condiciones y detalles |
|---|---|---|---|---|
| Título | sí, con sugerencias (`datalist`) y **autorrelleno** al coincidir con un título anterior: copia hora, duración, todo-el-día, repetición, recordatorios y, si no has tocado «¿Para quién?», personas y puntos (`handleTitleChange` `CS:4297-4320`) | sí, sin sugerencias ni autorrelleno | sí / sí | El autorrelleno NO está en ningún tutorial |
| Fecha | `DateField` obligatorio (`defaultDate` = día elegido) | igual | `<input type=date>` | |
| Hora «Empieza» / «Termina (opcional)» | sí (oculto si «Todo el día») | **no** | evento sí / tarea no (`!isTask`) | Sin hora y sin «Todo el día» → se guarda a las **00:00** (`CS:4332`: `time \|\| '00:00'`) y se muestra «00:00» |
| «Todo el día» | sí | **no** (se guarda `allDay:true` fijo, a 00:00; se muestra «Tarea») | evento sí / tarea no | |
| «🔒 Privado — Solo yo puedo verlo» | sí (por defecto marcado si se crea desde Personal) | sí (idem) | sí / sí | RLS en servidor (0089) |
| «🔔 Aviso a toda la familia» | condicional | condicional | condicional | Solo si el ajuste familiar es «Solo los miembros asignados» **y** no es privado (`NotifyFamilyCheckbox`); desmarcado por defecto |
| Repetición (ventana con presets, Personalizado, «Repetir hasta», «Excluir festivos») | sí | sí, con una regla extra: en «Personalizado» semanal hay que marcar ≥1 día y el botón «Crear tarea» se desactiva (`requireWeeklyDays`, `CS:4621`, `4650`) | sí / sí (misma regla para tarea) | Los presets reales son: **Ninguno**, Todos los días, Todos los días laborables, Todas las semanas, Cada 2 semanas, Todos los meses, Todos los años, Personalizado… (`RECURRENCE_PRESETS` `domain/recurrence.ts:96`). «Repetir hasta» y «Excluir festivos» solo salen con una repetición elegida |
| Recordatorio (ventana: presets 10 min, 30 min, 1 h, 1 día, 1 sem., 1 mes, 1 año; «Personalizado…» con Cantidad/Unidad + «+ Añadir recordatorio»; ancla «Antes de empezar/terminar» solo si hay hora de fin) | sí | **no** (`reminders: []`) | evento sí / tarea no | |
| ¿Para quién? | sí; por defecto **tu ficha** (o la persona de la columna Familiar desde la que pulsaste «+ Añadir»); si tu cuenta no tiene ficha, nadie preseleccionado y un aviso (`CS:4459`) | sí; por defecto tu ficha (`defaultMemberId`) | sí / sí | Si no marcas a nadie y el título contiene el nombre de un miembro, se asigna solo (`findMemberInText`, `CS:4338`, `4551`, `4016`) |
| Categoría (+ ⚙️ para gestionarlas sin salir del formulario) | sí | sí | sí / sí | El selector solo sale si ya existe alguna categoría; el ⚙️ y la etiqueta salen siempre |
| Puntos | solo con **exactamente 1** persona; etiqueta «Puntos al marcarlo "Hecho" (opcional)» | idem; etiqueta «…marcarla "Hecha"…» | idem | Con 0 o ≥2 personas los puntos se guardan a 0 (`CS:4355`) |
| Ubicación / Adjunto / Nota (3 chips; se abren al tocar) | sí | sí | sí / sí (en edición arrancan abiertos si ya había algo) | Ubicación: texto + «🔍 Buscar en el mapa» + «📍 Usar mi ubicación actual» + «Quitar coordenadas». Adjunto: un único archivo; imagen → foto (comprimida), otro → archivo. Nota: texto libre |
| «Alcance» al guardar («Guardar cambios en») | — | — | solo si el apunte ya se repite | 3 opciones |
| Sincronización con Google | `syncToGoogle` por defecto `true` (sin control en pantalla) | `false` fijo al crear | no se envía (ver §3.8) | |
| Cambiar de evento a tarea o al revés | — | — | **no existe** | |
| Aviso de asignación «Te han asignado una tarea» y resumen diario de tareas | — | (según `EXP`: solo tareas) | — | Lo dice la explicación existente, que cita migraciones; **no lo he re-verificado en este pase** |

**Qué diferencias merecen explicarse dentro del capítulo (propuesta)**
1. En la intro de T2 (una sola vez): tarea = evento **sin hora, sin «Todo el día» y sin recordatorio** (y sin autorrelleno por título). El resto de campos es igual.
2. Capítulo Repeticiones: en tarea, «Personalizado» semanal exige un día.
3. Capítulo Puntos: la etiqueta cambia a «Hecha»; solo con una persona.
4. Capítulo Recordatorios: aclarar que solo existen en eventos y que las tareas tienen resumen diario (remitir a «Cómo funciona»).
5. Capítulo Personas: asignación automática por nombre en el título; «Aviso a toda la familia» condicional.
No necesitan explicarse en el tutorial (mejor en «Cómo funciona»): sincronización con Google, 00:00 como consecuencia técnica (sí merece una frase en el capítulo 1), `kind` no convertible.

---------------------------------------------------------------------------------------------

## 3. DISCREPANCIAS, OMISIONES Y SOLAPES

### 3.1 Discrepancias texto ↔ código (ordenadas por prioridad)

| # | Dónde | Texto | Código real | Prio |
|---|---|---|---|---|
| D1 | `G1:43` («Otras cosas del menú», paso `elegir` de cambiar-vista) | «✏️ Editar deja reordenar las vistas. La primera… «⭐ Al abrir»» | El modo «Editar» fue retirado el 24/10/2026 (`cd003bb`; comentario `CS:4689`); ninguna pantalla reordena. El commit dice «recorrido… al día» pero no tocó `G1`. `legacyHelp.ts:68` repite lo mismo | ALTA |
| D2 | `G8:138` (tutorial compartir), `CARDS:170` (`quick` de cal-compartir), `EXP:303` (límites de privado-familiar) | «manda su título, fecha y nota» | `handleShareEvent` (`CS:707`): `[ev.title, when, ev.description?.trim()]`. `description` no la rellena ningún formulario (`createEvent`/`updateEvent` no la escriben; `DC:218-241`); la «Nota» va a `note`. La nota NO se comparte (salvo posibles eventos importados con `description`, no comprobado) | ALTA (afecta a lo que se promete al usuario; decisión de producto en §7) |
| D3 | `G1` marcar-hecho paso `dia` (`G1:122`) | «cambia de día con ‹ y › o toca otro día del mes» | En Inicio/Mes hay DOS pares de ‹ ›: los de `month-nav` (mes, `CS:985-998`) NO cambian el día elegido (`goToMonth` `CS:587`); los que cambian de día están en la cabecera del panel (`CS:1684`, `1696`) y no tienen marca de ayuda. Ver incidencia 1 | ALTA |
| D4 | `G8:87`, `G8:119`, `CARDS:154` («Si no marcas a nadie, … Toda la familia») | «Si no marcas a nadie, el evento es para «Toda la familia»» | Al guardar, si no hay nadie marcado y el título contiene el nombre de un miembro como palabra completa, se asigna a ese miembro (`CS:4338`; también tareas `CS:4551` y edición `CS:4016`). Los títulos de ejemplo de los propios tutoriales («Dentista de Eric») activan este caso si Eric es miembro | MEDIA |
| D5 | `PIL-E:45` hora («Es opcional») y todos los tutoriales con «hora» | «pon aquí la hora… Es opcional» | Dejar la hora vacía sin «Todo el día» = **00:00** (`CS:4332`). El evento sale como «00:00» y los recordatorios cuentan desde esa hora | MEDIA |
| D6 | `PIL-E` (todo el flujo) | Orden: ¿Para quién? → Puntos → Categoría → Extras (el comentario del archivo dice «Orden = orden de la pantalla») | Pantalla: ¿Para quién? → (aviso) → **Categoría → Puntos** → Extras (`CS:4458-4471`; tarea `CS:4623-4635`) | BAJA |
| D7 | `G1:278-291` opciones de repetición; `PIL-E:72` | Lista de presets y «puedes dejarlo en «No se repite»» | El primer botón real de la ventana es **«Ninguno»**; «No se repite» solo aparece en el resumen del desplegable y en el desplegable «Frecuencia» de Personalizado | BAJA |
| D8 | `PIL-E:107` categoría | «agrupa el evento con un color… el engranaje ⚙️ sirve para gestionarlas» | Con 0 categorías el selector no se pinta (solo etiqueta y ⚙️) (`CS:3440`). El color solo se aplica en los modos de color «categorías» y «solo categorías», no en «personas» (preferencia personal) | BAJA |
| D9 | `G1` recordatorio paso `opciones` (`G1:419`) | ««Personalizado…» deja poner otra cantidad» | Correcto, pero falta el botón **«+ Añadir recordatorio»** que hay que pulsar después (`CS:3604`); sin él no se añade nada | MEDIA |
| D10 | `G1` evento-recordatorio paso `ancla` | «Como el evento tiene hora de fin…» | Correcto, pero solo se ve si el usuario ha puesto «Termina»; el paso `hora` no le dice que ponga una hora de fin para verlo | BAJA |
| D11 | `G8` para-quien `finishText`: «No he guardado nada; cierra el formulario» | — | Correcto, pero deja al usuario con el formulario abierto y datos sin guardar; no hay paso para cerrar sin guardar (los chips ✕ del modal sí existen) | BAJA |
| D12 | `G1` nota-personal `cardId: 'cal-privado'` | Tutorial de **notas** colgado de la ficha «Crear un evento privado que solo yo vea» | La nota personal y el evento privado son cosas distintas. No existe tutorial para «crear un evento/tarea privado» ni para «lo que creo en Personal sale privado por defecto» | MEDIA |
| D13 | `VIS` paso `dia` | «toca otro día del mes… toca la fecha para saltar» | En «3 días»/«Día» el panel del día existe pero no hay mes; en esas vistas solo vale lo de la fecha. Es opcional, así que no rompe nada | BAJA |
| D14 | `EXP:` privado-familiar y `G1` editar-evento `cardId: 'cal-repeticion'` | — | `editar-evento` cuelga de la ficha de repeticiones por falta de ficha propia (lo dice el comentario de `G1:156`); un usuario que busque «editar» no encuentra la ficha adecuada | BAJA |

### 3.2 Pasos y controles visibles que los tutoriales NO explican (omisiones)

Por tutorial, comparando la pantalla del paso con los pasos:

- **`cal-crear-evento`** (pantalla: formulario de evento): no explica «Termina» más allá de una mención, la advertencia de 00:00, el autorrelleno por título, «🔔 Aviso a toda la familia» (condicional), el aviso «No he podido identificar tu ficha…» (`CS:4459`), cada uno de los tres iconos de extras (Ubicación con mapa/GPS, Adjunto foto o archivo, Nota), qué es el 📷 📎 📝 que luego aparece en la fila. No comprueba el resultado tras «Crear evento» (el modal se cierra y el evento solo se ve si la fecha es el día elegido).
- **`cal-crear-tarea`**: no dice que NO hay hora, «Todo el día» ni recordatorio (solo el comentario del archivo y la ficha); no menciona «Aviso a toda la familia»; los extras en una frase.
- **`tut-calendario-evento-repetitivo`**: no explica hora ni «Todo el día» (en un evento semanal «martes 17:00» la hora es lo esencial), recordatorio (los recordatorios se repiten en cada ocurrencia, `EXP`), personas, categoría, puntos, extras ni privado. El paso `opciones` no nombra «Ninguno».
- **`tut-calendario-tarea-repetitiva`** (incidencia 3): lo mismo; del formulario de tarea los campos visibles sin explicar son Privado, Aviso a toda la familia, ¿Para quién? (con el valor por defecto «tú»), Categoría, Puntos, Ubicación, Adjunto, Nota. Tampoco dice que cada día repetido tiene su propio círculo hasta el `finishText`.
- **`tut-calendario-evento-recordatorio`**: no explica «Todo el día» (qué pasa con los recordatorios), privado, personas, repetición + recordatorio, ni «+ Añadir recordatorio» (D9). El `finishText` remite vagamente a «los ajustes de avisos de tu familia».
- **`tut-calendario-puntos`**: usa una tarea; no explica que el evento funciona igual salvo en la etiqueta «Hecho/Hecha» (solo lo dice el `finishText`); no dice dónde ver el saldo (sí lo dice el `finishText`: «Pequeños Grandes → Puntos y recompensas»). Si la cuenta no tiene ficha, el paso `puntos` desaparece sin explicación.
- **`tut-calendario-editar-evento`**: la pantalla de edición tiene Privado, «Aviso a toda la familia», «Todo el día», Categoría, Puntos, extras y «Cancelar»; el tutorial solo explica título, fecha, hora, repetición, recordatorio, ¿para quién? (con puntos) y alcance. Faltan marcas en el código para tres de ellos: `EditEventForm` no pasa `helpId` a `CategoryDropdown` ni a `EventExtrasFields`, y «Todo el día» no tiene marca (`CS:4110`, `4141`, `4154`). `calendar.edit-private`, `calendar.edit-points` y `calendar.edit-cancel` sí existen pero no los usa ningún paso. Tampoco avisa de que en la vista Día los eventos con hora se editan tocando el bloque (no el `entry-edit`).
- **`tut-calendario-marcar-hecho`**: ver incidencias 1 y 2; además no explica «Tarea»/«No realizada», tachado ni colores de completadas (Configuración).
- **`tut-calendario-cambiar-vista`**: D1; tampoco explica los «chips» sacados («📌 Sacar») salvo en el desplegable, ni qué cambia entre vistas (Semana plegable, Agenda de 30 días, Familiar por columnas).
- **`tut-calendario-filtrar-persona`**: no dice que los cumpleaños no se filtran; no dice que Pepa usa el mismo filtro al responder (`CS:247-255`).
- **`tut-calendario-nota-personal`**: no explica que cada nota se puede compartir 📤 y borrar (`ConfirmIconButton`) (`CS:2086-2095`), ni la diferencia con «Privado».
- **`tut-calendario-google`**: solo señala 3 tarjetas. No explica «¿De quién es?», «Es un calendario de festivos» (enlaza con «Excluir festivos» de la repetición), «Sincronizar ahora», «Quitar», que Google tarda hasta una hora (lo dice la tarjeta, `MenuSettingsScreen.tsx:1384-1385`) o que las categorías/colores/«Tareas completadas» viven en esa misma pantalla de Configuración.
- **`tut-calendario-compartir`**: D2; solo se menciona «evento» pero las tareas también tienen 📤; tampoco se dice que el menú de compartir cambia según dispositivo (sí lo dice el paso `resultado`).
- **`tut-calendario-saltar-fecha`**: correcto; el paso 1-2 se salta solos en las vistas que ya tienen la fecha pulsable (Inicio/Mes), lo que es bueno.
- **`visita-calendario`**: no menciona «Hoy», el deslizado entre días, «Sacar», el contenido de la fila (📷📎📝🔒), ni las vistas distintas. Las frases sobre «+ Nueva tarea» omiten categoría, privado, ubicación, adjuntos, nota.

### 3.3 Funciones importantes del Calendario SIN tutorial
1. Categorías del calendario (crear/editar, emojis, color, ⚙️ en el formulario): `MenuSettingsScreen.tsx:1215`.
2. Colores del calendario (3 modos), orden Eventos/Tareas, «Tareas completadas» (tachar, color, mover al final): `MenuSettingsScreen.tsx:762-939`.
3. Evento/tarea **privado** y el comportamiento de la vista Personal al crear (privado por defecto).
4. Borrar un apunte (solo describir) y borrar solo un día/toda la serie.
5. Ubicación (mapa, GPS), adjuntos (foto/archivo) y nota como funciones (solo un paso `extras`).
6. «Aviso a toda la familia» (casilla condicional) y el ajuste «¿A quién avisamos…?» (en `EXP`, sin tutorial).
7. Autorrelleno por título, asignación automática por nombre.
8. Crear desde la columna «+ Añadir» de Familiar.
9. Enlace profundo desde un aviso (llegar al apunte).
10. Vista Semana plegable y Agenda: ningún tutorial las recorre.
11. Marcar como hecho citas externas y «eliminar» (ocultar) citas externas.
12. «Hoy» y deslizar mes/día.

### 3.4 Solapes entre pilotos y nuevos (pregunta expresa)

Los pilotos (`cal-crear-evento`, `cal-crear-tarea`) recorren el formulario COMPLETO de principio a fin. Los nuevos son «inmersiones» en una opción (repetición, recordatorio, puntos, para quién) pensadas para empezar con el formulario ya abierto (`startDest`) y repiten el arranque y el cierre. Lo único realmente distinto de los nuevos es:
- `evento-repetitivo`/`tarea-repetitiva`: 5 pasos de la ventana Repetición (`abrir-repeticion`, `opciones`, `hasta`, `festivos`, `cerrar`) frente a UN paso del piloto (`repeticion`). **Los dos tutoriales son la misma función** `repeatSteps(kind)` (`G1:247-329`); solo cambian 3 textos (título, detalle de «Personalizado», botón guardar).
- `evento-recordatorio`: 4 pasos de la ventana Recordatorio (`abrir-recordatorio`, `ancla`, `opciones`, `cerrar`) frente a UNO del piloto.
- `puntos`: `lista` y `cerrar` (ventana ¿Para quién?) y `puntos` con escritura, frente a `quien`+`puntos` del piloto.
- `para-quien`: `quien` (clic), `lista`, `cerrar`, `puntos`; sin título/fecha/guardar.
- `editar-evento`: no solapa con los pilotos en pasos (es edición), pero repite textos de repetición/recordatorio/¿para quién?.

Conteo del solape (aproximado, por texto/función):
- Pasos de arranque/cierre idénticos o casi: `titulo` ×6 (4 redacciones), `fecha` ×6, `guardar` ×6 = **18 pasos** de 58 pasos de creación (pilotos 23 + repetición 16 + recordatorio 8 + puntos 7 + para-quien 4).
- «¿Para quién?»/«Puntos» explicados en 5 sitios (`PIL-E.quien`, `PIL-T.quien`, `puntos.para-quien`, `para-quien.quien`, `editar.para-quien`) y el campo de puntos en 4 (`PIL-E.puntos`, `PIL-T.puntos`, `puntos.puntos`, `para-quien.puntos`).
- Repetición explicada en 5 sitios; recordatorio en 3.
- Estimación: **~28 de 58 pasos (≈ 48 %)** son repetición de contenido ya dicho en otro tutorial.

**Qué pasos se reutilizan en cada capítulo propuesto de T2** (con IDs exactos):

| Cap. T2 | Se reutiliza tal cual | Se reescribe | Falta (nuevo) |
|---|---|---|---|
| 0 Intro | — | — | 1 paso informativo sin marco (los pasos sin `target` están permitidos: ya existe `compartir.resultado`) |
| 1 Crear un evento (nombre, fecha, hora) | `PIL-E`: `abrir`, `titulo`, `fecha`, `todo-el-dia` | `PIL-E.hora` (añadir 00:00 y «Termina»); `titulo` (mención opcional del autorrelleno) | — |
| 2 Personas y categorías | `PIL-E.quien` + `para-quien`: `quien`(clic), `lista`, `cerrar`; `PIL-E.privado`; `PIL-E.categoria` | `quien` (asignación por nombre en el título, valor por defecto «tú», aviso sin ficha); `categoria` (selector solo si hay categorías) | «🔔 Aviso a toda la familia» (condicional); `Privado` con su efecto en Personal |
| 3 Repeticiones | `evento-repetitivo`: `abrir-repeticion`, `opciones`(+`details`), `hasta`, `festivos`, `cerrar` | `opciones` (nombrar «Ninguno»); añadir nota de tarea (día obligatorio en semanal personalizado) | — (se eliminan `titulo`, `fecha`, `guardar` de ese tutorial) |
| 4 Recordatorios | `evento-recordatorio`: `hora`, `abrir-recordatorio`, `ancla`, `opciones`, `cerrar` | `opciones` (añadir «+ Añadir recordatorio»); `hora` (pedir fin para ver el ancla) | Aviso de que las tareas no tienen recordatorio |
| 5 Puntos y recompensas | `puntos.puntos` (campo), `PIL-E.puntos` | `PIL-E.quien`/`puntos.para-quien` (condición «una sola persona»; qué hacer si no sale el campo) | Paso informativo de dónde se ven (Pequeños Grandes → Puntos y recompensas) |
| 6 Ubicación, adjuntos y notas | `PIL-E.extras` (el icono-fila) | **Dividir en 3 pasos** (Ubicación: escribir / mapa / GPS; Adjunto: foto o archivo; Nota) | Marcas nuevas por chip (hoy solo hay una `calendar.event-extras` para la fila) |
| 7 Guardar y comprobar | `PIL-E.guardar` (sensible) | — | Paso de comprobación (ver §6.2) |

Nota: el capítulo 1 puede cerrar el formulario sin guardar si se hace como capítulo independiente; ver §6.4.

### 3.5 Dependencias de datos y de vista (los pasos que se rompen)

- **«Hace falta un apunte»**: `marcar-hecho` (`circulo`, `marcar`), `editar-evento` (`abrir`), `compartir` (`icono`, no opcional) y la visita (opcional, se omite) necesitan un apunte propio visible en el día/vista. Con calendario vacío, los tres primeros fallan con el mensaje genérico (ver incidencia 2) salvo `compartir` y `editar-evento`, que dicen «Si aún no tienes ninguno, crea uno antes» pero igualmente caen en «broken».
- **Vista**: la mayoría de tutoriales arrancan en la vista que tenga la persona (`startPath` sin `startDest`). Casos frágiles:
  - `editar-evento.abrir` (`calendar.entry-edit`): en la vista Día los eventos con hora NO tienen esa marca (se editan desde el bloque); en 3 días tampoco.
  - `compartir.icono`: no existe en los bloques de 3 días/Día; sí en `DayModal` de esas vistas solo para apuntes «todo el día»/tareas.
  - `marcar-hecho.dia`: solo existe en Inicio, Mes, 3 días y Día (opcional, se omite en las demás).
  - `visita.mes`: `calendar.month-nav` solo en Inicio y Mes (opcional).
- **Formularios**: los tutoriales con `startDest` abren el formulario mediante `useHelpDestinations` (`CS:229-239`) y esperan la marca `data-help-dest` del formulario. Si la persona cierra el formulario, los pasos no opcionales pasan a «broken».
- **Cuenta sin ficha** (`myMemberId` nulo): no hay persona por defecto, el campo de puntos no sale y la vista Personal no muestra eventos/tareas.
- **Familia con ajuste «Solo los miembros asignados»**: aparece «Aviso a toda la familia»; con otro ajuste no (`NotifyFamilyCheckbox`).
- **Categorías**: sin ninguna categoría el selector no se pinta.
- **Modo de color de la persona**: `categoria` dice «con un color», que depende de la preferencia personal.
- **Navegación entre pantallas**: solo `tut-calendario-google` cruza a `/menu-organizar` (declarado en `paths`). Al volver («← Volver al calendario») el tutorial ya ha terminado.
- **Plataforma / rol**: ninguno tiene `access`; no hay restricciones por plataforma en el código.

### 3.6 Ambigüedades menores de redacción
- `PIL-E.hora` y `PIL-E.todo-el-dia` están en el grupo «opciones-1» y se pueden saltar de golpe (`Saltar opciones`), lo que no garantiza que el usuario conozca la regla de las 00:00.
- Los pasos de «Privado» dicen «solo tú verás» sin mencionar que los demás no pueden ni editarlo ni recibir avisos de él (está en `EXP`).

### 3.7 Pruebas existentes
Hay pruebas (jsdom, datos simulados) de los tutoriales de Calendario (`calendarG1.test.tsx`, `calendarTutorialsUx.test.tsx`, `tourPilotsReal.test.tsx`). **No hay ninguna prueba del caso «el día no tiene nada pendiente»**, ni de «tocar el círculo antes de tiempo», ni de la geometría real de la tarjeta (jsdom no calcula posiciones: `setTargetVisibilityForTests(() => true)`).

### 3.8 Hallazgo colateral: editar una tarea cambia su sincronización con Google
- Al crear una tarea: `syncToGoogle: false` (`CS:4571`), por diseño (migración 0184: «una Tarea NUNCA sincroniza con Google Calendar por defecto»).
- `EditEventForm.handleSubmit` construye `payload` sin `syncToGoogle` (`CS:4027-4050`) y `updateEvent` hace `sync_to_google: input.syncToGoogle ?? true` (`DC:307`). Las otras rutas de edición que crean fichas nuevas (`updateEventOccurrenceOnly`, `updateEventFromOccurrenceForward` → `createEvent`) también caen en `?? true` (`DC:238`).
- El cron de Google (`sync-calendar-to-google-cron/index.ts:120,172`) solo salta los apuntes con `sync_to_google === false` y su `select` no mira `kind`.
- Consecuencia probable (leída, **no comprobada en producción**): una tarea editada desde Calendario pasaría a sincronizarse con Google como evento de día completo. Conviene revisarlo aparte de la ayuda.

---------------------------------------------------------------------------------------------

## 4. INCIDENCIAS REPORTADAS EN iPHONE (causa comprobada en código)

### Incidencia 1 — «Marcar un evento o una tarea como hecho»: la tarjeta puede impedir usar los controles de fecha

**Qué dice el tutorial**: paso 1 `dia` (`G1:121-127`): «Aquí están los apuntes del día elegido. Si hoy no hay nada pendiente, cambia de día con ‹ y › o toca otro día del mes.» Marca: `calendar.day-panel`. `optional: true`, `manualNext: true`.

**Causas comprobadas**
1. **El marco no está en lo que se pide tocar.** `calendar.day-panel` es el `<div className="day-panel">` completo (`CS:1673`): cabecera con ‹ fecha ›, lista de apuntes. Los controles que el texto manda usar son: (a) los ‹ › de la cabecera del panel (`CS:1684`, `1696`; sin `data-help-id`, solo `aria-label`), (b) las celdas de la cuadrícula del mes (`CS:1016`, sin marca). Ninguno está resaltado.
2. **La tarjeta se coloca solo respecto al marco** (`TR:397-404`, `choosePanelSide` en `viewport.ts:54`): calcula el solape entre el rectángulo resaltado y la tarjeta arriba/abajo y elige el lado con menos solape; si no solapa con el lado actual, se queda. No conoce los controles que el texto pide pulsar. Como el panel del día puede ser alto (varios apuntes), el marco ocupa buena parte de la pantalla y la tarjeta cae encima de parte del panel, de la cuadrícula del mes o de la cabecera. La tarjeta mide hasta el 46 % del área visible (`TR:602`, `tours.css:53-55`; 40 % en modo compacto) y se coloca a `bottom: calc(76px + safe-area)` o `top: 8px + safe-area` (`tours.css:57-63`). Nada de la capa intercepta toques salvo la propia tarjeta (`pointer-events: auto` solo en `.tour-panel`, `tours.css:47`), por tanto lo que queda DEBAJO de la tarjeta no se puede pulsar.
3. **Desplazamiento automático**: al entrar en el paso el motor hace `scrollIntoView({block:'center'})` sobre el panel (`TR:275-280`). Con un panel alto, la mitad superior de la pantalla puede quedar sin la cuadrícula del mes (donde el texto manda tocar «otro día del mes») y sin los ‹ › del mes.
4. **Ambigüedad de «‹ y ›»**: en Inicio/Mes hay dos pares (mes arriba, día en el panel). Los del mes NO cambian el día elegido (`goToMonth` `CS:587-591` no toca `selectedDate`); si el usuario pulsa esos, el panel sigue mostrando el mismo día vacío. Es la parte más probable de «el texto me pide cambiar de fecha pero no puedo».
5. **El paso se muestra siempre**, aunque haya apuntes pendientes (no usa `skipIf`), y no tiene forma de ocultar/mover la tarjeta (solo «⋯ Más» en modo compacto). El tutorial «Atrás/Siguiente» no deja minimizarla.
6. En iPhone la tarjeta es ancha (`left/right: 8px`), y el área visible puede estar reducida por la barra del navegador.

**Efecto en iPhone**: no comprobado (no hay medidas reales; las pruebas usan jsdom sin geometría).

**Prioridad**: ALTA (bloquea el tutorial, no hay salida clara salvo «Siguiente»).

**Corrección recomendada (sin implementarla)**
- Añadir marcas `data-help-id` a los ‹ › del panel del día (`calendar.day-prev`, `calendar.day-next`) y a la cuadrícula (`calendar.month-grid`).
- Reescribir el paso para que el MARCO esté sobre lo que se pide tocar: un paso `cambiar-dia` con `target: 'calendar.day-next'` (o `month-grid`), `completeOn` sobre un evento nuevo (p. ej. `emitHelpEvent('calendar.day-changed')` desde `changeSelectedDate`/`setSelectedDate`) o `manualNext`, de modo que `choosePanelSide` aparte la tarjeta de ese control.
- Hacer el paso **condicional**: `skipIf: [{type:'appear', target:'calendar.entry-complete'}]` (el motor ya soporta `appear` en `skipIf`, `TR:244-249`): si ya hay un círculo pendiente a la vista, no se pide cambiar de día.
- Texto sin ambigüedad: «Usa las flechas ‹ › DEL PANEL del día (no las del mes)».
- Valorar (cambio de motor) un botón «Mover/ocultar tarjeta» o que `choosePanelSide` evite también un `avoid` de marcas secundarias definido en el paso.
- Fusionar los pasos 1 y 2 (ver incidencia 2).

### Incidencia 2 — ¿El paso «marcar» resalta el control REAL? ¿en qué vistas aparece el círculo?

**Respuesta corta**: sí, es el círculo real, pero solo existe si hay un apunte pendiente propio en la vista/día mostrado.

**Datos comprobados**
- Marca: `data-help-id="calendar.entry-complete"` en el `<button class="completion-circle">` (`CompletionCircle`, `CS:2723-2735`, marca en `CS:2726`). Se pone **solo si** `helpMark && !done && onComplete`. En un apunte ya hecho el botón existe pero SIN marca; en citas externas se desactiva la marca (`helpMark={!entry.isExternal}`, `CS:2852`); los cumpleaños no tienen círculo.
- Es el mismo control para **eventos y tareas**; no distingue. El primero pendiente que encuentre `findTarget` en el DOM (primer elemento visible por orden de documento, `domTargets.ts:20-25`). En Agenda es el primero de los 30 días, que puede no ser hoy.
- Dónde aparece (vistas):
  | Vista | Aparece | Dónde |
  |---|---|---|
  | Inicio / Mes | sí, si el día elegido tiene un apunte pendiente | `AgendaRow` en `DayModal` |
  | Semana | sí, solo en los días **desplegados** (por defecto el elegido o hoy) | `DayEntriesBody` |
  | 3 días | sí | filas «Tareas» y bloques de la cuadrícula (`CS:2361`, `2442`) y `DayModal` |
  | Día | sí | tareas, bloques con hora, `DayModal` (solo «todo el día»/tareas) |
  | Familiar | sí | `EventCard` (`CS:3077`) |
  | Agenda | sí | `AgendaRow` |
  | Personal | sí, solo para MIS apuntes y privados | `AgendaRow` |
- **Existe/visible en la vista normal (Inicio, la vista predeterminada)**: sí, si hoy hay algo pendiente propio. Si no (muy frecuente, p. ej. sin eventos hoy o solo cumpleaños), no existe ningún elemento con esa marca.

**Qué pasa cuando no existe** (`TR:260-268`, `ENG:107-111`): el paso `marcar` y el `circulo` no son opcionales; a los 3,5 s (`MISSING_AFTER_MS`) el tutorial pasa a `broken` y enseña «No encuentro este control en tu pantalla (puede que sea otra versión, que tu cuenta no tenga acceso o que se haya cerrado una ventana)» con «Empezar de nuevo / Ver los pasos escritos / Salir» (`TR:476-494`). El mensaje genérico es engañoso: el fallo es «hoy no hay nada pendiente». Si el usuario navega luego a un día con apuntes, el motor se recupera solo (`target-found`, `TR:271`).

**Fallos latentes adicionales**
1. **Tocar antes de tiempo**: el paso 2 (`circulo`) dice «Todavía no lo toques» pero el círculo es real y está resaltado. Si se toca, el evento `calendar.event-completed` llega con `completeOn: []` y se ignora (`ENG:75-77`, `stepAdvancesOn`). El paso 3 (`marcar`, sensible, sin «Siguiente») no puede avanzar: o no hay otro círculo pendiente (→ «broken» a los 3,5 s) o hay otro y queda esperando un evento que ya pasó (tendría que marcar otro). `Atrás`/`Salir` es lo único. Corrección: que el paso 2 acepte también `{type:'event', name:'calendar.event-completed'}` o fusionar 2 y 3.
2. **Pasos redundantes**: `circulo` y `marcar` señalan el mismo control con textos casi iguales; se puede fusionar en un único paso sensible.
3. **Marco posiblemente recortado**: el marco del tutorial es un `box-shadow` de 3 px + 8 px (hasta 11 px al pulsar, `tours.css:15-35`) sobre un círculo de 24 px. El círculo vive dentro de `.agenda-stripe` (40 px de ancho, `overflow:hidden`, `styles.css:3783-3791`) o de `.completion-circle-chip` (28 px, `overflow:hidden`, `styles.css:3839-3846`, usado en Familiar, fila Tareas y bloques de la cuadrícula). El borde exterior (24+16=40 px, hasta 46 px con la pulsación) queda recortado por la franja y en el chip incluso el anillo interior de 3 px queda parcialmente recortado. Es una deducción de CSS; **no comprobado en pantalla** (cómo se ve el marco en el iPhone). Corrección: marcar el contenedor (`agenda-stripe`/chip) en lugar del botón, o quitar `overflow:hidden` mientras `[data-tour-active]`.
4. **Tamaño del objetivo**: círculo de 24 px (< 44 px recomendado); no se ha medido el área táctil real (no comprobado).
5. **El tutorial pide marcar un apunte REAL**: queda hecho (y suma puntos al asignado) hasta que se desmarque. El texto final explica cómo deshacerlo. Conviene avisarlo antes (p. ej. «elige uno que sí esté hecho de verdad»).

**Prioridad**: ALTA (el tutorial falla justo en el caso más común: día sin pendientes).

**Corrección recomendada**
- Un único paso sensible `marcar` con `skipIf appear` y un camino alternativo para «no hay nada pendiente» (paso previo condicional con texto propio y marca en ‹ › del día; añadir un campo `missingText` al paso para sustituir el mensaje genérico).
- Aceptar el evento `calendar.event-completed` en el paso informativo previo.
- Revisar el recorte del marco en CSS.
- Probar en dispositivo (no se puede hacer leyendo).

### Incidencia 3 — «Crear una tarea que se repite»: faltan explicaciones de campos visibles

**Estado confirmado**: `repeatSteps('task')` (`G1:247-329`) termina con `titulo → fecha → abrir-repeticion → opciones → hasta → festivos → cerrar → guardar`. Al cerrar la ventana de repetición se ve el formulario de `AddTaskForm` y el siguiente paso apunta a `calendar.task-save`. Sin explicar:
- **Privado** (`calendar.task-private`, marca existente, `CS:4604`) y **🔔 Aviso a toda la familia** (condicional, sin marca).
- **¿Para quién?** (`calendar.task-who`, valor por defecto «tú», `CS:4623`).
- **Categoría** (`calendar.task-category`, `CS:4629`).
- **Puntos** (`calendar.task-points`, solo con 1 persona, `CS:4631`).
- **Ubicación / Adjunto / Nota** (`calendar.task-extras`, `CS:4636`).
- Y la regla propia de la tarea: sin hora/recordatorio; en «Personalizado» semanal hay que marcar un día (esto último sí está en `details`).
Todas estas marcas **ya existen** en `AddTaskForm`, así que se pueden explicar sin tocar la pantalla.
La versión de evento (`evento-repetitivo`) tiene el mismo problema (no explica hora, todo el día, recordatorio, personas, categoría, puntos, extras).

**Causa**: el tutorial se diseñó como inmersión en la opción «Repetición» (sin los pasos de las demás opciones), a diferencia de `cal-crear-tarea`, que recorre todas.
**Prioridad**: MEDIA (el usuario puede guardar, pero llega al botón sin saber qué hay en el formulario; coherente con la petición de explicar todo lo visible).
**Corrección recomendada**: no ampliar este tutorial; integrar el contenido en los capítulos de T2 (cada campo tiene su capítulo) y reducir `tut-calendario-tarea-repetitiva`/`-evento-repetitivo` a «ver Repeticiones». Mientras, si se mantienen, añadir antes de `guardar` un paso opcional «Otras opciones» (`group` de pasos opcionales con `skipGroupLabel`) con las marcas existentes (`task-who`, `task-category`, `task-points`, `task-extras`).

### Incidencia 4 — Auditoría de los demás tutoriales (omisiones equivalentes y discrepancias)

Resumen por tutorial (detalle en §3.1 y §3.2):

| Tutorial | Omisiones principales | Discrepancias | Riesgo de rotura (`broken`) |
|---|---|---|---|
| `cal-crear-evento` | autorrelleno, 00:00, aviso familia, subcampos de extras, comprobar resultado | D5, D6, D8 | Bajo (todo opcional salvo `quien`) |
| `cal-crear-tarea` | no dice «sin hora/recordatorio», aviso familia | D6 | Bajo |
| `visita-calendario` | Hoy, deslizar, anatomía de la fila, vistas | D13 | Bajo (casi todo opcional) |
| `cambiar-vista` | tipos de vista, chips sacados | **D1** | Bajo |
| `filtrar-persona` | cumpleaños no filtrados, Pepa | — | Medio (si la familia no tiene miembros no hay lista) |
| `marcar-hecho` | **Incidencias 1 y 2** | D3 | **Alto** |
| `editar-evento` | privado, aviso familia, todo el día, categoría, extras, cancelar; faltan marcas | — | **Medio-alto**: `abrir` falla en vista Día/3 días con eventos con hora y en calendario vacío |
| `evento-repetitivo` / `tarea-repetitiva` | todo lo no relacionado con repetir (incidencia 3) | D7 | Bajo |
| `evento-recordatorio` | todo el día, privado, personas, «+ Añadir recordatorio» | D9, D10 | Bajo |
| `puntos` | evento vs tarea, saldo | — | Bajo |
| `nota-personal` | compartir/borrar nota, diferencia con «Privado» | D12 | Bajo |
| `google` | festivos, de quién es, sincronizar, quitar; categorías/colores en la misma pantalla | — | Bajo (pasos opcionales) |
| `para-quien` | sin cierre ni guardado | D4, D11 | Bajo |
| `compartir` | 📤 también en tareas; contenido real | **D2** | Medio: `icono` no es opcional y depende de tener un evento propio visible |
| `saltar-fecha` | — | — | Bajo (se adapta a la vista) |

---------------------------------------------------------------------------------------------

## 5. DEPENDENCIAS (resumen)

- **Navegación**: `startPath` `/calendario` para todos; `startDest` `calendario.nuevo-evento` / `calendario.nueva-tarea` para los que arrancan con el formulario abierto (`useHelpDestinations`, `CS:229-239`). La preparación espera a la marca `data-help-dest` (8 s) o pasa a «No he podido abrir la pantalla de este tutorial» (`TR:93-113`, `427-445`).
- **Cruce de pantallas**: solo `google` (`paths: ['/calendario','/menu-organizar']`).
- **Datos**: apunte pendiente propio (marcar-hecho), cualquier apunte (editar, compartir), miembro enlazado (puntos, Personal), categorías (selector), ajuste familiar de avisos (casilla), eventos con fin (ancla de recordatorio).
- **Modales**: el filtro, Repetición, Recordatorio, ¿Para quién?, Categoría y Extras se abren en `modal-overlay` encima del formulario (que ya está en otro modal); los tutoriales piden cerrar con ✕ marcada (`repeat-close`, `reminder-close`, `who-close`). La ✕ del filtro y de Categoría no tienen marca.
- **Eventos de guardado (`helpBus`)**: `calendar.event-created` (`CS:4365`), `calendar.task-created` (`CS:4574`), `calendar.event-updated` (`CS:4060`), `calendar.event-completed` (`CS:677`), `calendar.note-added` (`CS:1222`). No hay evento de «apunte borrado» (correcto: nunca se automatiza) ni de «día cambiado» (que haría falta para la incidencia 1).
- **Límites actuales del motor/tests relevantes para una reestructura** (`tourDefs.test.ts`): `durationSec ≤ 120` por tutorial; texto de paso `≤ 300` caracteres; todo tutorial cuelga de una ficha existente; los pasos de un grupo de opciones deben ser opcionales/informativos; un paso `quien` no puede estar en un grupo; los pasos sensibles solo esperan eventos. Un `TourDef` es una lista plana de pasos con `group` para saltar; **no existe el concepto de capítulo**.

---------------------------------------------------------------------------------------------

## 6. PROPUESTA DE ESTRUCTURA

### 6.1 Reparto por niveles

- **A) «Conoce esta sección»** = `visita-calendario` (8 pasos, solo informativa, ~2 min). Mantener y actualizar: añadir «Hoy»/deslizar (un solo paso), la anatomía de la fila (círculo, 🔒📷📎📝, "Tarea/No realizada") y quitar promesas no verificables. Es lo que hoy cubre «zonas, navegación, vistas, filtros, controles».
- **B) «Enséñame»** = los tres tutoriales con capítulos (abajo).
- **C) «Cómo funciona PEPA»** = las 5 explicaciones actuales (repeticiones, puntos, recordatorios, quién recibe avisos, privado/familiar) + nuevas propuestas: (1) colores, categorías y «Tareas completadas»; (2) qué hace PEPA por ti al crear (00:00 sin hora, autorrelleno por título, asignación por nombre, 'Tarea' vs 'Todo el día', 'No realizada'); (3) sincronización con Google/exportación/enlaces (qué sube, qué no, cada cuánto; incluye lo de tareas); (4) qué contiene el texto de 📤 y qué NO (la nota); (5) cómo se aplica el filtro a Pepa y a los cumpleaños. Lo que NO debe estar en B: reglas internas de avisos (`EXP`), RLS de privados, sincronización.

### 6.2 Estructura de los tres tutoriales (revisión de la propuesta de la usuaria)

**Valoración de la estructura propuesta por la usuaria**: es acertada en T2 y T3. Dos ajustes importantes:
1. **T1 «Conoce tu calendario» duplica la visita (A).** Para no repetir, T1 debería ser una versión **interactiva y práctica** («Moverte por el calendario»: tocar, cambiar de vista, filtrar, saltar), no una explicación de zonas. Si prefiere que T1 sea la explicación de zonas, entonces la visita sobra; yo propongo mantener ambas con funciones distintas (A: «mira», B: «hazlo»).
2. **T2: la intro debe incluir que la tarea tampoco lleva recordatorio ni «Todo el día»**, no solo «sin hora» (comprobado en `AddTaskForm`). Si se dice solo «sin hora», el capítulo 4 (Recordatorios) induce a error para tareas.

#### T1 — «Moverte por tu calendario» (interactivo; ~5 min; 4 capítulos independientes)
| Cap. | Contenido real | Pasos existentes | Reescribir / falta | Dur. |
|---|---|---|---|---|
| 1 Vistas | ☰ Menú, las 8 vistas, 📌 Sacar / 📍 Quitar, qué ve cada una (Semana plegable, Agenda 30 días, Familiar columnas, Personal) | `cambiar-vista`: `menu`, `elegir`, `resultado` | Quitar «✏️ Editar» (D1), explicar «⭐ Al abrir» solo si se decide mantener (ver §7); añadir 1 paso informativo por tipo de vista no es imprescindible | 60 s |
| 2 Días y meses | ‹ › del mes, «Hoy», tocar un día, ‹ › del día, deslizar, ir a una fecha | `saltar-fecha`: `menu`, `vista`, `fecha`, `elegir`; `visita`: `mes`, `dia` (informativos) | **Nuevo**: marcas `calendar.day-prev/next`, `calendar.month-grid`; aclarar que los ‹ › del mes cambian de mes y los del panel cambian de día; evento «día cambiado» | 90 s |
| 3 Filtrar por persona | «Filtrar por», varias personas, «Todos», qué NO se filtra (cumpleaños) | `filtrar-persona`: `abrir`, `elegir`, `cerrar`, `quitar` | añadir 1 frase (cumpleaños, Pepa) | 70 s |
| 4 Tu vista Personal y notas | Personal = lo mío + privados; notas privadas (añadir, compartir, borrar); lo que creas ahí sale privado | `nota-personal`: `menu`, `personal`, `privado`, `escribir`, `anadir` | añadir paso informativo «compartir/borrar nota»; cambiar `cardId` (D12) | 80 s |
Total ≈ 5 min completo.

#### T2 — «Crear eventos y tareas» (tutorial de referencia con un EVENTO; ~8 min completo, capítulos de 40–100 s)
Cap. 0 (intro, sin capítulo propio; texto, sin marco): «Vamos a crear un evento. Las tareas se crean con «+ Nueva tarea» y se usan casi igual, pero **sin hora, sin «Todo el día» y sin recordatorio**; todo lo demás es igual. En cada capítulo te aviso si algo cambia en una tarea.» (Sin pregunta evento/tarea.)
| Cap. | Contenido | Reutiliza | Reescribe / falta | Dur. |
|---|---|---|---|---|
| 1 Crear un evento (nombre, fecha, hora) | Abrir «+ Nuevo evento», título, fecha, hora de inicio/fin, «Todo el día» | `PIL-E`: `abrir`, `titulo`, `fecha`, `hora`, `todo-el-dia` | `hora` (00:00, «Termina»); mención autorrelleno | 100 s |
| 2 Personas y categorías | ¿Para quién? (por defecto tú; lista; asignación por nombre), Privado, Aviso a toda la familia (si sale), Categoría (+⚙️) | `PIL-E`: `quien`, `privado`, `categoria`; `para-quien`: `lista`, `cerrar` | `quien` (D4); nuevo paso «Aviso a toda la familia» (condicional, sin marca hoy) | 90 s |
| 3 Repeticiones | Ventana Repetición: presets, Personalizado, hasta, festivos | `evento-repetitivo`: `abrir-repeticion`, `opciones`, `hasta`, `festivos`, `cerrar` | `opciones` («Ninguno»); nota de tarea | 80 s |
| 4 Recordatorios | Ventana Recordatorio: presets, varios, ancla, personalizado | `evento-recordatorio`: `hora`, `abrir-recordatorio`, `ancla`, `opciones`, `cerrar` | D9, D10; frase «las tareas no tienen» | 80 s |
| 5 Puntos y recompensas | Campo de puntos solo con 1 persona; dónde se ven | `puntos`: `puntos`; `PIL-E.puntos` | explicar condición y qué hacer si no sale el campo; paso informativo con el saldo | 50 s |
| 6 Ubicación, adjuntos y notas | Los 3 chips: mapa/GPS, foto/archivo, nota | `PIL-E.extras` | **dividir en 3 pasos** y añadir marcas por chip (`calendar.event-location`, `-attachment`, `-note`; hoy solo `calendar.event-extras`) | 70 s |
| 7 Guardar y comprobar | «Crear evento» (sensible) y ver el resultado | `PIL-E.guardar` | **Comprobar**: tras guardar el modal se cierra; el evento aparece en el panel solo si la fecha es el día elegido. Paso final informativo: señalar `calendar.day-panel` o la fila (`calendar.entry-edit`) si existe; si la fecha era otra, decirlo | 40 s |
Total ≈ 8 min 30 s si se hace entero (algo más de lo orientativo; recortar en cap. 1–2 o dejar 3–6 como «opcionales»).

Qué hay que cambiar para que el flujo sea realmente «capítulos independientes con un formulario abierto»: cada capítulo debe poder arrancar con el formulario de evento abierto (`startDest: 'calendario.nuevo-evento'`, que ya existe) y terminar con «Cerrar sin guardar» salvo el capítulo 7. Como los `TourDef` no tienen capítulos, ver §6.4.

#### T3 — «Gestionar eventos y tareas» (~7 min; 6 capítulos)
| Cap. | Contenido real | Pasos existentes | Reescribir / falta | Dur. |
|---|---|---|---|---|
| 1 Consultar y entender un apunte | Anatomía: círculo, 🔒📷📎📝, 📍, persona·⭐, "Tarea/No realizada", bloques Eventos/Tareas, ver la foto, dónde se lee la nota (editar o Familiar) | `visita`: `dia`, `hecho`, `editar` (informativos) | **Nuevo** (hoy no existe ningún tutorial de «leer» un apunte) | 70 s |
| 2 Marcar como hecho / pendiente | Círculo; por día en repeticiones; puntos; deshacer | `marcar-hecho` (3 pasos) | **Rehacer** por las incidencias 1 y 2 | 60 s |
| 3 Editar un apunte | Abrir, cambiar datos, guardar, cancelar | `editar-evento`: `abrir`, `titulo`, `fecha`, `hora`, `repeticion`, `recordatorio`, `para-quien`, `guardar` | añadir marcas de categoría/extras/«todo el día»; mencionar edición de Tareas (sin hora/recordatorio) | 100 s |
| 4 Cambiar una serie | «Toda la serie / Solo esta repetición / Esta y las siguientes» | `editar-evento`: `serie` | Crear apunte repetido de ejemplo o usar uno propio; enlazar a `exp-calendario-repeticiones` | 60 s |
| 5 Compartir | 📤: contenido real, menú nativo / copiar / WhatsApp / correo | `compartir`: `icono`, `compartir`, `resultado` | D2 (corregir texto o código), mencionar tareas | 50 s |
| 6 Borrar (solo descripción, nunca se automatiza) | Deslizar la fila → «🗑 Eliminar»; «Solo este día / Toda la serie»; sin papelera | `visita.editar` (parte) | **Paso solo texto** (sin `target` en el botón; el test prohíbe ids con `delete\|remove\|eliminar`); no pulsar ni resaltar el botón de borrar | 40 s |
| 7 (opcional) Calendarios externos | Google, enlace secreto, enlazar .ics, festivos | `google`: `menu`, `gestionar`, `google`, `exportar`, `enlazar` | añadir «¿De quién es?», «Sincronizar ahora», «Quitar»; cruza a Configuración (ya declarado en `paths`) | 100 s |

Notas personales y saltar a una fecha: **no las pongo en T3** sino en T1 (son navegación/Personal, no gestión de un apunte). La usuaria las nombra en T3; justifico el cambio en §6.3.

### 6.3 Justificación de los ajustes
- **Notas personales en T1 (Personal)**: no son un evento ni una tarea; para gestionarlas hay que estar en la vista Personal, donde el usuario aprende primero qué ve. Mantenerlas en T3 mezclaría dos objetos distintos.
- **Saltar a una fecha en T1 (Días y meses)**: es navegación, no gestión.
- **Calendarios externos**: se puede mantener en T3 como capítulo final opcional o dejarlo como tutorial aparte «Calendarios externos» (≈ 100 s) porque (a) no ocurre dentro del Calendario sino en Configuración, (b) es una tarea de una sola vez, (c) la usuaria pidió «tres tutoriales principales» con cobertura completa pero comprensible. Recomiendo capítulo opcional en T3 (la opción de cuarto tutorial es válida si el T3 se alarga demasiado).
- **Incidencias 1 y 2 se resuelven mejor al fusionarse** en T3 cap. 2.
- **Eliminar duplicados**: al integrar los 7 pilotos/inmersiones en T2, los tutoriales `tut-calendario-evento-repetitivo`, `-tarea-repetitiva`, `-evento-recordatorio`, `-puntos`, `-para-quien` y los dos pilotos dejan de existir como tutoriales sueltos (o se conservan como accesos directos a un capítulo). Se evitan ~28 pasos duplicados.

### 6.4 Qué hay que decidir/cambiar técnicamente para los «capítulos» (sin implementarlo)
- Hoy un `TourDef` es una lista plana y los tests exigen `durationSec ≤ 120` y texto ≤ 300 caracteres. Para T2 (≈ 8,5 min) hay dos vías:
  1. **Capítulos como `TourDef` independientes** (p. ej. `cal-crear-1-evento`… `cal-crear-7-guardar`) agrupados en la interfaz bajo un título de tutorial (campo `series`/`chapterOf` nuevo) y con un «Siguiente capítulo» al terminar; cada uno arranca con su `startDest`. Pros: cabe en los tests actuales; permite entrar directo a un capítulo; **recomendada**.
  2. **Un `TourDef` con `chapters`** en el motor (nuevo concepto) y relajar el test de 120 s. Más cambio de motor.
- Todos los capítulos «formulario» (T2 2–6) comparten el mismo `startDest`; hay que decidir si el capítulo siguiente reutiliza el formulario abierto (recorrido completo) o lo vuelve a abrir (capítulo suelto). El motor ya omite pasos cuyo `skipIf` se cumple (`appear` del título del formulario).
- Los IDs antiguos se usan en fichas, explicaciones, `next`, pruebas y la bienvenida (§1): hay que migrar `tour:`, `cardId` y `next` a la vez.

---------------------------------------------------------------------------------------------

## 7. DECISIONES DE PRODUCTO REALMENTE NECESARIAS

1. **Contenido de 📤 (D2)**: ¿la nota debe ir en el texto compartido? Recomendación: sí, corregir el código para compartir `note` (en vez de/además de `description`) porque el texto de la ficha y de los tutoriales ya lo promete; si no, corregir la redacción. (Cambio de código fuera de la ayuda.)
2. **«⭐ Al abrir» y vista inicial**: tras retirar «Editar» ya no se puede elegir la vista de apertura. ¿Se quita la insignia y la frase de `G1`, o se devuelve la función? Recomendación mínima: quitar la frase del tutorial ahora (D1) y decidir la insignia con el equipo.
3. **Editar tarea y Google (§3.8)**: ¿se confirma como fallo y se corrige (`syncToGoogle` no debe cambiar al editar)? Es independiente de la ayuda pero afecta a lo que se puede decir en «Cómo funciona».
4. **Mecanismo de capítulos (§6.4)**: ¿capítulos como `TourDef` encadenados (recomendado) o concepto nuevo de motor?
5. **Marcas nuevas en pantalla** (necesarias para T1/T2/T3): ‹ › del día y cuadrícula del mes (incidencia 1); Categoría/extras/«Todo el día»/aviso en el formulario de edición; chips Ubicación/Adjunto/Nota; casilla «Aviso a toda la familia». Cambios mínimos de `data-help-id`, sin cambio visual. Recomiendo aprobarlos todos juntos.
6. **Campo `missingText` por paso** (mensaje específico cuando un control no existe, en vez del genérico «otra versión…»): recomendado; implica tocar el motor/tipos.
7. **¿Se deja al usuario marcar apuntes REALES en el tutorial de «hecho»?** Hoy sí (la acción es suya). Recomendación: mantenerlo, pero decirlo antes («elige uno que sí esté hecho») y ofrecer «deshacer». No hace falta crear datos de ejemplo.
8. **Eventos de «Previsión de pagos» y tareas de «Eventos» enlazadas al calendario**: aparecen en Calendario (`DC`, migraciones 0155/0163/0207); no he analizado qué pasa si el usuario las edita desde Calendario. No afecta a los tutoriales propuestos, pero conviene saberlo antes de enseñar «Editar» (no comprobado).

---------------------------------------------------------------------------------------------

## ANEXO — Lo que NO he comprobado
- Comportamiento real en iPhone: colocación de la tarjeta frente a los controles (incidencia 1), recorte del marco (incidencia 2), tamaño táctil del círculo, selector nativo de fecha («saltar a una fecha»).
- Que el servidor envíe los avisos descritos en `EXP`; el efecto real de §3.8 en el cron de Google.
- Qué ve un invitado/niño exactamente (solo he leído las reglas de acceso por sección).
- La interacción entre tareas de «Eventos» enlazadas y su edición en Calendario.
- Que los textos de `CARDS`/`EXP` sobre avisos de tareas sigan siendo correctos (no los he re-verificado: solo he comprobado los textos que tocan el formulario y las pantallas de Calendario/Configuración).
