-- Rollback de 0229_pequenos_grandes_rewards_approval.sql.
revoke all on function request_reward_redemption(uuid, uuid) from authenticated;
drop function if exists request_reward_redemption(uuid, uuid);

drop table if exists point_grants;

drop policy if exists "reward_redemptions: adult decide" on reward_redemptions;
drop policy if exists "reward_redemptions: member request" on reward_redemptions;
drop policy if exists "reward_redemptions: family select" on reward_redemptions;
create policy "reward_redemptions: family crud" on reward_redemptions for all
  using (exists (select 1 from rewards r where r.id = reward_id and r.family_id = private.current_family_id()))
  with check (exists (select 1 from rewards r where r.id = reward_id and r.family_id = private.current_family_id()));

drop policy if exists "rewards: adult delete" on rewards;
drop policy if exists "rewards: adult update" on rewards;
drop policy if exists "rewards: adult insert" on rewards;
drop policy if exists "rewards: family select" on rewards;
create policy "rewards: family crud" on rewards for all
  using (family_id = private.current_family_id())
  with check (family_id = private.current_family_id());

alter table reward_redemptions drop column if exists enjoyed_at;
alter table reward_redemptions drop column if exists decided_at;
alter table reward_redemptions drop column if exists decided_by;
alter table reward_redemptions drop column if exists requested_by;
alter table reward_redemptions drop column if exists status;
alter table reward_redemptions drop column if exists family_id;

alter table reward_redemptions drop constraint if exists reward_redemptions_reward_id_fkey;
alter table reward_redemptions add constraint reward_redemptions_reward_id_fkey foreign key (reward_id) references rewards(id) on delete cascade;

alter table reward_redemptions drop column if exists reward_emoji;
alter table reward_redemptions drop column if exists reward_title;

alter table rewards drop column if exists active;
alter table rewards drop column if exists description;
alter table rewards drop column if exists emoji;
