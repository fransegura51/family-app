-- Petición real: "poder limitar la información que pueden ver los hijos en
-- la app... lo primero que quiero restringirles es Economía, [pero] al
-- estar dentro Educación Financiera no se la puedo restringir por
-- completo" — reutiliza el mecanismo ya construido para los invitados de
-- Galería (0070_guest_users.sql: private.has_section_access +
-- profiles.allowed_sections) en vez de inventar uno nuevo. Eric y
-- Fernando (4 años y medio, 3 meses) todavía no lo necesitan, pero se
-- construye ya porque la app se piensa para familias con hijos mayores.

-- 'child' como role propio (no 'adult' ni 'guest'): hace falta distinguirlo
-- en el cliente para el caso especial de que Economía (/dinero) se quede
-- visible en el menú aunque 'dinero' no esté en su allowed_sections —
-- porque ahí vive también Educación financiera, que sí debe verse.
alter table profiles drop constraint if exists profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('admin', 'adult', 'guest', 'child'));

-- join_family_with_code (0070_guest_users.sql) mapeaba cualquier
-- member_type que no fuera 'admin'/'guest' a role 'adult' — 'child' caía
-- ahí y perdía la distinción. Resto de la función sin cambios.
create or replace function public.join_family_with_code(p_code text, p_display_name text)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid;
  v_family_id uuid;
  v_member_type text;
  v_allowed_sections text[];
begin
  if v_user_id is null then
    raise exception 'No autenticado';
  end if;
  if exists (select 1 from profiles where id = v_user_id) then
    raise exception 'El usuario ya pertenece a una familia';
  end if;

  select id, family_id, member_type, allowed_sections into v_member_id, v_family_id, v_member_type, v_allowed_sections
  from family_members
  where invite_code = upper(p_code)
    and invite_code_expires_at > now()
    and linked_profile_id is null;

  if v_member_id is null then
    raise exception 'Código no válido o caducado';
  end if;

  insert into profiles (id, family_id, role, display_name, allowed_sections)
  values (
    v_user_id,
    v_family_id,
    case
      when v_member_type = 'admin' then 'admin'
      when v_member_type = 'guest' then 'guest'
      when v_member_type = 'child' then 'child'
      else 'adult'
    end,
    p_display_name,
    v_allowed_sections
  );

  update family_members
  set linked_profile_id = v_user_id, invite_code = null, invite_code_expires_at = null
  where id = v_member_id;

  return v_family_id;
end;
$function$;

-- Resolver "mi propio family_members.id" no tenía un helper reutilizable
-- (se resolvía ad hoc donde hacía falta, p. ej.
-- 0049_google_calendar_per_member_bidirectional.sql). Hace falta uno para
-- poder restringir el monedero de un niño a sí mismo más abajo.
create or replace function private.current_member_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select id from family_members where linked_profile_id = auth.uid()
$$;

revoke execute on function private.current_member_id() from public, anon, authenticated;
grant execute on function private.current_member_id() to authenticated;

-- expenses/budgets/budget_categories comparten budget_group
-- ('alimentacion' es el registro de La cocina de Pepa, en /alimentacion —
-- otro valor es Economía de verdad, en /dinero). Un bloqueo a nivel de
-- tabla completa habría roto también el registro de Alimentación para un
-- niño restringido; la condición mira budget_group, no solo family_id.
drop policy "expenses: family crud" on expenses;
create policy "expenses: family crud" on expenses for all
  using (family_id = private.current_family_id() and (budget_group = 'alimentacion' or private.has_section_access('dinero')))
  with check (family_id = private.current_family_id() and (budget_group = 'alimentacion' or private.has_section_access('dinero')));

drop policy "budgets: family crud" on budgets;
create policy "budgets: family crud" on budgets for all
  using (family_id = private.current_family_id() and (budget_group = 'alimentacion' or private.has_section_access('dinero')))
  with check (family_id = private.current_family_id() and (budget_group = 'alimentacion' or private.has_section_access('dinero')));

drop policy "budget_categories: family crud" on budget_categories;
create policy "budget_categories: family crud" on budget_categories for all
  using (family_id = private.current_family_id() and (budget_group = 'alimentacion' or private.has_section_access('dinero')))
  with check (family_id = private.current_family_id() and (budget_group = 'alimentacion' or private.has_section_access('dinero')));

-- tags solo se usa desde Economía (Movimientos/Banco) — sin la matización
-- de budget_group que hace falta arriba.
drop policy "tags: family crud" on tags;
create policy "tags: family crud" on tags for all
  using (family_id = private.current_family_id() and private.has_section_access('dinero'))
  with check (family_id = private.current_family_id() and private.has_section_access('dinero'));

drop policy "bank_connections: family crud" on bank_connections;
create policy "bank_connections: family crud" on bank_connections for all
  using (family_id = private.current_family_id() and private.has_section_access('dinero'))
  with check (family_id = private.current_family_id() and private.has_section_access('dinero'));

drop policy "bank_accounts: family crud" on bank_accounts;
create policy "bank_accounts: family crud" on bank_accounts for all
  using (exists (select 1 from bank_connections c where c.id = bank_accounts.connection_id and c.family_id = private.current_family_id() and private.has_section_access('dinero')))
  with check (exists (select 1 from bank_connections c where c.id = bank_accounts.connection_id and c.family_id = private.current_family_id() and private.has_section_access('dinero')));

drop policy "bank_transactions: family crud" on bank_transactions;
create policy "bank_transactions: family crud" on bank_transactions for all
  using (exists (select 1 from bank_accounts a join bank_connections c on c.id = a.connection_id where a.id = bank_transactions.account_id and c.family_id = private.current_family_id() and private.has_section_access('dinero')))
  with check (exists (select 1 from bank_accounts a join bank_connections c on c.id = a.connection_id where a.id = bank_transactions.account_id and c.family_id = private.current_family_id() and private.has_section_access('dinero')));

-- Educación financiera queda fuera del bloqueo de 'dinero' a propósito
-- (viven en tablas aparte, sin budget_group) — pero si el propio niño
-- tiene su login, no debería ver el monedero de un hermano. Un adulto
-- sigue viendo el de cualquier hijo (es quien lo gestiona hoy).
drop policy "kid_wallet_transactions: family crud" on kid_wallet_transactions;
create policy "kid_wallet_transactions: family crud" on kid_wallet_transactions for all
  using (family_id = private.current_family_id() and (private.current_role_in_family() <> 'child' or member_id = private.current_member_id()))
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id) and (private.current_role_in_family() <> 'child' or member_id = private.current_member_id()));

drop policy "kid_goals: family crud" on kid_goals;
create policy "kid_goals: family crud" on kid_goals for all
  using (family_id = private.current_family_id() and (private.current_role_in_family() <> 'child' or member_id = private.current_member_id()))
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id) and (private.current_role_in_family() <> 'child' or member_id = private.current_member_id()));
