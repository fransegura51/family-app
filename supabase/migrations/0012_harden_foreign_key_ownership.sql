-- Pentest real (Skill 32) encontró un fallo: varias políticas solo
-- comprobaban family_id = private.current_family_id() en la FILA que se
-- escribe, pero no verificaban que las referencias a otras tablas
-- (member_id, place_id) pertenecieran también a esa misma familia. Un
-- admin de la Familia A podía crear, dentro de su propio family_id, filas
-- que apuntaban a un family_member de la Familia B (probado con
-- location_sharing_consent + member_locations usando un member_id real
-- de otra familia). No llegaba a filtrarse ningún dato a la víctima
-- (las lecturas de la víctima siguen aisladas), pero permitía crear
-- referencias huérfanas/manipuladas — así que se cierra de raíz.

create or replace function private.member_in_current_family(p_member_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from family_members fm
    where fm.id = p_member_id and fm.family_id = private.current_family_id()
  )
$$;

create or replace function private.place_in_current_family(p_place_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from location_places p
    where p.id = p_place_id and p.family_id = private.current_family_id()
  )
$$;

revoke all on function private.member_in_current_family(uuid) from public, anon, authenticated;
grant execute on function private.member_in_current_family(uuid) to authenticated;
revoke all on function private.place_in_current_family(uuid) from public, anon, authenticated;
grant execute on function private.place_in_current_family(uuid) to authenticated;

-- location_sharing_consent: el fallo original. Solo el admin, y solo
-- para miembros de su propia familia.
drop policy "location_sharing_consent: admin write" on location_sharing_consent;
create policy "location_sharing_consent: admin write" on location_sharing_consent for insert
  with check (
    family_id = private.current_family_id()
    and private.current_role_in_family() = 'admin'
    and private.member_in_current_family(member_id)
  );

drop policy "location_sharing_consent: admin update" on location_sharing_consent;
create policy "location_sharing_consent: admin update" on location_sharing_consent for update
  using (family_id = private.current_family_id() and private.current_role_in_family() = 'admin')
  with check (
    family_id = private.current_family_id()
    and private.current_role_in_family() = 'admin'
    and private.member_in_current_family(member_id)
  );

-- tasks.member_id (nullable = tarea familiar)
drop policy "tasks: family crud" on tasks;
create policy "tasks: family crud" on tasks for all
  using (family_id = private.current_family_id())
  with check (
    family_id = private.current_family_id()
    and (member_id is null or private.member_in_current_family(member_id))
  );

-- task_completions.member_id
drop policy "task_completions: family crud" on task_completions;
create policy "task_completions: family crud" on task_completions for all
  using (exists (select 1 from tasks t where t.id = task_id and t.family_id = private.current_family_id()))
  with check (
    exists (select 1 from tasks t where t.id = task_id and t.family_id = private.current_family_id())
    and private.member_in_current_family(member_id)
  );

-- calendar_event_members.member_id
drop policy "calendar_event_members: family crud" on calendar_event_members;
create policy "calendar_event_members: family crud" on calendar_event_members for all
  using (
    exists (select 1 from calendar_events e where e.id = event_id and e.family_id = private.current_family_id())
  )
  with check (
    exists (select 1 from calendar_events e where e.id = event_id and e.family_id = private.current_family_id())
    and private.member_in_current_family(member_id)
  );

-- food_logs.member_id
drop policy "food_logs: family crud" on food_logs;
create policy "food_logs: family crud" on food_logs for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id));

-- kid_wallet_transactions.member_id
drop policy "kid_wallet_transactions: family crud" on kid_wallet_transactions;
create policy "kid_wallet_transactions: family crud" on kid_wallet_transactions for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id));

-- kid_goals.member_id
drop policy "kid_goals: family crud" on kid_goals;
create policy "kid_goals: family crud" on kid_goals for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id() and private.member_in_current_family(member_id));

-- reward_redemptions.member_id
drop policy "reward_redemptions: family crud" on reward_redemptions;
create policy "reward_redemptions: family crud" on reward_redemptions for all
  using (exists (select 1 from rewards r where r.id = reward_id and r.family_id = private.current_family_id()))
  with check (
    exists (select 1 from rewards r where r.id = reward_id and r.family_id = private.current_family_id())
    and private.member_in_current_family(member_id)
  );

-- automation_rules.member_id (nullable) + place_id (nullable)
drop policy "automation_rules: family crud" on automation_rules;
create policy "automation_rules: family crud" on automation_rules for all
  using (family_id = private.current_family_id())
  with check (
    family_id = private.current_family_id()
    and (member_id is null or private.member_in_current_family(member_id))
    and (place_id is null or private.place_in_current_family(place_id))
  );
