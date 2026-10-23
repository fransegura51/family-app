// Pruebas locales (PGlite, sin tocar ningún dato real) de la migración PENDIENTE 0310: Soporte técnico (incidencias, mensajes, adjuntos privados, historial y avisos).
// Aplican la migración REAL de supabase/pending-migrations y comprueban cada regla en el servidor: quién ve qué (RLS), que nadie escribe directamente en las tablas, límites,
// minimización del contexto, estados, notas internas, avisos sin duplicados y las políticas del almacenamiento privado.
import assert from 'node:assert/strict'
import { setup, addAccount, mkFamily, as, asAnon, err, read } from './harness.mjs'

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
const has = (msg, text) => assert.ok(msg && msg.includes(text), `se esperaba «${text}» y fue: ${msg}`)

const db = await setup({ onlyBase: true })

// ---- lo que 0310 da por existente en producción (simulado) -------------------------------------------------------------
await db.exec(`
  create function public.am_i_app_owner() returns boolean language sql security definer stable set search_path = public as $$ select coalesce((select is_app_owner from profiles where id = auth.uid()), false) $$;
  grant execute on function public.am_i_app_owner() to authenticated;
  create table public.notif_log (id serial primary key, profile uuid, bucket text, category text, title text, body text, url text, dedupe text, unique (profile, dedupe));
  create function private.notify_user(p_profile uuid, p_bucket text, p_category text, p_title text, p_body text, p_url text default null, p_group_key text default null, p_dedupe_key text default null, p_push boolean default true, p_payload jsonb default '{}'::jsonb)
  returns uuid language plpgsql security definer set search_path = '' as $$
  declare v int;
  begin
    insert into public.notif_log (profile, bucket, category, title, body, url, dedupe) values (p_profile, p_bucket, p_category, p_title, p_body, p_url, p_dedupe_key) on conflict do nothing returning id into v;
    return null;
  end $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$ declare p text[]; begin p := string_to_array(name, '/'); return p[1:array_length(p, 1) - 1]; end $$;
  alter table storage.objects enable row level security;
  grant usage on schema storage to authenticated;
  grant select, insert on storage.objects to authenticated;
`)

console.log('\n0310 · aplicar la migración pendiente')
await db.exec(read('supabase/pending-migrations/0310_support_tickets.sql'))

const famA = await mkFamily(db, 'A')
const famB = await mkFamily(db, 'B')
const ana = await addAccount(db, famA, 'admin', 'Ana') // administradora de familia (NO administración de PEPA)
const beto = await addAccount(db, famA, 'adult', 'Beto')
const cris = await addAccount(db, famB, 'admin', 'Cris')
const owner1 = await addAccount(db, famB, 'admin', 'Dueña Uno', 'admin', { owner: true })
const owner2 = await addAccount(db, famB, 'admin', 'Dueña Dos', 'admin', { owner: true })

const rpc = (user, fn, ...args) => as(db, user.id, async () => (await db.query(`select public.${fn}(${args.map((_, i) => '$' + (i + 1)).join(', ')}) as r`, args)).rows[0].r)
const create = (user, kind = 'tecnico', subject = 'El ticket no lee bien', body = 'Cuenta algo', ctx = {}) => rpc(user, 'support_create_ticket', kind, 'compras', subject, body, JSON.stringify(ctx))
const select = (user, sql, params = []) => as(db, user.id, async () => (await db.query(sql, params)).rows)
const notifs = async (profile, like = '%') => (await db.query(`select * from notif_log where profile = $1 and dedupe like $2 order by id`, [profile, like])).rows

console.log('\nCrear incidencias')
let ticketAna
await t('una persona crea una incidencia: queda recibida, con su mensaje y el historial «created»', async () => {
  ticketAna = await create(ana)
  const tk = (await db.query('select * from support_tickets where id = $1', [ticketAna])).rows[0]
  assert.equal(tk.status, 'recibida')
  assert.equal(tk.requester_id, ana.id)
  assert.equal(tk.family_id, famA)
  assert.equal(tk.message_count, 1)
  assert.equal(tk.admin_unread, true)
  const msgs = (await db.query('select * from support_messages where ticket_id = $1', [ticketAna])).rows
  assert.equal(msgs.length, 1)
  assert.equal(msgs[0].author_kind, 'user')
  assert.equal(msgs[0].visibility, 'public')
  const ev = (await db.query('select event, visible_to_user from support_ticket_events where ticket_id = $1', [ticketAna])).rows
  assert.deepEqual(ev.map((e) => e.event), ['created'])
})
await t('avisa a las DOS cuentas propietarias (y a nadie más), con enlace a la administración', async () => {
  const n1 = await notifs(owner1.id)
  const n2 = await notifs(owner2.id)
  assert.equal(n1.length, 1)
  assert.equal(n2.length, 1)
  assert.ok(n1[0].url.includes('/administracion') && n1[0].url.includes(ticketAna))
  assert.equal((await notifs(ana.id)).length, 0)
  assert.equal((await notifs(cris.id)).length, 0)
})
await t('MINIMIZACIÓN: solo se guardan las claves permitidas del contexto, y recortadas', async () => {
  const id = await create(beto, 'error', 'Contexto', 'x', { app_version: 'abc1234', os: 'iOS', email: 'beto@correo.es', nombre: 'Beto', texto_escrito: 'secreto', device: 'x'.repeat(300), nested: { a: 1 } })
  const ctx = (await db.query('select context from support_tickets where id = $1', [id])).rows[0].context
  assert.deepEqual(Object.keys(ctx).sort(), ['app_version', 'device', 'os'])
  assert.equal(ctx.device.length, 80)
})
await t('validación: título corto, texto vacío, tipo o sección inválidos', async () => {
  has(await err(() => create(ana, 'tecnico', 'ab')), 'INVALID_SUBJECT')
  has(await err(() => create(ana, 'tecnico', 'Título bueno', '   ')), 'INVALID_BODY')
  has(await err(() => create(ana, 'cualquiera')), 'INVALID_KIND')
  has(await err(() => rpc(ana, 'support_create_ticket', 'tecnico', 'Mal Id!', 'Título', 'x', '{}')), 'INVALID_SECTION')
})
await t('límite diario: la sexta incidencia en 24 horas se rechaza', async () => {
  const p = await addAccount(db, famA, 'adult', 'Pesada')
  for (let i = 0; i < 5; i++) await create(p, 'otra', `Incidencia ${i}`, 'x')
  has(await err(() => create(p, 'otra', 'Una más', 'x')), 'RATE_LIMIT')
})
await t('sin sesión no se puede crear', async () => {
  has(await err(() => asAnon(db, () => db.query(`select public.support_create_ticket('otra','compras','Título','x','{}')`))), 'permission denied')
})

console.log('\nQuién ve qué (RLS)')
await t('cada persona ve SOLO sus incidencias: ni la otra familia ni alguien de su misma familia', async () => {
  assert.equal((await select(ana, 'select id from support_tickets where id = $1', [ticketAna])).length, 1)
  assert.equal((await select(beto, 'select id from support_tickets where id = $1', [ticketAna])).length, 0) // misma familia
  assert.equal((await select(cris, 'select id from support_tickets where id = $1', [ticketAna])).length, 0) // otra familia
  assert.equal((await select(beto, 'select id from support_messages where ticket_id = $1', [ticketAna])).length, 0)
  assert.equal((await select(cris, 'select id from support_ticket_events where ticket_id = $1', [ticketAna])).length, 0)
})
await t('la administración de PEPA ve todas; la administradora de FAMILIA no ve las ajenas', async () => {
  assert.ok((await select(owner1, 'select id from support_tickets')).length >= 2)
  const adminFamily = await select(ana, 'select id from support_tickets')
  assert.ok(adminFamily.every((r) => true))
  assert.equal((await select(ana, `select id from support_tickets where requester_id = $1`, [beto.id])).length, 0)
})
await t('anónimo: sin acceso a las tablas', async () => {
  has(await err(() => asAnon(db, () => db.query('select * from support_tickets'))), 'permission denied')
})
await t('NADIE escribe directamente en las tablas (solo las funciones del servidor)', async () => {
  for (const sql of [
    `insert into support_tickets (requester_id, family_id, kind, subject) values ('${ana.id}','${famA}','otra','Directo')`,
    `update support_tickets set status = 'cerrada' where id = '${ticketAna}'`,
    `delete from support_tickets where id = '${ticketAna}'`,
    `insert into support_messages (ticket_id, author_kind, body) values ('${ticketAna}','user','directo')`,
    `update support_messages set body = 'editado' where ticket_id = '${ticketAna}'`,
    `insert into support_ticket_events (ticket_id, actor_kind, event) values ('${ticketAna}','user','message')`,
  ]) {
    has(await err(() => as(db, ana.id, () => db.query(sql))), 'permission denied')
    has(await err(() => as(db, owner1.id, () => db.query(sql))), 'permission denied') // ni siquiera la administración
  }
})

console.log('\nConversación')
await t('la administración responde: la persona lo ve, se marca sin leer y recibe aviso; pasa a «en revisión»', async () => {
  const mid = await rpc(owner1, 'support_admin_reply', ticketAna, 'Hola Ana, lo miramos.', false, null)
  assert.ok(mid)
  const tk = (await db.query('select * from support_tickets where id = $1', [ticketAna])).rows[0]
  assert.equal(tk.status, 'en_revision')
  assert.equal(tk.user_unread, true)
  assert.equal(tk.admin_unread, false)
  assert.ok(tk.first_admin_reply_at)
  assert.equal((await select(ana, `select id from support_messages where ticket_id = $1 and author_kind = 'admin'`, [ticketAna])).length, 1)
  assert.equal((await notifs(ana.id)).length, 1)
})
await t('NOTA INTERNA: la persona no la ve, no recibe aviso y el estado no cambia', async () => {
  const before = (await notifs(ana.id)).length
  await rpc(owner1, 'support_admin_reply', ticketAna, 'Nota: parece el bug conocido.', true, 'cerrada')
  assert.equal((await select(ana, `select id from support_messages where ticket_id = $1 and visibility = 'internal'`, [ticketAna])).length, 0)
  assert.equal((await select(owner2, `select id from support_messages where ticket_id = $1 and visibility = 'internal'`, [ticketAna])).length, 1)
  assert.equal((await notifs(ana.id)).length, before)
  assert.equal((await db.query('select status from support_tickets where id = $1', [ticketAna])).rows[0].status, 'en_revision')
})
await t('el historial visible para la persona no incluye gestión interna (asignación, prioridad, notas)', async () => {
  await rpc(owner1, 'support_admin_assign', ticketAna, owner2.id)
  await rpc(owner1, 'support_admin_set_priority', ticketAna, 'alta')
  const mine = (await select(ana, 'select event from support_ticket_events where ticket_id = $1', [ticketAna])).map((r) => r.event)
  for (const hidden of ['assigned', 'priority_changed', 'note_added']) assert.ok(!mine.includes(hidden), hidden)
  const all = (await select(owner1, 'select event from support_ticket_events where ticket_id = $1', [ticketAna])).map((r) => r.event)
  for (const shown of ['assigned', 'priority_changed', 'note_added']) assert.ok(all.includes(shown), shown)
})
await t('la persona contesta: vuelve a pasar sin leer para la administración y avisa', async () => {
  const before = (await notifs(owner1.id)).length
  await rpc(ana, 'support_post_message', ticketAna, 'Gracias, sigue pasando.')
  const tk = (await db.query('select * from support_tickets where id = $1', [ticketAna])).rows[0]
  assert.equal(tk.admin_unread, true)
  assert.equal(tk.message_count, 3)
  assert.equal((await notifs(owner1.id)).length, before + 1)
})
await t('nadie más puede escribir en una incidencia ajena', async () => {
  has(await err(() => rpc(beto, 'support_post_message', ticketAna, 'intruso')), 'NOT_FOUND')
  has(await err(() => rpc(cris, 'support_post_message', ticketAna, 'intruso')), 'NOT_FOUND')
  has(await err(() => rpc(ana, 'support_post_message', ticketAna, '   ')), 'INVALID_BODY')
})
await t('esperando al usuario → al contestar vuelve a «en revisión»; resuelta → al escribir se reabre', async () => {
  await rpc(owner1, 'support_admin_set_status', ticketAna, 'esperando_usuario')
  await rpc(ana, 'support_post_message', ticketAna, 'Aquí tienes más información.')
  assert.equal((await db.query('select status from support_tickets where id = $1', [ticketAna])).rows[0].status, 'en_revision')
  await rpc(owner1, 'support_admin_set_status', ticketAna, 'resuelta')
  await rpc(ana, 'support_post_message', ticketAna, 'No, no estaba resuelto.')
  const tk = (await db.query('select status, resolved_at from support_tickets where id = $1', [ticketAna])).rows[0]
  assert.equal(tk.status, 'en_revision')
  assert.equal(tk.resolved_at, null)
  const ev = (await db.query(`select event from support_ticket_events where ticket_id = $1 and event = 'reopened'`, [ticketAna])).rows
  assert.ok(ev.length >= 1)
})
await t('confirmar la resolución: solo si está «resuelta»; sí → cerrada, no → vuelve a revisión', async () => {
  has(await err(() => rpc(ana, 'support_confirm_resolution', ticketAna, true)), 'INVALID_STATE') // está en revisión
  await rpc(owner1, 'support_admin_set_status', ticketAna, 'resuelta')
  has(await err(() => rpc(beto, 'support_confirm_resolution', ticketAna, true)), 'NOT_FOUND')
  assert.equal(await rpc(ana, 'support_confirm_resolution', ticketAna, false), 'en_revision')
  await rpc(owner1, 'support_admin_set_status', ticketAna, 'resuelta')
  assert.equal(await rpc(ana, 'support_confirm_resolution', ticketAna, true), 'cerrada')
  assert.ok((await db.query('select closed_at from support_tickets where id = $1', [ticketAna])).rows[0].closed_at)
})
await t('avisos SIN duplicados: la misma clave no avisa dos veces', async () => {
  const before = (await notifs(ana.id, 'dup:%')).length
  await db.query(`select private.support_notify_requester($1, 'T', 'B', $2, 'dup:1')`, [ana.id, ticketAna])
  await db.query(`select private.support_notify_requester($1, 'T', 'B', $2, 'dup:1')`, [ana.id, ticketAna])
  assert.equal((await notifs(ana.id, 'dup:%')).length, before + 1)
})

console.log('\nAdministración')
await t('las funciones de administración exigen ser cuenta propietaria de PEPA (ni la administradora de familia ni un adulto)', async () => {
  for (const u of [ana, beto, cris]) {
    has(await err(() => rpc(u, 'support_admin_list')), 'NOT_ADMIN')
    has(await err(() => rpc(u, 'support_admin_reply', ticketAna, 'x', false, null)), 'NOT_ADMIN')
    has(await err(() => rpc(u, 'support_admin_set_status', ticketAna, 'cerrada')), 'NOT_ADMIN')
    has(await err(() => rpc(u, 'support_admin_assign', ticketAna, owner1.id)), 'NOT_ADMIN')
    has(await err(() => rpc(u, 'support_admin_set_priority', ticketAna, 'alta')), 'NOT_ADMIN')
    has(await err(() => rpc(u, 'support_admin_similar', ticketAna)), 'NOT_ADMIN')
    has(await err(() => rpc(u, 'support_admin_stats')), 'NOT_ADMIN')
    has(await err(() => rpc(u, 'support_admin_owners')), 'NOT_ADMIN')
  }
  has(await err(() => asAnon(db, () => db.query('select * from public.support_admin_list()'))), 'permission denied')
})
await t('listado con filtros, asignación solo a cuentas propietarias, prioridad y estadísticas', async () => {
  const all = await rpc(owner1, 'support_admin_list')
  assert.ok(all.length >= 1)
  const rows = (await as(db, owner1.id, async () => (await db.query(`select * from public.support_admin_list('cerrada', null, null, null, 50)`)).rows))
  assert.ok(rows.every((r) => r.status === 'cerrada'))
  has(await err(() => rpc(owner1, 'support_admin_assign', ticketAna, ana.id)), 'INVALID_ASSIGNEE')
  has(await err(() => rpc(owner1, 'support_admin_set_priority', ticketAna, 'urgentísima')), 'INVALID_PRIORITY')
  has(await err(() => rpc(owner1, 'support_admin_set_status', ticketAna, 'rarísimo')), 'INVALID_STATUS')
  const owners = await as(db, owner1.id, async () => (await db.query('select * from public.support_admin_owners()')).rows)
  assert.equal(owners.length, 2)
  const st = await rpc(owner1, 'support_admin_stats')
  assert.ok(st.total >= 2 && st.por_estado && st.por_seccion)
})
await t('incidencias parecidas: misma sección y tipo', async () => {
  const other = await create(beto, 'tecnico', 'El ticket no lee bien los precios', 'x')
  const sim = await as(db, owner1.id, async () => (await db.query('select * from public.support_admin_similar($1)', [other])).rows)
  assert.ok(sim.some((r) => r.id === ticketAna))
})

console.log('\nAdjuntos y almacenamiento privado')
const path = (fam, ticket, name = 'a.png') => `${fam}/support/${ticket}/${name}`
let msgAna
await t('registrar un adjunto: ruta de MI familia/incidencia, tipo y tamaño permitidos, y límites', async () => {
  msgAna = (await db.query(`select id from support_messages where ticket_id = $1 and author_kind = 'user' order by created_at limit 1`, [ticketAna])).rows[0].id
  assert.ok(await rpc(ana, 'support_register_attachment', ticketAna, msgAna, path(famA, ticketAna, '1.png'), 'captura.png', 'image/png', 1000))
  has(await err(() => rpc(ana, 'support_register_attachment', ticketAna, msgAna, path(famB, ticketAna, '2.png'), 'x.png', 'image/png', 1000)), 'INVALID_PATH') // otra familia
  has(await err(() => rpc(ana, 'support_register_attachment', ticketAna, msgAna, `${famA}/support/otra/3.png`, 'x.png', 'image/png', 1000)), 'INVALID_PATH')
  has(await err(() => rpc(ana, 'support_register_attachment', ticketAna, msgAna, `${famA}/support/${ticketAna}/../../x.png`, 'x.png', 'image/png', 1000)), 'INVALID_PATH')
  has(await err(() => rpc(ana, 'support_register_attachment', ticketAna, msgAna, path(famA, ticketAna, '4.exe'), 'x.exe', 'application/x-msdownload', 1000)), 'INVALID_FILE')
  has(await err(() => rpc(ana, 'support_register_attachment', ticketAna, msgAna, path(famA, ticketAna, '5.png'), 'x.png', 'image/png', 6 * 1024 * 1024)), 'INVALID_FILE')
  has(await err(() => rpc(beto, 'support_register_attachment', ticketAna, msgAna, path(famA, ticketAna, '6.png'), 'x.png', 'image/png', 1000)), 'NOT_FOUND') // incidencia ajena
  for (let i = 0; i < 4; i++) await rpc(ana, 'support_register_attachment', ticketAna, msgAna, path(famA, ticketAna, `m${i}.png`), 'x.png', 'image/png', 10)
  has(await err(() => rpc(ana, 'support_register_attachment', ticketAna, msgAna, path(famA, ticketAna, 'm9.png'), 'x.png', 'image/png', 10)), 'RATE_LIMIT') // 5 por mensaje
})
await t('RLS de adjuntos: los ve su dueña y la administración; ni la misma familia ni otra', async () => {
  assert.ok((await select(ana, 'select id from support_attachments where ticket_id = $1', [ticketAna])).length >= 1)
  assert.equal((await select(beto, 'select id from support_attachments where ticket_id = $1', [ticketAna])).length, 0)
  assert.equal((await select(cris, 'select id from support_attachments where ticket_id = $1', [ticketAna])).length, 0)
  assert.ok((await select(owner1, 'select id from support_attachments where ticket_id = $1', [ticketAna])).length >= 1)
})
await t('el bucket existe, es PRIVADO, con límite de 5 MB y solo tipos permitidos', async () => {
  const b = (await db.query(`select * from storage.buckets where id = 'support-attachments'`)).rows[0]
  assert.equal(b.public, false)
  assert.equal(Number(b.file_size_limit), 5242880)
  assert.deepEqual([...b.allowed_mime_types].sort(), ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain'])
})
await t('STORAGE: solo se sube dentro de la carpeta de mi familia, bajo «support», en una incidencia mía', async () => {
  const ins = (user, name) => as(db, user.id, () => db.query(`insert into storage.objects (bucket_id, name) values ('support-attachments', $1)`, [name]))
  assert.equal(await err(() => ins(ana, path(famA, ticketAna, 'ok.png'))), null)
  has(await err(() => ins(beto, path(famA, ticketAna, 'intruso.png'))), 'row-level security') // misma familia, incidencia ajena
  has(await err(() => ins(cris, path(famA, ticketAna, 'intruso.png'))), 'row-level security') // otra familia
  has(await err(() => ins(ana, path(famB, ticketAna, 'cruce.png'))), 'row-level security') // carpeta de otra familia
  has(await err(() => ins(ana, `${famA}/otra-cosa/${ticketAna}/x.png`)), 'row-level security') // fuera de «support»
  has(await err(() => as(db, ana.id, () => db.query(`insert into storage.objects (bucket_id, name) values ('documents', $1)`, [path(famA, ticketAna, 'x.png')]))), 'row-level security') // otro bucket
})
await t('STORAGE: solo se leen los adjuntos REGISTRADOS por mí (o todos, siendo administración de PEPA)', async () => {
  await db.query(`insert into storage.objects (bucket_id, name) values ('support-attachments', $1)`, [path(famA, ticketAna, '1.png')])
  await db.query(`insert into storage.objects (bucket_id, name) values ('support-attachments', $1)`, [path(famA, ticketAna, 'sin-registrar.png')])
  const sel = (user) => select(user, `select name from storage.objects where bucket_id = 'support-attachments'`)
  const mine = (await sel(ana)).map((r) => r.name)
  assert.ok(mine.includes(path(famA, ticketAna, '1.png')))
  assert.ok(!mine.includes(path(famA, ticketAna, 'sin-registrar.png')))
  assert.equal((await sel(beto)).length, 0) // misma familia
  assert.equal((await sel(cris)).length, 0) // otra familia
  assert.ok((await sel(owner1)).length >= 2) // administración de PEPA
})
await t('STORAGE: sin política de borrado ni de actualización (nadie borra ni reescribe adjuntos desde la app)', async () => {
  const pol = (await db.query(`select cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'support_attachments%'`)).rows.map((r) => r.cmd)
  assert.deepEqual(pol.sort(), ['INSERT', 'SELECT'])
})

console.log('\nBorrado en cascada')
await t('al borrar una familia se van sus incidencias, mensajes, adjuntos e historial (no queda nada colgando)', async () => {
  const fam = await mkFamily(db, 'Temporal')
  const u = await addAccount(db, fam, 'admin', 'Temp')
  const id = await create(u, 'otra', 'Se borrará', 'x')
  await db.query('delete from families where id = $1', [fam])
  for (const tbl of ['support_tickets', 'support_messages', 'support_ticket_events']) {
    const col = tbl === 'support_tickets' ? 'id' : 'ticket_id'
    assert.equal((await db.query(`select 1 from ${tbl} where ${col} = $1`, [id])).rows.length, 0, tbl)
  }
})

console.log('\nReversión')
await t('el script de reversión elimina todo lo creado por 0310', async () => {
  await db.exec(read('supabase/rollbacks/0310_support_tickets_down.sql'))
  const left = (await db.query(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where proname like 'support\\_%' and n.nspname in ('public','private')`)).rows
  assert.deepEqual(left, [])
  assert.equal((await db.query(`select to_regclass('public.support_tickets') as r`)).rows[0].r, null)
  assert.equal((await db.query(`select count(*)::int as n from pg_policies where policyname like 'support_%'`)).rows[0].n, 0)
})

console.log(`\n${passed} correctas, ${failed.length} con fallos`)
if (failed.length) {
  console.log('Fallos:', failed.join(' | '))
  process.exit(1)
}
