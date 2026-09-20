-- Ajuste de familia: a qué edad (en meses) un "Bebé" pasa a ser "Niño/a"
-- solo (por defecto 24 = 2 años).
alter table public.families
  add column if not exists baby_until_months integer not null default 24
  check (baby_until_months between 6 and 60);

-- Convierte en "child" a los bebés que ya han cumplido esa edad en su familia.
create or replace function public.promote_babies_to_children()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer;
begin
  update public.family_members m
     set member_type = 'child'
    from public.families f
   where m.family_id = f.id
     and m.member_type = 'baby'
     and m.birth_date is not null
     and m.birth_date <= (current_date - make_interval(months => f.baby_until_months))::date;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.promote_babies_to_children() from public, anon, authenticated;

-- Una vez al día (03:15 UTC), sin depender de que nadie abra la app.
select cron.schedule('promote-babies-to-children-daily', '15 3 * * *', $$select public.promote_babies_to_children();$$);
