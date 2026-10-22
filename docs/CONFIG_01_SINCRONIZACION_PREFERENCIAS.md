# CONFIG-01 · Sincronización de preferencias entre dispositivos (B1)

Estado (22/10/2026): **EN PRODUCCIÓN.** Migración `0305` aplicada (editor SQL de Supabase), Realtime activado para `user_prefs`, interruptor `PREFS_V2_ENABLED` encendido en `src/state/prefs/flags.ts` y web desplegada (commit `e4e22e2`). La comprobación con dispositivos reales (ordenador ↔ móvil) sigue **pendiente**.

Resultados en producción (22/10/2026): tabla y funciones creadas; 10 filas copiadas desde las 10 claves de `user_ui_prefs` (4 personas), ninguna sin copiar, tabla antigua intacta; RLS activa, `anon` sin acceso, escritura directa denegada, clave ajena y valor no texto rechazados, aislamiento entre personas (prueba en vivo con todo deshecho); disparador de transición probado (cambio de una versión antigua copiado, clave no permitida ignorada); Realtime con `public.user_prefs`; 0 errores en el asesor de seguridad.

## Qué hace

Las preferencias personales de pantalla de la persona (orden del menú, orden y carrusel de Inicio, tema de color, menús de cada sección, modo de voz de Pepa, «Hacerlo directamente, sin tarjeta», botones clásicos, aviso de calendarios visto, tema y personaje del medidor de altura, vista del menú del evento, decisión de la invitación a valorar) se guardan **una fila por preferencia** en la cuenta y se reparten **en tiempo real** a los demás dispositivos de la misma persona.

- **Orden de servidor**: cada escritura recibe una revisión creciente asignada por la base de datos. Nunca decide la hora del dispositivo.
- **Comparar y cambiar** (`set_user_pref(clave, valor, rev_base)`): solo se aplica si nadie cambió esa preferencia desde la revisión de partida. Si otro dispositivo se adelantó, **prevalece lo ya confirmado**, se muestra un **aviso discreto** («Se aplicó un cambio más reciente hecho en otro dispositivo…») y el valor rechazado queda guardado para **«Recuperar el mío»**.
- **Una conexión de tiempo real por dispositivo** (Postgres Changes sobre `user_prefs`, filtrada por la persona) y, además, **revalidación** al volver a primer plano, al recuperar la red y al reconectar el canal (el menú no depende de que Realtime funcione).
- **Cola de cambios pendientes** guardada en el dispositivo: sobrevive a cerrar la app, se reintenta con espera creciente y, si el fallo persiste, **se muestra** (aviso con «Reintentar ahora» y registro en los errores de la app). Un error que no se arregla reintentando se descarta **con aviso** y el valor sigue recuperable.
- **Cuentas distintas en el mismo navegador**: la caché local se limpia al cambiar de persona.
- La caché local (`localStorage`) sigue siendo lo que leen las pantallas (compatibilidad); lo nuevo es que ahora **escuchan** los cambios (`usePrefChange`, o el aviso propio que ya tenían).
- El cambio de **estilo de color** de otro dispositivo no recarga la app por sorpresa: se avisa y la persona elige «Aplicar ahora». Al cambiar el estilo aquí, primero se sube el cambio y después se recarga (antes la recarga podía cortar la subida).

## Dónde está

| Pieza | Archivo |
|---|---|
| Lista cerrada de claves | `src/state/prefs/prefsRegistry.ts` (debe coincidir con `private.user_pref_key_allowed` de la migración; una prueba lo comprueba) |
| Motor (sin red ni navegador: se prueba con servidor simulado) | `src/state/prefs/prefsEngine.ts` |
| Red real | `src/state/prefs/prefsTransport.ts` |
| Escritura (sin dependencias de red) | `src/state/prefs/prefsWrite.ts` (`prefSet`) — **toda** preferencia sincronizable se escribe con `prefSet`, nunca con `localStorage.setItem` (lo vigila `prefsWriteGuard.test.ts`) |
| Arranque, avisos, eventos | `src/state/prefs/prefsRuntime.ts`, `src/ui/PrefsNotices.tsx` (montado en `NavShell`) |
| Escucha en pantallas | `src/state/prefs/usePrefChange.ts` |
| Interruptor | `src/state/prefs/flags.ts` |
| Mecanismo anterior | `src/state/prefsSyncLegacy.ts` (se retira cuando 0305 lleve una semana aplicada) |
| Simulación para pruebas | `src/state/prefs/prefsSimulation.ts` |

## Qué NO se sincroniza (por diseño)
Estados del dispositivo: permisos del sistema, cachés, contadores de uso, posición de botones flotantes, quién comparte ubicación en este móvil, candidatos de visita, bloques abiertos del configurador y emojis recientes. Los ajustes familiares y los que ya viven en tablas de Supabase (modo de cuentas, mes contable, categorías…) **no** pasan por esta tabla (B1b, tras medir): su actualización en vivo se tratará aparte.

## Pruebas (todas con servicios simulados; no hay segundo proyecto de Supabase)
- `prefsEngine.test.ts` (20): dos dispositivos, A↔B, claves distintas sin pisarse, conflicto simultáneo + recuperar, cambio sin red con revisión antigua, eco, reconexión, cierre y reapertura, cambio de persona, errores pasajeros y fatales, canal caído.
- `prefsNavShellSync.test.tsx` (7): **el menú inferior real** se repinta al llegar un cambio remoto sin recargar; móvil→ordenador; sin red y recuperación; conflicto con aviso y «Recuperar el mío»; fallo persistente visible; otra persona no afecta; interruptor apagado = mecanismo anterior. Comprobado con una **mutación** (con la sincronización apagada fallan 3 de ellas).
- `prefsReaders.test.tsx` (14), `prefsWriteGuard.test.ts` (3), `prefsSync.test.ts`.
- SQL (PGlite, `supabase/local-sql-tests`): RLS, comparar y cambiar, orden de revisión, aislamiento, claves/valores no permitidos, límites, sin escritura directa, copia inicial, disparador de transición, deshacer y el guion de prueba en vivo.

**Pendiente de comprobar en dispositivos reales** (no sustituible por simulación): ordenador ↔ móvil (iPhone y Android, PWA y app nativa), Realtime real, comportamiento con la app en segundo plano.

## Puesta en producción (realizada el 22/10/2026; se conserva como guía de recuperación)
1. Aplicar `supabase/migrations/0305_user_prefs.sql` (incluye tabla, función, copia inicial desde `user_ui_prefs`, disparador temporal y **publicación Realtime**). (Hecho: el archivo ya está en `supabase/migrations/` y el rollback en `supabase/rollbacks/`.)
2. Ejecutar `supabase/pending-migrations/0305_live_test.sql` en el editor SQL (termina con un error a propósito que muestra el resultado y **deshace todo**) y comprobar el asesor de seguridad.
3. Poner `PREFS_V2_ENABLED = true` en `src/state/prefs/flags.ts`, actualizar los candados de «número máximo de migración» (304 → 305), fusionar en `master` y desplegar. (Hecho.)
4. Comprobar en dos dispositivos reales (cuentas de prueba) y confirmar el reparto del menú en ambos sentidos.
5. Pasada una semana: retirar el disparador de transición y `prefsSyncLegacy.ts`.

**Deshacer:** poner `PREFS_V2_ENABLED = false` (vuelve el mecanismo anterior) y, si hace falta, `supabase/rollbacks/0305_user_prefs_down.sql` (devuelve las preferencias nuevas a `user_ui_prefs` antes de borrar nada).

## Límites conocidos
- Con el interruptor encendido la migración debe estar aplicada (lo está). Si en algún momento faltara la tabla, la sincronización nueva falla (se reintenta y se registra) y las preferencias siguen guardándose en el dispositivo.
- El conflicto entre dos dispositivos descarta el cambio posterior que parte de una revisión antigua (con aviso y recuperación); no hay fusión parcial dentro de una misma preferencia (p. ej. dos cambios distintos del orden del mismo menú).
- `pepa:auto-confirm`: mientras la persona no la elija, cada tipo de dispositivo usa su valor habitual (nativa: directo; web: con tarjeta) y no se guarda; al elegirla, se sincroniza.
