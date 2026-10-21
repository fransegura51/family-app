// Banco de pruebas local (PGlite = PostgreSQL en memoria): esquema mínimo + las migraciones REALES 0292-0295 del proyecto.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8')

function extractFn(sql, startMarker) {
  const a = sql.indexOf(startMarker)
  if (a < 0) throw new Error('no encontrado: ' + startMarker)
  const b = sql.indexOf('$function$;', sql.indexOf('$function$', a + startMarker.length) + 5)
  return sql.slice(a, b + '$function$;'.length)
}

export async function setup(opts = {}) {
  const db = new PGlite({ extensions: { pgcrypto } })
  await db.exec(`
    create schema auth; create schema private; create schema vault; create schema extensions;
    create extension pgcrypto with schema extensions;
    create role anon nologin; create role authenticated nologin; create role supabase_auth_admin nologin;
    grant usage on schema public, private, auth, extensions to anon, authenticated, supabase_auth_admin;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, email_change text default '', created_at timestamptz not null default now());
    -- Igual que el auth.uid() real de Supabase: primero request.jwt.claim.sub y, si no, el «sub» de request.jwt.claims.
    create function auth.uid() returns uuid language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create table vault.secrets (name text primary key, secret text);
    create view vault.decrypted_secrets as select name, secret as decrypted_secret from vault.secrets;

    create table families (id uuid primary key default gen_random_uuid(), name text not null, created_at timestamptz not null default now());
    create table profiles (id uuid primary key references auth.users(id) on delete cascade, family_id uuid not null references families(id) on delete cascade,
      role text not null check (role in ('admin','adult','guest','child')), display_name text not null, allowed_sections text[], is_app_owner boolean not null default false, created_at timestamptz not null default now());
    create table family_members (id uuid primary key default gen_random_uuid(), family_id uuid not null references families(id) on delete cascade, name text not null,
      member_type text not null check (member_type in ('admin','adult','child','baby','guest')), linked_profile_id uuid references profiles(id) on delete set null,
      birth_date date, allowed_sections text[], invite_code text unique, invite_code_expires_at timestamptz);
    create table family_invites (code text primary key, created_by uuid not null, created_at timestamptz not null default now(), expires_at timestamptz not null default now() + interval '30 days',
      note text, used_by_family uuid references families(id) on delete set null, used_at timestamptz);
    create table profile_locks (profile_id uuid primary key references profiles(id) on delete cascade, pin_hash text, failed_attempts int not null default 0, locked_until timestamptz, updated_at timestamptz not null default now());
    create table profile_webauthn_credentials (id uuid primary key default gen_random_uuid(), profile_id uuid not null references profiles(id) on delete cascade, credential_id text not null unique, public_key text not null, counter bigint not null default 0, device_label text);
    create table profile_webauthn_challenges (profile_id uuid primary key references profiles(id) on delete cascade, challenge text not null);
    create table catalog_categories (key text primary key, name text, icon text, budget_group text, parent_key text, sort_order int, necessity text, is_fixed boolean, status text);
    create table catalog_food_types (key text primary key, name text, icon text, kind text, sort_order int, status text);
    create table budget_categories (id uuid primary key default gen_random_uuid(), family_id uuid, name text, icon text, budget_group text, parent_id uuid, sort_order int, necessity text, is_fixed boolean, catalog_key text);
    create table family_food_types (family_id uuid, name text, icon text, kind text, catalog_key text, created_at timestamptz);

    create function private.current_family_id() returns uuid language sql security definer stable set search_path = public as $$ select family_id from profiles where id = auth.uid() $$;
    create function private.current_role_in_family() returns text language sql security definer stable set search_path = public as $$ select role from profiles where id = auth.uid() $$;
    create function private.current_member_id() returns uuid language sql security definer stable set search_path = public as $$ select id from family_members where linked_profile_id = auth.uid() $$;
    grant select on all tables in schema public to authenticated;
    revoke insert, delete, truncate on profiles, families from anon, authenticated;
    grant insert, update, delete on family_members to authenticated;
  `)
  const m0084 = read('supabase/migrations/0084_fix_pgcrypto_search_path.sql')
  await db.exec(m0084.slice(m0084.indexOf('create or replace function public.set_own_pin')))
  await db.exec(`
    create or replace function public.clear_own_pin() returns void language plpgsql security definer set search_path = public as $$ begin delete from profile_locks where profile_id = auth.uid(); end; $$;
  `)
  // Partimos de la puerta ACTUAL de producción (0286) y generate_family_invite (0093), y luego aplicamos las migraciones nuevas.
  const m286 = read('supabase/migrations/0286_signup_birth_date_required.sql')
  await db.exec(m286.slice(m286.indexOf('create or replace function public.create_family('), m286.indexOf('revoke all on function public.create_family')))
  const m93 = read('supabase/migrations/0093_family_invites.sql')
  const g0 = m93.indexOf('create or replace function public.generate_family_invite')
  await db.exec(m93.slice(g0, m93.indexOf('$$;', m93.indexOf('$$', g0 + 80) + 3) + 3))
  const m32 = read('supabase/migrations/0032_member_invite_codes.sql')
  const g1 = m32.indexOf('create or replace function public.generate_member_invite_code')
  await db.exec(m32.slice(g1, m32.indexOf('$function$;', g1 + 80) + '$function$;'.length))
  await db.exec(`
    revoke all on function public.create_family(text, text, text, date) from public, anon;
    grant execute on function public.create_family(text, text, text, date) to authenticated;
    revoke all on function public.generate_family_invite(text) from public, anon; grant execute on function public.generate_family_invite(text) to authenticated;
    revoke all on function public.generate_member_invite_code(uuid) from public, anon; grant execute on function public.generate_member_invite_code(uuid) to authenticated;
  `)
  if (!opts.onlyBase) {
    for (const f of ['0292_account_security.sql', '0293_family_member_guardians.sql', '0294_invitation_hardening.sql', '0295_signup_gate_invitation_first.sql']) {
      await db.exec(read('supabase/migrations/' + f))
    }
    await db.exec(`revoke all on function public.join_family_with_code(text, text, date) from public, anon; grant execute on function public.join_family_with_code(text, text, date) to authenticated;`)
  }
  return db
}

const uid = () => crypto.randomUUID()
export { uid }

export async function addUser(db, email) {
  const id = uid()
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email])
  return id
}

export async function mkFamily(db, name = 'F') {
  const r = await db.query('insert into families (name) values ($1) returning id', [name])
  return r.rows[0].id
}

export async function addAccount(db, fam, role, name, memberType, opts = {}) {
  const id = await addUser(db, (opts.email ?? name.toLowerCase().replace(/\s+/g, '') + '-' + uid().slice(0, 4)) + '@example.invalid')
  await db.query('insert into profiles (id, family_id, role, display_name, is_app_owner) values ($1,$2,$3,$4,$5)', [id, fam, role, name, !!opts.owner])
  const m = await db.query('insert into family_members (family_id, name, member_type, linked_profile_id, birth_date) values ($1,$2,$3,$4,$5) returning id', [fam, name, memberType ?? role, id, opts.birth ?? '1985-01-01'])
  return { id, member: m.rows[0].id, email: (await db.query('select email from auth.users where id=$1', [id])).rows[0].email }
}

export async function addFicha(db, fam, name, type, opts = {}) {
  const r = await db.query('insert into family_members (family_id, name, member_type, birth_date, allowed_sections) values ($1,$2,$3,$4,$5) returning id', [fam, name, type, opts.birth ?? null, opts.sections ?? null])
  return r.rows[0].id
}

/** Ejecuta `fn` como esa persona (rol authenticated, con su identificador y marca de cómo entró). */
export async function as(db, userId, fn, { email, amrAgoSeconds = 3600 * 5 } = {}) {
  const amr = [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - amrAgoSeconds }]
  const claims = JSON.stringify({ sub: userId, role: 'authenticated', email: email ?? '', amr })
  await db.query(`select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)`, [userId, claims])
  await db.exec('set role authenticated')
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
    await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)`)
  }
}

export async function asAnon(db, fn, headers) {
  await db.query(`select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false), set_config('request.headers', $1, false)`, [JSON.stringify(headers ?? {})])
  await db.exec('set role anon')
  try {
    return await fn()
  } finally {
    await db.exec('reset role')
  }
}

/** Devuelve el mensaje de error, o null si no hubo error. */
export async function err(promiseFn) {
  try {
    await promiseFn()
    return null
  } catch (e) {
    return String(e.message ?? e)
  }
}
