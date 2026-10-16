// Candado de la parte de pantalla de las alergias e intolerancias (datos de salud, RGPD art. 9): lo que NO debe hacer ningún componente nuevo y cómo quedan
// enchufados. Estático sobre el código (complementa a src/data/dietaryPrivacyLock.test.ts, que vigila a la IA, a las funciones de servidor y a Comunidad).
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
// Sin comentarios de línea (las explicaciones pueden nombrar lo que NO se hace).
const code = (f: string) => read(f).replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const NEW_FILES = ['src/ui/DietaryWarnings.tsx', 'src/ui/FamilyDietarySection.tsx', 'src/ui/useFamilyDietary.ts', 'src/ui/familyDietaryText.ts']

describe('ningún componente nuevo guarda datos de salud fuera de la memoria', () => {
  for (const f of NEW_FILES) {
    it(`${f}: sin localStorage, sessionStorage, IndexedDB, cookies, consola, URL ni parámetros`, () => {
      expect(code(f)).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|console\.|URLSearchParams|useSearchParams|location\.|history\.(?:push|replace)State|navigate\(/)
    })
    it(`${f}: no usa la IA, la voz de Pepa, Comunidad, los avisos ni el registro de errores`, () => {
      const imports = [...read(f).matchAll(/from '([^']+)'/g)].map((m) => m[1])
      for (const i of imports) expect(i, `${f} importa ${i}`).not.toMatch(/aiClient|services\/|pepa\/|community(?!\/useDialogFocus)|notification|errorReports|showToast|state\/toast/)
    })
  }
  it('los errores que se enseñan son frases fijas: nada de serializar ni enviar el contenido de la ficha', () => {
    for (const f of NEW_FILES) expect(code(f), f).not.toMatch(/String\(e\)|JSON\.stringify|reportError|logClientError/)
  })
})

describe('una sola lectura por pantalla (coste Supabase)', () => {
  it('solo el estado compartido llama a loadDietaryOverview; ni la ficha ni el aviso lo hacen por su cuenta', () => {
    expect(code('src/ui/useFamilyDietary.ts')).toMatch(/loadDietaryOverview\(\)/)
    for (const f of ['src/ui/DietaryWarnings.tsx', 'src/ui/FamilyDietarySection.tsx', 'src/ui/FamilyScreen.tsx', 'src/ui/AlimentacionScreen.tsx']) {
      expect(code(f), f).not.toMatch(/loadDietaryOverview/)
    }
  })
  it('la ficha plegada no pide nada: useFamilyDietary con autoLoad=false y la lectura se hace al abrir', () => {
    const section = code('src/ui/FamilyDietarySection.tsx')
    expect(section).toMatch(/useFamilyDietary\(\{ autoLoad: false \}\)/)
    expect(section).toMatch(/if \(next\) void dietary\.ensureLoaded\(\)/)
  })
  it('no hay temporizadores, intervalos ni suscripciones en tiempo real', () => {
    for (const f of NEW_FILES) expect(code(f), f).not.toMatch(/setInterval|setTimeout|\.channel\(|realtime/i)
  })
  it('las pantallas ni leen ni escriben por su cuenta: solo pasan por src/data/dietaryRestrictions (funciones dietary_*)', () => {
    for (const f of NEW_FILES) expect(code(f), f).not.toMatch(/supabase\.from\(|\.rpc\(/)
  })
})

describe('enchufado mínimo en las pantallas existentes', () => {
  it('Familia: la ficha va dentro de la tarjeta de cada miembro, solo si esa cuenta puede verla', () => {
    const fam = code('src/ui/FamilyScreen.tsx')
    expect(fam).toMatch(/canSeeDietarySection\(profile, m\) && <FamilyDietarySection memberId=\{m\.id\} memberName=\{m\.name\} \/>/)
  })
  it('Cocina: el aviso sale en el visor de la receta (antes de los ingredientes) y en el selector del menú semanal', () => {
    const k = code('src/ui/AlimentacionScreen.tsx')
    expect(k).toMatch(/<DietaryWarnings ingredients=\{viewing\.ingredients\} \/>/)
    expect(k).toMatch(/<DietaryWarnings ingredients=\{pickedRecipe\.ingredients\}/)
    expect(k.indexOf('<DietaryWarnings ingredients={viewing.ingredients} />')).toBeLessThan(k.indexOf('<h3>Ingredientes</h3>'))
  })
  it('el aviso no se mete en el editor de recetas compartido con Comunidad ni dentro de Comunidad (se enchufará desde la importación)', () => {
    expect(code('src/ui/recipeEditor/RecipeEditorFields.tsx')).not.toMatch(/Dietary/)
  })
})

describe('los textos fijos no afirman seguridad', () => {
  it('familyDietaryText.ts no contiene «segura», «libre de», «apta para» ni «sin alérgenos»', () => {
    expect(code('src/ui/familyDietaryText.ts')).not.toMatch(/segur[oa]s?\b|libre de|apt[oa]s? para|sin al[eé]rgenos/i)
  })
  it('el aviso del consentimiento se declara provisional y no dice que esté revisado', () => {
    const t = code('src/ui/familyDietaryText.ts')
    expect(t).toContain('Texto provisional pendiente de revisión jurídica')
    expect(t).not.toMatch(/revisado por|aprobado por|validado por/i)
  })
})
