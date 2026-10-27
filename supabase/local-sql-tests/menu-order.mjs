// Pruebas locales (PGlite, sin tocar ningún dato real) de la 0323 (orden propio de los platos del menú) y de la 0324 (publicación en tiempo real):
// el orden anterior se conserva, varios platos por comida, dos clientes de la misma familia ven los cambios del otro, otra familia no, y la 0324 no falla sin Realtime.
import assert from 'node:assert/strict'
import { setup, addAccount, mkFamily, as, read } from './harness.mjs'

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
// Esquema previo a la 0323: menu_entries tal cual la creó la 0008 (sin unicidad por día y comida) y su política de familia.
await db.exec(`
  create table recipes (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id), title text not null default 'r');
  create table menu_entries (
    id uuid primary key default gen_random_uuid(),
    family_id uuid not null references families(id) on delete cascade,
    entry_date date not null,
    meal_type text not null check (meal_type in ('desayuno','comida','merienda','cena','snack')),
    recipe_id uuid references recipes(id) on delete set null,
    free_text text,
    created_at timestamptz not null default now()
  );
  alter table menu_entries enable row level security;
  create policy "menu_entries: family crud" on menu_entries for all using (family_id = private.current_family_id()) with check (family_id = private.current_family_id());
  grant select, insert, update, delete on menu_entries, recipes to authenticated;
`)
const famA = await mkFamily(db, 'A')
const famB = await mkFamily(db, 'B')
const pc = await addAccount(db, famA, 'admin', 'Ordenador')
const movil = await addAccount(db, famA, 'adult', 'Movil')
const otra = await addAccount(db, famB, 'admin', 'Otra')

// Menú «antiguo»: tres platos de la misma comida con created_at DISTINTOS y dos con el MISMO created_at (empate), anteriores a la 0323.
const ids = {}
const ins = async (key, text, ts) => (ids[key] = (await db.query(`insert into menu_entries (family_id, entry_date, meal_type, free_text, created_at) values ($1,'2026-11-02','comida',$2,$3) returning id`, [famA, text, ts])).rows[0].id)
await ins('a', 'Lentejas', '2026-10-01 10:00:00+00')
await ins('b', 'Ensalada', '2026-10-01 10:00:05+00')
await ins('c', 'Fruta', '2026-10-01 10:00:09+00')
await ins('d', 'Pan', '2026-10-01 10:00:20+00')
await ins('e', 'Queso', '2026-10-01 10:00:20+00')

console.log('\n0323 · aplicar la migración')
await db.exec(read('supabase/migrations/0323_menu_entries_sort_order.sql'))
const order = async (client, date = '2026-11-02') =>
  (await as(db, client.id, () => db.query(`select free_text from menu_entries where entry_date = $1 and meal_type = 'comida' order by sort_order, created_at, id`, [date]))).rows.map((r) => r.free_text)

await t('el orden de los platos que ya existían no cambia (ni los empatados)', async () => {
  const o = await order(pc)
  assert.deepEqual(o.slice(0, 3), ['Lentejas', 'Ensalada', 'Fruta'])
  assert.deepEqual([...o.slice(3)].sort(), ['Pan', 'Queso'])
  // el desempate queda FIJO: dos lecturas seguidas dan lo mismo
  assert.deepEqual(await order(movil), o)
})
await t('ningún plato se ha perdido ni modificado', async () => {
  const r = await db.query(`select count(*) c, count(distinct sort_order) d from menu_entries`)
  assert.equal(Number(r.rows[0].c), 5)
  assert.equal(Number(r.rows[0].d), 5) // todos con orden distinto
})
await t('una comida admite tres platos (o más) y los nuevos van detrás', async () => {
  await as(db, pc.id, () => db.query(`insert into menu_entries (family_id, entry_date, meal_type, free_text) values ($1,'2026-11-03','cena','Sopa')`, [famA]))
  await as(db, pc.id, () => db.query(`insert into menu_entries (family_id, entry_date, meal_type, free_text) values ($1,'2026-11-03','cena','Tortilla')`, [famA]))
  await as(db, movil.id, () => db.query(`insert into menu_entries (family_id, entry_date, meal_type, free_text) values ($1,'2026-11-03','cena','Yogur')`, [famA]))
  const r = (await as(db, pc.id, () => db.query(`select free_text from menu_entries where entry_date='2026-11-03' order by sort_order, created_at, id`))).rows.map((x) => x.free_text)
  assert.deepEqual(r, ['Sopa', 'Tortilla', 'Yogur'])
})
await t('reordenar un plato (cambiar solo su sort_order) no toca a los demás', async () => {
  const before = (await db.query(`select id, sort_order, free_text from menu_entries where entry_date='2026-11-03'`)).rows
  const yogur = before.find((x) => x.free_text === 'Yogur')
  const sopa = before.find((x) => x.free_text === 'Sopa')
  await as(db, movil.id, () => db.query(`update menu_entries set sort_order = $1 where id = $2`, [BigInt(sopa.sort_order) - 1n, yogur.id]))
  const r = (await as(db, pc.id, () => db.query(`select free_text from menu_entries where entry_date='2026-11-03' order by sort_order, created_at, id`))).rows.map((x) => x.free_text)
  assert.deepEqual(r, ['Yogur', 'Sopa', 'Tortilla'])
  const after = (await db.query(`select id, sort_order from menu_entries where entry_date='2026-11-03'`)).rows
  for (const b of before.filter((x) => x.free_text !== 'Yogur')) assert.equal(String(after.find((x) => x.id === b.id).sort_order), String(b.sort_order))
})
await t('dos dispositivos de la misma familia ven los cambios del otro; otra familia no ve nada', async () => {
  await as(db, movil.id, () => db.query(`insert into menu_entries (family_id, entry_date, meal_type, free_text) values ($1,'2026-11-04','comida','Hecho en el móvil')`, [famA]))
  const verPc = (await as(db, pc.id, () => db.query(`select free_text from menu_entries where entry_date='2026-11-04'`))).rows.length
  assert.equal(verPc, 1)
  await as(db, pc.id, () => db.query(`delete from menu_entries where free_text = 'Hecho en el móvil'`))
  assert.equal((await as(db, movil.id, () => db.query(`select 1 from menu_entries where entry_date='2026-11-04'`))).rows.length, 0)
  assert.equal((await as(db, otra.id, () => db.query(`select 1 from menu_entries`))).rows.length, 0)
})
await t('otra familia no puede insertar ni reordenar platos ajenos', async () => {
  const e = await as(db, otra.id, () => db.query(`insert into menu_entries (family_id, entry_date, meal_type, free_text) values ($1,'2026-11-05','comida','intruso')`, [famA])).then(
    () => null,
    (x) => String(x.message),
  )
  assert.ok(e, 'debía rechazarse')
  const r = await as(db, otra.id, () => db.query(`update menu_entries set sort_order = 1 where family_id = $1 returning 1`, [famA]))
  assert.equal(r.rows.length, 0)
})
await t('duplicar un día copia todos los platos en el mismo orden con identificadores nuevos y sin tocar el original', async () => {
  const src = (await db.query(`select id, free_text, recipe_id, meal_type from menu_entries where entry_date='2026-11-02' order by sort_order, created_at, id`)).rows
  let so = 5_000_000_000_000_000n
  for (const s of src) await as(db, pc.id, () => db.query(`insert into menu_entries (family_id, entry_date, meal_type, recipe_id, free_text, sort_order) values ($1,'2026-11-09',$2,$3,$4,$5)`, [famA, s.meal_type, s.recipe_id, s.free_text, (so += 1n)]))
  assert.deepEqual(await order(pc, '2026-11-09'), await order(pc, '2026-11-02'))
  const orig = (await db.query(`select id from menu_entries where entry_date='2026-11-02'`)).rows.map((x) => x.id).sort()
  assert.deepEqual(orig, Object.values(ids).sort())
})

console.log('\n0324 · publicación en tiempo real (aquí no existe Realtime: no debe fallar ni tocar nada)')
await t('se aplica sin error cuando no hay publicación supabase_realtime', async () => {
  await db.exec(read('supabase/migrations/0324_realtime_family_data.sql'))
})
await t('con publicación: añade las tablas que existen, es idempotente y activa replica identity full', async () => {
  await db.exec(`create publication supabase_realtime;`)
  await db.exec(read('supabase/migrations/0324_realtime_family_data.sql'))
  await db.exec(read('supabase/migrations/0324_realtime_family_data.sql'))
  const pub = (await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)).rows.map((r) => r.tablename)
  assert.ok(pub.includes('menu_entries') && pub.includes('recipes'))
  assert.ok(!pub.includes('profiles'), 'no publica tablas privadas de cuentas')
  const rep = (await db.query(`select relreplident from pg_class where relname='menu_entries'`)).rows[0].relreplident
  assert.equal(rep, 'f')
})
await t('el deshacer de la 0324 y el de la 0323 dejan todo como antes', async () => {
  await db.exec(read('supabase/rollbacks/0324_realtime_family_data_down.sql'))
  const pub = (await db.query(`select tablename from pg_publication_tables where pubname='supabase_realtime'`)).rows.map((r) => r.tablename)
  assert.ok(!pub.includes('menu_entries'))
  await db.exec(read('supabase/rollbacks/0323_menu_entries_sort_order_down.sql'))
  const cols = (await db.query(`select column_name from information_schema.columns where table_name='menu_entries'`)).rows.map((r) => r.column_name)
  assert.ok(!cols.includes('sort_order'))
  assert.equal(Number((await db.query(`select count(*) c from menu_entries`)).rows[0].c) > 0, true)
})

console.log(`\n${passed} pasadas, ${failed.length} fallidas`)
if (failed.length) process.exit(1)
