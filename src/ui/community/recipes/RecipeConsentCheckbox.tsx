import { RECIPE_CONSENT_TEXT } from '@/domain/communityRecipeBridge'
import '@/ui/community/recipes/communityRecipes.css'

// Casilla OBLIGATORIA de consentimiento para publicar una receta que viene de la Cocina privada. La usa la hoja «Compartir en Comunidad» y debe usarla
// cualquier otra pantalla que publique una receta de la Cocina (p. ej. el editor cuando llega con ?receta=).
export function RecipeConsentCheckbox({ checked, onChange, disabled }: { checked: boolean; onChange: (next: boolean) => void; disabled?: boolean }) {
  return (
    <label className="community-consent">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} required />
      <span>{RECIPE_CONSENT_TEXT}</span>
    </label>
  )
}
