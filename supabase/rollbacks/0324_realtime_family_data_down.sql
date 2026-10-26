-- Deshace 0324: quita de la publicación Realtime las tablas añadidas (user_prefs se queda: es de la 0305). No toca datos. replica identity vuelve a su valor por defecto.
do $$
declare
  t text;
  tables text[] := array[
    'menu_entries', 'recipes', 'recipe_ingredients',
    'shopping_items', 'shopping_stores', 'shopping_trips', 'receipts',
    'calendar_events', 'calendar_event_completions', 'calendar_event_members',
    'expenses', 'budgets', 'budget_categories', 'bank_transactions', 'bank_accounts', 'cash_movements', 'cash_wallets', 'forecast_payments', 'forecast_occurrences', 'purchase_payments', 'purchase_refunds', 'expense_tag_shares',
    'events', 'event_tasks', 'event_guests', 'event_budget_items', 'event_payments', 'event_providers', 'event_menu_items', 'event_decisions', 'event_moments', 'event_task_groups', 'event_special_details', 'event_tables', 'event_decoration_items', 'event_activities', 'event_provider_links', 'event_guest_members', 'event_menu_options',
    'point_grants', 'reward_redemptions', 'rewards', 'reward_participants', 'kid_wallet_transactions', 'kid_goals', 'wishlist_items', 'wishlists',
    'user_lists', 'list_items', 'list_folders', 'list_columns', 'list_calendar_links',
    'gallery_photos', 'member_documents', 'contacts', 'family_members'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array tables loop
      if to_regclass('public.' || t) is not null then
        if exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
          execute format('alter publication supabase_realtime drop table public.%I', t);
        end if;
        execute format('alter table public.%I replica identity default', t);
      end if;
    end loop;
  end if;
end
$$;
