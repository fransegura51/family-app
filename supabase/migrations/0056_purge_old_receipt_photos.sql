-- Las fotos de tickets son la foto que más se sube (petición real: "los
-- tickets... a los tres meses que se eliminen, para no estar ocupando
-- espacio"). Se borra SOLO el archivo de la foto pasados 3 meses desde
-- la fecha del ticket — la ficha (tienda, fecha, importe) y el gasto
-- enlazado en Dinero se quedan igual para siempre, para no perder el
-- historial de gasto (petición real explícita: "los datos tienen que
-- permanecer... solo se borra la foto").
alter table receipts alter column storage_path drop not null;

-- Devuelve las rutas de storage a borrar y marca esas filas como sin
-- foto (storage_path = null) — SECURITY DEFINER porque lo llama el cron
-- (service_role), no un usuario con sesión.
create or replace function public.claim_old_receipt_photos()
returns table (out_storage_path text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with old as (
    select id, storage_path
    from receipts
    where storage_path is not null
      and receipt_date < (current_date - interval '3 months')
  ),
  cleared as (
    update receipts
    set storage_path = null
    where id in (select id from old)
    returning receipts.id
  )
  select o.storage_path from old o join cleared c on c.id = o.id;
end;
$$;

revoke all on function public.claim_old_receipt_photos() from public, anon, authenticated;
grant execute on function public.claim_old_receipt_photos() to service_role, postgres;
