-- Los iconos de categoría se pueden arrastrar para reordenarlos —
-- petición real: "los iconos de las categorías... que se puedan mover
-- y organizar como queramos, arrastrándolos con el dedo". Se rellena
-- con el orden alfabético que ya tenían, para que nada salte de sitio
-- al desplegar esto.
alter table budget_categories add column sort_order bigint not null default 0;

with ordered as (
  select id, row_number() over (partition by family_id, budget_group order by name) as rn
  from budget_categories
)
update budget_categories bc
set sort_order = ordered.rn
from ordered
where ordered.id = bc.id;
