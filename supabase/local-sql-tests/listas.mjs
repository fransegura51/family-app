// Pruebas locales (PGlite, sin tocar ningún dato real) de la migración 0319: Mis listas (privacidad real, carpetas,
// vínculos con Calendario, envío a Compras y sincronización Compras → Mis listas).
import assert from 'node:assert/strict'
import { setup, addAccount, mkFamily, as, err, read } from './harness.mjs'

let passed = 0
const failed = []
async function t(name, fn) {
  try {
    await fn()
    passed++
    console.log('  ✓', name)
  } catch (e) {
    failed.push(name)
    console.log('  ✗', name, '\n     ', String(e.message).split('\n').slice(0, 4).join('\n      '))
  }
}

const db = await setup({ onlyBase: true })
const m70 = read('supabase/migrations/0070_guest_users.sql')
const h0 = m70.indexOf('create or replace function private.has_section_access')
await db.exec(m70.slice(h0, m70.indexOf('$$;', h0) + 3))
await db.exec(`
  grant execute on function private.has_section_access(text) to authenticated;
  -- Tablas que la migración enlaza (esquema mínimo; en producción son las reales).
  create table calendar_events (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), title text not null default 'x', created_by uuid);
  alter table calendar_events enable row level security;
  create policy ce on calendar_events for all using (family_id = private.current_family_id());
  create table shopping_items (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), name text not null, status text not null default 'pendiente', updated_at timestamptz not null default now());
  alter table shopping_items enable row level security;
  create policy si on shopping_items for all using (family_id = private.current_family_id());
  grant select, insert, update, delete on calendar_events, shopping_items to authenticated;
`)
console.log('\n0319 · aplicar la migración')
await db.exec(read('supabase/pending-migrations/0319_mis_listas.sql'))
await db.exec('grant select, insert, update, delete on list_folders, user_lists, list_columns, list_items, list_calendar_links, list_shopping_links to authenticated')

const fam = await mkFamily(db, 'A')
const other = await mkFamily(db, 'B')
const ana = await addAccount(db, fam, 'admin', 'Ana')
const beto = await addAccount(db, fam, 'adult', 'Beto')
const nico = await addAccount(db, fam, 'child', 'Nico', 'child')
const cris = await addAccount(db, other, 'admin', 'Cris')
await db.query(`update profiles set allowed_sections = array['calendario'] where id = $1`, [nico.id])

const q = (user, sql, p = []) => as(db, user.id, () => db.query(sql, p))
const mkList = async (user, title, vis = 'privada', folder = null) =>
  (await q(user, `insert into user_lists (family_id, title, visibility, folder_id) values ($1,$2,$3,$4) returning id`, [user === cris ? other : fam, title, vis, folder])).rows[0].id
const addItem = async (user, list, text, extra = {}) =>
  (await q(user, `insert into list_items (list_id, family_id, text, rich, depth) values ($1,$2,$3,$4,$5) returning id`, [list, user === cris ? other : fam, text, extra.rich ?? null, extra.depth ?? 0])).rows[0].id
const count = async (user, table, where = 'true') => Number((await q(user, `select count(*) c from ${table} where ${where}`)).rows[0].c)

await t('una lista privada solo la ve su dueña; la familiar la ven los miembros con la sección', async () => {
  const priv = await mkList(ana, 'Privada de Ana')
  const fami = await mkList(ana, 'Familiar de Ana', 'familiar')
  assert.equal(await count(ana, 'user_lists', `id in ('${priv}','${fami}')`), 2)
  assert.equal(await count(beto, 'user_lists', `id in ('${priv}','${fami}')`), 1)
  assert.equal(await count(cris, 'user_lists'), 0)
})

await t('los elementos de una lista privada no se ven ni se pueden crear por otra persona', async () => {
  const priv = await mkList(ana, 'P2')
  await addItem(ana, priv, 'secreto')
  assert.equal(await count(beto, 'list_items', `list_id = '${priv}'`), 0)
  assert.ok(await err(() => addItem(beto, priv, 'intruso')))
})

await t('en una familiar todos editan elementos, pero solo la dueña cambia o borra la lista', async () => {
  const fami = await mkList(ana, 'Compartida', 'familiar')
  const it = await addItem(beto, fami, 'de Beto')
  await q(ana, `update list_items set done = true where id = $1`, [it])
  assert.equal(await count(beto, 'list_items', `id = '${it}' and done and done_at is not null`), 1)
  await q(beto, `update user_lists set title = 'Robada' where id = $1`, [fami])
  assert.equal(await count(ana, 'user_lists', `id = '${fami}' and title = 'Compartida'`), 1)
  await q(beto, `delete from user_lists where id = $1`, [fami])
  assert.equal(await count(ana, 'user_lists', `id = '${fami}'`), 1)
})

await t('pasar privada → familiar → privada no pierde elementos', async () => {
  const l = await mkList(ana, 'Cambia')
  await addItem(ana, l, 'uno', { rich: '<b>uno</b>' })
  await q(ana, `update user_lists set visibility = 'familiar' where id = $1`, [l])
  assert.equal(await count(beto, 'list_items', `list_id = '${l}'`), 1)
  await q(ana, `update user_lists set visibility = 'privada' where id = $1`, [l])
  assert.equal(await count(beto, 'list_items', `list_id = '${l}'`), 0)
  assert.equal(await count(ana, 'list_items', `list_id = '${l}' and rich = '<b>uno</b>'`), 1)
})

await t('quien no tiene la sección «listas» no ve nada, ni lo familiar', async () => {
  const fami = await mkList(ana, 'Solo con sección', 'familiar')
  assert.equal(await count(nico, 'user_lists', `id = '${fami}'`), 0)
  assert.ok(await err(() => mkList(nico, 'no')))
})

await t('las carpetas son de su dueña: nadie más las ve ni cuelga listas de ellas', async () => {
  const f = (await q(ana, `insert into list_folders (family_id, name) values ($1,'Colegio') returning id`, [fam])).rows[0].id
  assert.equal(await count(beto, 'list_folders'), 0)
  assert.ok(await err(() => mkList(beto, 'En carpeta ajena', 'privada', f)))
  const l = await mkList(ana, 'En mi carpeta', 'familiar', f)
  assert.equal(await count(beto, 'user_lists', `id = '${l}'`), 1) // ver la lista no da acceso a la carpeta
  assert.equal(await count(beto, 'list_folders'), 0)
  // Borrar la carpeta no borra la lista
  await q(ana, `delete from list_folders where id = $1`, [f])
  assert.equal(await count(ana, 'user_lists', `id = '${l}' and folder_id is null`), 1)
})

await t('el texto con formato inseguro no entra en la base de datos', async () => {
  const l = await mkList(ana, 'Rich')
  assert.ok(await err(() => addItem(ana, l, 'x', { rich: '<script>alert(1)</script>' })))
  assert.ok(await err(() => addItem(ana, l, 'x', { rich: '<img src=x>' })))
  await addItem(ana, l, 'ok', { rich: '<b>a</b> <c:rojo>b</c> &lt;' })
})

await t('profundidad máxima de dos niveles', async () => {
  const l = await mkList(ana, 'Niveles')
  assert.ok(await err(() => addItem(ana, l, 'x', { depth: 2 })))
})

await t('vínculos con el Calendario: solo se ven si se ve la lista; borrar el evento quita el vínculo y no la lista', async () => {
  const ev = (await q(ana, `insert into calendar_events (family_id) values ($1) returning id`, [fam])).rows[0].id
  const priv = await mkList(ana, 'Vinculada privada')
  const fami = await mkList(ana, 'Vinculada familiar', 'familiar')
  await q(ana, `insert into list_calendar_links (list_id, event_id, family_id) values ($1,$2,$3), ($4,$2,$3)`, [priv, ev, fam, fami])
  assert.equal(await count(ana, 'list_calendar_links', `event_id = '${ev}'`), 2)
  assert.equal(await count(beto, 'list_calendar_links', `event_id = '${ev}'`), 1) // la privada no se delata
  assert.ok(await err(() => q(beto, `insert into list_calendar_links (list_id, event_id, family_id) values ($1,$2,$3)`, [priv, ev, fam])))
  await db.query(`delete from calendar_events where id = $1`, [ev])
  assert.equal(await count(ana, 'user_lists', `id in ('${priv}','${fami}')`), 2)
  assert.equal(await count(ana, 'list_calendar_links'), 0)
})

await t('sustituir elementos es atómico y respeta la privacidad', async () => {
  const l = await mkList(ana, 'Sustituir')
  await addItem(ana, l, 'viejo 1')
  await addItem(ana, l, 'viejo 2')
  const n = (await q(ana, `select replace_list_items($1, $2::jsonb) n`, [l, JSON.stringify([{ text: 'nuevo A' }, { text: '  ' }, { text: 'nuevo B', depth: 1, rich: '<b>nuevo B</b>' }])])).rows[0].n
  assert.equal(n, 2)
  assert.equal(await count(ana, 'list_items', `list_id = '${l}' and text like 'nuevo%'`), 2)
  assert.ok(await err(() => q(beto, `select replace_list_items($1, '[]'::jsonb)`, [l])))
  // un fallo a mitad no deja la lista a medias (rich inseguro): se conserva lo anterior
  assert.ok(await err(() => q(ana, `select replace_list_items($1, $2::jsonb)`, [l, JSON.stringify([{ text: 'a' }, { text: 'b', rich: '<script>' }])])))
  assert.equal(await count(ana, 'list_items', `list_id = '${l}' and text like 'nuevo%'`), 2)
})

await t('enviar a Compras: crea productos pendientes con vínculo; lo comprado marca el elemento, pero al revés no', async () => {
  const l = await mkList(ana, 'Para la compra')
  const a = await addItem(ana, l, 'Leche')
  const b = await addItem(ana, l, 'Pan')
  const n = (await q(ana, `select enviar_a_compras($1::jsonb) n`, [JSON.stringify([{ item_id: a, name: 'Leche' }, { item_id: b, name: 'Pan' }])])).rows[0].n
  assert.equal(n, 2)
  const prod = (await q(ana, `select s.id from shopping_items s join list_shopping_links k on k.shopping_item_id = s.id where k.list_item_id = $1`, [a])).rows[0].id
  // comprado en Compras → hecho en Mis listas
  await q(beto, `update shopping_items set status = 'comprado' where id = $1`, [prod])
  assert.equal(await count(ana, 'list_items', `id = '${a}' and done`), 1)
  // volver a pendiente en Compras → pendiente en Mis listas
  await q(beto, `update shopping_items set status = 'pendiente' where id = $1`, [prod])
  assert.equal(await count(ana, 'list_items', `id = '${a}' and not done`), 1)
  // hecho en Mis listas NO toca Compras
  await q(ana, `update list_items set done = true where id = $1`, [a])
  assert.equal(await count(ana, 'shopping_items', `id = '${prod}' and status = 'pendiente'`), 1)
  // renombrar en Compras no rompe el vínculo; borrar el producto deja el elemento hecho
  await q(ana, `update shopping_items set name = 'Leche entera' where id = $1`, [prod])
  assert.equal(await count(ana, 'list_shopping_links', `shopping_item_id = '${prod}'`), 1)
  await q(ana, `delete from shopping_items where id = $1`, [prod])
  assert.equal(await count(ana, 'list_items', `id = '${a}' and done`), 1)
  assert.equal(await count(ana, 'list_shopping_links', `list_item_id = '${a}'`), 0)
})

await t('no se puede enviar a Compras un elemento de una lista privada ajena ni sin acceso a Compras', async () => {
  const l = await mkList(ana, 'Privada envío')
  const a = await addItem(ana, l, 'Secreto')
  assert.ok(await err(() => q(beto, `select enviar_a_compras($1::jsonb)`, [JSON.stringify([{ item_id: a, name: 'Secreto' }])])))
  const fami = await mkList(ana, 'Familiar envío', 'familiar')
  const c = await addItem(ana, fami, 'X')
  await db.query(`update profiles set allowed_sections = array['listas'] where id = $1`, [beto.id])
  assert.ok(await err(() => q(beto, `select enviar_a_compras($1::jsonb)`, [JSON.stringify([{ item_id: c, name: 'X' }])])))
  await db.query(`update profiles set allowed_sections = null where id = $1`, [beto.id])
})

await t('otra familia no ve ni toca nada', async () => {
  assert.equal(await count(cris, 'list_items'), 0)
  assert.equal(await count(cris, 'list_shopping_links'), 0)
})

await t('borrar una lista borra sus elementos y columnas, nada más', async () => {
  const l = await mkList(ana, 'Borrable', 'familiar')
  const col = (await q(ana, `insert into list_columns (list_id, title) values ($1,'Pros') returning id`, [l])).rows[0].id
  await addItem(ana, l, 'a')
  await q(ana, `delete from user_lists where id = $1`, [l])
  assert.equal(await count(ana, 'list_items', `list_id = '${l}'`), 0)
  assert.equal(await count(ana, 'list_columns', `id = '${col}'`), 0)
})

console.log(`\n${passed} pasadas, ${failed.length} fallidas`)
if (failed.length) process.exit(1)
