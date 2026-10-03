import { describe, expect, it } from 'vitest'

const SRC = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function slice(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

describe('GuestsSection monta GuestQuestionsBlock — "📋 Preguntas a los invitados" vive junto a "+ Añadir invitado"/enlace abierto, no en el configurador', () => {
  it('se monta justo después de EventOpenLinkBlock', () => {
    const section = slice(SRC, 'function GuestsSection(', '\nconst GUEST_QUESTION_SCOPE_OPTIONS')
    expect(section).toContain('<EventOpenLinkBlock event={event} />')
    expect(section).toContain('<GuestQuestionsBlock event={event} />')
  })
})

describe('GuestQuestionsBlock — CRUD de preguntas/opciones, nunca de respuestas desde la app', () => {
  it('reutiliza listEventGuestQuestions/listEventGuestQuestionOptionsForEvent/updateEventGuestQuestion/deleteEventGuestQuestion', () => {
    const block = slice(SRC, 'function GuestQuestionsBlock(', '\n// Eventos Fase 14B')
    expect(block).toContain('listEventGuestQuestions(event.id)')
    expect(block).toContain('listEventGuestQuestionOptionsForEvent(event.id)')
    expect(block).toContain('updateEventGuestQuestion(question.id, { active: !question.active })')
    expect(block).toContain('deleteEventGuestQuestion(q.id)')
  })

  it('"+ Añadir pregunta a los invitados" abre GuestQuestionForm; al guardar, recarga', () => {
    const block = slice(SRC, 'function GuestQuestionsBlock(', '\n// Eventos Fase 14B')
    expect(block).toContain('+ Añadir pregunta a los invitados')
    expect(block).toContain('<GuestQuestionForm')
  })

  it('cada pregunta muestra scope/obligatoriedad/estado y sus opciones — nunca sus respuestas (esta fase no construye un visor de respuestas)', () => {
    const block = slice(SRC, 'function GuestQuestionsBlock(', '\n// Eventos Fase 14B')
    expect(block).toContain("q.scope === 'persona' ? 'Cada persona responde' : 'Una respuesta por familia/invitación'")
    expect(block).not.toContain('event_guest_question_answers')
    expect(block).not.toContain('Answers')
  })
})

describe('GuestQuestionForm — pregunta libre + opciones editables + scope + obligatoriedad, sin preselección', () => {
  it('no se puede guardar sin texto de pregunta ni sin al menos una opción', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('disabled={saving || !prompt.trim() || optionList.length === 0}')
  })

  it('"+ Añadir opción" permite cualquier texto libre, sin opciones predefinidas', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('function addOption() {')
    expect(form).toContain("setOptionList((prev) => [...prev, { id: null, label: optionInput.trim() }])")
  })

  it('scope por defecto es \'persona\', pero el organizador puede elegir \'invitacion\' — nunca se decide solo', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain("useState<GuestQuestionScope>(initialScope ?? 'persona')")
    expect(form).toContain('<ChoiceRow options={GUEST_QUESTION_SCOPE_OPTIONS} value={scope}')
  })

  it('GUEST_QUESTION_SCOPE_OPTIONS ofrece exactamente "Cada persona" y "Una respuesta por familia/invitación"', () => {
    const start = SRC.indexOf('const GUEST_QUESTION_SCOPE_OPTIONS')
    const arrayStart = SRC.indexOf('= [', start)
    const optionsBlock = SRC.slice(arrayStart, SRC.indexOf(']', arrayStart + 3))
    expect(optionsBlock).toContain("value: 'persona'")
    expect(optionsBlock).toContain("value: 'invitacion'")
  })

  it('"Respuesta obligatoria" no está marcada por defecto', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('const [required, setRequired] = useState(initialRequired ?? false)')
  })

  it('al crear (sin questionId), crea la pregunta y después cada opción enlazada a su id (addEventGuestQuestion devuelve la fila creada)', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('const question = await addEventGuestQuestion(event.id, { prompt: prompt.trim(), scope, required })')
    expect(form).toContain('await addEventGuestQuestionOption(question.id, event.id, opt.label)')
  })

  it('acepta initialPrompt/initialOptions/initialScope/initialRequired opcionales (petición real: "🚗 Transporte" propone una pregunta ya escrita, editable del todo antes de guardar) — "+ Añadir pregunta a los invitados"/"✏️ Otra pregunta" lo abren en blanco omitiéndolos', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('initialPrompt?: string')
    expect(form).toContain('initialOptions?: GuestQuestionOptionDraft[]')
    expect(form).toContain('initialScope?: GuestQuestionScope')
    expect(form).toContain('initialRequired?: boolean')
    expect(form).toContain("const [prompt, setPrompt] = useState(initialPrompt ?? '')")
    expect(form).toContain('const [optionList, setOptionList] = useState<GuestQuestionOptionDraft[]>(initialOptions ?? [])')
  })
})

describe('GuestQuestionForm — edición de una pregunta ya existente (mismo componente, questionId presente), CASO A-E', () => {
  it('CASO A/B — con questionId, "Guardar cambios" actualiza la MISMA pregunta (updateEventGuestQuestion) y nunca crea una nueva (addEventGuestQuestion) en esa rama', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    const handleSave = slice(form, 'async function handleSave(', '\n\n  return (')
    const editBranch = slice(handleSave, 'if (questionId) {', '\n      } else {')
    expect(editBranch).toContain('await updateEventGuestQuestion(questionId, { prompt: prompt.trim(), scope, required })')
    expect(editBranch).not.toContain('addEventGuestQuestion(')
  })

  it('CASO B — renombrar una opción existente la actualiza en el sitio (updateEventGuestQuestionOption), conservando su id — nunca borra+crea', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    const handleSave = slice(form, 'async function handleSave(', '\n\n  return (')
    expect(handleSave).toContain('if (original && original.label !== opt.label) await updateEventGuestQuestionOption(opt.id, opt.label)')
  })

  it('CASO C — texto/obligatoriedad se pueden cambiar siempre, haya o no respuestas reales (nunca comprueban answerStats)', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('<input type="checkbox" checked={required} disabled={saving} onChange={(e) => setRequired(e.target.checked)} />')
  })

  it('CASO D — quitar una opción que YA tiene respuestas (answeredOptionIds) exige confirmación explícita antes de poder perderla; sin respuestas se quita sin pedir nada', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    const removeOption = slice(form, 'function removeOption(index: number) {', '\n  function confirmRemoveOption')
    expect(removeOption).toContain('if (opt.id && answerStats?.answeredOptionIds.includes(opt.id)) {')
    expect(removeOption).toContain('setRemoveConfirmIndex(index)')
    expect(form).toContain('<ConfirmButton')
    expect(form).toContain('confirmMessage="Esta pregunta ya tiene respuestas con esta opción')
  })

  it('CASO E — cambiar el scope se bloquea del todo (no solo se avisa) en cuanto la pregunta ya tiene alguna respuesta, sea cual sea la opción', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('const scopeLocked = Boolean(questionId) && (answerStats?.total ?? 0) > 0')
    expect(form).toContain('disabled={saving || scopeLocked}')
    expect(form).toContain('Esta pregunta ya tiene respuestas — no se puede cambiar quién responde.')
  })

  it('al entrar en modo edición, consulta getEventGuestQuestionAnswerStats(questionId) — nunca asume que no hay respuestas', () => {
    const form = slice(SRC, 'function GuestQuestionForm(', '\nfunction GuestQuestionsBlock(')
    expect(form).toContain('getEventGuestQuestionAnswerStats(questionId)')
  })
})

describe('GuestQuestionsBlock — "✏️ Editar" abre el MISMO GuestQuestionForm precargado, nunca un formulario/sistema nuevo', () => {
  it('editingQuestionId intercambia esa tarjeta por GuestQuestionForm con questionId + valores iniciales de esa pregunta', () => {
    const block = slice(SRC, 'function GuestQuestionsBlock(', '\n// Eventos Fase 14B')
    expect(block).toContain('editingQuestionId === q.id ? (')
    expect(block).toContain('<GuestQuestionForm')
    expect(block).toContain('questionId={q.id}')
    expect(block).toContain('initialPrompt={q.prompt}')
    expect(block).toContain('initialScope={q.scope}')
    expect(block).toContain('initialRequired={q.required}')
    expect(block).toContain('initialOptions={options.filter((o) => o.questionId === q.id).map((o) => ({ id: o.id, label: o.label }))}')
  })

  it('"✏️ Editar" vive junto a Desactivar/Activar y Borrar — nunca sustituye nada de lo que ya funcionaba', () => {
    const block = slice(SRC, 'function GuestQuestionsBlock(', '\n// Eventos Fase 14B')
    expect(block).toContain('✏️ Editar')
    expect(block).toContain("{q.active ? 'Desactivar' : 'Activar'}")
    expect(block).toContain('ConfirmIconButton icon="✕"')
  })
})
