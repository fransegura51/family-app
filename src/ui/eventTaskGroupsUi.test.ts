import { describe, expect, it } from 'vitest'

// Bloque D/F/G — "🗂️ Encargos" integrado en Preparativos sin sobrecargarlo: cero cambio visual cuando
// no hay ningún encargo (groups.length === 0), un botón secundario junto a "+ Nueva tarea"/"👥
// Colaboradores" cuando sí se usa.
const UI = (import.meta.glob('/src/ui/EventosScreen.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['/src/ui/EventosScreen.tsx']

function window_(src: string, fromMarker: string, toMarker: string): string {
  const start = src.indexOf(fromMarker)
  expect(start, `no se encontró "${fromMarker}"`).toBeGreaterThan(-1)
  const end = src.indexOf(toMarker, start + fromMarker.length)
  expect(end, `no se encontró "${toMarker}" después de "${fromMarker}"`).toBeGreaterThan(start)
  return src.slice(start, end)
}

const TAREAS_MODULE = window_(UI, "case 'tareas': {", "case 'invitados':")
const MODAL = window_(UI, 'function TaskEditModal({', '\nfunction EventHelpersModal(')
const GROUPS_MODAL = window_(UI, 'function EventTaskGroupsModal(', '\nfunction ResolveGroupModal(')
const RESOLVE_MODAL = window_(UI, 'function ResolveGroupModal(', '\nfunction NextStepPromptModal(')
const NEXT_STEP_MODAL = window_(UI, 'function NextStepPromptModal(', '\nfunction EventShoppingSection(')

describe('bloque G: integración ligera, sin sobrecargar Preparativos', () => {
  it('"🗂️ Encargos" es un botón secundario (link-button) junto a "+ Nueva tarea" y "👥 Colaboradores"', () => {
    expect(TAREAS_MODULE).toContain('🗂️ Encargos')
    const row = window_(TAREAS_MODULE, '+ Nueva tarea', '</div>')
    expect(row).toContain('👥 Colaboradores')
    expect(row).toContain('🗂️ Encargos')
  })
  it('el selector de encargo en el formulario de tarea solo aparece si hay algún encargo creado (groups.length > 0) — cero cambio para quien no agrupa nada', () => {
    expect(MODAL).toContain('{groups.length > 0 && (')
  })
})

describe('bloque F: crear, asociar, desasociar — sin obligar a agrupar', () => {
  it('"+ Nuevo encargo" crea un encargo (addEventTaskGroup) desde "🗂️ Encargos"', () => {
    const addFn = window_(GROUPS_MODAL, 'async function add(', '\n  }')
    expect(addFn).toContain('await addEventTaskGroup(eventId, name)')
  })
  it('renombrar un encargo (saveEditing) actualiza el nombre', () => {
    const editFn = window_(GROUPS_MODAL, 'async function saveEditing(', '\n  }')
    expect(editFn).toContain('await renameEventTaskGroup(editing.id, editing.name)')
  })
  it('el selector "Encargo (opcional)" del formulario de tarea permite "Ninguno" (desasociar sin borrar la tarea)', () => {
    expect(MODAL).toContain('<option value="">Ninguno</option>')
  })
  it('crear la tarea nueva asocia el encargo elegido solo si se eligió uno (nunca una llamada vacía)', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const createBranch = window_(submitFn, 'if (isCreating) {', '} else {')
    expect(createBranch).toContain('if (groupId) await setEventTaskGroup(newId, groupId)')
  })
  it('editar una tarea solo llama a setEventTaskGroup si el encargo elegido cambió de verdad', () => {
    const submitFn = window_(MODAL, 'async function handleSubmit(', '\n  return (')
    const editBranch = submitFn.slice(submitFn.indexOf('} else {'))
    expect(editBranch).toContain("if (groupId !== (task.groupId ?? '')) await setEventTaskGroup(task.id, groupId || null)")
  })
})

describe('bloque F: borrar un encargo nunca borra sus tareas', () => {
  it('el aviso de borrado dice explícitamente que las tareas no se borran, con el número real', () => {
    const askFn = window_(GROUPS_MODAL, 'async function askDelete(', '\n  }')
    expect(askFn).toContain('const count = await countTasksInGroup(g.id)')
    expect(askFn).toContain('no se borran: quedan sin encargo')
  })
  it('deleteEventTaskGroup se llama tras confirmar, nunca borra tareas por su cuenta (ver eventTaskGroups.test.ts)', () => {
    const askFn = window_(GROUPS_MODAL, 'async function askDelete(', '\n  }')
    expect(askFn).toContain('await deleteEventTaskGroup(g.id)')
  })
})

describe('bloque F: crear una tarea directamente dentro de un encargo', () => {
  it('"+ Crear nueva tarea" lleva el id del grupo hasta la creación de la tarea', () => {
    expect(GROUPS_MODAL).toContain('onClick={() => onCreateTaskInGroup(g.id)}')
    expect(UI).toContain('onCreateTaskInGroup={(groupId) => {')
    expect(UI).toContain('setCreatingTaskInGroup(groupId)')
  })
  it('el formulario de creación preselecciona ese encargo (initialGroupId)', () => {
    expect(MODAL).toContain("const [groupId, setGroupId] = useState<string>(task?.groupId ?? initialGroupId ?? '')")
  })
})

// Tanda Encargos v2 (bloque 15) — "+ Añadir tarea existente" junto a "+ Crear nueva tarea": mete en el
// encargo una tarea que YA existe, en vez de obligar a crear una nueva. Solo ofrece tareas sin encargo
// todavía (una tarea pertenece como mucho a uno; mover entre encargos no se ofrece aquí).
describe('bloque 15: "+ Añadir tarea existente" — alternativa a crear una nueva', () => {
  it('existe junto a "+ Crear nueva tarea", y solo lista tareas sin encargo (ungroupedTasks = tasks.filter(!groupId))', () => {
    expect(GROUPS_MODAL).toContain('+ Añadir tarea existente')
    expect(GROUPS_MODAL).toContain('const ungroupedTasks = tasks.filter((t) => !t.groupId)')
  })
  it('añadir reutiliza setEventTaskGroup tal cual (ningún camino de escritura paralelo)', () => {
    const addExistingFn = window_(GROUPS_MODAL, 'async function addExistingTask(', '\n  }')
    expect(addExistingFn).toContain('await setEventTaskGroup(selectedExistingTaskId, groupId)')
  })
  it('tras añadir una tarea existente, se recargan tanto los encargos como las tareas (la propia lista de "Encargos" depende de `tasks`)', () => {
    expect(UI).toContain('onGroupsChanged={async () => {\n                  await reloadEventTaskGroups()\n                  await reloadTasks()\n                }}')
  })
})

describe('bloque F: ver las tareas de un encargo juntas, y la tarjeta las marca ligeramente', () => {
  it('"🗂️ Encargos" lista los títulos de las tareas de cada grupo', () => {
    expect(GROUPS_MODAL).toContain('const groupTasks = tasks.filter((t) => t.groupId === g.id)')
    expect(GROUPS_MODAL).toContain('{t.title}')
  })
  it('en Completadas (fuera del contenedor agrupado) la tarjeta sigue mostrando el nombre del encargo como etiqueta ligera (ahora con su punto de color, Fase 8 Parte C5 — ver eventTaskGroupColorsUi.test.ts)', () => {
    expect(UI).toContain('{groupName && (')
    expect(UI).toContain('🗂️ {groupName}')
  })
})

// Tanda Encargos v2 (bloque 1) — redefine el Encargo de una simple etiqueta por tarjeta a un CONTENEDOR:
// un encabezado "📦 NOMBRE" compartido, mostrado UNA vez, con sus tareas debajo — nunca repetido por
// tarjeta en la vista de Preparativos pendientes.
describe('contenedor de Encargo en Preparativos (pendientes): un encabezado compartido, nunca repetido por tarjeta', () => {
  const PENDING_LIST = window_(TAREAS_MODULE, "<div className=\"event-list\" style={{ marginTop: 8 }}>", 'pendingTasks.length > 5')

  it('la lista pendiente se construye agrupando con buildTaskGroupRenderItems, no con un .map plano de visibleTasks', () => {
    expect(PENDING_LIST).toContain('buildTaskGroupRenderItems(visibleTasks, eventTaskGroups).map((item) =>')
  })
  it('un bloque "group" pinta "📦 NOMBRE" UNA vez (fuera de cada TaskCard) y un botón para resolverlo', () => {
    expect(PENDING_LIST).toContain('📦 {item.groupName.toUpperCase()}')
    expect(PENDING_LIST).toContain('Resolver encargo')
  })
  it('dentro del contenedor, cada TaskCard no recibe groupName (el encabezado ya lo dice una vez) — mantiene sus controles normales', () => {
    const groupBlock = window_(PENDING_LIST, "<strong>📦 {item.groupName.toUpperCase()}</strong>", '</div>\n                ),\n              )}')
    expect(groupBlock).not.toContain('groupName=')
    expect(groupBlock).toContain('onToggleDone={() => void completeTaskWithNextStep(t)}')
    expect(groupBlock).toContain('reminder={{')
    expect(groupBlock).toContain('onDelete={() => deleteEventTask(t.id).then(reloadTasks)}')
  })
  it('una tarea suelta (sin encargo, o cuyo bloque "task") tampoco recibe groupName — nunca se pinta la etiqueta vieja a la vez que el nuevo contenedor', () => {
    const looseTaskBlock = window_(PENDING_LIST, 'item.type === \'task\' ? (', ') : (')
    expect(looseTaskBlock).not.toContain('groupName=')
  })
  // Conflicto de integridad real, resuelto siguiendo la decisión explícita de la usuaria: un encargo con
  // resolvedAt YA puesto pero con algo pendiente NUEVO (p. ej. un complemento floral añadido tras resolver
  // Flores) nunca debe esconder ese pendiente detrás de "✅ Resuelto" — este contenedor solo se pinta a
  // partir de tareas PENDIENTES (buildTaskGroupRenderItems sobre visibleTasks, ya filtrado a !done), así
  // que el botón "Resolver encargo" sale siempre aquí; la resolución anterior se conserva como referencia,
  // nunca se oculta ni se borra.
  it('el botón "Resolver encargo" sale SIEMPRE que haya algo pendiente, incluso si el encargo ya tuvo una resolución antes', () => {
    expect(PENDING_LIST).not.toContain('item.group.resolvedAt ? (')
    const groupBlock = window_(PENDING_LIST, "<strong>📦 {item.groupName.toUpperCase()}</strong>", '</div>\n                ),\n              )}')
    expect(groupBlock).toContain('<button type="button" className="link-button" onClick={() => setResolvingGroup(item.group)}>')
    expect(groupBlock).toContain('Resolver encargo')
  })
  it('si ya hubo una resolución antes, se muestra como referencia histórica ("Antes resuelto: …"), sin ocultar que hay algo nuevo pendiente', () => {
    const groupBlock = window_(PENDING_LIST, "<strong>📦 {item.groupName.toUpperCase()}</strong>", '</div>\n                ),\n              )}')
    expect(groupBlock).toContain('item.group.resolvedAt && (')
    expect(groupBlock).toContain('Antes resuelto: {RESOLUTION_METHOD_LABELS[item.group.resolutionMethod ?? \'otro\']}')
    expect(groupBlock).toContain('hay algo nuevo pendiente')
  })
})

describe('bloque G: no romper filtros ni completadas al agrupar', () => {
  it('filteredTasks/visibleTasks/completedTasks no se tocan por la agrupación (misma lógica de siempre)', () => {
    expect(UI).toContain('const filteredTasks = pendingTasks.filter((t) => taskMatchesResponsibleFilter(t, responsibleFilter))')
    expect(UI).toContain('const completedTasks = tasks.filter((t) => t.done)')
  })
  it('el modal de gestión manual de encargos (crear/renombrar/borrar/asociar) nunca completa tareas por su cuenta — solo "Resolver encargo" lo hace, y de forma explícita', () => {
    // updateEventTask( con el paréntesis, no updateEventTask a secas — si no, "updateEventTaskGroupOffer("
    // (Fase 6: ofertas) cuenta como un falso positivo al compartir el mismo prefijo.
    const groupsModalDoneCalls = GROUPS_MODAL.match(/updateEventTask\(/g) ?? []
    expect(groupsModalDoneCalls).toHaveLength(0)
  })
})

// Tanda Encargos v2, revisada en la Fase 7 (Parte C3, prompt maestro PEPA) por decisión EXPLÍCITA del
// usuario: "contratar" (resolver el encargo: proveedor, precio, método) y "completar tareas" son acciones
// SEPARADAS. Antes, "Marcar encargo como resuelto" completaba también las tareas pendientes del encargo
// — eso YA NO pasa: cada tarea se marca hecha a mano, como cualquier otra, nunca como efecto colateral de
// resolver el encargo.
describe('ResolveGroupModal — "contratar" nunca completa tareas (Fase 7, Parte C3)', () => {
  it('EventosScreen le sigue pasando las tareas pendientes de ESE grupo (para el aviso informativo), aunque ya no se usen para completarlas', () => {
    expect(UI).toContain('tasks={tasks.filter((t) => t.groupId === resolvingGroup.id && !t.done)}')
  })
  it('handleSubmit NUNCA llama a updateEventTask ni completa tareas por su cuenta', () => {
    const submitFn = window_(RESOLVE_MODAL, 'async function handleSubmit(', '\n  }\n\n  return (')
    expect(submitFn).not.toMatch(/updateEventTask\(/)
    expect(submitFn).not.toContain('done: true')
  })
  it('el aviso informativo deja claro que resolver no completa las tareas — hay que marcarlas a mano', () => {
    expect(RESOLVE_MODAL).toContain('no las completa: marca cada una a mano cuando esté hecha de verdad')
  })
  it('el precio TOTAL (si se pone) crea UN único event_payments — nunca uno por tarea, nunca toca event_budget_items', () => {
    expect(RESOLVE_MODAL).toContain('addEventPayment(event.id, { concept: group.name, totalAmount: amount, depositPaid: 0, providerId, providerName })')
    expect((RESOLVE_MODAL.match(/addEventPayment\(/g) ?? []).length).toBe(1)
    expect(RESOLVE_MODAL).not.toContain('event_budget_items')
    expect(RESOLVE_MODAL).not.toContain('addEventBudgetItem')
  })
  it('un proveedor nuevo se da de alta vía el sistema de Proveedores de siempre (addEventProvider), nunca un modelo paralelo', () => {
    expect(RESOLVE_MODAL).toContain('addEventProvider(event.id, { name: newProviderName })')
  })
  it('resolveEventTaskGroup guarda el método/nota/proveedor/pago/oferta en el propio encargo — nunca en las tareas', () => {
    expect(RESOLVE_MODAL).toContain(
      'resolveEventTaskGroup(group.id, { method, note: note.trim() ? note.trim() : null, providerId, providerName, paymentId, offerId: usedOfferId })',
    )
  })
  it('si el método no es "Empresa/proveedor", nunca se intenta crear ni proveedor ni pago', () => {
    const submitFn = window_(RESOLVE_MODAL, 'async function handleSubmit(', '\n  return (')
    const providerBlock = window_(submitFn, 'let providerId: string | null = null', 'let paymentId: string | null = null')
    expect(providerBlock).toContain("if (method === 'empresa') {")
    const paymentBlock = submitFn.slice(submitFn.indexOf('let paymentId: string | null = null'))
    expect(paymentBlock).toContain("method === 'empresa' && price.trim()")
  })
})

// Fase 7 (Parte C2/C4) — "Usar esta oferta al resolver" ahora además guarda de qué oferta viene (para
// poder consultarlo después) y propone el precio POR SERVICIOS seleccionados cuando la oferta los tiene
// desglosados, en vez del total simple siempre — pero el campo sigue siendo editable, nunca se fija solo.
describe('ResolveGroupModal — trazabilidad oferta→encargo y precio por servicios (Fase 7, Parte C2/C4)', () => {
  it('onUseOffer guarda usedOfferId (la oferta usada) además de proveedor/precio', () => {
    const onUseOfferProp = window_(RESOLVE_MODAL, 'onUseOffer={(offer) => {', '}}\n          />')
    expect(onUseOfferProp).toContain('setUsedOfferId(offer.id)')
  })
  it('el precio se calcula a partir de listEventTaskGroupOfferItems — la suma de las líneas seleccionadas si hay alguna con importe, el total simple si no', () => {
    const onUseOfferProp = window_(RESOLVE_MODAL, 'onUseOffer={(offer) => {', '}}\n          />')
    expect(onUseOfferProp).toContain('listEventTaskGroupOfferItems(offer.id)')
    expect(onUseOfferProp).toContain('i.selected && i.subtotal !== null')
    expect(onUseOfferProp).toContain('setPrice(String(selectedSum > 0 ? selectedSum : offer.amount))')
  })
})

// "Siguiente preparativo" — motor general (ver eventNextSteps.ts), nunca crea nada por su cuenta: las tres
// acciones pasan siempre por el formulario normal de "Nueva tarea" (TaskEditModal), nunca un segundo
// camino de creación.
describe('NextStepPromptModal — Crear preparativo / No hace falta / + Crear otro', () => {
  it('"Crear preparativo" abre TaskEditModal con el título de la sugerencia precargado — nunca lo crea directamente', () => {
    expect(UI).toContain("onCreate={(s) => setFollowUpCreate({ initialTitle: s.title, suggestionKey: s.key })}")
  })
  it('"+ Crear otro" abre el MISMO formulario, pero vacío — para una continuación distinta de la que PEPA conocía', () => {
    expect(UI).toContain("onCreateOther={() => setFollowUpCreate({ initialTitle: '', suggestionKey: null })}")
  })
  it('"No hace falta" no crea nada — solo retira esa sugerencia del propio prompt (efímero, nunca persistido)', () => {
    const dismissBtn = window_(NEXT_STEP_MODAL, 'No hace falta', '</button>')
    expect(dismissBtn).not.toMatch(/addEventTask|insert\(/)
  })
  it('una sugerencia ya creada no puede volver a crearse desde el mismo prompt (createdKeys)', () => {
    expect(NEXT_STEP_MODAL).toContain('disabled={prompt.createdKeys.has(s.key)}')
  })
})
