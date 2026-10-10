# Auditoría de Calendario — colores, integraciones y regresiones

Entregable propio pedido por EVT-F4 (prompt CONSOLIDADO, Parte F) y COR-5.1
(prompt CORRECCIONES, apartado 5): revisión de código de Calendario — nunca
sustituye la comprobación visual real en dispositivo, que sigue siendo
manual (ver "Pendiente" al final de cada apartado).

Fecha: 2026-10-11. Alcance: `src/ui/CalendarScreen.tsx`, `src/domain/calendar.ts`,
`src/domain/colors.ts`, `src/domain/eventCalendarSync.ts`, `src/data/events.ts`,
`src/data/calendar.ts`, `src/ui/styles.css`.

## 1. Colores (EVT-F2)

**Mecanismo central.** `eventColors()` (`CalendarScreen.tsx:1341-1349`)
resuelve el color de cualquier evento/tarea con la misma jerarquía en las
vistas Agenda, Semana, Día/3 días, Familiar y Personal: color propio del
evento → color de categoría (si el modo de color no es "por miembro" y la
categoría tiene uno) → `solo_categorias` cae a gris neutro → color(es) de
miembro(s) asignados → gris de respaldo. Se usa igual en las 5 llamadas
detectadas — no hay rutas divergentes dentro de ese archivo. El respaldo a
gris (`#9ca3af`) cuando no hay color asignado está cubierto explícitamente,
nunca deja un string vacío.

`toPastel()`/`readableTextColor()` (`domain/colors.ts`,
`domain/calendar.ts:192-215`) reutilizan el mismo sistema de temas
pastel/vivo/neutro que el resto de la app, sin inventar una paleta aparte.

**Hallazgo real — duplicación estructural.** `eventDotColors()`
(`domain/calendar.ts:175-190`), usado solo en los puntos de la "Vista
general" del mes (`CalendarScreen.tsx:980`), es una segunda implementación
escrita a mano de la MISMA lógica que `eventColors()`. El propio código ya
reconoce en un comentario que hubo un bug real de desincronización entre
ambas, corregido en su momento. Hoy están sincronizadas y no hay ningún bug
visible, pero la duplicación en sí es un riesgo de regresión futura si se
toca una sin la otra. **No se ha tocado** (ver abajo, "no alterar sin razón
comprobada") — queda documentado como candidato a unificar en una sola
función compartida el día que se edite cualquiera de las dos.

**Hallazgo real — dos grises "sin color" distintos.** `#9ca3af` (eventos y
tareas propios) frente a `#6b7280` (eventos externos de Google/Outlook sin
miembro asignado, `externalEventColor`). Ninguno de los dos pasa por
`colors.ts`, así que quedan fuera del sistema de temas, y al ser dos grises
ligeramente distintos para el mismo significado ("sin color asignado")
pueden notarse distintos en una misma pantalla con eventos propios y
externos mezclados. Impacto visual menor — no es una regresión de nada ya
corregido, es una inconsistencia que ya existía.

**Pendiente (no verificable por código):** contraste real de cada color
sobre su fondo en dispositivo — esto solo se puede confirmar mirando la
pantalla, no leyendo el código.

## 2. Integración con Eventos (EVT-F3)

**Sincronización fecha→Calendario centralizada.** `planCalendarSync`
(`domain/eventCalendarSync.ts:53-72`, función pura) es la única fuente de
la decisión de crear/actualizar/borrar la entrada de Calendario de un
Evento, ejecutada solo por `syncEventToCalendar`/`syncEventToCalendarSafely`
(`data/events.ts:892,943`), disparada solo desde cambios de fecha/estado del
propio Evento. Antiduplicación por diseño: solo una fecha "confirmada" crea
el compromiso; un cambio que no toca fecha/hora/título/lugar es idempotente
(`calendarRowMatches`); sin fecha, se borra la entrada y se limpia el
enlace.

**Las ofertas nunca crean eventos de Calendario.** Revisados
`eventTaskGroupOffers.ts`, `eventTaskGroupLooseOffers.ts`,
`eventTaskGroupOfferItems.ts` y `services/offerBudgetDocument.ts` — ninguno
referencia la tabla de Calendario ni `planCalendarSync`. Confirma lo que ya
decía la Ayuda: "apuntar una oferta... nunca crea ningún pago ni toca el
Presupuesto [ni Calendario]; eso solo pasa si de verdad resolvéis el
encargo" — y ni siquiera resolver un encargo toca Calendario, solo Eventos
mismo lo hace a través de su propia fecha.

No se detectó ninguna otra vía de inserción en la tabla de Calendario fuera
del CRUD manual del propio módulo y de esta sincronización desde Eventos.

## 3. Regresiones conocidas (EVT-F1)

Revisado el commit que corrigió el desbordamiento en 3 días/Día y el FAB
tapando la vista Familiar: los ajustes CSS (`min-width: 0` en las celdas y
chips de la rejilla horaria, el `padding-bottom` de la vista familiar) y el
grupo de FAB siguen presentes sin alteraciones posteriores que los
reviertan. No hay commits posteriores que toquen esas mismas clases.

**Pendiente (no verificable por código):** confirmación visual en
dispositivo real de que el desbordamiento y el solape del FAB siguen sin
reproducirse — el código no revela una regresión, pero solo una prueba
manual lo certifica del todo.

## Decisión sobre los 2 hallazgos reales

Ninguno de los dos (duplicación `eventColors`/`eventDotColors`, los dos
grises distintos) se ha corregido en esta auditoría: ambos son mejoras de
limpieza de bajo riesgo, no un bug visible hoy, y la instrucción expresa de
este encargo es "no alterar comportamientos que ya funcionan sin una razón
comprobada". Quedan documentados aquí para quien los quiera abordar como un
cambio aparte y deliberado.
