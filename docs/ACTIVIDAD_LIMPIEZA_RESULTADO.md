# Actividad reciente — limpieza controlada ejecutada (24/10/2026)

Ejecutada con la autorización expresa del segundo encargo, después de terminar y publicar la Parte 1. Propuesta y criterios: [`ACTIVIDAD_LIMPIEZA_PROPUESTA.md`](ACTIVIDAD_LIMPIEZA_PROPUESTA.md).

## Resultado

| | Antes | Después |
|---|---|---|
| Filas de `activity_log` | 771.219 | **10.263** |
| Borradas (solo clases A1 + A2) | — | **760.958** (A1 = 758.923, A2 = 2.035) |
| Clase B (dudosas, conservadas) | 29 | 29 intactas |
| Filas hasta el límite auditado (23/10 18:10 UTC) | 10.242 + nuevas | **10.242** (exactamente las protegidas) |
| Filas nuevas legítimas desde la auditoría | — | 21 (personas, gastos y 2 actualizaciones a medianoche de eventos que no son de Google) |
| Eventos importados de Google / vínculos | 755 / 755 | 755 / 755 |
| `activity_log` físico | 173 MB | 173 MB (el `VACUUM` normal no devuelve disco; el espacio queda reutilizable) |

Lo único que se perdió del historial activo es «a las HH:MM el evento X se sincronizó» (ver limitación en la propuesta); no se tocó ningún dato de la familia. Solo se borró de `activity_log`.

## Cómo se hizo

1. **Comprobaciones previas** (solo lectura): A1 = 758.923, A2 = 2.035, B = 29, ninguna candidata posterior al límite (2026-10-23 18:10 UTC), ninguna con persona, ninguna de otra tabla/acción; 755 eventos importados y 755 vínculos; la 0307 seguía evitando nuevas actualizaciones (ninguna `update` de eventos de Google tras el límite).
2. **Copia exacta** en `private.activity_log_archive_20261024` (todas las columnas + `clase` + `archived_at`): 760.958 filas. Verificada: mismos 760.958 identificadores distintos, 0 con persona, 0 de otra tabla o acción, 0 posteriores al límite, y **idénticas al original** columna a columna en los 12 tramos de fechas (suma = 760.958). Restauración probada solo en una tabla temporal (760.958 filas), sin tocar producción.
3. **Borrado en 45 lotes** (uno de 13.097 y 44 de un día: 10.030–18.123 filas; todos entre 10.000 y 20.000), cada uno en su transacción, seleccionando **solo identificadores del archivo** y **revalidando** en el mismo momento todos los criterios (tabla/acción/sin persona/ventana minutos 4–29/límite de fecha/evento de Google con vínculo, o evento desaparecido con `insert` automático). Cada lote llevaba una guarda que no borra nada si el número revalidado no coincide con el esperado. Registro por lote en `private.activity_log_cleanup_log_20261024`: 45 lotes, **0 con discrepancia**, suma 760.958.
4. **Validación posterior**: 0 filas del archivo siguen en `activity_log`; las 29 de la clase B siguen; 2.204 `insert`/`delete` de eventos conservados (2.203 + 1 nuevo); 755 eventos/755 vínculos/755 asignaciones de eventos importados; la consulta de la pantalla Actividad responde.
5. **Mantenimiento**: únicamente `VACUUM (ANALYZE) public.activity_log` (sin `VACUUM FULL`, sin reindexar). Resultado: 0 filas muertas, 10.263 vivas; tamaño total sin cambio (esperado).

## Copia de seguridad: dónde está y cómo se usa

- **Ubicación**: `private.activity_log_archive_20261024` (proyecto Supabase `family-app`, 128 MB). Esquema `private`, no expuesto por la API; RLS activada **sin políticas**; permisos retirados a `public`, `anon`, `authenticated` y `service_role`: solo la administración técnica (rol `postgres`, desde el SQL Editor) puede leerla. Creada el 23/10/2026 entre las 23:31 y las 23:33 UTC (24/10 01:31 hora de Madrid).
- **Contenido**: las 760.958 filas retiradas con su `id` original, `family_id`, `actor_id`, `table_name`, `action`, `record_id`, `created_at`, más `clase` (A1/A2) y `archived_at`. Registro de lotes: `private.activity_log_cleanup_log_20261024`.
- **Conservación**: **mínimo 30 días** tras la limpieza (hasta el 23/11/2026 como pronto). No hay borrado automático. Solo se retirará cuando se autorice expresamente.
- **Restauración** (NO ejecutada en producción; requiere autorización): por lotes de ≤ 20.000, `insert into public.activity_log (id, family_id, actor_id, table_name, action, record_id, created_at) select id, family_id, actor_id, table_name, action, record_id, created_at from private.activity_log_archive_20261024 where created_at >= :desde and created_at < :hasta on conflict (id) do nothing;` — reinserta con los mismos identificadores. Los `actor_id` eran nulos y los `family_id` siguen existiendo salvo familias borradas desde entonces (en ese caso esas filas fallarían por la clave foránea y deberían omitirse).
- Además siguen las copias físicas diarias de Supabase.

## `calendar_event_members`: `ignoreDuplicates: true`

Cambiado en `sync-calendar-from-google-cron` (una línea: `ignoreDuplicates: true` en el `upsert` de `calendar_event_members`). Se mantiene la sincronización, los eventos importados y las asignaciones; no se borra ningún vínculo; no se cambia ninguna lógica de asignación ni ningún otro módulo; si una asignación faltara, se vuelve a crear igual que antes. **No** se implementó crear vínculos solo en la primera importación (no autorizado).

- Pruebas antes de desplegar: `googleImportSync.test.ts` ejecuta el código real de la función con una base simulada (ahora distingue «reescribe» de «no hace nada»): una vuelta sin cambios hace 0 reescrituras de asignaciones, una asignación que falta se recrea, y la función contiene exactamente un `upsert` con `ignoreDuplicates: true`.
- Desplegada como versión 5 de la función (la descargada en vivo contiene el cambio). La verificación del efecto en la primera vuelta horaria posterior se anota abajo.

### Verificación en producción de la primera vuelta con la función nueva (24/10/2026, 01:05 UTC)

- El `pg_cron` `5 * * * *` se ejecutó (`succeeded`); las 4 credenciales de Google quedaron `ok` (sincronizadas entre 01:05:06 y 01:05:33 UTC, sin error).
- `calendar_event_members`: contador de actualizaciones **759.279 antes y después** de la vuelta (con la versión anterior sumaba ≈ 754 por hora). Asignaciones de eventos importados: 755 (sin pérdida).
- `calendar_events`: 0 actualizaciones nuevas; 755 eventos importados y 755 vínculos intactos.
- `activity_log`: 10.263 filas antes y después de la vuelta (ninguna fila nueva de la sincronización).
