-- Sincronización entre dispositivos: publica en Realtime las tablas de datos COMPARTIDOS de la familia, para que un cambio hecho en un dispositivo avise a los demás
-- sin recargar. Antes solo user_prefs estaba publicada (0305). Aditiva e idempotente: no cambia datos, políticas ni columnas.
--   · El canal solo AVISA («algo cambió en esta tabla»); la app vuelve a pedir sus datos con su sesión, así que las políticas de seguridad (RLS) siguen decidiendo qué ve
--     cada persona (un evento privado de otra persona no llega ni como aviso; los borrados solo llevan el identificador de la fila).
--   · replica identity full: para que los borrados también lleguen con la fila completa.
-- Deshacer: supabase/rollbacks/0324_realtime_family_data_down.sql.

do $$
declare
  t text;
  tables text[] := array[
    -- Cocina
    'menu_entries', 'recipes', 'recipe_ingredients',
    -- Compras
    'shopping_items', 'shopping_stores', 'shopping_trips', 'receipts',
    -- Calendario
    'calendar_events', 'calendar_event_completions', 'calendar_event_members',
    -- Economía
    'expenses', 'budgets', 'budget_categories', 'bank_transactions', 'bank_accounts', 'cash_movements', 'cash_wallets', 'forecast_payments', 'forecast_occurrences', 'purchase_payments', 'purchase_refunds', 'expense_tag_shares',
    -- Eventos
    'events', 'event_tasks', 'event_guests', 'event_budget_items', 'event_payments', 'event_providers', 'event_menu_items', 'event_decisions', 'event_moments', 'event_task_groups', 'event_special_details', 'event_tables', 'event_decoration_items', 'event_activities', 'event_provider_links', 'event_guest_members', 'event_menu_options',
    -- Pequeños Grandes
    'point_grants', 'reward_redemptions', 'rewards', 'reward_participants', 'kid_wallet_transactions', 'kid_goals', 'wishlist_items', 'wishlists',
    -- Mis listas
    'user_lists', 'list_items', 'list_folders', 'list_columns', 'list_calendar_links',
    -- Galería, Documentos, Contactos, Familia
    'gallery_photos', 'member_documents', 'contacts', 'family_members'
  ];
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array tables loop
      if to_regclass('public.' || t) is not null then
        if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
          execute format('alter publication supabase_realtime add table public.%I', t);
        end if;
        execute format('alter table public.%I replica identity full', t);
      end if;
    end loop;
  end if;
end
$$;
