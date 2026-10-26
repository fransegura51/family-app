// Nueva Ayuda de PEPA, «Pepa te acompaña» (B3). Esquema de los DATOS de la Ayuda. Todo el catálogo vive en el repositorio (viaja en el mismo build que la interfaz, así que
// ficha y pantalla nunca quedan desfasadas y no cuesta ninguna llamada a Supabase). Reglas de contenido:
//  - Una ficha solo cuenta lo que la app hace de verdad. Lo que está a medias o apagado se explica como tal (`state` + `limits`), nunca se vende como disponible.
//  - Los textos de botones y pantallas que cita (`labels`) se comprueban automáticamente contra el código (AYUDA-01): si un botón cambia de nombre, falla la prueba.
//  - «Llévame» (`go`) solo apunta a rutas que existen (src/help/routes.ts) y respeta los permisos de cada persona.

export type HelpModuleId =
  | 'inicio'
  | 'pepa'
  | 'calendario'
  | 'compras'
  | 'cocina'
  | 'economia'
  | 'eventos'
  | 'pequenos'
  | 'familia'
  | 'cumpleanos'
  | 'contactos'
  | 'galeria'
  | 'documentos'
  | 'listas'
  | 'ubicacion'
  | 'comunidad'
  | 'configuracion'
  | 'notificaciones'
  | 'cuentas'
  | 'ayuda'

// disponible = funciona como se explica; parcial = funciona pero con un límite que la ficha explica; desactivada = existe pero está apagada: NO se ofrece como función
// (solo se explica si alguien pregunta por ella, sin botones «Llévame» ni «Enséñame»).
export type HelpCardState = 'disponible' | 'parcial' | 'desactivada'

export type HelpPlatform = 'web' | 'android' | 'ios'

// Quién puede ver y usar lo que cuenta la ficha. El servidor siempre decide de verdad; esto solo evita ofrecer lo que a esa persona no le va a funcionar.
export interface HelpAccessRule {
  /** Solo administración de la familia (rol «admin»). El resto ve una explicación de la restricción. */
  familyAdmin?: boolean
  /** Solo personas adultas de la familia (administrador/a o adulto/a); un niño/a o un invitado/a ve la explicación de la restricción. */
  adultsOnly?: boolean
  /** Es de Comunidad: solo con cuenta, 18 años cumplidos y Comunidad abierta para esa cuenta. Si no, la ficha NO se muestra. */
  community?: boolean
  /** Solo en estas plataformas (app nativa o web). */
  platforms?: HelpPlatform[]
}

export interface HelpGo {
  /** Ruta real de la app (debe estar en KNOWN_APP_ROUTES). */
  path: string
  /** Destino exacto dentro de esa pantalla (pestaña, tema de Configuración, formulario…): ver src/help/destinations.ts. Si falta, «Llévame» lleva a la portada del módulo. */
  dest?: string
  /** Texto del botón; por defecto «Llévame». */
  label?: string
}

export interface HelpCard {
  id: string // p. ej. 'cal-crear-evento'
  module: HelpModuleId
  /** Lo que la persona quiere hacer o saber, en infinitivo o como pregunta corta: «Crear un evento». */
  title: string
  /** Otras formas de decirlo (sinónimos, palabras de la calle, errores habituales). Alimentan el buscador. */
  synonyms: string[]
  /** Respuesta breve (1-3 frases). Es lo que se lee en voz alta. */
  quick: string
  /** Pasos reales, cortos. */
  steps?: string[]
  /** Explicación avanzada (opcional). */
  more?: string
  state: HelpCardState
  /** Obligatorio si el estado no es «disponible»: qué límite tiene o por qué no está. */
  limits?: string
  /** El texto de `limits` es de estado interno (interruptores, pantallas pendientes…): solo lo ve la administración de PEPA. Si falta, es una limitación real de uso y se explica a todo el mundo con naturalidad. */
  limitsInternal?: boolean
  /** «Llévame». */
  go?: HelpGo
  /** Identificador del recorrido «Enséñame» (B4), si lo hay. */
  tour?: string
  /** Vídeo explicativo existente: ruta de la sección de Ayuda donde está (clave de HELP_VIDEOS). */
  video?: string
  /** Función del inventario del Centro de Administración que describe esta ficha (src/admin/features). */
  featureId?: string
  /** Textos de botones/pantallas que cita la ficha, EXACTAMENTE como se ven; una prueba comprueba que existen en el código. */
  labels?: string[]
  access?: HelpAccessRule
  /** Aparece en «Acciones frecuentes» de la pantalla de Ayuda. */
  frequent?: boolean
  /** Fecha (AAAA-MM-DD) en que se comprobó la ficha contra la app. */
  verified: string
}

export interface HelpModule {
  id: HelpModuleId
  label: string
  icon: string
  /** Pantalla principal del módulo («Llévame al módulo»). */
  path: string
  /** Una frase: para qué sirve. */
  summary: string
  /** Clave de la Ayuda histórica (src/help/legacy) con la explicación ampliada de este módulo. */
  legacyRoute?: string
  access?: HelpAccessRule
}

// Todo lo que el buscador puede devolver: una ficha curada o un apartado de la explicación ampliada histórica de un módulo.
export interface HelpDocEntry {
  kind: 'legacy'
  id: string
  module: HelpModuleId
  title: string
  text: string
  legacyRoute: string
}
