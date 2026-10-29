-- 0344 — «Rectificar con Pepa» con alcance elegible en los menús semanales (una receta, una comida, un día o el menú completo).
-- Solo AMPLÍA el check de community_editorial_revisions.scope: los valores existentes ('item' = menú completo / artículo / encuesta y 'dish' = una comida) no cambian de
-- significado ni se renombran; se añaden 'day' (un día: sus dos comidas) y 'recipe' (una receta de una comida; el destino va en `target` = {day, meal, recipe}).
-- Aditiva y reversible (ver rollbacks/0344_editorial_revision_scopes_down.sql). No toca filas, funciones ni permisos. Orden de despliegue: ESTA migración primero y después la
-- función de servidor `community-editorial` (si la función va antes, guardar una rectificación de «día» o «receta» fallaría por el check).
alter table public.community_editorial_revisions drop constraint if exists community_editorial_revisions_scope_check;
alter table public.community_editorial_revisions
  add constraint community_editorial_revisions_scope_check check (scope in ('item', 'dish', 'day', 'recipe'));
