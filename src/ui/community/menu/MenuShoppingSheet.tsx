import { useMemo } from 'react'
import { buildMenuShopping, selectionTitle, type CommunityMenu, type MenuSelection } from '@/domain/communityMenu'
import { ShoppingLinesSheet } from '@/ui/ShoppingLinesSheet'

// «Añadir a Compras» del menú de Comunidad: junta los ingredientes de lo elegido (semana, día, comida o receta) con el MISMO código que «Preparar compra del menú» de Eventos
// (menuShoppingPlan.ts): mismo producto y unidad compatible = una sola línea con la suma, escalada a las raciones elegidas y redondeada para comprar. La revisión (filas
// compactas, «Ya está en tu lista», todo o nada) es la hoja compartida ShoppingLinesSheet, la misma que usa el menú semanal de la Cocina.
export function MenuShoppingSheet({ menu, selection, servings, onClose }: { menu: CommunityMenu; selection: MenuSelection; servings: number; onClose: () => void }) {
  const lines = useMemo(() => buildMenuShopping(menu, selection, servings), [menu, selection, servings])
  return (
    <ShoppingLinesSheet
      lines={lines}
      onClose={onClose}
      intro={
        <>
          {selectionTitle(selection, menu)}, para {servings} {servings === 1 ? 'persona' : 'personas'}. Revisa qué quieres añadir: no se guarda nada hasta que lo confirmes.
        </>
      }
    />
  )
}
