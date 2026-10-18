import { useEffect, useMemo, useState } from 'react'
import { listFamilyMembers } from '@/data/family'
import { defaultDiners, kitchenMenuShopping, type KitchenShoppingScope } from '@/domain/kitchenMenuShopping'
import type { MenuEntry, Recipe } from '@/domain/types'
import { ShoppingLinesSheet } from '@/ui/ShoppingLinesSheet'

const DINER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]

// «Añadir a Compras» desde el menú semanal de la Cocina (semana, un día o un plato). Usa la hoja compartida de revisión (se pueden desmarcar ingredientes antes de
// confirmar) y el código de «Preparar compra del menú». Los platos escritos a mano entran como un producto cada uno (sin inventar ingredientes) y las recetas no se modifican.
export function KitchenMenuShoppingSheet({
  entries,
  recipes,
  scope,
  title,
  onClose,
}: {
  entries: MenuEntry[]
  recipes: Recipe[]
  scope: KitchenShoppingScope
  title: string
  onClose: () => void
}) {
  const [diners, setDiners] = useState<number>(4)
  // Una lectura de las fichas de la familia para proponer cuántas personas comen (se puede cambiar).
  useEffect(() => {
    let cancelled = false
    listFamilyMembers()
      .then((m) => {
        if (!cancelled) setDiners(defaultDiners(m))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])
  const lines = useMemo(() => kitchenMenuShopping(entries, recipes, scope, diners), [entries, recipes, scope, diners])
  const options = DINER_OPTIONS.includes(diners) ? DINER_OPTIONS : [...DINER_OPTIONS, diners].sort((a, b) => a - b)
  return (
    <ShoppingLinesSheet
      lines={lines}
      onClose={onClose}
      intro={<>{title}. Revisa qué quieres añadir: no se guarda nada hasta que lo confirmes. Los platos con receta aportan sus ingredientes; los escritos a mano se añaden tal cual, como un producto.</>}
      note={
        <label className="community-menu-diners">
          Personas
          <select value={diners} onChange={(e) => setDiners(Number(e.target.value))}>
            {options.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      }
    />
  )
}
