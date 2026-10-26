-- Deshace 0323: quita el orden propio de los platos del menú (vuelve a ordenarse por created_at, como antes). No borra platos.
drop index if exists public.idx_menu_entries_family_slot_order;
alter table public.menu_entries drop column if exists sort_order;
