// Ficha de alergias e intolerancias en Familia (datos de salud, RGPD art. 9): estructura, estados, roles y textos, sobre el HTML que dibuja React.
// No sustituye a la prueba manual con un lector de pantalla ni a la verificación en un móvil real.
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/data/supabaseClient', () => ({ supabase: { rpc: vi.fn(), auth: { onAuthStateChange: vi.fn() } } }))

import { a11yProblems } from '@/domain/staticA11y'
import type { DietaryRestriction } from '@/domain/dietaryRestrictions'
import { DIETARY_ERROR_TEXT } from '@/data/dietaryRestrictions'
import {
  canSeeDietarySection,
  ConsentDialog,
  dietaryErrorText,
  FamilyDietarySection,
  FamilyDietarySectionView,
  RestrictionForm,
  RevokeDialog,
  type FamilyDietarySectionViewProps,
} from '@/ui/FamilyDietarySection'
import { DietaryError } from '@/data/dietaryRestrictions'
import * as T from '@/ui/familyDietaryText'

const noop = () => undefined
function restriction(over: Partial<DietaryRestriction> = {}): DietaryRestriction {
  return { id: 'r1', memberId: 'm1', kind: 'alergia', allergenKey: 'leche', customLabel: null, severity: 'grave', note: null, createdAt: '2026-10-16T10:00:00Z', updatedAt: '2026-10-16T10:00:00Z', ...over }
}
function view(over: Partial<FamilyDietarySectionViewProps> = {}): string {
  const props: FamilyDietarySectionViewProps = {
    memberName: 'Lucía',
    open: true,
    onToggleOpen: noop,
    load: 'ready',
    loadError: null,
    onRetry: noop,
    canManage: true,
    hasConsent: true,
    restrictions: [],
    busy: false,
    actionError: null,
    adding: false,
    editingId: null,
    consentDialog: false,
    revokeDialog: false,
    onAskConsent: noop,
    onConfirmConsent: noop,
    onCancelConsent: noop,
    onAskRevoke: noop,
    onConfirmRevoke: noop,
    onCancelRevoke: noop,
    onStartAdd: noop,
    onCancelAdd: noop,
    onSubmitAdd: noop,
    onStartEdit: noop,
    onCancelEdit: noop,
    onSubmitEdit: noop,
    onDelete: noop,
    ...over,
  }
  return renderToStaticMarkup(<FamilyDietarySectionView {...props} />)
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ')

describe('plegada por defecto', () => {
  it('cerrada solo enseña el título y «Opcional»: ni privacidad, ni datos, ni botones de acción', () => {
    const html = view({ open: false, restrictions: [restriction()] })
    expect(html).toContain('aria-expanded="false"')
    expect(text(html)).toContain(T.DIETARY_SECTION_TITLE)
    expect(text(html)).toContain('Opcional')
    expect(html).not.toContain('Leche')
    expect(html).not.toContain(T.DIETARY_PRIVACY_MANAGER)
    expect(html).not.toContain('Añadir')
  })

  it('el componente real arranca plegado y sin pedir nada (el render del servidor no ejecuta efectos)', () => {
    const html = renderToStaticMarkup(<FamilyDietarySection memberId="m1" memberName="Lucía" />)
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain(T.DIETARY_LOADING_TEXT)
  })

  it('abierta: botón con aria-expanded=true y el cuerpo enlazado con aria-controls', () => {
    const html = view({ open: true })
    expect(html).toContain('aria-expanded="true"')
    const controls = /aria-controls="([^"]+)"/.exec(html)?.[1]
    expect(controls).toBeTruthy()
    expect(html).toContain(`id="${controls}"`)
  })
})

describe('con consentimiento (administrador o adulto)', () => {
  it('vacío: frase de vacío, botón de añadir, retirar el consentimiento y descargo; privacidad con los roles reales', () => {
    const html = view({ restrictions: [] })
    const t = text(html)
    expect(t).toContain(T.DIETARY_EMPTY_TEXT('Lucía'))
    expect(t).toContain(T.DIETARY_ADD_LABEL)
    expect(t).toContain(T.DIETARY_REVOKE_ASK)
    expect(t).toContain('Solo lo ven las personas adultas de tu familia')
    expect(t).toContain('No se comparte con Comunidad ni con la inteligencia artificial')
    expect(t).toContain('PEPA es una ayuda de organización')
    expect(a11yProblems(html)).toEqual([])
  })

  it('con restricciones: etiqueta, tipo, gravedad, nota, editar y quitar con nombre accesible', () => {
    const html = view({ restrictions: [restriction({ note: 'Tolera el huevo cocido' }), restriction({ id: 'r2', kind: 'intolerancia', allergenKey: 'lactosa', severity: null })] })
    const t = text(html)
    expect(t).toContain('Leche (proteínas lácteas)')
    expect(t).toContain('Alergia')
    expect(t).toContain('Grave')
    expect(t).toContain('Tolera el huevo cocido')
    expect(t).toContain('Lactosa (intolerancia)')
    expect(t).toContain('Intolerancia')
    expect(html).toContain('aria-label="Editar: Leche (proteínas lácteas)"')
    expect(html).toContain('aria-label="Quitar: Lactosa (intolerancia)"')
    expect(t).not.toContain(T.DIETARY_EMPTY_TEXT('Lucía'))
    expect(a11yProblems(html)).toEqual([])
  })

  it('texto libre se enseña tal cual como texto de React (sin HTML)', () => {
    const html = view({ restrictions: [restriction({ allergenKey: null, customLabel: '<b>kiwi</b>', note: '<img src=x onerror=1>' })] })
    expect(html).not.toContain('<b>kiwi</b>')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;b&gt;kiwi&lt;/b&gt;')
  })

  it('estado de carga y de error con la frase fija', () => {
    expect(text(view({ load: 'loading' }))).toContain(T.DIETARY_LOADING_TEXT)
    const err = view({ load: 'error', loadError: DIETARY_ERROR_TEXT.network })
    expect(text(err)).toContain(DIETARY_ERROR_TEXT.network)
    expect(text(err)).toContain(T.DIETARY_RETRY_LABEL)
    expect(err).toContain('role="alert"')
  })

  it('un error de una acción se enseña con la frase fija', () => {
    expect(text(view({ restrictions: [restriction()], actionError: DIETARY_ERROR_TEXT.forbidden }))).toContain(DIETARY_ERROR_TEXT.forbidden)
  })
})

describe('sin consentimiento', () => {
  it('administrador o adulto: explica por qué y ofrece dar el consentimiento; no deja añadir nada', () => {
    const html = view({ hasConsent: false })
    const t = text(html)
    expect(t).toContain(T.DIETARY_NO_CONSENT_TEXT('Lucía'))
    expect(t).toContain(T.DIETARY_CONSENT_ASK)
    expect(t).not.toContain(T.DIETARY_ADD_LABEL)
    expect(t).not.toContain(T.DIETARY_REVOKE_ASK)
    expect(a11yProblems(html)).toEqual([])
  })

  it('niño o invitado: solo texto, sin botón de consentimiento', () => {
    const html = view({ hasConsent: false, canManage: false })
    expect(text(html)).toContain(T.DIETARY_NO_CONSENT_READONLY)
    expect(text(html)).not.toContain(T.DIETARY_CONSENT_ASK)
  })
})

describe('rol niño o invitado: solo lectura de lo suyo', () => {
  const html = view({ canManage: false, restrictions: [restriction()] })
  it('ve lo suyo con el texto de privacidad de solo lectura', () => {
    expect(text(html)).toContain('Leche (proteínas lácteas)')
    expect(text(html)).toContain(T.DIETARY_PRIVACY_READONLY)
    expect(text(html)).not.toContain(T.DIETARY_PRIVACY_MANAGER)
  })
  it('no hay ningún control para cambiar: ni añadir, ni editar, ni quitar, ni retirar el consentimiento', () => {
    const t = text(html)
    for (const s of [T.DIETARY_ADD_LABEL, T.DIETARY_EDIT, T.DIETARY_REMOVE, T.DIETARY_REVOKE_ASK, T.DIETARY_CONSENT_ASK]) expect(t).not.toContain(s)
    expect(a11yProblems(html)).toEqual([])
  })
})

describe('diálogo del consentimiento', () => {
  const html = renderToStaticMarkup(<ConsentDialog memberName="Lucía" busy={false} error={null} onConfirm={noop} onCancel={noop} />)
  it('accesible: role=dialog, aria-modal, nombre y descripción', () => {
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(a11yProblems(html)).toEqual([])
  })
  it('lleva la marca de texto provisional y NO dice que esté revisado', () => {
    expect(text(html)).toContain('Texto provisional pendiente de revisión jurídica')
    expect(text(html)).not.toMatch(/revisado por|aprobado por|validado/i)
  })
  it('explica qué se guarda, quién lo ve, qué no se hace y que retirarlo borra; muestra la versión', () => {
    const t = text(html)
    for (const s of ['Qué se guarda', 'Quién lo ve', 'Qué no se hace', 'Cuánto tiempo', 'Al retirarlo se borra todo']) expect(t).toContain(s)
    expect(t).toContain('No se comparte con Comunidad, no se envía a la inteligencia artificial')
    expect(t).toContain('Versión del aviso: v1')
  })
  it('el botón de consentir empieza desactivado hasta marcar la casilla obligatoria', () => {
    expect(html).toMatch(/<input type="checkbox"[^>]*aria-required="true"/)
    expect(html).toMatch(/<button type="button" class="primary" disabled=""[^>]*>Dar el consentimiento/)
  })
})

describe('retirar el consentimiento', () => {
  it('avisa con claridad de que se BORRAN los datos y de cuántos', () => {
    const html = renderToStaticMarkup(<RevokeDialog memberName="Lucía" count={3} busy={false} error={null} onConfirm={noop} onCancel={noop} />)
    const t = text(html)
    expect(t).toContain('se BORRARÁN de forma definitiva')
    expect(t).toContain('3 anotadas')
    expect(t).toContain('No se pueden recuperar')
    expect(t).toContain(T.DIETARY_REVOKE_CONFIRM)
    expect(html).toContain('role="alertdialog"')
    expect(a11yProblems(html)).toEqual([])
  })
  it('desde la ficha se abre solo al pedirlo', () => {
    expect(view({ revokeDialog: true, restrictions: [restriction()] })).toContain('alertdialog')
    expect(view({ revokeDialog: false, restrictions: [restriction()] })).not.toContain('alertdialog')
  })
})

describe('formulario de alta', () => {
  const html = renderToStaticMarkup(<RestrictionForm mode="add" busy={false} error={null} onSubmit={noop} onCancel={noop} />)
  it('lista cerrada: 14 alérgenos de la UE y frutos concretos, trigo, lactosa, fructosa, gluten no celíaco y «Otra (escribir)»', () => {
    for (const label of ['Cereales con gluten', 'Trigo', 'Crustáceos', 'Moluscos', 'Huevo', 'Pescado', 'Cacahuete', 'Soja', 'Leche (proteínas lácteas)', 'Frutos de cáscara (todos)', 'Almendra', 'Avellana', 'Nuez de Brasil', 'Apio', 'Mostaza', 'Sésamo', 'Dióxido de azufre y sulfitos', 'Altramuces', 'Lactosa (intolerancia)', 'Fructosa (intolerancia)', 'Gluten (sensibilidad no celíaca)']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Otra (escribir)')
  })
  it('tres tipos, con la diferencia entre la alergia a la proteína de la leche y la intolerancia a la lactosa', () => {
    const t = text(html)
    expect(t).toContain('Alergia')
    expect(t).toContain('Intolerancia')
    expect(t).toContain('Otra restricción')
    expect(t).toContain('alergia a la proteína de la leche')
    expect(t).toContain('intolerancia a la lactosa')
    expect(t).toContain('no son lo mismo')
    expect(html.match(/type="radio"/g)).toHaveLength(3)
  })
  it('gravedad opcional y nota opcional de 200 como máximo', () => {
    expect(text(html)).toContain('Gravedad (opcional)')
    expect(html).toContain('Sin indicar')
    expect(html).toContain('maxLength="200"')
    expect(text(html)).toContain('(0/200)')
  })
  it('accesible: etiquetas en todos los campos y botones con nombre', () => {
    expect(a11yProblems(html)).toEqual([])
  })
  it('edición de una de la lista: sin selector (la clave no se cambia), con tipo, gravedad y nota', () => {
    const edit = renderToStaticMarkup(<RestrictionForm mode="edit" initial={restriction()} busy={false} error={null} onSubmit={noop} onCancel={noop} />)
    expect(edit).not.toContain('Otra (escribir)')
    expect(text(edit)).toContain('Leche (proteínas lácteas)')
    expect(a11yProblems(edit)).toEqual([])
  })
  it('edición de una de texto libre: deja cambiar el texto (máximo 60)', () => {
    const edit = renderToStaticMarkup(<RestrictionForm mode="edit" initial={restriction({ allergenKey: null, customLabel: 'kiwi' })} busy={false} error={null} onSubmit={noop} onCancel={noop} />)
    expect(edit).toContain('value="kiwi"')
    expect(edit).toContain('maxLength="60"')
  })
  it('en una lactosa (solo intolerancia o restricción) la opción «Alergia» queda desactivada', () => {
    const edit = renderToStaticMarkup(<RestrictionForm mode="edit" initial={restriction({ allergenKey: 'lactosa', kind: 'intolerancia', severity: null })} busy={false} error={null} onSubmit={noop} onCancel={noop} />)
    expect(edit).toMatch(/<input type="radio"[^>]*disabled=""[^>]*value="alergia"/)
    expect(edit).not.toMatch(/<input type="radio"[^>]*disabled=""[^>]*value="intolerancia"/)
  })
  it('un error de validación o del servidor se anuncia con role=alert', () => {
    const e = renderToStaticMarkup(<RestrictionForm mode="add" busy={false} error={DIETARY_ERROR_TEXT.duplicate} onSubmit={noop} onCancel={noop} />)
    expect(e).toContain('role="alert"')
    expect(text(e)).toContain(DIETARY_ERROR_TEXT.duplicate)
    expect(a11yProblems(e)).toEqual([])
  })
})

describe('quién ve cada ficha', () => {
  it('administradores y adultos ven todas; niño e invitado solo la suya', () => {
    const other = { linkedProfileId: 'otra' }
    const mine = { linkedProfileId: 'yo' }
    expect(canSeeDietarySection({ id: 'yo', role: 'admin' }, other)).toBe(true)
    expect(canSeeDietarySection({ id: 'yo', role: 'adult' }, other)).toBe(true)
    expect(canSeeDietarySection({ id: 'yo', role: 'child' }, other)).toBe(false)
    expect(canSeeDietarySection({ id: 'yo', role: 'guest' }, other)).toBe(false)
    expect(canSeeDietarySection({ id: 'yo', role: 'child' }, mine)).toBe(true)
    expect(canSeeDietarySection({ id: 'yo', role: 'guest' }, mine)).toBe(true)
    expect(canSeeDietarySection({ id: 'yo', role: 'child' }, { linkedProfileId: null })).toBe(false)
  })
})

describe('errores', () => {
  it('solo salen frases fijas: nunca el texto de un error ajeno', () => {
    expect(dietaryErrorText(new DietaryError('no_consent'))).toBe(DIETARY_ERROR_TEXT.no_consent)
    expect(dietaryErrorText(new Error('ZZ_CANARIO_ALERGIA_7731 detalle interno'))).toBe(DIETARY_ERROR_TEXT.network)
    expect(dietaryErrorText('cualquier cosa')).toBe(DIETARY_ERROR_TEXT.network)
  })
})
