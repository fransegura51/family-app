import { describe, expect, it } from 'vitest'

// Fase 3 Bloque 5B — "✨ Pepa, hazla por mí" integrado en el editor real, evolucionado 2026-09-28: solo dos
// estilos (Clásico/Divertido) y la foto pasa a ser una elección aparte, ORTOGONAL al estilo (sección 18) —
// ya no un tercer estilo "Con foto" que había que elegir antes de poder subir la imagen. Sin React Testing
// Library (igual que el resto de src/ui/*Ui*.test.ts): se comprueba cómo está cableado el código fuente
// real, mismo patrón que invitationDesignerUndo.test.ts / invitationDesignerRedo.test.ts.
const SRC = (import.meta.glob('/src/ui/InvitationDesigner.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)[
  '/src/ui/InvitationDesigner.tsx'
]

function fn(name: string): string {
  const start = SRC.indexOf(`function ${name}`)
  expect(start, `${name} debería existir`).toBeGreaterThan(-1)
  return SRC.slice(start, SRC.indexOf('\n  }', start))
}

describe('sección 3-4 — la plantilla se elige ANTES, nunca al revés', () => {
  it('la plantilla activa para el motor es la que ya está puesta en el editor (templateKey/backgroundImageUrl), nunca un segundo estado de "plantilla elegida en el asistente"', () => {
    expect(SRC).toContain('const activeTemplateForPepa: InvitationTemplateMeta | null = backgroundImageUrl')
  })

  it('el panel "pepa" muestra la plantilla activa de solo lectura, con un enlace "Cambiar" que reabre el selector YA existente (nunca un segundo catálogo)', () => {
    const start = SRC.indexOf("panel === 'pepa' && (")
    const panel = SRC.slice(start, SRC.indexOf("panel === 'emoji'", start))
    expect(panel).toContain('Plantilla:')
    expect(panel).toContain("togglePanel('plantilla')")
    // Reutiliza InvitationTemplatePicker (ya existente) — se MONTA una sola vez en todo el editor.
    expect(SRC.match(/<InvitationTemplatePicker/g)?.length).toBe(1)
  })

  it('la compatibilidad de estilo se calcula a partir de la plantilla activa, no al revés', () => {
    expect(SRC).toContain('checkAllStyleCompatibility({ event, template: activeTemplateForPepa')
  })
})

describe('sección 5-7, 17 — compatibilidad real, sin casos especiales por nombre de plantilla', () => {
  it('los 2 estilos se muestran siempre (nunca ocultos), desactivados con motivo cuando no son compatibles — nunca un tercer estilo "con_foto"', () => {
    const start = SRC.indexOf("panel === 'pepa' && (")
    const panel = SRC.slice(start, SRC.indexOf("panel === 'emoji'", start))
    expect(panel).toContain("style: 'clasico'")
    expect(panel).toContain("style: 'divertido'")
    expect(panel).not.toContain("'con_foto'")
    expect(panel).toContain('disabled={disabled}')
    expect(panel).toContain('compat?.reason')
  })

  it('nunca hay un if hardcodeado por clave de plantilla (bruja/otono_hogar) en la UI del asistente', () => {
    const start = SRC.indexOf("panel === 'pepa' && (")
    const panel = SRC.slice(start, SRC.indexOf("panel === 'emoji'", start))
    expect(panel).not.toMatch(/template\.key\s*===\s*['"]/)
    expect(panel).not.toContain('bruja')
    expect(panel).not.toContain('otono_hogar')
  })
})

describe('sección 18 — la foto es ORTOGONAL al estilo, no un tercer estilo', () => {
  it('handlePepaSelectStyle compone directamente para cualquiera de los 2 estilos, usando la foto ya elegida (o ninguna) — nunca corta a esperar una foto', () => {
    const body = fn('handlePepaSelectStyle')
    expect(body).toContain('requestPepaGeneration(style, pepaPhotoPath)')
    expect(body).not.toContain("if (style === 'con_foto')")
  })

  it('el control de foto del asistente siempre está visible (no depende de qué estilo esté elegido)', () => {
    const start = SRC.indexOf("panel === 'pepa' && (")
    const panel = SRC.slice(start, SRC.indexOf("panel === 'emoji'", start))
    expect(panel).not.toContain("pepaStyle === 'con_foto'")
    expect(panel).toContain('pepaPhotoPath')
    expect(panel).toContain('handlePepaRemovePhoto')
  })

  it('handlePepaPhotoChange reutiliza el MISMO pipeline de subida/compresión que "+ Foto" (uploadInvitationPhoto + getInvitationPhotoUrl), nunca un segundo sistema', () => {
    const body = fn('handlePepaPhotoChange')
    expect(body).toContain('uploadInvitationPhoto(event.id, file)')
    expect(body).toContain('getInvitationPhotoUrl(path)')
  })

  it('añadir o quitar la foto con un estilo ya elegido regenera con ese mismo estilo (foto y estilo son dos decisiones independientes que se combinan)', () => {
    const photoChange = fn('handlePepaPhotoChange')
    expect(photoChange).toContain('if (pepaStyle) requestPepaGeneration(pepaStyle, path)')
    const removePhoto = fn('handlePepaRemovePhoto')
    expect(removePhoto).toContain('if (pepaStyle) requestPepaGeneration(pepaStyle, null)')
  })

  it('la compatibilidad se recalcula con la foto actual del asistente (una plantilla puede tener hueco sin foto pero no con ella)', () => {
    expect(SRC).toContain('checkAllStyleCompatibility({ event, template: activeTemplateForPepa, photoPath: pepaPhotoPath')
  })
})

describe('secciones 17-23 — generación coordinada por React, compuesta por el dominio', () => {
  it('applyPepaGeneration llama a composeInvitationForMe (nunca construye capas a mano)', () => {
    const body = fn('applyPepaGeneration')
    expect(body).toContain('composeInvitationForMe({')
  })

  it('un resultado fallido nunca toca `layers` (la composición anterior permanece intacta)', () => {
    const body = fn('applyPepaGeneration')
    const failIdx = body.indexOf("result.status !== 'success'")
    const setLayersIdx = body.indexOf('setLayers(result.layers)')
    expect(failIdx).toBeGreaterThan(-1)
    expect(setLayersIdx).toBeGreaterThan(failIdx)
    // Dentro del bloque de fallo no hay ningún setLayers.
    const failBlock = body.slice(failIdx, body.indexOf('}', failIdx))
    expect(failBlock).not.toContain('setLayers')
  })
})

describe('sección 19 — una sola operación de Undo por generación', () => {
  it('applyPepaGeneration llama a pushHistory() exactamente una vez, antes de setLayers', () => {
    const body = fn('applyPepaGeneration')
    const occurrences = body.match(/pushHistory\(\)/g) ?? []
    expect(occurrences.length).toBe(1)
    expect(body.indexOf('pushHistory()')).toBeLessThan(body.indexOf('setLayers(result.layers)'))
  })
})

describe('sección 20 — regenerar sobre contenido existente pide confirmación', () => {
  it('requestPepaGeneration comprueba hasExistingInvitationContent() antes de generar directamente', () => {
    const body = fn('requestPepaGeneration')
    expect(body).toContain('hasExistingInvitationContent()')
    expect(body).toContain('setPendingPepaGeneration({ style, photoPath })')
    expect(body).toContain('applyPepaGeneration(style, photoPath)')
  })

  it('hay un modal de confirmación real ("Cancelar"/"Crear nueva") antes de sustituir', () => {
    expect(SRC).toContain('PEPA va a crear una nueva composición')
    expect(SRC).toContain('Tus cambios actuales se sustituirán')
    expect(SRC).toContain('confirmPepaRegeneration')
  })
})

describe('sección 21 — nunca autosave', () => {
  it('applyPepaGeneration nunca llama a handleSave/saveEventInvitation', () => {
    const body = fn('applyPepaGeneration')
    expect(body).not.toContain('handleSave')
    expect(body).not.toContain('saveEventInvitation')
  })

  it('applyEventDataUpdate nunca llama a handleSave/saveEventInvitation', () => {
    const body = fn('applyEventDataUpdate')
    expect(body).not.toContain('handleSave')
    expect(body).not.toContain('saveEventInvitation')
  })
})

describe('secciones 10-16 — plantilla propia y su zona de escritura', () => {
  it('subir un fondo nuevo invalida la zona anterior y abre el editor visual con una propuesta razonable (DEFAULT_TEXT_AREA)', () => {
    const body = fn('handleBackgroundPhotoChange')
    expect(body).toContain('setCustomTextArea(null)')
    expect(body).toContain('setDraftTextArea(DEFAULT_TEXT_AREA)')
    expect(body).toContain('setDefiningTextArea(true)')
  })

  it('quitar la foto de fondo también limpia la zona de escritura', () => {
    const body = fn('handleRemoveBackgroundPhoto')
    expect(body).toContain('setCustomTextArea(null)')
  })

  it('el rectángulo admite mover Y redimensionar, con el mismo patrón de puntero que las capas normales', () => {
    const body = fn('handleTextAreaRectPointerMove')
    expect(body).toContain("d.mode === 'move'")
    expect(body).toContain('setDraftTextArea')
  })

  it('confirmTextArea fija customTextArea al rectángulo actual', () => {
    const body = fn('confirmTextArea')
    expect(body).toContain('setCustomTextArea(draftTextArea)')
    expect(body).toContain('setDefiningTextArea(false)')
  })

  it('"Hazla bonita" respeta la zona confirmada para un fondo propio, sin cambiar su comportamiento cuando no hay ninguna', () => {
    const body = fn('handlePrettify')
    expect(body).toContain('backgroundImageUrl ? (customTextArea ?? undefined) : undefined')
  })

  it('"Pepa, hazla por mí" también respeta la zona confirmada — la plantilla sintética se construye con ella', () => {
    expect(SRC).toContain('buildCustomTemplateMeta(customTextArea)')
  })

  it('customTextArea persiste: forma parte de EditorSnapshot, currentSnapshot/applySnapshot, la carga inicial y el guardado', () => {
    const snapshotIdx = SRC.indexOf('interface EditorSnapshot')
    const snapshotBlock = SRC.slice(snapshotIdx, SRC.indexOf('}', snapshotIdx))
    expect(snapshotBlock).toContain('customTextArea: SafeZone | null')
    expect(fn('currentSnapshot')).toContain('customTextArea')
    expect(fn('applySnapshot')).toContain('setCustomTextArea(s.customTextArea)')
    expect(fn('handleSave')).toContain('customTextArea')
  })
})

describe('secciones 9-11, 26-39 — seguimiento de datos del evento, evolucionado para el párrafo narrativo', () => {
  it('el aviso de cambios se calcula con getInvitationEventDataChanges/invitationHasTrackedEventData (nunca una copia del evento aparte)', () => {
    expect(SRC).toContain('getInvitationEventDataChanges(layers, event)')
    expect(SRC).toContain('invitationHasTrackedEventData(layers)')
  })

  it('el aviso se puede descartar ("Ahora no") sin tocar ningún dato', () => {
    expect(SRC).toContain('setChangesBannerDismissed(true)')
  })

  it('la búsqueda de la capa de un campo usa findLayerForField (soporta un dato suelto O un párrafo narrativo que lo teje), no solo `source.field`', () => {
    expect(SRC).toContain('function findLayerForField(layers: InvitationLayer[], field: string)')
    const body = fn('applyEventDataUpdate')
    expect(body).toContain('findLayerForField(layers, change.field)')
  })

  it('applyEventDataUpdate nunca sobrescribe un campo/párrafo personalizado sin permiso explícito (solo si la decisión es "update")', () => {
    const body = fn('applyEventDataUpdate')
    expect(body).toContain("manualFieldDecisions[change.field] === 'update'")
  })

  it('un campo eliminado del evento solo se quita si el usuario lo confirma, y NUNCA para un párrafo narrativo (se regenera, no se borra — sección 10)', () => {
    const body = fn('applyEventDataUpdate')
    expect(body).toContain('if (change.current === null && !isNarrative)')
    expect(body).toContain('if (removedFieldDecisions[change.field]) fieldsToRemove.push(change.field)')
  })

  it('los cambios se agrupan por capa en la UI (groupEventDataChanges) — varios campos de un mismo párrafo comparten una sola decisión', () => {
    expect(SRC).toContain('function groupEventDataChanges(')
    expect(SRC).toContain('groupEventDataChanges(eventDataChanges, layers).map((group)')
  })

  it('la actualización (aunque afecte a varios campos) es una sola operación de historial', () => {
    const body = fn('applyEventDataUpdate')
    const occurrences = body.match(/pushHistory\(\)/g) ?? []
    expect(occurrences.length).toBe(1)
  })
})
