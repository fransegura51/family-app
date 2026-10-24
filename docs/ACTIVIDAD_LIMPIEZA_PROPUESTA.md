# Actividad reciente — auditoría del historial y propuesta de limpieza (SOLO PROPUESTA)

Fecha de la auditoría: 23/10/2026. Todo lo de abajo se obtuvo con consultas de **solo lectura** desde el SQL Editor del panel de Supabase (proyecto `family-app`). **No se ha borrado, modificado ni vacuado nada.**
Esta propuesta NO está autorizada: no se ejecutará ningún `DELETE`, `TRUNCATE`, `VACUUM FULL`, migración ni cambio de disparadores sin autorización expresa.

## 1. Fotografía de `activity_log`

| Dato | Valor |
|---|---|
| Filas | 771.200 (desde 31/08/2026 hasta 23/10/2026 18:06 UTC; ninguna nueva desde entonces) |
| Tamaño total | 173 MB = tabla 81 MB + índices 92 MB (`idx_activity_log_family_created` 54 MB, clave primaria 31 MB, `idx_activity_log_actor` 7 MB) |
| Base de datos entera | 268 MB (la actividad es ≈ 65 % de todo) — la Pro incluye 8 GB: **no hay coste económico por espacio hoy** |
| Filas vivas / muertas | 771.186 / 3.058; último autovacuum 21/10; nunca `VACUUM` manual |

Por tabla, acción y autor:

| Tabla / acción | Sin persona (`actor_id` nulo) | Con persona |
|---|---|---|
| `calendar_events` update | **760.987** (1.141 eventos) | 116 |
| `calendar_events` insert | 1.258 | 292 |
| `calendar_events` delete | 479 | 174 |
| `expenses` insert / update / delete | 2.257 / 733 / 1.377 | 106 / 664 / — |
| `shopping_items` insert / update / delete | 159 / — / 162 | 695 / 565 / 637 |

## 2. Clasificación (criterio por EVIDENCIA, no por falta de autor)

Una fila es **ruido de la sincronización de Google (clase A)** solo si cumple TODAS:
1. `table_name = 'calendar_events'` y `action = 'update'` y `actor_id IS NULL`;
2. creada dentro de la ventana de la sincronización horaria (minutos 4–29 de cada hora; el cron es `5 * * * *`);
3. el evento es **importado de Google** (`google_source_member_id` no nulo y con vínculo en `google_calendar_imported_events`), o fue un evento que desapareció pero **nació con un `insert` automático** (también importado).

| Clase | Filas | Confianza | Qué es |
|---|---|---|---|
| **A1** — update horario de los 755 eventos importados vivos | **758.923** | Alta | 1 fila por evento y hora (sólo 2 pares evento-hora repetidos en todo el historial), 1.179 horas distintas, del 03/09 (cuando se activó la sincronización) al 23/10 |
| **A2** — update horario de 360 eventos importados que ya no existen | **2.035** | Alta | 339 insertados y borrados automáticamente (Google) + 21 borrados por una persona en la app; todos con `insert` automático |
| **Total A (candidatas)** | **760.958** | | 98,7 % del historial |
| **B — dudosas, se conservan** | **29** | — | 11 updates del 21/09 sobre 9 eventos que no son de Google (un cambio puntual de ese día, probablemente la migración 0207 de reclasificación; no verificado) + 18 updates sin persona **fuera** de la ventana horaria (algunos a las 00:00:01, probablemente el proceso que reprograma pagos previstos; no verificado) |
| **C — legítimas, se conservan** | **10.213** | — | Todo lo demás: acciones de personas, `insert`/`delete` automáticos de eventos (la importación y la retirada reales de Google), gastos del banco, compras… |

Comprobación: A + B + C = 760.958 + 29 + 10.213 = **771.200** ✔ (B = 11 updates de la ventana sobre eventos que no son de Google + 18 fuera de la ventana; fuera de la ventana horaria y de la clase A hay 10.231 filas = esas 18 + las 10.213 de C).

Hallazgos sobre «sin persona» (`actor_id` nulo ≠ innecesario):
- 4.367 filas de `expenses` sin persona (4.219 en septiembre, 148 en octubre): procesos del servidor (banco, previsiones, automatizaciones) → **legítimas**.
- 1.737 `insert`/`delete` de eventos sin persona: importación y retirada reales de Google → **legítimas**.
- `activity_log.actor_id` tiene `ON DELETE SET NULL`: al borrar una cuenta, sus acciones pasan a «sin persona» (las estadísticas muestran 2.332 actualizaciones en la tabla, compatibles con eso) → **legítimas**.
- 940 grupos de filas «parecidas» en el mismo minuto fuera de la sincronización (8.748 filas): 7.721 son operaciones distintas sobre elementos distintos y 1.027 repiten elemento (ediciones seguidas) → **se conservan**.

Limitación honesta: el historial **no guarda valores** (ni antes ni después). Dentro de A no se puede distinguir una vuelta «sin cambios» de una vuelta en la que Google SÍ cambió algo del evento (ambas dejaron 1 fila). Lo único que se perdería al borrar A es «a las HH:MM el evento X se sincronizó», no ningún dato de la familia.

## 3. Propuesta de limpieza (NO ejecutar sin autorización)

**Objetivo**: retirar la clase A y nada más. Resultado esperado: de 771.200 filas se quedan 10.242.

### 3.1 Antes
1. **Copia de seguridad**: (a) las copias físicas diarias de Supabase (hay una de hoy 03:08 UTC y de los días anteriores; restaurar una copia restaura TODO el proyecto, por eso no es la herramienta cómoda) y (b) un **archivo dentro de la propia base** de lo que se va a borrar: tabla `archive_activity_log_a_20261023 (id, family_id, actor_id, table_name, action, record_id, created_at)` con `INSERT ... SELECT` de las 760.958 filas exactas (≈ 80 MB + clave) y un **resumen permanente** (una fila por evento y día: n.º de sincronizaciones) por si se quisiera conservar la huella. El archivo se borra más adelante con otra autorización, tras un periodo de gracia (p. ej. 14 días).
2. **Comprobaciones previas** (todas de solo lectura, deben dar exactamente estos números el día de la limpieza, o se detiene todo):
   - `count(*)` total = 771.200 (más lo que haya entrado legítimamente; la clase A no crece desde 0307).
   - Candidatas A1 = 758.923 y A2 = 2.035 con el predicado del §2; ninguna con `actor_id` no nulo; ninguna fuera de la ventana; ninguna en `expenses`/`shopping_items`.
   - Cero candidatas creadas después de las 18:10 UTC del 23/10/2026.
   - Que el archivo contiene exactamente las mismas `id` que se van a borrar.
3. Hacerlo en horas de poca actividad.

### 3.2 Borrado por lotes (sin bloqueos largos)
- Lotes de 10.000–20.000 filas por `id` (`DELETE ... WHERE id IN (SELECT id FROM archive ... LIMIT n)` con el mismo predicado repetido en la cláusula del borrado, nunca solo «ids»), cada lote en su transacción, con una pausa corta entre lotes. ≈ 40–80 lotes.
- `activity_log` no tiene disparadores propios ni claves foráneas que apunten a ella: el borrado solo mantiene sus 3 índices. No bloquea la lectura ni las escrituras de la app (los `INSERT` de los disparadores de las demás tablas siguen entrando).
- Parada inmediata si algún lote borra un número distinto del esperado.

### 3.3 Después
- Validaciones: total final = 10.242 ± lo nuevo; ninguna fila de clase B/C borrada (comparar con el archivo); la pantalla Actividad sigue mostrando lo de siempre; recuento de eventos importados (755) intacto.
- `VACUUM (ANALYZE) public.activity_log;` (no bloquea; marca el espacio como reutilizable).

### 3.4 Espacio: lógico frente a físico
- **Lógico** (lo que PostgreSQL considera libre/reutilizable tras `DELETE` + `VACUUM`): ≈ 80 MB de tabla y ≈ 90 MB de índices → la base pasaría de 268 MB a ≈ 100 MB de datos **reutilizables**.
- **Físico** (lo que el disco deja de ocupar): un `DELETE` y un `VACUUM` normal **no encogen** los archivos (solo recortan páginas vacías del final). Para recuperar disco real hacen falta `VACUUM FULL public.activity_log` (reescribe la tabla y reconstruye índices; **bloquea la tabla con acceso exclusivo**: mientras dura, cualquier alta o cambio en compras, calendario o gastos espera; con ~10 mil filas tarda segundos, pero es un bloqueo real) o `REINDEX INDEX CONCURRENTLY` (sin bloqueo largo) para los dos índices grandes. Como la base cuesta lo mismo hasta 8 GB, **recuperar disco físico no ahorra dinero hoy**: lo que se gana es orden, copias más pequeñas y un índice de 54 MB menos que mantener en cada alta. Mi recomendación: borrar + `VACUUM (ANALYZE)` y, si se quiere, `REINDEX ... CONCURRENTLY`; dejar `VACUUM FULL` para una ventana tranquila y solo si lo pides.

### 3.5 Recuperación
- Reinserción de las filas desde el archivo (mismas `id`) con un único `INSERT ... SELECT` (también por lotes). Si algo se hubiera borrado de más, se restaura de ahí; si el archivo ya se hubiera retirado, queda la copia diaria de Supabase.

### 3.6 Riesgos y exclusiones
- No se borra por fechas ni por «actor nulo». Se excluyen siempre: cualquier fila con persona; cualquier `insert`/`delete`; cualquier fila de otra tabla; los 18 updates fuera de ventana; los 11 del 21/09; todo evento sin `insert` automático.
- Riesgo principal: borrar de más por un predicado flojo → mitigado con archivo, recuentos exactos y parada ante cualquier diferencia.
- Riesgo secundario: carga de E/S durante el borrado → lotes pequeños y horario tranquilo.
- Impacto en la aplicación: ninguno funcional; la pantalla Actividad (ya agrupa y no depende de estas filas) puede ir algo más ligera.
- Autorizaciones necesarias: (1) crear el archivo (`CREATE TABLE ... AS SELECT`), (2) ejecutar el borrado por lotes, (3) `VACUUM (ANALYZE)` y, opcionalmente, (4) `REINDEX CONCURRENTLY` / `VACUUM FULL` en ventana acordada, (5) retirar el archivo pasado el periodo de gracia.

## 4. Comprobaciones posteriores a la migración 0307

- Ejecuciones del cron `5 * * * *` posteriores al despliegue: 19:05 y 20:05 UTC, ambas `succeeded` (la de 19:05 con HTTP 200) → **0 filas nuevas** en `activity_log` (771.200 antes y después; `max(created_at)` sigue en 18:06 UTC, la última vuelta con el código antiguo).
- Medición antes/después de la vuelta de las 20:05 (contadores de PostgreSQL): `calendar_events` **0 updates** (754.965 → 754.965) y `calendar_event_members` **+754 updates** (755.509 → 756.263): la sincronización ya no reescribe eventos, pero sí sigue reescribiendo los vínculos (ver §5).
- 755 eventos importados intactos (755 vínculos en `google_calendar_imported_events`; 898 asignaciones en `calendar_event_members`).
- Cambios reales: no hay ninguna fila nueva con persona desde la 0307 (nadie ha editado nada), así que no hay ejemplo en producción; la prueba local con la base simulada y la del código real de la función cubren ese caso. No se han creado ni modificado eventos reales.

## 5. `calendar_event_members` — por qué se reescribe cada hora (SIN implementar)

- Causa: tras (no) actualizar cada evento, la función hace `upsert({event_id, member_id}, {onConflict: 'event_id,member_id'})` para **todos** los eventos importados en cada vuelta. En PostgREST el valor por defecto es `ON CONFLICT DO UPDATE`: reescribe la fila con los mismos valores (nueva versión de la fila) aunque no cambie nada.
- ¿Innecesaria? **Sí**: la tabla solo tiene `(event_id, member_id)` — la clave —, no hay nada que actualizar.
- Efectos: el único disparador (`notify_task_assignment`) es `AFTER INSERT` y solo actúa en tareas no privadas; un `ON CONFLICT DO UPDATE` no lo dispara; no hay Realtime sobre la tabla; no hay actividad registrada. Estadísticas: 755.509 updates acumulados, 755.414 «HOT» (sin tocar índices), 146 filas muertas: **coste muy bajo** (≈ 754 versiones de fila y unos 75 KB de WAL por hora), pero trabajo inútil para el autovacuum.
- Efecto colateral conocido: como la fila se «reasegura» cada hora, si una persona quitara a ese miembro de un evento importado, la sincronización lo volvería a poner.
- **Modificación mínima recomendada (separada, no implementada)**: `ignoreDuplicates: true` en ese `upsert` (`ON CONFLICT DO NOTHING`). Mantiene exactamente las asignaciones actuales (incluida la reasignación automática si faltara), no escribe nada cuando ya existe y no dispara nada. Alternativa distinta (cambia el comportamiento, requiere decisión): crear el vínculo solo al **importar** el evento por primera vez, respetando que una persona lo reasigne después.
