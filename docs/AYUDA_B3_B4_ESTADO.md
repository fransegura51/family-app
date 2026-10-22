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
| Búsqueda con IA | `src/help/ai.ts` | **Apagada** (`HELP_AI_ENABLED = false`) |

## Interruptores (todos en el código; apagar = poner `false` y desplegar)

- `HELP_CONTEXTUAL_ENABLED` (`src/help/flags.ts`, **encendido**): los «?» de cada módulo y formulario y el panel flotante de Pepa. Apagado, solo queda la pantalla `/ayuda`.
- `HELP_FEEDBACK_ENABLED` (`src/help/feedback.ts`): muestra «¿Te ha servido?» y envía el sí/no agregado. Requiere 0306.
- `HELP_PREFS_SYNC_ENABLED` (`src/state/prefs/prefsRegistry.ts`): las claves `pepa:help-*` viajan con la cuenta. Requiere 0306. Una prueba impide encenderlo sin la migración aplicada.
- `HELP_AI_ENABLED` (`src/help/ai.ts`): reservado; no hay función de servidor ni límite de gasto aprobado.

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

1. **Ayuda nueva**: cada despliegue es un commit de `master`; el último estable antes de B3 es `a003376` (B2-UX). Revertir = `git revert <commit de B3>` y push (la web vuelve a la Ayuda anterior;
   no toca la base de datos). Si la pantalla falla, también se puede apagar el panel contextual quitando `<HelpPanel />` de `NavShell.tsx`.
2. **Interruptores**: para quitar solo una pieza, poner su interruptor a `false`.
3. **Base de datos**: revertir código **no** revierte la base de datos. Solo 0306 (si se aplica) añade objetos; se deshace con su script de reversión.
