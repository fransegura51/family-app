-- Enlaza el catálogo global de cadenas (store_chains, Fase 3 de 0142) con las tiendas propias de cada
-- familia (shopping_stores), para poder mostrar nombre/logo oficiales sin duplicarlos por familia.
--
-- Aditivo y seguro: ninguna fila existente de shopping_stores cambia (chain_key nace a null en todas),
-- y logo_asset nace a null en todas las cadenas ya sembradas — el resto de la app sigue funcionando
-- exactamente igual hasta que se enlace algo a mano desde StoreManager.
--
-- ROLLBACK: supabase/rollbacks/0182_store_chains_logo_and_shopping_link_down.sql

alter table public.store_chains
  add column logo_asset text;

comment on column public.store_chains.logo_asset is
  'Identificador del logo empaquetado con la app (resuelto en el cliente, domain/storeIcons.ts). Null = sin logo propio todavía, se usa el resolutor por nombre de siempre.';

alter table public.shopping_stores
  add column chain_key text references public.store_chains(key) on update cascade;

comment on column public.shopping_stores.chain_key is
  'Vínculo opcional a una cadena global conocida (store_chains.key). Null = tienda personalizada de la familia. Nunca se asigna solo: siempre por elección explícita del usuario en StoreManager.';

create index idx_shopping_stores_chain_key on public.shopping_stores(chain_key);
