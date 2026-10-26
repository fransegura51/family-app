import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
vi.mock('@/data/supabaseClient', () => ({ supabase: {} }))
import { parseProposedLines } from '@/services/listDocument'

// Pruebas de «forma» (texto del código y de la migración): lo que no se puede comprobar sin un móvil o una base de datos real, pero sí
// vigilar para que nadie lo rompa sin querer.
const ui = import.meta.glob('/src/ui/lists/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sql = import.meta.glob('/supabase/migrations/0321_mis_listas.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const down = import.meta.glob('/supabase/rollbacks/0321_mis_listas_down.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const stylesCss = readFileSync(resolve(process.cwd(), 'src/ui/styles.css'), 'utf8')
const migration = Object.values(sql)[0]
const rollback = Object.values(down)[0]
const prod = Object.entries(ui).filter(([f]) => !/\.test\./.test(f))

describe('Mis listas — seguridad del código', () => {
  it('nunca se pinta HTML en bruto: ni innerHTML ni dangerouslySetInnerHTML', () => {
    for (const [file, src] of prod) {
      expect(src, file).not.toMatch(/dangerouslySetInnerHTML/)
      expect(src.replace(/\/\/.*$/gm, ''), file).not.toMatch(/\.innerHTML\s*=/)
      expect(src, file).not.toMatch(/insertAdjacentHTML|document\.write\(/)
    }
  })
  it('el formato solo permite negrita y los colores de una paleta pequeña', async () => {
    const { RICH_COLOR_NAMES } = await import('@/domain/lists')
    expect(RICH_COLOR_NAMES.length).toBeLessThanOrEqual(8)
  })
})

describe('Mis listas — gestos (mismo mecanismo que la Lista de la compra)', () => {
  const gestures = Object.entries(ui).find(([f]) => f.endsWith('gestures.ts'))![1]
  it('el deslizar solo captura el puntero tras confirmar intención horizontal; un gesto vertical cede el scroll', () => {
    expect(gestures).toMatch(/SWIPE_INTENT_THRESHOLD_PX = 8/)
    const move = gestures.slice(gestures.indexOf('const onPointerMove'), gestures.indexOf('const onPointerEnd'))
    expect(move.indexOf('Math.abs(dy) >= Math.abs(dx)')).toBeGreaterThan(-1)
    expect(move.indexOf('swiping.current = false')).toBeLessThan(move.indexOf('setPointerCapture'))
    expect(move.indexOf('Math.abs(dy) >= Math.abs(dx)')).toBeLessThan(move.indexOf('setPointerCapture'))
  })
  it('las filas usan la misma clase que Compras, que deja el scroll vertical nativo (touch-action: pan-y)', () => {
    const row = Object.entries(ui).find(([f]) => f.endsWith('ItemRow.tsx'))![1]
    expect(row).toContain('shopping-row-inner')
    expect(stylesCss).toMatch(/\.shopping-row-inner\s*\{[^}]*touch-action:\s*pan-y/)
  })
  it('el asa de arrastre bloquea el scroll solo en el asa (touch-action: none)', () => {
    expect(stylesCss).toMatch(/\.shopping-drag-handle\s*\{[^}]*touch-action:\s*none/)
  })
})

describe('Mis listas — migración 0321', () => {
  const tables = ['list_folders', 'user_lists', 'list_columns', 'list_items', 'list_calendar_links', 'list_shopping_links']
  it('todas las tablas nuevas tienen RLS activada y borrado en cascada desde su lista', () => {
    for (const t of tables) expect(migration, t).toMatch(new RegExp(`alter table public\\.${t} enable row level security`))
    expect(migration).toMatch(/list_id uuid not null references public\.user_lists\(id\) on delete cascade/)
  })
  it('las funciones nuevas no se ejecutan sin sesión (anon)', () => {
    for (const fn of ['list_accessible\\(uuid\\)', 'folder_is_mine\\(uuid\\)', 'replace_list_items\\(uuid, jsonb\\)', 'enviar_a_compras\\(jsonb\\)']) {
      expect(migration, fn).toMatch(new RegExp(`revoke execute on function [\\w.]*${fn} from public, anon`))
    }
  })
  it('las políticas respetan la privacidad: privada solo la dueña, y la sección «listas»', () => {
    expect(migration).toMatch(/visibility = 'familiar' or l\.created_by = auth\.uid\(\)/)
    expect(migration).toContain("private.has_section_access('listas')")
    expect(migration).toMatch(/create policy "user_lists: update own"/)
    expect(migration).toMatch(/create policy "user_lists: delete own"/)
  })
  it('la base de datos rechaza texto con formato inseguro y más de dos niveles', () => {
    expect(migration).toMatch(/rich !~ '<\(\?!/)
    expect(migration).toMatch(/depth smallint not null default 0 check \(depth in \(0, 1\)\)/)
  })
  it('Compras → Mis listas es de un solo sentido: no hay ningún disparador sobre list_items que toque shopping_items', () => {
    expect(migration).not.toMatch(/on public\.list_items for each row execute function private\.sync/)
    expect(migration).not.toMatch(/update shopping_items/)
  })
  it('el deshacer elimina todo lo que crea', () => {
    for (const t of tables) expect(rollback, t).toContain(`drop table if exists public.${t}`)
    expect(rollback).toContain('drop trigger if exists trg_shopping_to_lists')
    expect(rollback).toContain('drop function if exists public.enviar_a_compras')
  })
  it('es aditiva: no altera ni borra tablas de otros módulos', () => {
    expect(migration).not.toMatch(/alter table (public\.)?(shopping_items|calendar_events|profiles|families)/)
    expect(migration).not.toMatch(/drop table|drop policy|delete from (shopping|calendar|profiles)/)
  })
})

describe('Mis listas — respuesta del lector de imágenes', () => {
  it('limpia vacíos y repetidos seguidos, conserva el orden y marca lo dudoso; el primero nunca es subelemento', () => {
    const out = parseProposedLines({
      items: [
        { text: '  Leche ', depth: 1 },
        { text: 'Leche', depth: 0 },
        { text: '', depth: 0 },
        { text: 'Pan', depth: 1, uncertain: true },
        { text: 42 },
        'texto suelto',
      ],
    })
    expect(out).toEqual([
      { text: 'Leche', depth: 0, uncertain: undefined },
      { text: 'Pan', depth: 1, uncertain: true },
    ])
  })
  it('una respuesta rara no rompe nada', () => {
    expect(parseProposedLines(null)).toEqual([])
    expect(parseProposedLines({ items: 'x' })).toEqual([])
    expect(parseProposedLines({})).toEqual([])
  })
  it('limita a 200 elementos y 1000 caracteres por elemento', () => {
    const many = parseProposedLines({ items: Array.from({ length: 500 }, (_, i) => ({ text: `l${i}` })) })
    expect(many.length).toBe(200)
    expect(parseProposedLines({ items: [{ text: 'x'.repeat(5000) }] })[0].text.length).toBe(1000)
  })
})
