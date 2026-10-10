import { describe, expect, it } from 'vitest'

// "Lista de deseos" (Pequeños Grandes, Fases 12-16, migración 0239) — condiciones de seguridad explícitas
// del usuario: reservas secretas (ni el destinatario ni ningún 'child' pueden verlas), protección real
// frente a reservas simultáneas, regalos conjuntos, deshacer la propia reserva sin borrar nada, enlaces
// públicos sin acceso a nada privado de la familia, migraciones aditivas.
const MIG = (import.meta.glob('/supabase/migrations/0239_wishlists.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0239_wishlists.sql'
]
const DATA_SRC = (import.meta.glob('/src/data/wishlist.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/data/wishlist.ts']
const EDGE_SRC = (import.meta.glob('/supabase/functions/wishlist-guest/index.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/functions/wishlist-guest/index.ts'
]

function fn(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  return source.slice(start, source.indexOf('\n}', start) + 2)
}

// Para bloques SQL (tablas, políticas, funciones plpgsql) — a diferencia de TS/JS, no terminan en una
// línea "}", sino en ";"; un cuerpo "as $$ ... $$;" tiene SUS PROPIOS ";" por dentro (declare x; begin...),
// así que una función se corta en el "$$;" de cierre, nunca en el primer ";" que aparezca.
function sqlBlock(source: string, signature: string): string {
  const start = source.indexOf(signature)
  expect(start, `no se encontró "${signature}"`).toBeGreaterThan(-1)
  const semiEnd = source.indexOf(';', start)
  const dollarStart = source.indexOf('$$', start)
  if (dollarStart !== -1 && dollarStart < semiEnd) {
    const dollarEnd = source.indexOf('$$;', dollarStart + 2)
    expect(dollarEnd).toBeGreaterThan(start)
    return source.slice(start, dollarEnd + 3)
  }
  expect(semiEnd).toBeGreaterThan(start)
  return source.slice(start, semiEnd + 1)
}

describe('Migración 0239 — tablas nuevas, aditiva de principio a fin', () => {
  it('las 3 tablas nuevas tienen RLS habilitada', () => {
    for (const table of ['wishlists', 'wishlist_items', 'wishlist_item_reservations']) {
      expect(MIG).toContain(`alter table ${table} enable row level security`)
    }
  })
  it('celebration_date es opcional (nullable), no inventa una fecha obligatoria', () => {
    expect(MIG).toContain('celebration_date date null')
  })
  it('wishlist_items: descripción, enlace y precio son opcionales; solo el nombre es obligatorio', () => {
    const table = sqlBlock(MIG, 'create table wishlist_items (')
    expect(table).toContain('name text not null')
    expect(table).toContain('description text null')
    expect(table).toContain('link text null')
    expect(table).toContain('price numeric(10, 2) null')
  })
})

describe('Migración 0239 — reservas secretas: RLS a nivel de fila, no solo ocultado en la interfaz', () => {
  it('el destinatario de la lista queda excluido del select de reservas', () => {
    const policy = sqlBlock(MIG, 'create policy "wishlist_item_reservations: select family (not owner, not child)" on wishlist_item_reservations')
    expect(policy).toContain("w.owner_member_id = (select private.current_member_id())")
    expect(policy).toContain('not exists')
  })
  it('cualquier miembro con role \'child\' queda excluido del select de reservas', () => {
    const policy = sqlBlock(MIG, 'create policy "wishlist_item_reservations: select family (not owner, not child)" on wishlist_item_reservations')
    expect(policy).toContain("(select private.current_role_in_family()) <> 'child'")
  })
  it('cada uno puede ver (y por tanto deshacer) SU PROPIA reserva, incluso siendo child o el destinatario de otra lista', () => {
    expect(MIG).toContain('create policy "wishlist_item_reservations: select own" on wishlist_item_reservations')
  })
  it('nadie puede reservar en su propia lista (insert excluye al destinatario)', () => {
    const policy = sqlBlock(MIG, 'create policy "wishlist_item_reservations: insert own" on wishlist_item_reservations')
    expect(policy).toContain('not exists')
    expect(policy).toContain("w.owner_member_id = (select private.current_member_id())")
  })
  it('deshacer solo está permitido sobre la reserva propia, nunca la de otro', () => {
    const policy = sqlBlock(MIG, 'create policy "wishlist_item_reservations: undo own" on wishlist_item_reservations')
    expect(policy).toContain('reserved_by_member_id = (select private.current_member_id())')
  })
  it('no existe ninguna política de DELETE sobre reservas — deshacer marca undone_at, nunca borra', () => {
    expect(MIG).not.toMatch(/for delete[\s\S]{0,40}wishlist_item_reservations/i)
  })
})

describe('Migración 0239 — protección real frente a reservas simultáneas (a nivel de base de datos)', () => {
  it('un índice único impide dos reservas activas a la vez en un regalo NO conjunto', () => {
    expect(MIG).toContain(
      'create unique index idx_wishlist_item_reservations_exclusive on wishlist_item_reservations(item_id) where (undone_at is null and not allow_joint)',
    )
  })
  it('un regalo conjunto sí admite varias reservas activas, pero nunca la misma persona dos veces', () => {
    expect(MIG).toContain(
      'create unique index idx_wishlist_item_reservations_member_once on wishlist_item_reservations(item_id, reserved_by_member_id) where (undone_at is null and reserved_by_member_id is not null)',
    )
  })
  it('la capa de datos del lado invitado (edge function) deja que la base de datos decida la carrera — nunca comprueba "ya existe" antes de insertar y confía en eso', () => {
    const reserveBlock = fn(EDGE_SRC, 'if (action === "reserve") {')
    expect(reserveBlock).toContain('23505')
    expect(reserveBlock).toContain('ya_reservado')
  })
})

describe('Migración 0239 — enlaces públicos: token de 24 bytes, mismo patrón que RSVP', () => {
  it('generate_wishlist_guest_token comprueba la familia antes de generar, igual que generate_event_open_rsvp_token', () => {
    const fnSql = sqlBlock(MIG, 'create or replace function public.generate_wishlist_guest_token(p_wishlist_id uuid)')
    expect(fnSql).toContain('v_family_id <> private.current_family_id()')
    expect(fnSql).toContain("gen_random_bytes(24), 'hex'")
  })
  it('las funciones de token se revocan de anon/public y solo se conceden a authenticated (solo la familia las genera, nunca un invitado)', () => {
    expect(MIG).toContain('revoke execute on function public.generate_wishlist_guest_token(uuid) from public, anon')
    expect(MIG).toContain('revoke execute on function public.regenerate_wishlist_guest_token(uuid) from public, anon')
  })
})

describe('data/wishlist.ts — capa de datos del lado familia', () => {
  it('reserveWishlistItem resuelve el member_id del usuario autenticado, nunca deja que el cliente lo invente', () => {
    const reserveFn = fn(DATA_SRC, 'export async function reserveWishlistItem(')
    expect(reserveFn).toContain("eq('linked_profile_id', userResult.user.id)")
    expect(reserveFn).toContain('reserved_by_member_id: memberRow.id')
  })
  it('undoWishlistReservation marca undone_at, nunca borra la fila', () => {
    const undoFn = fn(DATA_SRC, 'export async function undoWishlistReservation(')
    expect(undoFn).toContain('update({ undone_at: new Date().toISOString() })')
    expect(undoFn).not.toContain('.delete(')
  })
  it('saveWishlistItemPhoto comprime si es imagen y sustituye (borra) la foto anterior, mismo patrón que proveedores', () => {
    const photoFn = fn(DATA_SRC, 'export async function saveWishlistItemPhoto(')
    expect(photoFn).toContain('compressImageFile(file)')
    expect(photoFn).toContain('previousPath && previousPath !== path')
  })
})

describe('supabase/functions/wishlist-guest — qué es público y qué no lo es nunca', () => {
  it('verify_jwt está desactivado a propósito (documentado), igual que event-rsvp', () => {
    expect(EDGE_SRC).toContain('verify_jwt = false a propósito')
  })
  it('publicItems nunca expone quién ha reservado (nombre, member id) — solo el estado y, si es conjunto, el recuento', () => {
    const publicItemsFn = fn(EDGE_SRC, 'async function publicItems(')
    expect(publicItemsFn).not.toContain('reserved_by_guest_name')
    expect(publicItemsFn).not.toContain('reserved_by_member_id')
    expect(publicItemsFn).toContain('jointCount')
  })
  it('la foto se sirve siempre como URL firmada (bucket privado), nunca una ruta de storage en crudo', () => {
    expect(EDGE_SRC).toContain('createSignedUrl(item.photo_storage_path, 3600)')
  })
  it('reservar exige un nombre de invitado (nunca una reserva anónima sin ningún dato)', () => {
    const reserveBlock = fn(EDGE_SRC, 'if (action === "reserve") {')
    expect(reserveBlock).toContain('missing_name')
  })
  it('está protegido por límite de peticiones (mismo mecanismo que event-rsvp), para que nadie pueda automatizar reservas en bucle', () => {
    expect(EDGE_SRC).toContain('underRateLimit(admin, req,')
    expect(EDGE_SRC).toContain('rate_limited')
  })
  it('nunca consulta ni expone ninguna tabla ajena a la lista de deseos (presupuesto, pagos, otros invitados...)', () => {
    const forbidden = ['event_payments', 'event_budget_items', 'event_guests', 'bank_', 'kid_wallet']
    for (const table of forbidden) expect(EDGE_SRC).not.toContain(`.from("${table}`)
  })
})
