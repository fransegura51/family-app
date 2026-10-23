-- Deshace 0309. ATENCIÓN: si ya se corrigió o anuló algo, esas filas (kind = 'correccion'/'anulacion') SIGUEN en
-- point_grants y siguen contando en el saldo; solo desaparecen la función y el etiquetado. Para dejar de contarlas
-- habría que borrarlas a mano, y eso reabriría los errores corregidos: no se hace aquí.
drop function if exists public.adjust_point_grant(uuid, text, integer, text);

drop policy if exists "point_grants: adult insert" on point_grants;
create policy "point_grants: adult insert" on point_grants for insert
  with check (family_id = private.current_family_id() and private.current_role_in_family() in ('admin', 'adult') and granted_by = auth.uid());

alter table point_grants drop column if exists kind;
