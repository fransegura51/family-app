// Comunidad PEPA — tipos y constantes compartidos por la capa de datos y las pantallas (sin red, sin React).
// El servidor (migraciones 0264-0273) es quien aplica las reglas; aquí solo viven las formas de los datos y los textos fijos.

export type PostKind = 'receta' | 'pregunta' | 'consejo' | 'anecdota'
// Tipos de publicación OFICIAL (de Pepa o Equipo PEPA): no son un quinto tipo de publicación de personas.
export type OfficialKind = 'encuesta' | 'articulo'
export type AnyPostKind = PostKind | OfficialKind
export type CommunitySection = 'recetas' | 'hogar'
export type PostOrder = 'recientes' | 'comentados' | 'valoradas' | 'sin_respuesta' | 'para_mi'
export type CommentOrder = 'antiguos' | 'recientes' | 'utiles'
export type FollowMode = 'smart' | 'every' | 'off'

// Solo dos secciones iniciales (Anécdotas es un TIPO de publicación, no una tercera sección).
export const SECTIONS: { id: CommunitySection; title: string; icon: string; description: string }[] = [
  { id: 'recetas', title: 'Recetas y cocina', icon: '🍲', description: 'Recetas, trucos y consejos de cocina de otras familias.' },
  { id: 'hogar', title: 'Hogar y familia', icon: '🏡', description: 'Ahorro, organización, crianza, limpieza, actividades y manualidades.' },
]

export const POST_KINDS: { id: PostKind; label: string; icon: string; help: string }[] = [
  { id: 'receta', label: 'Receta', icon: '🍲', help: 'Comparte una receta de tu Cocina de PEPA.' },
  { id: 'pregunta', label: 'Pregunta', icon: '❓', help: 'Pregunta a otras familias.' },
  { id: 'consejo', label: 'Consejo', icon: '💡', help: 'Cuenta un truco o consejo.' },
  { id: 'anecdota', label: 'Anécdota', icon: '😄', help: 'Una historia graciosa, bonita o emotiva.' },
]

export const KIND_LABELS: Record<AnyPostKind, string> = {
  receta: 'Receta',
  pregunta: 'Pregunta',
  consejo: 'Consejo',
  anecdota: 'Anécdota',
  encuesta: 'Encuesta',
  articulo: 'Artículo',
}

export const KIND_ICONS: Record<AnyPostKind, string> = {
  receta: '🍲',
  pregunta: '❓',
  consejo: '💡',
  anecdota: '😄',
  encuesta: '📊',
  articulo: '📰',
}

export const ORDER_LABELS: Record<PostOrder, string> = {
  recientes: 'Más recientes',
  comentados: 'Más comentados',
  valoradas: 'Mejor valoradas',
  sin_respuesta: 'Preguntas sin responder',
  para_mi: 'Para mí',
}

export const COMMENT_ORDER_LABELS: Record<CommentOrder, string> = {
  antiguos: 'Más antiguos primero',
  recientes: 'Más recientes primero',
  utiles: 'Más útiles',
}

// Límites visibles para la persona (el servidor los vuelve a comprobar).
export const MAX_POST_PHOTOS = 5
export const MAX_COMMENT_PHOTOS = 1
export const MAX_TITLE = 140
export const MAX_BODY = 10000
export const MAX_COMMENT = 2000
export const DRAFT_DAYS = 30

export interface CommunityTopic {
  id: string
  section: CommunitySection
  label: string
}

export interface MyCommunityProfile {
  hasProfile: boolean
  id?: string
  alias?: string
  avatarEmoji?: string | null
  rulesAccepted?: boolean
  banState?: 'ok' | 'banned' | 'readmission'
  banEndsAt?: string | null
  readmissionStatus?: 'none' | 'requested' | 'approved' | 'rejected' | null
  isAdmin?: boolean
}

export interface CommunityStatus {
  launched: boolean
  visible: boolean
  isAdmin: boolean
}

// Capa neutra de alguien bloqueado: el servidor NO manda su contenido; solo el id para poder desbloquear.
export interface BlockedCard {
  blockedByMe: true
  id: string
  authorId: string
}

export interface PostCard {
  blockedByMe?: false
  id: string
  kind: AnyPostKind
  section: CommunitySection
  topicId: string
  topicLabel: string
  title: string
  excerpt: string
  authorId: string
  authorAlias: string | null
  authorAvatar: string | null
  authorIsOfficial: boolean
  authorDeleted: boolean
  isOfficial: boolean
  officialLabel: string | null
  featured: boolean
  thumbPath: string | null
  likeCount: number
  commentCount: number
  saveCount: number
  avgRating: number | null
  ratingCount: number
  importCount: number
  createdAt: string
  editedAt: string | null
  lastActivityAt: string
  unanswered: boolean
  likedByMe: boolean
  savedByMe: boolean
  canInteract: boolean
}

export type CommunityCardItem = PostCard | BlockedCard

export interface RecipeIngredient {
  name: string
  quantity: string
  unit: string
}

export interface PublicRecipe {
  id: string
  title: string
  servings: number | null
  ingredients: RecipeIngredient[]
  steps: string
  tags: string[]
  version: number
  updatedAt: string
  myRating: number | null
  importedByMyFamily: boolean
}

export interface RecipeDraftInput {
  servings: number | null
  ingredients: RecipeIngredient[]
  steps: string
  tags: string[]
}

export interface PostPhoto {
  path: string
  position: number
}

export interface PostDetail extends Omit<PostCard, 'blockedByMe'> {
  blockedByMe?: false
  status?: 'published'
  body: string
  photos: PostPhoto[]
  recipe: PublicRecipe | null
  articleSources: unknown
  isMine: boolean
  followingConversation: boolean
  followingAuthor: boolean
}

// El autor de una publicación oculta por moderación recibe solo esto.
export interface HiddenPostNotice {
  id: string
  status: 'hidden'
  isMine: true
  title: string
}

export interface CommentNode {
  id: string
  parentId: string | null
  replyToId: string | null
  replyToAlias: string | null
  status: 'published' | 'removed'
  authorId: string
  authorAlias: string | null
  authorAvatar: string | null
  authorIsOfficial: boolean
  authorDeleted: boolean
  body: string
  photoPath: string | null
  createdAt: string
  editedAt: string | null
  likeCount: number
  likedByMe: boolean
  mine: boolean
  isNew: boolean
  canInteract: boolean
  blockedByMe?: boolean
  replyCount?: number
  newReplyCount?: number
  replies?: CommentNode[]
}

export interface CommentList {
  comments: CommentNode[]
  totalRoots: number
  newCount: number
}

export interface PublicProfileInfo {
  id: string
  alias?: string
  avatarEmoji?: string | null
  isOfficial?: boolean
  memberSince?: string
  postCount?: number
  recipeCount?: number
  ratingCount?: number
  following?: boolean
  isMe?: boolean
  canInteract?: boolean
  blockedByMe?: boolean
}

export interface DraftSummary {
  id: string
  kind: PostKind
  title: string
  savedAt: string
  daysLeft: number
}

export interface Draft extends DraftSummary {
  section: CommunitySection | null
  topicId: string | null
  body: string
  photos: string[]
  recipe: RecipeDraftInput | null
}

export interface SearchHistoryItem {
  id: string
  query: string
  filters: Record<string, string>
  createdAt: string
}

export interface SuggestItem {
  type: 'topic' | 'post'
  id: string
  label: string
  section?: CommunitySection
  kind?: AnyPostKind
}

export interface MedalInfo {
  key: string
  family: 'cocina' | 'participacion' | 'ayuda'
  name: string
  description: string
  earned: boolean
  awardedAt: string | null
  progress: [number, number] | null
}

export interface MedalsView {
  medals: MedalInfo[]
  constancy: { level: number; name: string; weeksActive: number } | null
  suspended: boolean
}

export interface PollView {
  id: string
  postId: string
  question: string
  options: string[]
  opensAt: string
  closesAt: string
  status: 'scheduled' | 'open' | 'closed'
  myVote: number | null
  resultsVisible: boolean
  final: boolean
  counts: number[] | null
  totalVotes: number | null
}

export interface SummaryState {
  commentCount: number
  eligible: boolean
  threshold: number
  summary: string | null
  generatedAt: string | null
  commentsSince: number | null
  stale: boolean
}

export interface NewsBreakdownItem {
  postId: string
  title: string
  count: number
  firstCommentId: string
}

export interface RecipeReview {
  authorId: string
  authorAlias?: string | null
  authorAvatar?: string | null
  stars?: number
  review?: string | null
  createdAt?: string
  mine?: boolean
  blockedByMe?: boolean
}

export interface RecipeUpdateInfo {
  available: boolean
  hasUpdate: boolean
  importedVersion?: number
  currentVersion?: number
  imported?: (RecipeDraftInput & { title: string }) | null
  current?: (RecipeDraftInput & { title: string }) | null
  postId?: string
}

export const REPORT_REASONS: { id: string; label: string }[] = [
  { id: 'spam', label: 'Spam o publicidad' },
  { id: 'acoso', label: 'Acoso o faltas de respeto' },
  { id: 'violencia', label: 'Violencia' },
  { id: 'sexual', label: 'Contenido sexual' },
  { id: 'ilegal', label: 'Algo ilegal' },
  { id: 'datos_privados', label: 'Datos privados de alguien' },
  { id: 'enganoso', label: 'Información engañosa' },
  { id: 'otro', label: 'Otro motivo' },
]

// Normas que se enseñan antes de la primera participación (texto fijo; las reglas de verdad las aplica el servidor).
export const COMMUNITY_RULES: string[] = [
  'Sé amable y respetuoso/a: aquí hablamos de recetas, hogar y familia.',
  'No compartas datos privados tuyos ni de otras personas (nombres reales, direcciones, teléfonos, fotos de menores).',
  'No publiques spam, publicidad ni enlaces engañosos. Los enlaces que lleven fuera de PEPA se avisarán.',
  'Lo que publiques es público: lo puede leer cualquier persona con el enlace y buscadores como Google.',
  'Puedes denunciar y bloquear. La administración revisa las denuncias; con tres advertencias se pierde el acceso a Comunidad (no a tu cuenta familiar).',
  'Puedes borrar tu cuenta y tus aportaciones cuando quieras desde PEPA.',
]
