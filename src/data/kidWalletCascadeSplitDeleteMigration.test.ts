import { describe, expect, it } from 'vitest'

// PG-PUNTOS-FINANZAS (Parte B8, auditoría del modelo financiero) — BUG real encontrado (nunca disparado
// en producción, solo al limpiar datos de prueba a mano por SQL dos veces en esta misma sesión): borrar un
// ingreso desde "Eliminar" en el historial dejaba huérfanas sus filas 'ahorro'/'impuesto' auto-generadas
// (source_income_id → "on delete set null"), que seguían contando en walletCategoryTotal/walletBalance —
// "Para gastar" podía quedar negativo sin ningún ingreso real detrás. Migración 0252 cambia la FK a
// "on delete cascade": el reparto automático deja de poder sobrevivir al ingreso que lo generó.
const MIG = (import.meta.glob('/supabase/migrations/0252_kid_wallet_cascade_split_delete.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/supabase/migrations/0252_kid_wallet_cascade_split_delete.sql'
]

describe('migración 0252 — source_income_id pasa de "set null" a "cascade", nunca deja un reparto huérfano', () => {
  it('sustituye la FK por una que SÍ borra en cascada', () => {
    expect(MIG).toContain('drop constraint kid_wallet_transactions_source_income_id_fkey')
    expect(MIG).toContain('foreign key (source_income_id) references kid_wallet_transactions(id) on delete cascade')
  })
  it('ya no deja la vieja política "on delete set null" como resultado final', () => {
    const afterDrop = MIG.slice(MIG.indexOf('drop constraint'))
    expect(afterDrop).not.toMatch(/on delete set null/)
  })
  it('no borra ni actualiza ninguna fila existente (aditiva: solo cambia qué pasa la PRÓXIMA vez que se borre un ingreso)', () => {
    const code = MIG.split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
    expect(code).not.toMatch(/\bupdate\s+kid_wallet_transactions\b|\bdelete\s+from\b|\bdrop\s+table\b/i)
  })
})
