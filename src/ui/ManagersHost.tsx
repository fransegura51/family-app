import { useEffect, useState } from 'react'
import { listBudgetCategories, listTags } from '@/data/finance'
import { listFamilyFoodTypes, type FamilyFoodType } from '@/data/foodTypes'
import type { BudgetCategory, Tag } from '@/domain/types'
import { notifyManagersChanged, type ManagerKind } from '@/state/managers'
import { CategoriesModal, TagsModal } from '@/ui/FinanceScreen'
import { ProductTypesModal } from '@/ui/ProductTypesModal'

// Las ventanas de gestión de categorías, etiquetas y clases de
// alimentos, sueltas de cualquier pantalla: cargan sus propios datos y
// avisan al terminar cada cambio. Se carga bajo demanda desde NavShell
// (import dinámico) para que la app no arrastre todo Economía al abrirse.
export default function ManagersHost({ kind, onClose }: { kind: ManagerKind; onClose: () => void }) {
  const [categories, setCategories] = useState<BudgetCategory[] | null>(null)
  const [tags, setTags] = useState<Tag[] | null>(null)
  const [foodTypes, setFoodTypes] = useState<FamilyFoodType[] | null>(null)

  async function load(): Promise<void> {
    try {
      if (kind === 'categorias') setCategories(await listBudgetCategories())
      else if (kind === 'etiquetas') setTags(await listTags())
      else {
        const [food, other] = await Promise.all([listFamilyFoodTypes('alimentacion'), listFamilyFoodTypes('no_alimentos')])
        setFoodTypes([...food, ...other])
      }
    } catch {
      onClose()
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind])

  async function handleChanged(): Promise<void> {
    await load()
    notifyManagersChanged()
  }

  if (kind === 'categorias' && categories) return <CategoriesModal categories={categories} onClose={onClose} onChanged={handleChanged} />
  if (kind === 'etiquetas' && tags) return <TagsModal tags={tags} onClose={onClose} onChanged={handleChanged} />
  if (kind === 'clases' && foodTypes) return <ProductTypesModal types={foodTypes} initialKind="alimentacion" onClose={onClose} onChanged={handleChanged} />
  return null
}
