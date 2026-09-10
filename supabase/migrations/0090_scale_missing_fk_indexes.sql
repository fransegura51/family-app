-- Petición real: "si hay algo más que tengas que preparar para que en
-- el futuro no falle con muchos usuarios hazlo también" — preparación
-- de escala, parte 1: índices que faltaban.
--
-- Postgres NO crea índices por sí solo en las claves foráneas (a
-- diferencia de MySQL). Sin índice en la columna hija, cada borrado o
-- cambio en la tabla padre (una familia, un evento, un perfil...)
-- obliga a recorrer la tabla hija ENTERA para comprobar referencias, y
-- cada consulta filtrada por esa columna hace lo mismo. Con pocas
-- familias no se nota; con miles, cada una de esas operaciones se
-- vuelve proporcional al tamaño total de la tabla en vez de al de la
-- familia.
--
-- Lista calculada contra el esquema real: toda columna que sea clave
-- foránea o columna de inquilino (family_id/member_id/profile_id/
-- user_id) sin ningún índice cuya PRIMERA columna sea ella. Los
-- family_id son los que más importan: son el filtro de todas las
-- políticas RLS.

-- family_id sin índice (filtro de RLS en cada consulta)
create index if not exists idx_body_measurements_family on body_measurements(family_id);
create index if not exists idx_body_photos_family on body_photos(family_id);
create index if not exists idx_budget_categories_family on budget_categories(family_id);
create index if not exists idx_google_calendar_credentials_family on google_calendar_credentials(family_id);
create index if not exists idx_kid_goals_family on kid_goals(family_id);
create index if not exists idx_kid_wallet_transactions_family on kid_wallet_transactions(family_id);
create index if not exists idx_location_sharing_consent_family on location_sharing_consent(family_id);
create index if not exists idx_member_location_history_family on member_location_history(family_id);
create index if not exists idx_member_locations_family on member_locations(family_id);
create index if not exists idx_member_place_visits_family on member_place_visits(family_id);
create index if not exists idx_profiles_family on profiles(family_id);

-- member_id / profile_id sin índice
create index if not exists idx_automation_rules_member on automation_rules(member_id);
create index if not exists idx_calendar_event_completions_member on calendar_event_completions(member_id);
create index if not exists idx_calendar_event_members_member on calendar_event_members(member_id);
create index if not exists idx_external_calendar_feeds_member on external_calendar_feeds(member_id);
create index if not exists idx_food_logs_member on food_logs(member_id);
create index if not exists idx_shopping_trips_member on shopping_trips(member_id);
create index if not exists idx_profile_webauthn_credentials_profile on profile_webauthn_credentials(profile_id);
create index if not exists idx_suggestions_profile on suggestions(profile_id);

-- Resto de claves foráneas sin índice (comprobación de referencias al
-- borrar el padre, y joins en políticas RLS)
create index if not exists idx_activity_log_actor on activity_log(actor_id);
create index if not exists idx_automation_rules_place on automation_rules(place_id);
create index if not exists idx_bank_connections_connected_by on bank_connections(connected_by);
create index if not exists idx_bank_transactions_matched_expense on bank_transactions(matched_expense_id);
create index if not exists idx_calendar_event_reminders_event on calendar_event_reminders(event_id);
create index if not exists idx_calendar_events_created_by on calendar_events(created_by);
create index if not exists idx_calendar_events_google_source_member on calendar_events(google_source_member_id);
create index if not exists idx_family_members_linked_profile on family_members(linked_profile_id);
create index if not exists idx_gallery_photos_uploaded_by on gallery_photos(uploaded_by);
create index if not exists idx_google_calendar_credentials_connected_by on google_calendar_credentials(connected_by);
create index if not exists idx_member_documents_calendar_event on member_documents(calendar_event_id);
create index if not exists idx_menu_entries_recipe on menu_entries(recipe_id);
create index if not exists idx_overdue_nag_deliveries_subscription on overdue_nag_deliveries(subscription_id);
create index if not exists idx_receipts_expense on receipts(expense_id);
create index if not exists idx_reminder_deliveries_subscription on reminder_deliveries(subscription_id);
create index if not exists idx_reward_redemptions_reward on reward_redemptions(reward_id);
create index if not exists idx_shopping_trips_calendar_event on shopping_trips(calendar_event_id);
