# AUDITORIA B1 (solo lectura) - Familia, La cocina de Pepa, Eventos, Pequenos Grandes, Documentos, Galeria, Contactos, Cumpleanos

Repositorio leido: `C:\Users\Usuario\Documents\proyectos claude\family-app-prefs` (HEAD `d3641f5`, 25/10/2026). Volcado: `tours_dump.json` (44 entradas de mi alcance: 8 visitas + 36 tutoriales).
Todo lo de abajo sale de leer codigo (no se ha ejecutado nada). Cuando algo no se puede comprobar leyendo, esta marcado **«no comprobado»**.
Abreviaturas: `TD` = `src/help/tours/defs`, `UI` = `src/ui`.

---------------------------------------------------------------------------------------------------------------------------------

## 0. Hallazgos transversales (afectan a todos los modulos)

1. **No existe el concepto de «capitulo»** en el motor: `TourDef`/`TourStep` (`src/help/tours/types.ts`) solo tienen `group` + `skipGroupLabel` (para saltar pasos opcionales) y `next` (fichas sugeridas). Un tutorial con capitulos necesita soporte nuevo (selector de capitulo, progreso por capitulo, `access` por capitulo). Hoy el unico filtro de permisos es por tutorial entero (`TourDef.access`, evaluado en `HelpProvider.canDoTour`, l.263-269).
2. **El permiso del tutorial NO hereda el de la ficha.** `canDoTour` solo mira el acceso del modulo + `TourDef.access`; el acceso de la ficha (`HelpCard.access`) solo lo aplican las respuestas de la Ayuda (`HelpAnswer`, `talkHelp`). Consecuencia comprobada: la ficha `fam-anadir-miembro` es `{familyAdmin:true}` (`src/help/catalog/cardsDiaADia.ts:356`) pero el tutorial `fam-anadir-miembro` no tiene `access` (`TD/famAnadirMiembro.ts`), asi que `HelpLearnArea` (que filtra con `help.canDoTour`) se lo ofrece a una persona adulta no administradora; su primer paso («+ Añadir miembro», no opcional) apunta a un boton que solo se pinta si `isAdmin` (`UI/FamilyScreen.tsx:392-411`) -> el motor lo deja en `broken / target-missing` (`engine.ts:107-111`). **Prioridad alta.**
3. **Restriccion de implementacion al fusionar tutoriales:** `src/help/tours/tourCoverage.test.ts` exige que *cada ficha no desactivada* tenga un tour con `cardId` igual (o `card.tour`) y que cada modulo con fichas tenga su visita. Un tutorial solo tiene un `cardId`. Si varios tutoriales se funden en uno con capitulos, hay que (a) fusionar tambien fichas (p.ej. `fam-anadir-miembro`+`fam-editar-ficha`+`fam-codigo-acceso`+`fam-invitado-limitado`) o (b) cambiar la prueba para admitir una lista de fichas por tutorial. Ademas el progreso («✓ Hecho», «Empezado») se guarda por `tour.id` + `version` (`HelpAreas.badgeOf`): renombrar ids borra ese progreso visible.
4. **Hay marcas `data-help-id` que ningun recorrido usa** (= funciones con marca pero sin tutorial): `cocina.menu-semana-nav`, `cocina.menu-importar`, `cocina.menu-acciones`, `cocina.recetas-buscar`, `cocina.recetas-favoritos`, `cocina.recetas-filtros`, `cocina.recetas-lista`, `cocina.receta-escalar`, `documentos.candado`, `documentos.quien-ve-personas`, `eventos.manage`, `eventos.event-hero`, `eventos.event-list`, `eventos.guest-export`, `eventos.guest-remind`, `eventos.guest-open-link`, `eventos.menu-shopping`, `family.member-photo`, `family.generate-code`, `pequenos.lista-editar`, `pequenos.regalo-editar` (comprobado cruzando `data-help-id` de `UI/**` con los literales de `TD/**`). Son los candidatos naturales a capitulos nuevos.
5. **Tutoriales que no hacen hacer nada** (todos los pasos `manualNext`, solo mirar): `tut-pequenos-mi-camino` (6 pasos), `tut-pequenos-monedero` (7), `tut-contactos-importar` (4), `tut-galeria-ampliar` (2), casi `tut-familia-actividad` (5) y `tut-familia-peso-medidas` (3). Por la definicion del encargo son nivel A («Conoce esta seccion») o C («Como funciona»), no B («Ensename a hacerlo»).
6. **Pasos de «entrar en el evento / tarjeta del modulo» duplicados 6 veces** (`abrirEvento`/`abrirModulo` en `TD/g4/eventos.ts:1-30`): cada tutorial de Eventos repite los mismos 2 pasos.
7. **Fichas/explicaciones que han quedado antiguas respecto al codigo** (ademas de los pasos): ver §4 (tabla de discrepancias).

---------------------------------------------------------------------------------------------------------------------------------

## 1. FAMILIA (7 entradas) - `UI/FamilyScreen.tsx`, `UI/BodyScreen.tsx`, `UI/AdultBodyView.tsx`, `UI/AccessInvitePanel.tsx`, `domain/guardianship.ts`

### 1.1 Inventario
| id | tipo | pasos | dur | access | cardId | explicacion enlazada | que cubre |
|---|---|---|---|---|---|---|---|
| `fam-anadir-miembro` | tutorial | 8 | 90 s | **ninguno** (ficha: familyAdmin) | `fam-anadir-miembro` | `exp-familia-dar-acceso` (tour del explicador) | «+ Añadir miembro»: nombre, tipo (con desplegable de tipos), color, nacimiento, sexo, secciones (niño/invitado), «Añadir» |
| `visita-familia` | visita | 8 | 100 s | - | `fam-anadir-miembro` | - | pestañas, lista, ⠿ arrastrar, ⋯, «Dar acceso», «+ Añadir miembro», Actividad, pestaña Peso |
| `tut-familia-editar-ficha` | tutorial | 8 | 90 s | adultsOnly | `fam-editar-ficha` | `exp-familia-tipos-de-miembro` | ⋯ → ✏️ Editar: nombre, color, nacimiento, sexo, tipo, Guardar |
| `tut-familia-secciones` | tutorial | 5 | 90 s | familyAdmin | `fam-invitado-limitado` | idem | ⋯ → ✏️ de un niño/invitado: checklist de secciones |
| `tut-familia-peso-medidas` | tutorial | 3 | 60 s | - | `fam-peso-medidas` | - | elegir persona, ver evolucion, formulario (solo señala) |
| `tut-familia-codigo-acceso` | tutorial | 4 | 100 s | familyAdmin | `fam-codigo-acceso` | `exp-familia-dar-acceso` | «🔑 Dar acceso a PEPA» + codigo (solo señala, no genera) |
| `tut-familia-actividad` | tutorial | 5 | 80 s | - | `fam-actividad` | - | enlace «🕘 Actividad reciente», lista, «Ver mas antiguas», limites |

### 1.2 Mapa funcional real (codigo)
Existe y funciona (FamilyScreen.tsx salvo indicacion):
- Pestañas «Miembros» / «⚖️ Peso y medidas» (l.231-247); destinos de Ayuda `familia.miembros|anadir-miembro|peso` (l.108-112).
- Lista de fichas reordenable con ⠿ (l.287-296, `handleDragEnd` l.198-205 llama a `reorderFamilyMembers` sin `catch`); avatar, pildora de tipo (`effectiveMemberType`: un bebé pasa solo a niño por edad), fecha de nacimiento, correo ✉️ (+ «sin confirmar», «cambio pendiente»), «Sin acceso a PEPA» (l.318-322).
- Panel de cambio de correo solo en la ficha propia (`ChangeEmailPanel`, l.316) - es de Cuentas, no de Familia.
- «🔑 Dar acceso a PEPA» (`AccessInvitePanel`) visible si `canGiveAccess` (l.323): admin en cualquier ficha sin cuenta salvo bebes; **madre/padre vinculado (adulto) solo en la ficha de su hijo menor** (`domain/guardianship.ts` `canGiveAccess`). Genera/reutiliza invitacion, caduca a 24 h, un solo uso, Copiar / Compartir (si `navigator.share`) / WhatsApp / «🔄 Generar otra» (AccessInvitePanel.tsx l.59-115).
- Vinculos parentales: «👪 Es mi hijo/a» (adultos/admin, `canDeclareGuardianship`), «Dejar de figurar como …» (l.325-355).
- Menu ⋯ (l.357-383): «📷 Foto», «✏️ Editar»; admin ademas «🔑 Generar código de acceso» (`InviteCodeButton` l.445-486, **ruta antigua** `generate_member_invite_code`) y «🗑 Borrar». El ⋯ lo ven `isAdmin || canEditMemberCard` (admin; adulto: su ficha y las de sus hijos menores vinculados).
- Formulario de edicion (`EditMemberForm` l.490-594): si `limited` (no admin) no hay Tipo ni Secciones; la fecha de nacimiento es obligatoria **solo si `isOwn && limited`** (l.518-522, etiqueta l.566).
- Alta (`AddMemberForm` l.654-814): solo admin (l.392-411). Tras crear: pantalla «Ficha creada: X - ¿Quieres darle acceso a PEPA ahora?» («Sí, dar acceso» / «Ahora no»), excepto bebes (l.705-711); y, si es el 2º adulto/admin, modal «¿Cómo lleváis las cuentas?» Compartidas/Separadas (`AccountsModePromptModal` l.599-645; condición `isFinancialAdult && existingAdults === 1`, l.702).
- Alergias/intolerancias (`FamilyDietarySection`): **apagado** (`domain/dietaryFeature.ts`: `DIETARY_FEATURE_DEFAULT=false`). No debe enseñarse.
- «Invitar amigos»: boton **desactivado y solo visible a administradoras de PEPA** (`InviteFriendsButton.tsx`). No debe enseñarse.
- «🕘 Actividad reciente» (l.258) -> `/actividad` (ActivityScreen).
- Peso y medidas (BodyScreen.tsx): chips de persona (`body.members`, l.160); la vista depende de la persona (`variantFor`, l.38-43): bebe -> percentiles OMS (BabyGrowthView), niño -> medidor de altura (KidsMeterView) + peso, resto -> `AdultBodyView` con **sub-pestañas ⚖️ Peso / 📏 Medidas / 📷 Fotos**, IMC, periodo, **peso objetivo** («🎯 Fijar un peso objetivo», «Quitar objetivo», AdultBodyView l.218-362); formulario «Registrar … » (l.459-511: fecha, peso, altura (cm o m), perimetro cefalico solo bebes, cintura/abdomen/brazo/pierna solo adultos); editar medida (modal l.217-240), borrar, «Convertir a centímetros» si hay alturas en metros (l.178-188), fotos de evolucion (subir, editar, borrar, comparar antes/despues).
Parcial / limitado: orden de fichas (el servidor solo deja a admin: politica `family_members: admin update`, `0001_init.sql:105` - **no comprobado en servidor real**; para un no-admin el ⠿ aparece y reordena en pantalla sin avisar si no se guarda).
No existe: cambiar el tipo de ficha por parte de no-admin; avisos de alergias.

### 1.3 Dependencias (navegacion, permisos, datos)
- Todos arrancan en `/familia` con `startDest` `familia.miembros` (o `familia.anadir-miembro`/`familia.peso`), destinos registrados en l.108-112 (correcto).
- `fam-anadir-miembro`: solo administracion (§0.2 - falta `access`).
- `tut-familia-secciones`: exige que exista un niño/a o invitado/a (paso `abrir-acciones` apunta a `family.member-actions-limited`, no opcional; el texto dice «Te señalo la primera que veo de esos tipos»). Sin ninguno -> `broken`. **Datos que pueden no existir.**
- `tut-familia-editar-ficha` (adultsOnly): para una adulta no admin el formulario es la version `limited`: sin «Tipo» (paso `tipo` opcional, se omite bien).
- `tut-familia-codigo-acceso` (familyAdmin): el paso `boton` es opcional; si todas las fichas ya tienen cuenta no sale el boton y se omite. Pero la **madre/padre adulta vinculada** tambien puede dar acceso a su hijo (guardianship) y el tutorial se lo oculta.
- `tut-familia-peso-medidas`: paso `evolucion` sin objetivo; paso `registrar` apunta al formulario de «nueva medida» (`body.measurement-form`, solo en el formulario no-editar). El contenido real **cambia segun la persona elegida** (bebe/niño/adulto) y el tutorial no lo dice.
- `tut-familia-actividad`: `/actividad` esta siempre visible (`ALWAYS_VISIBLE_PATHS`); sin datos la lista sale vacia (pasos `lista`/`mas` opcionales).

### 1.4 Discrepancias texto <-> codigo
| # | Donde | Texto | Realidad en el codigo | Prio |
|---|---|---|---|---|
| F1 | `TD/g9/familia.ts:30` (paso `boton`), `cardsDiaADia.ts:381` | «(tambien en su ⋯, como «🔑 Generar código de acceso»)» | Es **otro boton y otro flujo**: `InviteCodeButton` (FamilyScreen.tsx l.445-486) usa `generate_member_invite_code` y enseña unas instrucciones **antiguas** («toque "¿No tienes cuenta? Crear una" … luego "Ya tengo un código de invitación"»), que **contradicen** el flujo real de `LoginScreen.tsx:299` («¿No tienes cuenta? Tengo una invitación», primero invitacion, despues cuenta) y el paso `cuenta` del propio tutorial. Ademas esa ruta no ofrece Copiar/Compartir/WhatsApp (que el paso `codigo` promete). | **Alta** (dos instrucciones opuestas en la app) |
| F2 | `TD/g5/familia.ts:137` (editar-ficha, paso `nacimiento`) | «En tu propia ficha es obligatoria» | Solo es obligatoria si quien edita **no es admin** y es su ficha (`isOwn && limited`, l.518-522). Un admin editando su propia ficha ve «(opcional)». | Baja |
| F3 | `visita-familia` paso `arrastrar` | «Ese orden solo lo puede guardar la administración» | Coherente con la RLS (0001) pero la pantalla no lo comunica; no comprobado en servidor. | Baja |
| F4 | `tut-familia-codigo-acceso` access `familyAdmin` | solo admin | `canGiveAccess` tambien permite a una madre/padre vinculado, solo para su hijo menor | Media |
| F5 | `fam-anadir-miembro` (flujo) | `finishText` menciona la pregunta de acceso | OK, pero **no menciona** el modal «¿Cómo lleváis las cuentas?» del 2º adulto (l.599-645, que si aparece en pleno recorrido y puede confundir) | Media |
| F6 | `visita-familia` paso `acciones` | «Foto y Editar … la administración ve alguna acción más» | Cierto (🔑 Generar código, 🗑 Borrar), pero ni visita ni tutoriales nombran «🗑 Borrar» ni «Dejar de figurar» ni «👪 Es mi hijo/a». | Media |

### 1.5 Omisiones de campos/controles en los recorridos
- **Alta de miembro**: el tutorial recorre nombre, tipo, color, nacimiento, sexo, secciones -> completo. Falta lo que ocurre justo despues: pantalla «¿Quieres darle acceso ahora?» (solo en `finishText`) y modal de modo de cuentas.
- **Editar ficha**: no hay paso de **«📷 Foto»** (la marca `family.member-photo` existe y no se usa; el paso `editar` solo lo menciona de pasada), ni de **«🗑 Borrar»**, ni del cambio de **secciones** (esta en otro tutorial), ni de los vinculos «👪 Es mi hijo/a».
- **Dar acceso**: no cubre «🔄 Generar otra» (invalida la anterior), ni que el correo/ficha queda enlazada, ni el camino de la madre/padre para su hijo.
- **Peso y medidas**: faltan, con control existente: el formulario campo a campo (por edad), **editar/borrar una medida**, **sub-pestañas Peso/Medidas/Fotos**, **peso objetivo** (funcion reciente, commit `e87dfbe`), **fotos de evolucion**, «Convertir a centimetros». El tutorial actual (3 pasos) no tiene ningun paso interactivo.

### 1.6 Propuesta de estructura (Familia)
Justificacion de uso real: la administracion hace «alta -> dar acceso -> ajustar secciones» como un flujo continuo; la edicion de ficha es casi igual a esa misma pantalla; Peso y medidas es una herramienta distinta (cualquier adulto).
- **A. «Conoce Familia»** (visita, 6 pasos, ~1,5 min): pestañas, lista (✉️/sin acceso), ⠿, ⋯, «Dar acceso», Actividad y Peso (quitar los textos que repiten los tutoriales: `anadir`).
- **B1. «Gestionar las fichas de la familia»** (≈5-6 min, 4 capitulos; B1 va solo a admin salvo el cap. 2 que es adulto):
  1. *Añadir un miembro* (1,5 min) - reutiliza `fam-anadir-miembro` (8 pasos) + 2 pasos nuevos: «Ficha creada: ¿dar acceso ahora?» y aviso del modo de cuentas (2º adulto). Mover «Qué significa cada tipo» (`details`) a C (ya existe `exp-familia-tipos-de-miembro`), dejando solo un enlace.
  2. *Editar una ficha y cambiar su foto* (1,5 min) - reutiliza `tut-familia-editar-ficha` (arreglar F2) + paso nuevo «📷 Foto» (marca ya existe) + «🗑 Borrar» (informativo). Accesible a adultos (con la version limitada).
  3. *Elegir a qué secciones entra un niño o un invitado* (1 min) - reutiliza `tut-familia-secciones` (5 pasos, 3 utiles). **Solo admin y solo si hay niño/invitado** (paso opcional para no romper; mejor ocultar el capitulo si no hay datos).
  4. *Dar acceso a PEPA* (1,5 min) - reutiliza `tut-familia-codigo-acceso` (reescribir F1, F4; cubre tambien «Es mi hijo/a» para adultos como paso previo).
- **B2. «Peso y medidas»** (≈4,5 min, 3 capitulos; adultos y familia): 1) *Apuntar una medida* (persona, formulario segun edad, Guardar - reescribir `tut-familia-peso-medidas`, hoy sin interaccion); 2) *Leer la evolucion* (percentiles / medidor / grafica + sub-pestañas de adulto; parte «informativa» puede ser A); 3) *Peso objetivo y fotos de evolucion* (nuevo, solo vista adulta).
- **Actividad reciente**: **no merece tutorial** (casi todo manual). Pasarlo a: A (paso `actividad` de la visita) + C (los limites de «solo 6 tipos» y «proceso automatico» ya estan en la ficha). Problema de cobertura: la ficha `fam-actividad` quedaria sin tour propio salvo que se re-apunte (ver §0.3); decision tecnica.
- **Pertenece a C** (ya existe `exp-familia-*`): tipos de miembro, administrar familia vs administrar PEPA, por qué la fecha de nacimiento (Comunidad 18+), caducidad de 24 h y un solo uso.
- Conteo: 7 entradas -> 1 visita + 2 tutoriales (7 capitulos). Si el equipo prefiere minimo: B1 (4 cap.) + B2 (2 cap.).

---------------------------------------------------------------------------------------------------------------------------------

## 2. LA COCINA DE PEPA (5 entradas) - `UI/AlimentacionScreen.tsx` (1690 l.), `UI/CocinarTab.tsx`, `UI/KitchenMenuShoppingSheet.tsx`, `UI/ShoppingLinesSheet.tsx`

### 2.1 Inventario
| id | tipo | pasos | dur | access | ficha | explicacion | que cubre |
|---|---|---|---|---|---|---|---|
| `visita-cocina` | visita | 6 | 80 s | - | `coc-menu-semanal` | - | portada (3 accesos), Menú, Recetas, Cocinar, ☰ Menu, 🛒 |
| `tut-cocina-menu-plato` | tutorial | 3 | 60 s | - | `coc-menu-semanal` | - | «+ Añadir» en un hueco -> receta o texto -> OK |
| `tut-cocina-receta-escribir` | tutorial | 8 | 110 s | - | `coc-receta` | `exp-cocina-que-cocino-hoy` (cardIds incl. coc-receta) | «+ Nueva receta» modo ✍️, titulo, raciones, etiquetas, ingredientes, pasos, «Crear receta» |
| `tut-cocina-menu-a-compras` | tutorial | 6 | 100 s | - | `coc-menu-a-compras` | `exp-cocina-menu-a-compras` | «🛒 Añadir semana a Compras» -> hoja: personas, revisar, marcar, confirmar |
| `tut-cocina-que-cocino` | tutorial | 5 | 80 s | - | `coc-que-cocino-hoy` | `exp-cocina-que-cocino-hoy` | «Tengo…», personas, «🔍 Buscar (gratis)», resultados, «💡 Pedir ideas a la IA» |

### 2.2 Mapa funcional real
- Portada `Inicio` con 3 tarjetas (AlimentacionScreen.tsx l.244-280) y menu ☰ solo con «📌 Sacar / 📍 Quitar» (l.309-352; sin modo Editar desde 24/10).
- **Menú semanal** (MenuTab l.351-640): navegacion de semana «‹ Anterior · fechas · Siguiente ›» y «Volver a hoy» (l.416-432, **nueva**, commit `22d9141`); boton «📥 Importar menú de Comunidad» (solo si Comunidad visible, l.433-438); «🛒 Añadir semana a Compras» (solo si hay algo comprable, l.439-446); 7 dias desde hoy (o desde `?desde=`), cada uno con **5 comidas: Desayuno, Comida, Merienda, Cena, Snack** (`MEAL_TYPES` l.80-86); por hueco: «+ Añadir», selector receta o texto libre + OK/✕ (l.663-693); un plato ya puesto: nombre (abre ficha emergente de la receta con «Abrir la receta completa»), iconos 🛒 / ✏️ editar / 🗑 quitar (l.504-526); acompañamientos extra en el mismo hueco (importados de Comunidad).
- **Recetas** (RecipesTab l.730-1175): buscador de guardadas, ⭐ Favoritos, 🎚️ Filtros (ingrediente + etiquetas), lista, «+ Nueva receta» (boton flotante), ficha emergente con **🛒 a Compras (PickIngredientsModal), 📤 compartir, ✏️ editar, ✕ borrar, aviso «Hay una versión nueva» y «Compartir en Comunidad»**, raciones con **− / +** (`ScaledIngredients`, commit 9cb83ef/22d9141) e «Indicar raciones».
- **Formulario de receta** (RecipeForm l.1201-1689): titulo (con historial), «¿Cómo quieres empezar?» ✍️ Escribirla / 🔍 Buscar (Cookpad+FatSecret+Wikibooks, elegir candidata, «Usar esta receta») / 🔗 Enlace (importar URL), **Foto** (subir, o «🌐 Usar una foto de internet»), raciones, etiquetas, ingredientes (nombre/cantidad/unidad), pasos.
- **¿Qué cocino hoy?** (CocinarTab): «Tengo…», «Para N personas», 🎤 dictado (si el navegador lo soporta), «🔍 Buscar qué cocinar (gratis)» -> guardadas que se pueden hacer (con «Te faltaría…», sal/aceite/agua/pimienta/vinagre no cuentan: `cookFromSaved.STAPLES`) + recetas de internet (Cookpad) con «🔗 Ver» y «💾 Guardar en mis recetas» (hoja `RecipeDraftSheet`) + «💡 Pedir ideas a la IA» (solo adultos), «📖 Ver la receta y guardarla», «🔊 Escuchar».
- Hoja «Añadir a Compras» (ShoppingLinesSheet): intro, **«Personas»** (por defecto = admin+adult+child de la familia, `defaultDiners`), aviso «N productos ya están en tu lista … sin marcar», Marcar/Desmarcar todo, **eleccion de tienda** (`StoreChoiceBar`/`RowStoreSelect`), seccion «Escritos a mano», boton «Añadir N a Compras».
Alergias en recetas: apagado (feature flag).

### 2.3 Dependencias
- Destinos `cocina.inicio|menu|recetas|cocinar` (l.134-139) OK.
- `tut-cocina-menu-a-compras`: el boton 🛒 solo existe si `hasShoppableEntry` -> el paso `abrir` (no opcional) se rompe sin ningun plato en el menu; el paso `requisito` lo avisa por texto, pero el motor no lo impide. **Datos que pueden no existir.**
- `tut-cocina-menu-plato`: no necesita datos (admite texto libre). `tut-cocina-receta-escribir`: no necesita datos. `tut-cocina-que-cocino`: el paso `ia` es opcional; el boton «Pedir ideas a la IA» solo existe mientras `result.ideas` esta vacio y exige cuenta adulta con IA activa (`aiErrorText`).
- Los modales de receta (`/alimentacion?receta=`) y la ficha de plato son capas de UI sobre la misma pantalla: no hay problema de `startDest`.
- Permisos: ningun rol esta restringido en Cocina salvo la IA (adultos).

### 2.4 Discrepancias
| # | Donde | Texto | Realidad | Prio |
|---|---|---|---|---|
| C1 | `TD/g3/cocina.ts:27` (visita, paso `menu`) | «ves los 7 días a partir de hoy, cada uno con desayuno, comida, merienda y cena» | Hay **5 comidas (Snack)** y se puede **cambiar de semana** y «Volver a hoy». | Media |
| C2 | `TD/g3/cocina.ts:82` (`menu-plato` paso `anadir`) | «hueco para desayuno, comida, merienda y cena» | idem (falta Snack) | Media |
| C3 | `cardsDiaADia.ts` `coc-receta` `limits` | «Las recetas guardadas no recalculan las cantidades al cambiar raciones» | Falso desde 24/10: `ScaledIngredients` (− / +) recalcula en el visor (solo la vista, no la receta). | Media |
| C4 | `explainers/g3/cocina.ts` limits | «El menú solo muestra 7 días a partir de hoy» | Sigue siendo 7 dias visibles, pero ahora navegables (semana anterior/siguiente); el texto induce a creer que no se puede ir a otra semana. | Baja |
| C5 | `tut-cocina-menu-a-compras` | pasos `personas/revisar/marcar/confirmar` | Omite la **eleccion de tienda por ingrediente** y la seccion «Escritos a mano» de la hoja. | Media |
| C6 | `tut-cocina-receta-escribir` paso `modo` | «Buscar y Enlace … no las usamos ahora» | Correcto, pero **no hay ningun recorrido de Buscar/Enlace** (importar una receta, el flujo mas usado para llenar el recetario). | Media |

### 2.5 Omisiones en los formularios que recorren
- Receta: falta **Foto** (campo visible y destacado, con «🌐 Usar una foto de internet»), y las acciones sobre una receta ya creada (ver, 🛒, 📤, ✏️, ✕, ⭐ favorito = etiqueta «Favoritos», raciones −/+). Favoritos solo existe como etiqueta; el tutorial de etiquetas no lo dice.
- Menu: falta **editar (✏️) y quitar (🗑)** un plato, el **🛒 por plato**, **Snack**, **semana anterior/siguiente**, y «📥 Importar menú de Comunidad».
- ¿Qué cocino hoy?: falta **🎤 dictado**, **«💾 Guardar en mis recetas»** (una receta de internet encontrada), y el paso de «Ver la receta y guardarla» de las ideas IA.

### 2.6 Propuesta de estructura (Cocina)
Los 3 accesos de la portada ya son 3 «mini-aplicaciones» con uso real distinto: se proponen **3 tutoriales** (no 5) con capitulos cortos.
- **A. «Conoce La cocina de Pepa»** (visita 6 pasos, 1,5 min): corregir C1; quitar el paso `compras` (es del cap. 2 del Menu) o dejarlo breve.
- **B1. «Planificar la semana»** (≈3 min, 2 cap.): 1) *Añadir, cambiar y quitar un plato* (reutiliza `menu-plato` 3 pasos + pasos nuevos: ✏️/🗑, semana siguiente, Snack) - el actual de 3 pasos **es demasiado pequeño para ser independiente**; 2) *Pasar los ingredientes a Compras* (reutiliza `menu-a-compras` 6 pasos + paso de tienda; ocultar o saltar si el menu esta vacio).
- **B2. «Mis recetas»** (≈5,5 min, 3 cap.): 1) *Escribir una receta* (reutiliza `receta-escribir`; añadir Foto); 2) *Traer una receta de internet o de un enlace* (nuevo: modos Buscar/Enlace, «Usar esta receta»); 3) *Usar una receta* (nuevo: abrir, raciones −/+, 🛒, compartir, favoritos/filtros).
- **B3. «¿Qué cocino hoy?»** (1 cap., ≈2 min): reutiliza `que-cocino` (5 pasos) + paso «Guardar en mis recetas». Pequeño pero es una seccion propia de la portada; si se prefiere, se funde como cap. 4 de B2.
- **C**: qué cuenta como «hay lo necesario» (sal/aceite/agua/pimienta/vinagre), IA solo adultos y bajo peticion, cómo se suman cantidades al pasar a Compras (ya existen `exp-cocina-menu-a-compras` y `exp-cocina-que-cocino-hoy`; actualizar C3/C4).
- Conteo: 5 entradas -> 1 visita + 3 tutoriales (6 capitulos).

---------------------------------------------------------------------------------------------------------------------------------

## 3. EVENTOS (8 entradas) - `UI/EventosScreen.tsx` (**17.011 lineas**), `UI/EventMenu*.tsx`, `UI/EventDayPlan.tsx`, `UI/InvitationDesigner.tsx` (3.802 l.), `domain/events.ts`

### 3.1 Inventario
| id | tipo | pasos | dur | ficha | que cubre |
|---|---|---|---|---|---|
| `visita-eventos` | visita | 8 | 110 s | `eve-crear` | intro, «+ Nuevo evento», filtro En marcha/Archivados, «📇 Proveedores y ofertas», rejilla de modulos, configurador, «🪄 Organizamelo», aviso de envios |
| `tut-eventos-crear-evento` | tutorial | 5 | 80 s | `eve-crear` | «+ Nuevo evento»: nombre, tipo, modulos, «Crear evento» |
| `tut-eventos-anadir-tarea` | tutorial | 9 | 110 s | `eve-crear` | entrar al evento -> tarjeta Preparativos -> «+ Nueva tarea»: titulo, fecha, prioridad, responsables, calendario, Guardar |
| `tut-eventos-anadir-invitado` | tutorial | 6 | 90 s | `eve-invitados` | evento -> Invitados -> «+ Añadir invitado»: nombre, adultos/niños, Añadir |
| `tut-eventos-anadir-partida` | tutorial | 7 | 90 s | `eve-presupuesto` | evento -> Presupuesto -> resumen (4 cifras) -> «+ Añadir partida»: concepto, importe |
| `tut-eventos-anadir-plato` | tutorial | 5 | 80 s | `eve-menu` | evento -> Menú del evento -> «+ Añadir plato»: nombre |
| `tut-eventos-anadir-momento` | tutorial | 7 | 90 s | `eve-plan-dia` | evento -> Plan del día -> «+ Añadir momento»: nombre, hora, «Mostrar al compartir» |
| `tut-eventos-crear-invitacion` | tutorial | 6 | 100 s | `eve-invitacion` | evento -> Invitación -> «+ Crear invitación» -> barra de herramientas, plantilla, «💾 Guardar» |
Explicaciones (C): `exp-eventos-confirmacion-invitados`, `exp-eventos-menu-compras-presupuesto`, `exp-eventos-organizame-pepa`. Nota: las fichas `eve-*` NO llevan el campo `tour` (se enlazan por `TourDef.cardId`).

### 3.2 Mapa funcional real
Existe y funciona:
- Lista (EventosScreen l.929-980): «+ Nuevo evento», «📇 Proveedores y ofertas» (registro global, `ProvidersGlobalScreen`), filtro En marcha/Archivados, tarjeta por evento.
- «Nuevo evento» (CreateEventModal l.990-1140): **plantilla opcional** (si hay plantillas guardadas, con borrado), nombre, tipo (🎂 Cumpleaños, ⛪ Comunión, 👶 Bautizo, 🎉 Celebración, 💍 Boda íntima, ✨ Personalizado - `EVENT_TYPE_META`), **«Tipo de celebración»** (solo si Celebración), **14 modulos** premarcados segun tipo (✨ recomendados): Invitados, Invitación, Preparativos, Presupuesto, Pagos y fianzas, Menú del evento, Decoración, Actividades y juegos, Mesas, Ceremonia, Proveedores y ofertas, Detalles/recuerdos, Regalos recibidos, Plan del día (`EVENT_MODULES`, domain/events.ts:172-189). Fecha/lugar NO se piden aquí (se hacen en el configurador).
- Panel del evento (EventDetail l.2025-2356): «← Todos los eventos», «⚙️ Gestionar evento» (info, La pareja en bodas, activar/desactivar secciones, guardar como plantilla, duplicar, archivar con resumen final, borrar - ManageEventModal l.2373-2630), tarjeta con cuenta atras, «Estado del evento» (tareas, invitados, presupuesto, proximo hito), «💡 Pepa te recomienda» (tareas proximas), propuestas de prioridad, **configurador plegable «Cómo queréis que sea vuestro evento»** (bloques: Ceremonia y celebración / La pareja / Invitados e invitaciones / Momentos especiales / Comida y bebida / Personas especiales / Familiares / Fotos y recuerdos / Música… - l.5906-10911), rejilla de tarjetas (una por modulo activado + «Compras» si hay Menú), «🪄 Organizame Pepa» (solo en `status==='planificacion'`, l.2298-2307; hoja con checklist y boton «Aplicar»).
- **Preparativos** (l.1650-1990): filtro por responsable (Todos/Sin asignar/personas/colaboradores), «+ Nueva tarea», «👥 Colaboradores» (personas externas del evento), «🗂️ Encargos» (grupos de tareas con «📋 Consultar ofertas» y «Resolver encargo»), completadas, campana de recordatorio por tarea. Formulario de tarea (TaskEditModal l.3084-3295): Título, Fecha, **Hora (opcional)**, Prioridad, **Encargo (si hay encargos)**, Responsables (varias personas + **«+ Añadir persona externa»**), **Nota**, «📅 Mostrar en Calendario» (solo con fecha) y, si se marca, **Recordatorios** (varios presets + personalizado).
- **Invitados** (GuestsSection l.12039-12278): «📤 Exportar invitados», resumen de cifras, **«🔗 Enlace abierto (opcional)»** (activar, compartir, regenerar, desactivar - EventOpenLinkBlock l.12280), preguntas a invitados, «🔔 Recordar a pendientes» (texto para compartir, nunca se manda solo), filtro por estado RSVP, por invitado: **«💌 Invitación»** (InvitationModal l.15254: enlace personal de confirmacion + imagen de la invitacion si existe; compartir/regenerar), estado de asistencia editable, adultos/niños que vienen, nota del invitado, desglose, «A qué está invitado» en bodas/comuniones. «+ Añadir invitado» (AddGuestModal l.12889-12985): Nombre o familia, Adultos, Niños, **A qué está invitado (solo eventos con dos lugares)**, **Notas**.
- **Invitación** (InvitationSection l.11929 + InvitationDesigner): «+ Crear invitación»/«🎨 Editar diseño»/«Revisar invitación» (si cambiaron datos del evento), diseñador: 🔍 Editar/Completa, ↩️ Deshacer, ↪️ Rehacer, **✨ «Pepa, hazla bonita» / «hazla por mí»**, barra Texto/Datos/Foto/Decorar/Plantilla (+ Color/Tamaño/Más al seleccionar capa), «💾 Guardar» (InvitationDesigner l.2640-2690, 3600-3660). «Para enviarla a los invitados, ve a 👥 Invitados.» (l.12016).
- **Presupuesto** (l.13008-13240): cuatro tarjetas (Planificado, Comprometido, Pagado, Gastado en Economía) con ⓘ, agrupar por (Sin agrupar/categoria/encargo/proveedor), «+ Añadir partida» (AddBudgetItemModal l.13254-13380: **Concepto, Categoría (sugerida sola), Presupuesto (€), Encargo (si hay), Proveedor (si hay)**), edicion en linea, desglose, historial.
- **Menú del evento** (EventMenu.tsx): comensales (DinersPanel), "MENU" con «+ Añadir plato», «+ Encabezado o nota», «📷 Importar menú» (foto/PDF), **«🛒 Preparar compra del menú»** (solo si cocina la familia), originales, «⚙️ Gestionar secciones», vistas «Orden del menú / Por secciones». Plato (l.620-715): **Tipo (plato/encabezado/nota), Plato, Sección, Nota, «No hay que comprarlo», «¿Quién lo prepara?» (modo mixto), Receta (si aplica)**. Mensaje «sin comida» si el configurador dice que el evento no lleva comida.
- **Plan del día** (EventDayPlan.tsx): lista cronologica + «Sin hora» reordenable (☰, ▲▼), momentos que vienen de «Comida y bebida» (🍽️), aviso «Misma hora · ¿coinciden?», «+ Añadir momento»: Nombre, Hora (opcional), **Nota (opcional)**, «Mostrar al compartir».
- Modulos con pantalla y **sin ningun recorrido**: Pagos y fianzas (PaymentsSection l.14653), Decoración (l.15648), Actividades y juegos (l.15734), Mesas (l.15478), Ceremonia, Proveedores y ofertas (por evento, l.14128), Detalles/recuerdos (l.15906), Regalos recibidos (l.16361), Compras del evento, plantillas, archivar/duplicar, configurador.
No existe / parcial: **compartir el plan del día** (no hay ningun boton que comparta el plan; `showOnShare` solo se guarda y se muestra como «· solo para vosotros»; comprobado: ninguna otra referencia en `UI`/`data` lo lee). Alergias/necesidades alimentarias: apagado (la propia ficha `eve-menu` lo dice; `domain/dietaryFeature.ts`).

### 3.3 Dependencias
- Los 6 tutoriales «de modulo» arrancan en `/eventos` **lista** y usan `abrirEvento` -> `eventos.event-card` (necesita al menos un evento) y `abrirModulo` (necesita el modulo activado). Si la persona ya esta dentro de OTRO modulo del evento, ni `module-grid` ni la tarjeta destino estan en pantalla (`skipIf` no se cumple) y el paso `evento` espera una `event-card` que no existe -> riesgo de `broken` (**no comprobado en ejecucion; por codigo ocurre**; el estado «modulo abierto» es local de EventDetail).
- **`visita-eventos`: 3 de sus 8 pasos (`modulos`, `configurador`, `organizame`) apuntan a controles que SOLO existen dentro de un evento** (`eventos.module-grid` l.2279, `eventos.configurator` l.6144, `eventos.organize` l.2300), pero la visita arranca en la lista y esos pasos son `optional` -> en la lista se **omiten en silencio**: la persona nunca ve el panel del evento, el configurador ni «Organízamelo» (que el texto de la visita describe). Una cuenta sin eventos no puede verlos de ningun modo. **Prioridad alta** (la visita promete lo que no enseña).
- «🪄 Organízamelo» solo se pinta con evento `planificacion` (no archivado).
- Permisos: no hay `access` en ninguno; la seccion se rige por `allowedSections` (modulo). **No comprobado** si un niño con cuenta puede crear eventos (RLS).

### 3.4 Discrepancias
| # | Donde | Texto | Realidad | Prio |
|---|---|---|---|---|
| E1 | `TD/g4/eventos.ts:434` (plan del dia, paso `compartir`) | «Si lo desmarcas, ese momento es solo para vosotros y no saldrá en el plan que compartáis.» | **No existe ninguna funcion de compartir el plan**; solo hay una etiqueta «· solo para vosotros». Se presenta como operativa una funcion futura (contrario al encargo). | **Alta** |
| E2 | visita-eventos pasos `modulos/configurador/organizame` | descripcion de controles | Se omiten en la lista (ver §3.3). | **Alta** |
| E3 | `TD/g4/eventos.ts:301` | «cuatro cifras … no se suman entre sí» | Correcto (BudgetSection l.13188-13202), pero el tutorial de «partida» dedica un paso a algo que es nivel C (`exp-eventos-menu-compras-presupuesto`). | Baja |
| E4 | `tut-eventos-anadir-tarea` paso `fecha` | «Con fecha puedes añadir también una hora.» | Cierto, pero no hay paso que apunte al campo **Hora**; ni a Nota, Encargo, recordatorios, persona externa. | Media |
| E5 | `tut-eventos-crear-evento` | tipos y modulos | Omite **plantilla** (si existe) y **«Tipo de celebración»**. Dice «cambian los módulos que Pepa te recomienda»; en el codigo `handleTypeChange` **reemplaza** la seleccion hecha a mano (l.1009-1012). | Baja |
| E6 | `tut-eventos-crear-invitacion` paso `guardar` | «no se envía a nadie» | Correcto. Pero **nada enseña a enviarla** (💌 por invitado, enlace abierto, recordatorio), que es el 2º paso natural. | Alta (hueco) |
| E7 | `cardsOtros.ts` `eve-menu` | «Las necesidades alimentarias dependen de la función de alergias, que está apagada.» | Coherente con el flag, pero mezcla en la ficha un detalle interno; no figura en ningun recorrido (bien). | Info |

### 3.5 Omisiones de campos/controles (resumen)
- Tarea: Hora, Encargo, Nota, persona externa, recordatorios; ademas el filtro por responsable, «👥 Colaboradores», «🗂️ Encargos».
- Invitado: **Notas**, **«A qué está invitado»** (bodas/comuniones), y todo el seguimiento (estado RSVP, enlace abierto, 💌 Invitación, «Recordar a pendientes», Exportar).
- Partida: **Categoría, Encargo, Proveedor**.
- Plato: Tipo, Sección, Nota, «No hay que comprarlo», «¿Quién lo prepara?», Receta; importar menú por foto/PDF; «Preparar compra».
- Momento: **Nota**; reordenar «Sin hora»; momentos de «Comida y bebida».
- Evento nuevo: plantilla, subtipo de celebracion. Sin cubrir: ⚙️ Gestionar evento (activar modulos, duplicar, archivar, plantilla).

### 3.6 Propuesta de estructura (Eventos)
Es el modulo mas complejo (14 modulos): se justifica **3 tutoriales** con capitulos, no cinco ni uno. No se proponen tutoriales para los modulos sin recorrido (Pagos, Decoración, Actividades, Mesas, Ceremonia, Proveedores, Detalles, Regalos): ver «Decisiones».
- **A. «Conoce Eventos»** (visita, 7-8 pasos, 2 min): **reescribir para que entre en un evento** (p.ej. paso inicial que lleve a un evento de ejemplo o, sin eventos, que lo diga y explique con la lista) o dividir en dos mini-visitas: «lista» y «panel del evento» (esta ultima solo se ofrece cuando se esta dentro de un evento). Mantener `envios`.
- **B1. «Crear y preparar un evento»** (≈6 min, 4 cap.): 1) *Crear un evento* (reutiliza `crear-evento` 5 pasos + plantilla/subtipo opcional) 1,3 min; 2) *Conocer el panel y activar partes* (nuevo: estado, rejilla, ⚙️ Gestionar, 🪄 Organízamelo - absorbe los 3 pasos huerfanos de la visita) 1,5 min; 3) *Tareas de preparativos* (reutiliza `anadir-tarea`, quitando `evento`+`tarjeta`; añadir Hora/Nota/persona externa/recordatorio; filtro por responsable como informativo) 2 min; 4) *Presupuesto: añadir una partida* (reutiliza `anadir-partida`; mover el paso `resumen` a C; añadir Categoría/Encargo/Proveedor) 1,2 min.
- **B2. «Invitados e invitación»** (≈5,5 min, 3 cap.): 1) *Añadir invitados* (reutiliza `anadir-invitado`, + Notas / A qué está invitado) 1,2 min; 2) *Diseñar la invitación* (reutiliza `crear-invitacion`; mover «Pepa, hazla bonita» a opcional) 1,7 min; 3) *Enviar la invitación y seguir las confirmaciones* (**nuevo**: 💌 Invitación por invitado, enlace abierto, estado, «Recordar a pendientes», exportar; todo «solo señala, tú pulsas») 2 min.
- **B3. «Menú y plan del día»** (≈5 min, 3 cap.): 1) *Añadir un plato al menú* (reutiliza `anadir-plato` + Sección/Nota/«No hay que comprarlo» + importar por foto) 1,5 min; 2) *Preparar la compra del menú* (nuevo, marca `eventos.menu-shopping` sin usar; solo si cocina la familia) 1,2 min; 3) *Plan del día* (reutiliza `anadir-momento` **sin el paso `compartir`** (E1), + Nota y «Sin hora») 1,5 min.
- **C (Como funciona)**: confirmacion de invitados (ya existe), menu/compras/presupuesto (ya existe), Organizamelo (ya existe), las 4 cifras del presupuesto, plan del dia vs. Comida y bebida, qué decide el configurador.
- Duraciones: 17 min de capitulos en 3 tutoriales; si resulta largo, B3 puede pasar a 2 cap. (plato + plan).
- Conteo: 8 entradas -> 1 visita + 3 tutoriales (10 capitulos).

---------------------------------------------------------------------------------------------------------------------------------

## 4. PEQUEÑOS GRANDES (9 entradas) - `UI/PequenosGrandesScreen.tsx`, `UI/RewardsScreen.tsx`, `UI/WishlistScreen.tsx`, `UI/MiCamino.tsx`, `UI/FinanceScreen.tsx` (`KidsFinanceTab`, l.11488-12470)

### 4.1 Inventario
| id | tipo | pasos | dur | access | ficha |
|---|---|---|---|---|---|
| `visita-pequenos` | visita | 5 | 70 s | - | `pg-puntos` |
| `tut-pequenos-dar-puntos` | tutorial | 4 | 70 s | adultsOnly | `pg-puntos` |
| `tut-pequenos-solicitar` | tutorial | 3 | 70 s | - | `pg-recompensas` |
| `tut-pequenos-recompensa-crear` | tutorial | 6 | 80 s | adultsOnly | `pg-recompensas` |
| `tut-pequenos-lista-deseos` | tutorial | 5 | 70 s | - | `pg-lista-deseos` |
| `tut-pequenos-regalo-anadir` | tutorial | 6 | 90 s | - | `pg-lista-deseos` |
| `tut-pequenos-regalo-reservar` | tutorial | 4 | 80 s | - | `pg-lista-deseos` |
| `tut-pequenos-mi-camino` | tutorial | 6 | 100 s | - | `pg-mi-camino` |
| `tut-pequenos-monedero` | tutorial | 7 | 110 s | - | `pg-monedero` |
Explicaciones: `exp-pequenos-puntos-recompensas` (tour `tut-pequenos-solicitar`), `exp-pequenos-deseos-reservas` (tour `tut-pequenos-regalo-reservar`).

### 4.2 Mapa funcional real
- Hub de 3 tarjetas ilustradas (PequenosGrandesScreen l.30-33, 58-67): Puntos y recompensas, Educación financiera, Lista de deseos. Estado local (`openModule`), todo en `/puntos`.
- **Puntos y recompensas** (RewardsScreen): aviso si hay solicitudes pendientes (adultos) y «Premios pendientes de disfrutar» con «Marcar como disfrutado» (adultos) (l.213-239); **«⚙️ Camino/Carrera»** (adultos, ajuste de familia, l.248-252, default `camino`) y **«⚙️ Quién participa»** (adultos); pista `MiCamino` (modo Camino) o `RaceTrack` (modo Carrera); por persona: «Camino/Carrera mensual: N» y «⭐ Puntos disponibles: N», «faltan N para …», «🎁 Ya puedes conseguir», panel: **«⭐ Dar puntos»** (adultos), «🎁 Catálogo de recompensas» con «Solicitar» (activo si alcanza), «📜 Historial» (adultos pueden corregir/anular concesiones), «🏆 Trofeos» y copa anual (modo Carrera). Catalogo (adultos): «+ Nueva recompensa», ⋯ Editar/Desactivar/Reactivar/Borrar. Aprobar ✓ / Rechazar ✕ (adultos).
- **Educación financiera** (`KidsFinanceTab`, l.11488+): chips de niño/a (solo `child|baby`), «⏳ N movimientos pendientes de aprobar» (adultos: ✓ / ✕), «+ Nuevo objetivo de ahorro» (con edicion de objetivo y celebracion), «💰 Mi dinero ahora», **4 tarjetas Recibido/Ahorro/Para gastar/Impuestos** (cada una con historial y «+ Nuevo ingreso/ahorro/gasto/impuesto»), fondo comun de impuestos, «Reparto automático … ✏️ Editar reparto» (adultos, solo afecta a ingresos futuros). **El niño registra sus movimientos y un adulto los aprueba** (no lo lee ningun recorrido). Monedero de aprendizaje, no mueve dinero real.
- **Lista de deseos** (WishlistScreen): lista de listas (tarjeta por persona/celebracion/año, ✕ borrar), «+ Nueva lista» (Para quién, Celebración, Año, Fecha opcional); dentro: **«✏️ Editar lista»** (celebracion y fecha; commit `864d60f`), aviso 🤫 de secreto (propia lista o niño), **«🔗 Compartir con invitados sin cuenta» / «Renovar enlace»** (`WishlistGuestScreen`), «+ Añadir regalo» (Nombre, **Descripción, Enlace (busca la foto sola), Precio, Fotografía**, «Es un regalo conjunto»), por regalo: ✏️ editar, ✕ borrar, estado Disponible/Reservado/Conjunto (solo para quien puede verlo), «🎁 Reservar este regalo» / «+ Unirme», «Deshacer mi reserva».
- Avisos: **nuevo** (0316, commit `8a85cd8`): al pedir una recompensa se avisa (campana + push) a los adultos/admin de la familia salvo a quien la pide (`private.notify_reward_request`).

### 4.3 Dependencias
- Arranque: `/puntos` + `startDest` `pequenos.recompensas` | `pequenos.deseos` | `pequenos.inicio`, registrados (PequenosGrandesScreen l.34-38) -> bien.
- **Rol**: `dar-puntos` y `recompensa-crear` `adultsOnly` (correcto, los controles estan bajo `isAdult`). `solicitar` lo hace un niño; en un recorrido de niño la ficha de otra persona tambien muestra «Solicitar» (RewardsScreen l.666) - **no comprobado** que el servidor lo permita para otros.
- **Datos**: `solicitar` (paso `solicitar`, no opcional) exige que existan recompensas y puntos suficientes (el boton esta `disabled` sin saldo; el texto avisa «Si no ves recompensas, un adulto tiene que crearlas antes»). `regalo-reservar` exige una lista de **otra** persona con un regalo libre (en la propia lista no hay boton). `regalo-anadir` exige al menos una lista. `monedero`: pasos opcionales; sin ningun niño/bebé no aparecen los chips ni el resto. `mi-camino`: solo tiene sentido en **modo Camino** (por defecto); en modo Carrera los pasos `camino/ninos` se omiten.
- Un niño con `allowedSections` sin Pequeños Grandes no ve nada; el modulo ya filtra por seccion.

### 4.4 Discrepancias
| # | Donde | Texto | Realidad | Prio |
|---|---|---|---|---|
| P1 | `explainers/g3/pequenos.ts` limits[0] | «no hay un aviso aparte para las personas adultas: la solicitud aparece al abrir Puntos» | **Falso desde 0316**: se envia aviso (campana + push) a adultos/admin. Tambien `tut-pequenos-solicitar` paso `despues` (`TD/g3/pequenos.ts:140`) dice «Un adulto verá la solicitud en…» sin mencionar el aviso. | Media |
| P2 | `visita-pequenos` paso `deseos` | «foto, enlace y precio, y la familia puede reservarlos» | Cierto, pero omite que se puede **compartir la lista con invitados sin cuenta** (funcion existente y relevante). Ademas `tut-pequenos-regalo-anadir` omite **Descripción, Precio, Fotografía** (el paso `enlace` menciona solo la foto automatica). | Media |
| P3 | `tut-pequenos-mi-camino` titulo/pasos | «viaje por los tres mundos» | Solo aplica en modo Camino; en modo Carrera la pantalla es otra (RaceTrack, trofeos, copa) y **no hay ningun recorrido de Carrera/Trofeos**. | Media |
| P4 | `tut-pequenos-lista-deseos` / `regalo-anadir` | texto de «Nueva lista» | Correcto, pero la marca `pequenos.lista-editar` y `pequenos.regalo-editar` (funcion nueva) no se usan en ningun recorrido. | Baja |
| P5 | `tut-pequenos-monedero` | «Esta visita solo mira» | Es una visita en forma de tutorial: no enseña a **apuntar un ingreso/gasto** ni la **aprobacion** de movimientos de niños, que es lo que mas se hace. | Media |

### 4.5 Omisiones de campos
- Recompensa: el tutorial cubre titulo, emoji, coste, descripcion -> completo. Falta editar/desactivar/borrar (menu ⋯).
- Dar puntos: cantidad, motivo -> completo. Falta **corregir/anular** una concesion (Historial).
- Lista de deseos: «Para quién / Celebración / Año / Fecha»: cubre `quien`, `celebracion` («El año ya viene puesto»), `fecha`; falta el **Año** como campo (editable) y la **edicion posterior**.
- Regalo: faltan Descripción, Precio, Fotografía manual, **compartir con invitados**, **editar/borrar regalo**, **deshacer reserva**.
- Educación financiera: faltan **«+ Nuevo ingreso/ahorro/gasto/impuesto»**, **aprobar/rechazar movimientos**, **editar objetivo**, **fondo comun**.

### 4.6 Propuesta de estructura (Pequeños Grandes)
Tres mini-aplicaciones independientes -> **3 tutoriales** con capitulos; Mi Camino pasa a visita/explicacion.
- **A. «Conoce Pequeños Grandes»** (visita, 5 pasos, 1,2 min): reducir `roles` a un enlace a C; añadir mencion de listas compartibles. Dentro (o aparte, «Conoce Puntos»): el paso informativo de Mi Camino/Carrera, «Puntos disponibles» vs «Camino» (hoy `tut-pequenos-mi-camino`, 6 pasos solo para mirar) -> es A.
- **B1. «Puntos y recompensas»** (≈6 min, 4 cap.; **capitulos por rol**): 1) *Dar puntos* (adultos; reutiliza `dar-puntos` + paso de Historial/corregir) 1,2; 2) *Crear una recompensa* (adultos; reutiliza `recompensa-crear`) 1,5; 3) *Pedir una recompensa y aprobarla* (niños: Solicitar; adultos: Aprobar/Rechazar y Marcar disfrutado; reutiliza `solicitar` 3 pasos + nuevos) 1,5; 4) *Camino o Carrera y quién participa* (adultos; reutiliza paso `modo`; nuevo `Quién participa`) 1,2. **Un niño solo veria el cap. 3** -> hace falta `access` por capitulo (no existe, §0.1) o dos tutoriales (uno para niños, uno para adultos).
- **B2. «Lista de deseos»** (≈6 min, 4 cap.): 1) *Crear una lista* (reutiliza `lista-deseos`) 1,2; 2) *Añadir regalos* (reutiliza `regalo-anadir` + Descripción/Precio/Foto) 1,5; 3) *Reservar un regalo* (reutiliza `regalo-reservar`; mover el detalle del secreto a C `exp-pequenos-deseos-reservas`) 1,2; 4) *Compartir la lista con invitados y editarla* (nuevo; marcas `lista-editar`, `regalo-editar`) 1,5.
- **B3. «Educación financiera»** (≈4 min, 2-3 cap.): 1) *Apuntar un ingreso o un gasto* (nuevo; niño registra, adulto aprueba) 1,5; 2) *Crear un objetivo de ahorro* (nuevo; marca `finance.kids-objetivo`) 1,2; 3) (opc.) *Cómo se reparte lo que recibe* -> mejor A/C (hoy pasos `tarjetas/reparto/aparte` del monedero). **No he leido a fondo** los formularios de movimiento (`WalletTransactionModal`, l.12431+): confirmar campos antes de escribir los pasos.
- **C**: puntos ganados vs disponibles, canje y reserva de puntos (`exp-pequenos-puntos-recompensas`), secreto y reservas (`exp-pequenos-deseos-reservas`), reparto 60/20/20 y que es un monedero de aprendizaje.
- Conteo: 9 entradas -> 1 visita + 3 tutoriales (≈10 capitulos).

---------------------------------------------------------------------------------------------------------------------------------

## 5. DOCUMENTOS (3 entradas) - `UI/DocumentsScreen.tsx`, `UI/DocumentVisibilityPicker.tsx`, `data/documents.ts`, migracion `0317_document_visibility.sql`

### 5.1 Inventario
| id | tipo | pasos | dur | ficha |
|---|---|---|---|---|
| `visita-documentos` | visita | 4 | 80 s | `doc-subir` |
| `tut-documentos-carpeta` | tutorial | 3 | 60 s | `doc-subir` |
| `tut-documentos-subir-vencimiento` | tutorial | 10 | 120 s | `doc-vencimiento` |
Explicaciones: `exp-documentos-avisos-vencimiento`, `exp-documentos-compartir` (esta sin tour).

### 5.2 Mapa funcional real
- Rejilla de carpetas por categoria (+ «Sin categoría» si hay documentos sin categoria) y «Nueva carpeta» (DocumentsScreen l.130-190; `AddCategoryInline` l.449-480: «+ Añadir categoría»). Al abrir una categoria: una carpeta por persona + «Sin especificar» + «➕ Añadir miembro» (l.248-325; **ese `AddMemberForm` se ofrece a cualquiera, no solo a admin** - no comprobado que el servidor lo rechace).
- «+ Subir foto» (boton flotante, l.216-218) -> «Subir documento» (AddDocumentForm l.482-615): **Archivo** (📷 Foto o 📄 PDF - `FileOrPdfPicker`), «🔍 Detectar caducidad» (IA, solo si hay archivo, puede fallar), **Título**, **A qué carpeta**, **A quién**, **Fecha de vencimiento**, aviso de lo que se creara, **«¿Quién puede ver este documento?» (Toda la familia / Solo yo / Elegir personas)**, Guardar.
- Fila de documento (l.331-446): titulo, «📅 Vence el …», **candado** (`describeAudience`), 👁 ver, 📤 compartir (menu del movil o pestaña nueva), ✏️ editar (titulo, vencimiento y, si lo subiste tu, visibilidad), ✕ borrar. **Un documento restringido solo lo cambia o borra quien lo subió** (`canManage`, l.339; RLS 0317 l.35-46); la administracion **no** tiene acceso especial a uno ajeno.
- Con vencimiento: evento de dia completo «Vence: titulo» en el Calendario con avisos 30/7/1 dias antes; **si el documento esta restringido, ese evento es privado de quien lo sube** (`data/documents.ts` `syncExpiryEvent`, `visibility: 'private'`); el aviso del formulario cambia segun la audiencia (l.603-607).
- Carpetas por defecto para familias nuevas (commit `864d60f`).

### 5.3 Dependencias
- `startPath /documentos`, sin `startDest` (ok). Todos son accesibles (sin `access`).
- `tut-documentos-subir-vencimiento`: el paso `archivo` no es opcional y **requiere tener un archivo** a mano (foto o PDF) para continuar (`appear documentos.detectar`); no hay forma de practicarlo sin archivo. Los pasos `titulo/carpeta/persona/vencimiento` son obligatorios (esperan eventos); `vencimiento` espera `confirmed` (fecha elegida) y el texto dice «si no caduca, déjala vacía y pulsa Siguiente» (correcto).
- `tut-documentos-carpeta`: sin dependencia de datos.

### 5.4 Discrepancias
| # | Donde | Texto | Realidad | Prio |
|---|---|---|---|---|
| D1 | `visita-documentos` pasos `subir`/`acciones` | no menciona **privacidad por persona** ni el candado 🔒 | Existe desde 0317 (commit `f96259a`); el recorrido `subir-vencimiento` si lo recoge (paso `quien-ve`) pero la visita no. | Media |
| D2 | `explainers/g6/explicaciones.ts` (`exp-documentos-avisos-vencimiento`, l.164-216) | «llegan a la persona asignada … y a los administradores» (§«A quién le llegan») | Para un **documento restringido** el evento es privado de quien lo sube; el explicador no lo dice (y no hay ninguna mencion a «Solo yo»/restringido en todo el archivo; comprobado con busqueda). | Media |
| D3 | `tut-documentos-subir-vencimiento` paso `aviso` | «PEPA crea en el Calendario un evento de todo el día … avisos 30, 7 y 1 día antes» | Cierto para «Toda la familia»; para restringidos solo lo ve quien lo sube (el paso siguiente `quien-ve` lo cubre en parte). | Baja |
| D4 | `tut-documentos-subir-vencimiento` paso `persona` | «aviso del Calendario queda asignado a esa persona» | Conforme a `memberIds` en `syncExpiryEvent`. OK. | - |
| D5 | `visita-documentos` paso `acciones` (opcional) | «✏️ … ✕» | Esos botones solo salen a quien puede gestionar el documento (restringidos ajenos: no hay ✏️/✕). | Baja |

### 5.5 Omisiones
- «Subir documento»: el tutorial cubre archivo, detectar, titulo, carpeta, persona, vencimiento, aviso, visibilidad, guardar -> **completo** (el mas completo de mi alcance tras la actualizacion). Falta **editar un documento** (✏️: titulo/fecha/visibilidad) y borrar; «ver» y «compartir» solo aparecen en la visita (opcional).
- El tutorial `carpeta` (3 pasos) es demasiado pequeño para ser independiente.

### 5.6 Propuesta de estructura (Documentos)
- **A. «Conoce Documentos»** (visita, 4-5 pasos, 1,3 min): carpetas, «Nueva carpeta», «Subir», acciones; **añadir un paso sobre el candado y la privacidad**.
- **B. «Guardar y cuidar tus documentos»** (≈6 min, 4 cap., un solo tutorial): 1) *Crear una carpeta* (reutiliza `tut-documentos-carpeta`, 3 pasos) 0,8 min; 2) *Subir un documento* (pasos 1-6 de `subir-vencimiento`: abrir, archivo, titulo, carpeta, persona + guardar) 2 min; 3) *Fecha de vencimiento y avisos* (pasos `detectar`, `vencimiento`, `aviso`) 1,5 min (tambien puede aplicarse al editar un documento ya subido); 4) *Quién puede ver el documento y gestionarlo* (paso `quien-ve` + ✏️/👁/📤/✕ y candado; nuevo en parte) 1,5 min.
- **C**: qué avisos se crean y a quién llegan (actualizar D2), qué se manda al compartir (ya existe), reglas de documento restringido (solo quien lo subió cambia/borra; la administracion no ve los ajenos).
- Conteo: 3 entradas -> 1 visita + 1 tutorial (4 capitulos). La ficha `doc-vencimiento` tendria que re-apuntarse (§0.3).

---------------------------------------------------------------------------------------------------------------------------------

## 6. GALERÍA (4 entradas) - `UI/GalleryScreen.tsx` (263 l.)

### 6.1 Inventario
| id | tipo | pasos | dur | ficha |
|---|---|---|---|---|
| `visita-galeria` | visita | 4 | 70 s | `gal-subir` |
| `tut-galeria-subir-foto` | tutorial | 3 | 60 s | `gal-subir` |
| `tut-galeria-compartir` | tutorial | 4 | 90 s | `gal-compartir` |
| `tut-galeria-ampliar` | tutorial | 2 | 60 s | `gal-ampliar` |

### 6.2 Mapa funcional real
- Rejilla de fotos (l.141-182): miniatura + descripcion + fecha; por foto: tocar -> **foto en grande** (modal «Foto N de M», `‹ Anterior` / `Siguiente ›`, campo **Descripción** + «Guardar descripción»; l.184-214), 📤 compartir una, ✕ borrar (con confirmacion).
- «📤 Compartir varias» / «Cancelar selección» -> casillas -> «📤 Compartir N fotos» (l.124-140). Si el navegador no permite compartir archivos: aviso de compartir de una en una (l.80).
- «Subir foto» (AddPhotoForm l.219-263): Foto (obligatoria), Descripción (opcional), «Subir».
- Las fotos alimentan el carrusel de Inicio (hasta `MAX_CAROUSEL_PHOTOS` = 5, ajustes en `HomeCarouselSettings`).
No existe: albumes, buscar, editar la foto, mover/ordenar.

### 6.3 Dependencias
- Sin `access`, sin `startDest`. `ampliar` y `compartir` dependen de **tener al menos una foto** (pasos manuales con «Siguiente» como salida; bien resuelto en el texto). `subir-foto` pide elegir una foto del movil (el paso `foto` espera el archivo).
- Plataforma: compartir multiples fotos depende del navegador (`shareFiles`), **no comprobado** en iPhone/Android.

### 6.4 Discrepancias
| # | Donde | Texto | Realidad |
|---|---|---|---|
| G1 | `visita-galeria` paso `carrusel` | «hasta 5 … con el engranaje del carrusel» | Coherente con `HomeCarouselSettings` (l.14, 108-123). OK. |
| G2 | `tut-galeria-ampliar` | «Con ‹ Anterior y Siguiente › pasas a otra foto sin cerrar» | Coherente (l.198-203). OK. |
| G3 | ninguna | - | No hay discrepancias de texto; el problema es de **tamaño** (tutoriales de 2-4 pasos) y de que **no se enseña a borrar** (✕ con confirmacion). |

### 6.5 Omisiones
- Subir: cubre Foto y Descripción (completo). Falta **borrar** una foto y que **alimenta el carrusel**.
- Ampliar: cubre descripción y navegacion. Es de solo 2 pasos, ambos manuales.

### 6.6 Propuesta de estructura (Galería)
Modulo sencillo -> **1 tutorial con 3 capitulos cortos** (≈3,5 min) en lugar de 3 tutoriales:
- **A. «Conoce Galería»** (visita 4 pasos, 1 min): sin cambios de fondo; mover «Compartir varias» a B.
- **B. «Fotos de la familia»**: 1) *Subir una foto* (reutiliza `subir-foto`, 3 pasos) 1 min; 2) *Ver una foto grande y poner descripción* (reutiliza `ampliar`, 2 pasos + paso de «Anterior/Siguiente») 0,8 min; 3) *Compartir fotos* (reutiliza `compartir`, 4 pasos; el 📤 individual + varias) 1,5 min; opcional: paso final «borrar» informativo.
- **C**: qué pasa al compartir (ya existe `exp-galeria-compartir`), qué fotos llegan al carrusel.
- Conteo: 4 entradas -> 1 visita + 1 tutorial (3 capitulos). Fichas `gal-subir/gal-ampliar/gal-compartir` serian candidatas a fusionar en una (§0.3).

---------------------------------------------------------------------------------------------------------------------------------

## 7. CONTACTOS (5 entradas) - `UI/ContactsScreen.tsx` (947 l.)

### 7.1 Inventario
| id | tipo | pasos | dur | ficha |
|---|---|---|---|---|
| `visita-contactos` | visita | 7 | 100 s | `con-agenda` |
| `tut-contactos-anadir` | tutorial | 8 | 100 s | `con-agenda` |
| `tut-contactos-buscar` | tutorial | 3 | 60 s | `con-agenda` |
| `tut-contactos-importar` | tutorial | 4 | 100 s | `con-importar` |
| `tut-contactos-compartir` | tutorial | 4 | 90 s | `con-compartir` |

### 7.2 Mapa funcional real
- Buscador por nombre (sin tildes/mayusculas, l.147-149, 114-121), «📤 Compartir varias», chips de categoria (Todas + `CATEGORIES` = Colegio, Médico, Emergencia, Familia, Otros + las creadas, l.24-32), lista; por contacto: 📞 llamar (si tiene telefono), 📤, ✏️ editar (`EditContactForm`), ✕ borrar, y **«🎂 Añadir cumpleaños»** inline (l.360-380).
- «+ Nuevo contacto» (boton flotante l.209 -> `AddContactForm` l.847-947): Nombre (con autocompletado de contactos ya creados que **rellena categoria, telefono, email, notas y cumpleaños**), **Categoría (por defecto «Colegio», `CATEGORIES[0]`)**, Teléfono, Email, Cumpleaños (opcional), Notas, «Añadir».
- Tres importaciones: «Importar del teléfono» (Contact Picker; `ImportContactsForm` devuelve `null` si el navegador no lo soporta -> solo Chrome/Edge Android, l.485-545), «.vcf» (`ImportVcfContactsForm`, l.684+), «cumpleaños de Google (.ics)» (`ImportIcsBirthdaysForm`, l.812+); todas: casillas -> «Importar N».
- Compartir como texto (nombre, telefono, email); fallback `ShareFallbackModal`.

### 7.3 Dependencias
- `startPath /contactos`, sin `startDest`. Sin `access`.
- `tut-contactos-importar`: paso `telefono` **opcional** (bien resuelto), pero el paso final `guardar` dice «En los tres casos…» aunque en iPhone/ordenador solo haya dos; el `.vcf` y `.ics` requieren **tener el archivo** (solo se miran, ok).
- `tut-contactos-compartir`/`buscar`: sin datos -> «Siguiente» como salida (ok).

### 7.4 Discrepancias
| # | Donde | Texto | Realidad | Prio |
|---|---|---|---|---|
| K1 | `tut-contactos-anadir` paso `categoria` | «Puedes elegir una de las sugeridas o escribir una nueva» | Cierto, pero **no avisa de que ya viene preseleccionada «Colegio»**: quien no la toque guarda el contacto en Colegio (l.849, 922). | Media |
| K2 | `tut-contactos-anadir` paso `cumpleanos` | «saldrá también en la sección Cumpleaños y en el Calendario» | Cierto (BirthdaysScreen mezcla contactos; CalendarScreen l.564-872). Falta añadir que ahora **tambien recibe el aviso diario de las 09:00** (0315). | Baja |
| K3 | `visita-contactos` paso `acciones` | «Debajo del nombre puedes añadir su cumpleaños» | Correcto (boton «🎂 Añadir cumpleaños»). OK | - |

### 7.5 Omisiones
- Formulario «Nuevo contacto»: cubre los 6 campos -> completo.
- Falta: **editar** (✏️), **borrar** (✕), **llamar** (📞), **cumpleaños inline** en la ficha.

### 7.6 Propuesta de estructura (Contactos)
- **A. «Conoce Contactos»** (visita 5-6 pasos, 1,5 min): quitar los dos pasos de importacion (a B2) y el de compartir (a B2).
- **B1. «Tu agenda familiar»** (≈4,5 min, 3 cap.): 1) *Añadir un contacto* (reutiliza `anadir`, 8 pasos; avisar de «Colegio» por defecto) 2 min; 2) *Buscar y filtrar* (reutiliza `buscar`, 3 pasos - **demasiado pequeño para ser independiente**) 0,8 min; 3) *Editar, llamar o borrar y añadir cumpleaños* (nuevo, marcas `contactos.acciones`) 1,2 min.
- **B2. «Importar y compartir contactos»** (≈3,5 min, 2 cap.): 1) *Importar* (reutiliza `importar`; capitulo con pasos opcionales por plataforma; ajustar «los tres casos») 1,7 min; 2) *Compartir uno o varios* (reutiliza `compartir`, 4 pasos) 1,5 min.
- **C**: qué se manda al compartir un contacto (`exp-contactos-compartir`), cómo se completan los repetidos al importar (hoy dentro de un paso).
- Conteo: 5 entradas -> 1 visita + 2 tutoriales (5 capitulos). Alternativa minima: 1 tutorial de 5 capitulos (≈8 min, sobre el limite).

---------------------------------------------------------------------------------------------------------------------------------

## 8. CUMPLEAÑOS (3 entradas) - `UI/BirthdaysScreen.tsx` (199 l.) + migracion `0315_birthday_reminders.sql`

### 8.1 Inventario
| id | tipo | pasos | dur | access | ficha |
|---|---|---|---|---|---|
| `visita-cumpleanos` | visita | 4 | 80 s | - | `cum-ver` |
| `tut-cumpleanos-favorito` | tutorial | 3 | 60 s | **familyAdmin** | `cum-ver` |
| `tut-cumpleanos-cambiar-fecha` | tutorial | 3 | 70 s | **familyAdmin** | `cum-ver` |
Explicacion: `exp-cumpleanos-origen` (tour `tut-cumpleanos-cambiar-fecha`).

### 8.2 Mapa funcional real
- Filtro «Próximos / Favoritos» (l.109-115; es un filtro, no dos listas). Lista unica de **fichas de Familia con `birthDate` + contactos con `birthDate`**, ordenada por dias que faltan: «¡Hoy!/Mañana/En N días · cumple N · fecha» (+ «· contacto») (l.117-148).
- Acciones por fila: ⭐ favorito (guarda en la ficha: lo ve toda la familia), ✏️ cambiar fecha (`BirthdayDateEditor`: DateField + Guardar/Cancelar), ✕ quitar (con `confirm()` del navegador) (l.149-161).
- **No hay boton para añadir** un cumpleaños (se pone en Familia o Contactos).
- **Aviso diario nuevo** (0315, commit `8a85cd8`): cada dia a las 09:00 (hora local de la persona, por defecto Europe/Madrid) llega **un solo aviso** (campana + push) con los cumpleaños de **hoy y de mañana** de fichas de familia y contactos, a cada perfil de la familia; sin cumpleaños no se envia nada; el 29/feb se celebra el 28 en años no bisiestos (`private.run_birthday_reminders_at`). No he encontrado en la UI un ajuste especifico para desactivarlo (no comprobado si lo cubre el permiso general de avisos).

### 8.3 Dependencias
- Los dos tutoriales son `familyAdmin` porque **la RLS de `family_members` solo deja actualizar a administracion** (`0001_init.sql:105`, politica «admin update») - lo documenta el propio comentario de `TD/g6/tutoriales.ts:432-435`. Pero la pantalla muestra ⭐ y ✏️ a **todo el mundo**, y las llamadas `updateFamilyMemberBirthDate/…BirthdayFavorite` (`data/family.ts:121-129`) no gestionan 0 filas actualizadas: una adulta no admin tocaria ⭐ o ✏️ en una ficha de familia y **no pasaria nada ni saldria error** (afirmacion basada en las politicas; **no comprobado en servidor real**). Con contactos si puede cualquiera.
- Resultado: una adulta no admin no tiene ningun tutorial del modulo salvo la visita.
- Ambos tutoriales necesitan al menos un cumpleaños (`cumpleanos.lista`, `favorito`, `editar` no opcionales): sin datos -> `broken`. El texto del paso `lista` lo dice («falta poner la fecha…»).

### 8.4 Discrepancias
| # | Donde | Texto | Realidad | Prio |
|---|---|---|---|---|
| B1 | `TD/g6/visitas.ts:244` (`visita-cumpleanos` paso `fechas`) | «Tampoco hay avisos de cumpleaños; se ven aquí y en el Calendario.» | **Falso**: hay aviso diario a las 09:00 (0315). La ficha `cum-ver` ya esta actualizada; la visita no. | **Alta** |
| B2 | `explainers/g6/explicaciones.ts:348-372` (`exp-cumpleanos-origen`) | titulo «…y si avisan», resumen «por qué no manda avisos», seccion «Cuándo avisan: No avisan» | **Falso** por lo mismo. Necesita reescribirse entero la seccion (hora 09:00, hoy y mañana, un aviso por dia, sin cumpleaños no hay aviso, 29/feb). | **Alta** |
| B3 | `featureInventory`/ficha | `cum-ver` ya dice «Cada día a las 09:00 te llega un aviso …» | Coherente con el codigo. | - |

### 8.5 Omisiones
- No se explica la **✕ Quitar** (solo la visita lo nombra), ni que ⭐ se comparte con toda la familia, ni que contactos y familia comparten lista.
- «Añadir cumpleaños»: ver Familia (ficha) y Contactos (formulario + 🎂 inline) - hoy ningun tutorial de esos modulos enlaza con Cumpleaños.

### 8.6 Propuesta de estructura (Cumpleaños)
Modulo muy sencillo: **no merece dos tutoriales**.
- **A. «Conoce Cumpleaños»** (visita, 4 pasos, 1,2 min): **arreglar B1**; incluir el aviso de las 09:00.
- **B. «Favoritos y fechas»** (1 tutorial, 2 capitulos, ≈2,3 min): 1) *Marcar un favorito* (reutiliza `favorito`, 3 pasos) 1 min; 2) *Cambiar una fecha* (reutiliza `cambiar-fecha`, 3 pasos) 1,3 min. Ambos pequeños -> capitulos, no tutoriales. **Dependen de decision de permisos** (abajo): si se mantiene admin-only en filas de Familia, el tutorial deberia ofrecerse a todos pero con pasos `optional` o contenido solo-contactos.
- **C**: de dónde salen los cumpleaños, cómo se calculan los dias y la edad, el aviso diario (reescribir B2), qué pasa con el 29/feb.
- Conteo: 3 entradas -> 1 visita + 1 tutorial (2 capitulos); o, minimo, solo visita + C si no se resuelve el tema de permisos.

---------------------------------------------------------------------------------------------------------------------------------

## 9. Resumen de incidencias priorizadas (con causa comprobada)

| Prio | Id | Descripcion | Causa en el codigo | Correccion recomendada (sin implementar) |
|---|---|---|---|---|
| Alta | B1/B2 | Cumpleaños dice que **no hay avisos** | `TD/g6/visitas.ts:244`; `explainers/g6/explicaciones.ts:348-372`; el codigo envia aviso diario (`0315_birthday_reminders.sql`) | Reescribir ambos con hora 09:00, hoy y mañana, 1 aviso/dia |
| Alta | E1 | Plan del dia promete compartir el plan | `TD/g4/eventos.ts:434`; ninguna UI lee `showOnShare` | Quitar la frase o decir «solo se guarda» hasta que exista compartir |
| Alta | E2 | La visita de Eventos omite 3 pasos | pasos `optional` con controles solo visibles dentro de un evento (`eventos.module-grid` l.2279, `eventos.configurator` l.6144, `eventos.organize` l.2300) y arranque en `/eventos` lista | Visita en dos partes o paso que entre al evento |
| Alta | T-2 | Tutorial `fam-anadir-miembro` ofrecido a no admins | `canDoTour` no hereda `HelpCard.access`; boton solo `isAdmin` (FamilyScreen l.392) | Poner `access:{familyAdmin:true}` en el `TourDef` (y revisar el resto de tutoriales con ficha restringida) |
| Alta | F1 | Dos instrucciones opuestas para dar acceso | `InviteCodeButton` (l.445-486) vs `AccessInvitePanel` y `LoginScreen:299` | Retirar el boton antiguo o igualar texto y flujo; actualizar tutorial/ficha |
| Media | C1/C2/C3 | Cocina: falta Snack y semanas; ficha de receta dice que no recalcula | `MEAL_TYPES` l.80-86; `menu-week-nav` l.416; `ScaledIngredients` | Actualizar visita, `menu-plato`, ficha `coc-receta` |
| Media | P1 | Pequeños: sin aviso a adultos | explicador `limits[0]` vs `0316_reward_request_notify.sql` | Actualizar `exp-pequenos-puntos-recompensas` y paso `despues` |
| Media | D1/D2 | Documentos: visita/explicador sin privacidad | commit `f96259a` no toco visita ni explicadores | Añadir candado/visibilidad a visita y a `exp-documentos-avisos-vencimiento` |
| Media | F4/F5 | Dar acceso para madres/padres y modal de cuentas | `canGiveAccess` / `AccountsModePromptModal` | Reescribir `codigo-acceso`; paso nuevo en alta |
| Media | K1 | Contactos: «Colegio» preseleccionada | `CATEGORIES[0]` (l.849) | Frase en el paso `categoria` |
| Media | birthdays-perm | ⭐/✏️ en Cumpleaños visibles para quien no puede guardarlos | RLS `family_members: admin update`; `data/family.ts:121-129` | Decision de producto (§10) |
| Media | tutorial-datos | Tutoriales que se rompen sin datos | `tut-familia-secciones`, `tut-cocina-menu-a-compras`, `tut-cumpleanos-*`, `regalo-reservar`: primer paso no opcional | Ocultar/avisar antes de empezar o hacer opcionales |
| Baja | resto | F2, F3, E3, E4, E5, G*, K2 | ver tablas | segun reescritura de capitulos |

---------------------------------------------------------------------------------------------------------------------------------

## 10. Decisiones de producto realmente necesarias (solo las que no se resuelven con una recomendacion)

1. **Cumpleaños y permisos**: hoy una adulta que no es administradora ve ⭐ y ✏️ en las fichas de Familia y no se le guarda nada (RLS). ¿Se oculta/desactiva para ella, se abre el permiso (funcion de servidor como `updateMemberCard`), o se deja admin-only? Mientras no se decida, el tutorial `cumpleanos` solo puede ofrecerse a administracion.
2. **Compartir el plan del día** (Eventos): ¿es una funcion futura? Si sí, quitar «Mostrar al compartir» del recorrido; si se va a construir pronto, dejar la casilla pero redactar «de momento solo marca el momento como solo-vuestro».
3. **Alcance de Eventos**: ¿se quiere tutorial de Pagos y fianzas, Proveedores y ofertas, Mesas, Decoración/Actividades, Detalles, Regalos y el configurador (8 modulos sin recorrido hoy)? Propongo dejarlos fuera de esta tanda y que la visita los nombre; si se quieren, cada uno seria un capitulo de 1-1,5 min y habria que pasar de 3 a 4-5 tutoriales.
4. **Ficha única por tutorial** (§0.3): ¿se fusionan fichas de Ayuda o se cambia `tourCoverage.test.ts` para admitir varias fichas por tutorial? Afecta a Familia (4 fichas), Galería (3), Documentos (2), Pequeños Grandes (3).
5. **Capitulos con rol** (§0.1, Pequeños Grandes): ¿`access` por capitulo (cambio de motor) o dos tutoriales separados niños/adultos?
6. **«🔑 Generar código de acceso» (ruta antigua)**: ¿se retira de la pantalla o se mantiene con texto actualizado? Define si el tutorial lo menciona.
