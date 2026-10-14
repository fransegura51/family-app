// Comunidad PEPA — capa de datos. TODO el acceso es por funciones del servidor (supabase.rpc); ninguna tabla de Comunidad se toca directamente.
// Las respuestas llegan en snake_case y aquí se pasan a camelCase. Los errores del servidor traen un CÓDIGO (ALIAS_REQUIRED, BANNED, RATE_LIMIT…) que se
// convierte en CommunityError con una frase clara (domain/communityErrors.ts).
import { supabase } from '@/data/supabaseClient'
import { toCommunityError } from '@/domain/communityErrors'
import type {
  AnyPostKind,
  CommentList,
  CommentOrder,
  CommunitySection,
  CommunityStatus,
  CommunityTopic,
  CommunityCardItem,
  Draft,
  DraftSummary,
  FollowMode,
  MedalsView,
  MyCommunityProfile,
  NewsBreakdownItem,
  PollView,
  PostCard,
  PostDetail,
  HiddenPostNotice,
  PostKind,
  PostOrder,
  PublicProfileInfo,
  RecipeDraftInput,
  RecipeReview,
  RecipeUpdateInfo,
  SearchHistoryItem,
  SuggestItem,
  SummaryState,
} from '@/domain/community'

// snake_case → camelCase en profundidad (las claves de recetas/ingredientes ya son simples y no cambian).
export function camelize<T>(value: unknown): T {
  if (Array.isArray(value)) return value.map((v) => camelize(v)) as T
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())] = camelize(v)
    return out as T
  }
  return value as T
}

async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args ?? {})
  if (error) throw toCommunityError(error)
  return camelize<T>(data)
}

// ---- Estado, alias y temas
export const communityStatus = () => rpc<CommunityStatus>('community_status')
export const getMyCommunityProfile = () => rpc<MyCommunityProfile | null>('community_get_my_profile')
export const setCommunityAlias = (alias: string, avatarEmoji: string | null, acceptRules: boolean) =>
  rpc<MyCommunityProfile>('community_set_alias', { p_alias: alias, p_avatar_emoji: avatarEmoji, p_accept_rules: acceptRules })
export const listCommunityTopics = () => rpc<CommunityTopic[]>('community_list_topics')

// ---- Publicaciones
export interface ListPostsParams {
  section?: CommunitySection | null
  topic?: string | null
  kind?: AnyPostKind | null
  order?: PostOrder
  limit?: number
  offset?: number
  query?: string | null
  author?: string | null
  saved?: boolean
  following?: boolean
}

export const listPosts = (p: ListPostsParams = {}) =>
  rpc<CommunityCardItem[]>('community_list_posts', {
    p_section: p.section ?? null,
    p_topic: p.topic ?? null,
    p_kind: p.kind ?? null,
    p_order: p.order ?? 'recientes',
    p_limit: p.limit ?? 20,
    p_offset: p.offset ?? 0,
    p_query: p.query ?? null,
    p_author: p.author ?? null,
    p_saved: p.saved ?? false,
    p_following: p.following ?? false,
  })

export const similarPosts = (title: string, kind: PostKind | null, section: CommunitySection | null) =>
  rpc<PostCard[]>('community_similar_posts', { p_title: title, p_kind: kind, p_section: section })

export const searchSuggest = (prefix: string) => rpc<SuggestItem[]>('community_search_suggest', { p_prefix: prefix })

// null = no disponible (eliminada, oculta, no existe). El autor de una oculta por moderación recibe un aviso mínimo.
export const getPost = (id: string) => rpc<PostDetail | HiddenPostNotice | null>('community_get_post', { p_id: id })

export interface PostInput {
  kind: PostKind
  section: CommunitySection
  topicId: string
  title: string
  body: string
  photos: string[]
  recipe?: RecipeDraftInput | null
  fromDraft?: string | null
}

export const createPost = (i: PostInput) =>
  rpc<string>('community_create_post', {
    p_kind: i.kind,
    p_section: i.section,
    p_topic: i.topicId,
    p_title: i.title,
    p_body: i.body,
    p_photos: i.photos,
    p_recipe: i.recipe ?? null,
    p_from_draft: i.fromDraft ?? null,
  })

export const updatePost = (id: string, i: Omit<PostInput, 'kind' | 'section' | 'fromDraft'>) =>
  rpc<void>('community_update_post', { p_id: id, p_topic: i.topicId, p_title: i.title, p_body: i.body, p_photos: i.photos, p_recipe: i.recipe ?? null })

export const deletePost = (id: string) => rpc<void>('community_delete_post', { p_id: id })

// ---- Comentarios
export const listComments = (postId: string, order: CommentOrder = 'antiguos', limit = 30, offset = 0) =>
  rpc<CommentList | null>('community_list_comments', { p_post: postId, p_order: order, p_limit: limit, p_offset: offset })

export const addComment = (postId: string, body: string, photoPath: string | null, replyTo: string | null) =>
  rpc<string>('community_add_comment', { p_post: postId, p_body: body, p_photo: photoPath, p_reply_to: replyTo })

export const editComment = (id: string, body: string) => rpc<void>('community_edit_comment', { p_id: id, p_body: body })
export const deleteComment = (id: string) => rpc<void>('community_delete_comment', { p_id: id })
export const markCommentsSeen = (ids: string[]) => rpc<number>('community_mark_comments_seen', { p_ids: ids })

// ---- Interacciones
export const toggleLike = (type: 'post' | 'comment', id: string) => rpc<{ liked: boolean; likeCount: number }>('community_toggle_like', { p_type: type, p_id: id })
export const toggleSave = (postId: string) => rpc<{ saved: boolean; saveCount: number }>('community_toggle_save', { p_post: postId })
export const toggleFollowConversation = (postId: string) => rpc<boolean>('community_toggle_follow_conversation', { p_post: postId })
export const followUser = (profileId: string, mode: FollowMode = 'smart') => rpc<void>('community_follow_user', { p_cp: profileId, p_mode: mode })
export const unfollowUser = (profileId: string) => rpc<void>('community_unfollow_user', { p_cp: profileId })
export const blockUser = (profileId: string) => rpc<void>('community_block', { p_cp: profileId })
export const unblockUser = (profileId: string) => rpc<void>('community_unblock', { p_cp: profileId })
export const listBlocks = () => rpc<{ id: string; alias: string; avatarEmoji: string | null }[]>('community_list_blocks')
export const listFollowing = () => rpc<{ id: string; alias: string; avatarEmoji: string | null; notifyMode: FollowMode }[]>('community_list_following')
export const setFavoriteTopics = (topics: string[]) => rpc<void>('community_set_favorite_topics', { p_topics: topics })
export const getFavoriteTopics = () => rpc<string[]>('community_get_favorite_topics')
export const getPublicProfile = (profileId: string) => rpc<PublicProfileInfo | null>('community_get_public_profile', { p_cp: profileId })
export const reportContent = (type: 'post' | 'comment' | 'user', id: string, reason: string, detail: string | null) =>
  rpc<{ alreadyReported: boolean; hidden?: boolean }>('community_report', { p_type: type, p_id: id, p_reason: reason, p_detail: detail })

// ---- Borradores y búsquedas
export const saveDraft = (d: {
  id: string | null
  kind: PostKind
  section: CommunitySection | null
  topicId: string | null
  title: string
  body: string
  photos: string[]
  recipe: RecipeDraftInput | null
}) =>
  rpc<string>('community_save_draft', {
    p_id: d.id,
    p_kind: d.kind,
    p_section: d.section,
    p_topic: d.topicId,
    p_title: d.title,
    p_body: d.body,
    p_photos: d.photos,
    p_recipe: d.recipe,
  })
export const listDrafts = () => rpc<DraftSummary[]>('community_list_drafts')
export const getDraft = (id: string) => rpc<Draft | null>('community_get_draft', { p_id: id })
export const deleteDraft = (id: string) => rpc<void>('community_delete_draft', { p_id: id })
export const recordSearch = (query: string, filters: Record<string, string>) => rpc<void>('community_record_search', { p_query: query, p_filters: filters })
export const listSearches = () => rpc<SearchHistoryItem[]>('community_list_searches')
export const clearSearches = () => rpc<void>('community_clear_searches')

// ---- Recetas
export const rateRecipe = (recipeId: string, stars: number, review: string | null) =>
  rpc<{ avgRating: number; ratingCount: number }>('community_rate_recipe', { p_recipe: recipeId, p_stars: stars, p_review: review })
export const listRecipeReviews = (recipeId: string, limit = 20, offset = 0) =>
  rpc<RecipeReview[]>('community_list_recipe_reviews', { p_recipe: recipeId, p_limit: limit, p_offset: offset })
export const recordRecipeImport = (recipeId: string, privateRecipeId: string) =>
  rpc<{ importedVersion: number; importCount: number }>('community_record_import', { p_recipe: recipeId, p_private_recipe: privateRecipeId })
export const getRecipeUpdate = (privateRecipeId: string) => rpc<RecipeUpdateInfo | null>('community_get_recipe_update', { p_private_recipe: privateRecipeId })
export const markRecipeUpdated = (privateRecipeId: string) => rpc<void>('community_mark_recipe_updated', { p_private_recipe: privateRecipeId })

// ---- Medallas, encuestas, resumen y novedades
export const getMedals = (profileId?: string | null) => rpc<MedalsView | null>('community_get_medals', { p_cp: profileId ?? null })
export const getPoll = (postId: string) => rpc<PollView | null>('community_get_poll', { p_post: postId })
export const votePoll = (postId: string, option: number) => rpc<PollView>('community_vote_poll', { p_post: postId, p_option: option })
export const getSummary = (postId: string) => rpc<SummaryState | null>('community_get_summary', { p_post: postId })
export const requestSummaryRefresh = (postId: string) => rpc<void>('community_request_summary_refresh', { p_post: postId })
export const newsBreakdown = () => rpc<NewsBreakdownItem[]>('community_news_breakdown')

// Pide a la función de servidor que genere o actualice el resumen de Pepa (si falla, los comentarios siguen accesibles: nunca bloquea nada).
export async function generateSummary(postId: string, force = false): Promise<{ ok: boolean; summary?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('community-summarize', { body: { post_id: postId, force } })
    if (error) return { ok: false }
    const result = data as { ok?: boolean; summary?: string } | null
    return { ok: result?.ok === true, summary: result?.summary }
  } catch {
    return { ok: false }
  }
}

// ---- Derecho de supresión y readmisión
export const requestReadmission = () => rpc<void>('community_request_readmission')
export const deleteMyCommunityContent = () => rpc<number>('community_delete_my_content')
export const requestContentRemoval = (scope: 'all_my_content' | 'specific', targetType: 'post' | 'comment' | null, targetId: string | null, detail: string) =>
  rpc<string>('community_request_content_removal', { p_scope: scope, p_target_type: targetType, p_target_id: targetId, p_detail: detail })

// ---- Fotos (bucket público «community-media»; la ruta empieza por el id del perfil público)
export function communityPhotoUrl(path: string): string {
  return supabase.storage.from('community-media').getPublicUrl(path).data.publicUrl
}

export async function uploadCommunityPhoto(profileId: string, blob: Blob): Promise<string> {
  const path = `${profileId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage.from('community-media').upload(path, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw toCommunityError(error)
  return path
}

export async function removeCommunityPhoto(path: string): Promise<void> {
  // Solo se puede borrar dentro de la carpeta propia (política de Storage). Un fallo aquí no es grave: la limpieza del servidor la retira igualmente.
  await supabase.storage.from('community-media').remove([path]).catch(() => undefined)
}

// ---- Centro de Mando (solo administradores de Comunidad; el servidor lo comprueba)
export const adminOverview = () => rpc<Record<string, number>>('community_admin_overview')
export const adminListReports = (status: 'open' | 'resolved' = 'open', limit = 50, offset = 0) =>
  rpc<Record<string, unknown>[]>('community_admin_list_reports', { p_status: status, p_limit: limit, p_offset: offset })
export const adminGetContent = (type: 'post' | 'comment', id: string) => rpc<Record<string, unknown> | null>('community_admin_get_content', { p_type: type, p_id: id })
export const adminResolveContent = (type: 'post' | 'comment' | 'user', id: string, action: 'sin_accion' | 'ocultar' | 'advertir' | 'expulsar', note: string | null) =>
  rpc<Record<string, unknown>>('community_admin_resolve_content', { p_type: type, p_id: id, p_action: action, p_note: note })
export const adminSetVisibility = (type: 'post' | 'comment', id: string, visible: boolean, reason: string) =>
  rpc<void>('community_admin_set_visibility', { p_type: type, p_id: id, p_visible: visible, p_reason: reason })
export const adminListHidden = () => rpc<Record<string, unknown>[]>('community_admin_list_hidden')
export const adminListUsers = (query: string | null) => rpc<Record<string, unknown>[]>('community_admin_list_users', { p_query: query })
export const adminListReadmissions = () => rpc<Record<string, unknown>[]>('community_admin_list_readmissions')
export const adminResolveReadmission = (banId: string, approve: boolean, note: string | null) =>
  rpc<void>('community_admin_resolve_readmission', { p_ban: banId, p_approve: approve, p_note: note })
export const adminListLog = (limit = 100, offset = 0) => rpc<Record<string, unknown>[]>('community_admin_list_log', { p_limit: limit, p_offset: offset })
export const adminGetSettings = () => rpc<{ settings: { key: string; value: unknown; description: string }[]; blockedDomains: { domain: string; reason: string | null }[] }>('community_admin_get_settings')
export const adminSetSetting = (key: string, value: number) => rpc<void>('community_admin_set_setting', { p_key: key, p_value: value })
export const adminBlockDomain = (domain: string, reason: string | null, remove = false) => rpc<void>('community_admin_block_domain', { p_domain: domain, p_reason: reason, p_remove: remove })
export const adminSetFeatured = (postId: string, featured: boolean) => rpc<void>('community_admin_set_featured', { p_post: postId, p_featured: featured })
export const adminListFeatured = () => rpc<Record<string, unknown>[]>('community_admin_list_featured')
export const adminWarn = (profileId: string, reason: string) => rpc<Record<string, unknown>>('community_admin_warn', { p_profile: profileId, p_reason: reason })
export const adminRevokeWarning = (warningId: string, reason: string) => rpc<void>('community_admin_revoke_warning', { p_warning: warningId, p_reason: reason })
export const adminBan = (profileId: string, reason: string, days: number | null) => rpc<string>('community_admin_ban', { p_profile: profileId, p_reason: reason, p_days: days })
export const adminLiftBan = (banId: string, reason: string) => rpc<void>('community_admin_lift_ban', { p_ban: banId, p_reason: reason })
export const adminListRemovalRequests = (status: 'open' | 'done' | 'rejected' = 'open') => rpc<Record<string, unknown>[]>('community_admin_list_removal_requests', { p_status: status })
export const adminHandleRemoval = (id: string, approve: boolean, note: string | null) => rpc<void>('community_admin_handle_removal', { p_id: id, p_approve: approve, p_note: note })
export const adminListProposals = (status: 'proposed' | 'approved' | 'rejected' | 'published' = 'proposed') =>
  rpc<Record<string, unknown>[]>('community_admin_list_proposals', { p_status: status })
export const adminEditProposal = (id: string, title: string, body: string, payload: Record<string, unknown> | null, topic: string | null) =>
  rpc<number>('community_admin_edit_proposal', { p_id: id, p_title: title, p_body: body, p_payload: payload, p_topic: topic })
export const adminApproveProposal = (id: string) => rpc<Record<string, unknown>>('community_admin_approve_proposal', { p_id: id })
export const adminRejectProposal = (id: string, note: string | null) => rpc<void>('community_admin_reject_proposal', { p_id: id, p_note: note })
export const adminSetLaunch = (enabled: boolean) => rpc<void>('community_admin_set_launch', { p_enabled: enabled })
