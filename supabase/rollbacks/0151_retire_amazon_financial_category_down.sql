-- ROLLBACK de la Fase 6C.2D (cierre): restaura EXACTAMENTE la categoría personal «Amazon» de Familia Hepburn (mismo id, mismo family_id,
-- mismo nombre, mismo padre, mismo grupo, mismo orden, mismo icono y demás columnas) — nunca genera un id nuevo. No toca Familia Demo,
-- otras familias, ni ningún otro dato.
insert into public.budget_categories
select r.*
from public.amazon_category_retirement_log l,
     jsonb_populate_record(null::public.budget_categories, l.before) r
where l.family_id = '011429a4-4fd8-4341-9c04-ec6b2f585196'
on conflict (id) do nothing;

drop table if exists public.amazon_category_retirement_log;
