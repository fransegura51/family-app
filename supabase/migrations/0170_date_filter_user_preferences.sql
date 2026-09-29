-- "Configuración → Filtros temporales" — favorito y activar/desactivar filtros estándar, por USUARIO (no
-- por familia ni por dispositivo), mismo patrón que finance_month_start_day (profiles, RLS "update own row"
-- ya cubre las columnas nuevas). Cambio aditivo y seguro: ambas columnas nacen con un valor por defecto que
-- deja el comportamiento actual intacto para cualquier fila ya existente.
--
-- date_filter_favorite: preset favorito (uno solo); NULL = todavía no se ha marcado ninguno.
-- date_filter_disabled: presets ocultos de los desplegables compartidos ("desactivar" = ocultar, nunca
-- borrar el propio filtro del sistema). Por defecto, los 5 presets NUEVOS de esta fase (mes contable
-- anterior, mes real anterior, año anterior, últimos 30 días, últimos 3 meses) nacen desactivados — así el
-- desplegable "📅 Fecha" de cualquier fila ya existente se ve EXACTAMENTE igual que antes de este cambio,
-- hasta que la persona los active a propósito desde Configuración.
alter table profiles add column date_filter_favorite text;
alter table profiles add column date_filter_disabled text[] not null default array['mes_anterior', 'mes_real_anterior', 'año_anterior', 'ultimos_30', 'ultimos_3_meses'];
