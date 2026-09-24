-- Inciso Compras — Parte B: foto OPCIONAL de un producto, para que
-- otra persona de la familia sepa exactamente cuál traer aunque no
-- sepa el nombre exacto (petición real: "Champú" con un ojo que abre
-- la foto grande). Va en `products` (la identidad reutilizable por
-- nombre normalizado, Skill 11), no en `shopping_items` (que se borra
-- al completar la compra, Fase 4 — ver src/data/shopping.ts
-- deleteShoppingItems): así la foto reaparece sola la próxima vez que
-- se añade el mismo producto a la lista, sin tener que repetirla.
--
-- Mismo patrón privado+signed-url que member-photos/recipe-photos/
-- receipts: la base de datos solo guarda el path, nunca los bytes de
-- la imagen. products ya tiene RLS por family_id (0014) que ya cubre
-- esta columna nueva — no hace falta tocar su política.
alter table products add column photo_path text;

insert into storage.buckets (id, name, public)
values ('product-photos', 'product-photos', false)
on conflict (id) do nothing;

create policy "product-photos storage: family select" on storage.objects for select
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "product-photos storage: family insert" on storage.objects for insert
  with check (bucket_id = 'product-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);

create policy "product-photos storage: family delete" on storage.objects for delete
  using (bucket_id = 'product-photos' and (storage.foldername(name))[1] = private.current_family_id()::text);
