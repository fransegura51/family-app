-- Punto 3.1 (prompt de correcciones) — "Por categoría" agrupaba por `category` (el nombre propio de cada
-- partida, p. ej. "Ramo de Jennifer"), único por construcción: en la práctica, una categoría distinta por
-- partida. Esta columna nueva es la categoría REAL y compartida ("Flores y decoración"), que PEPA sugiere
-- sola (ver suggestBudgetCategoryGroup en el dominio) y la familia puede editar — nunca depende de
-- budget_categories (el catálogo de Economía, con sembrado duplicado conocido) ni de un catálogo previo.
-- Aditiva: columna NULLABLE, no toca ninguna fila existente salvo el backfill de abajo.
alter table event_budget_items add column category_group text null;

-- Backfill con la MISMA heurística por palabras clave que el dominio (suggestBudgetCategoryGroup) — toda
-- partida ya creada recibe ya una categoría real razonable, sin que la familia tenga que repetir nada.
update event_budget_items
set category_group = case
  when category ~* '(ramo|flor|decoracion|decoración|prendido|corsage|tocado)' then 'Flores y decoración'
  when category ~* '(vestido|traje|vestuario|complemento|zapato|corbata|gemelo)' then 'Vestuario'
  when category ~* '(peluqueria|peluquería|maquillaje)' then 'Peluquería y maquillaje'
  when category ~* '(alianza|joyer)' then 'Alianzas y joyería'
  when category ~* '(animacion|animación|monitor|juego)' then 'Animación'
  when category ~* '(musica|música|\bdj\b|banda|orquesta)' then 'Música'
  when category ~* '(foto|video|vídeo|reportaje)' then 'Fotografía y vídeo'
  when category ~* '(catering|comida|bebida|tarta|pastel|menu|menú)' then 'Comida y bebida'
  when category ~* '(transporte|coche|autobus|autobús)' then 'Transporte'
  when category ~* '(invitacion|invitación|papeleria|papelería)' then 'Invitaciones y papelería'
  else 'Otros'
end
where category_group is null;
