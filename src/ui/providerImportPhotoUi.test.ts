import { describe, expect, it } from 'vitest'

// PEPA Eventos, prompt maestro Parte A6 — "Importar datos con foto" (tarjeta de visita, captura de Google
// Maps, foto o documento) → IA (analyze-provider-contact-document, mismo patrón que
// analyzeReceiptPhoto/analyzeForecastDocument) → revisión editable → SOLO al confirmar se aplica, y solo
// a los campos que la familia tenga vacíos (nunca sobrescribe algo ya escrito sin avisar). Verificado en
// vivo con npm run dev: una imagen sintética con datos reales se lee correctamente end-to-end.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('ImportProviderPhotoButton — nunca aplica nada sin que la familia confirme', () => {
  const comp = window_(UI, 'function ImportProviderPhotoButton(', '\nfunction ProviderExtraFields(')

  it('llama a analyzeProviderContactDocument y SOLO guarda el resultado para revisar (setResult), no lo aplica aún', () => {
    const handleFile = window_(comp, 'async function handleFile(', '\n  }')
    expect(handleFile).toContain('await analyzeProviderContactDocument(file)')
    expect(handleFile).not.toContain('onImported(')
  })
  it('si no se ha leído ningún dato, avisa en vez de mostrar una revisión vacía', () => {
    expect(comp).toContain('No se ha podido leer ningún dato en esta imagen')
  })
  it('"Usar estos datos" es el ÚNICO sitio donde se llama a onImported — "Descartar" solo limpia el resultado', () => {
    expect((comp.match(/onImported\(/g) ?? []).length).toBe(1)
    expect(comp).toContain('Usar estos datos')
    expect(comp).toContain('Descartar')
  })
})

describe('AddProviderGlobalForm/AddProviderAndLinkForm — importar nunca sobrescribe un campo ya escrito', () => {
  it('AddProviderGlobalForm.applyImported solo rellena cada campo si está vacío (!name && r.name, etc.)', () => {
    const form = window_(UI, 'function AddProviderGlobalForm(', '\nfunction EditProviderGlobalForm(')
    const applyFn = window_(form, 'function applyImported(', '\n  }')
    expect(applyFn).toContain('if (!name && r.name) setName(r.name)')
    expect(applyFn).toContain('if (!phone && r.phone) setPhone(r.phone)')
  })
  it('AddProviderAndLinkForm.applyImported tiene la misma regla', () => {
    const form = window_(UI, 'function AddProviderAndLinkForm(', '\nfunction ')
    const applyFn = window_(form, 'function applyImported(', '\n  }')
    expect(applyFn).toContain('if (!name && r.name) setName(r.name)')
    expect(applyFn).toContain('if (!email && r.email) setEmail(r.email)')
  })
  it('ambos formularios ofrecen el botón de importar', () => {
    const addGlobal = window_(UI, 'function AddProviderGlobalForm(', '\nfunction EditProviderGlobalForm(')
    const addAndLink = window_(UI, 'function AddProviderAndLinkForm(', '\nfunction ')
    expect(addGlobal).toContain('<ImportProviderPhotoButton onImported={applyImported} />')
    expect(addAndLink).toContain('<ImportProviderPhotoButton onImported={applyImported} />')
  })
})

describe('ProviderExtraFields — forceOpen reacciona a datos importados mientras estaba plegado (no solo al montar)', () => {
  it('useEffect reabre la sección cuando forceOpen pasa a true', () => {
    const comp = UI.slice(UI.indexOf('function ProviderExtraFields('))
    expect(comp).toContain('useEffect(() => {\n    if (forceOpen) setOpen(true)\n  }, [forceOpen])')
  })
})
