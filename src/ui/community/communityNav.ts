// Rutas y migas de pan de Comunidad (contrato compartido por todas las pantallas de Comunidad).
//
//   /comunidad                      portada
//   /comunidad/s/recetas|hogar      sección (query: tema=<id>, orden=<PostOrder>, tipo=<kind>)
//   /comunidad/p/:id                publicación (query: nuevos=1, c=<id de comentario> para abrir en lo nuevo)
//   /comunidad/nueva                crear (query: tipo=<kind>, seccion=<id>, borrador=<id>, receta=<id de receta privada>, titulo=<título precompletado>)
//   /comunidad/editar/:id           editar una publicación propia
//   /comunidad/borradores | /guardados | /buscar (query q=) | /recientes (Novedades: últimas publicaciones) | /novedades (comentarios sin leer) | /medallas | /normas
//   /comunidad/u/:id                perfil público
//   /comunidad/mi-perfil            ajustes de mi perfil público, bloqueos, temas favoritos…
//   /administracion?area=comunidad  Centro de Mando (solo administración; /comunidad/admin redirige aquí)

import { SECTIONS, type CommunitySection } from '@/domain/community'

export const COMMUNITY_BASE = '/comunidad'
// Perfil oficial de Pepa (fijo: lo crea la migración 0264).
export const PEPA_PROFILE_ID = '00000000-0000-4000-8000-0000000000a2'

export const paths = {
  home: COMMUNITY_BASE,
  section: (section: CommunitySection, params?: { tema?: string | null; orden?: string | null; tipo?: string | null }) => {
    const q = new URLSearchParams()
    if (params?.tema) q.set('tema', params.tema)
    if (params?.orden) q.set('orden', params.orden)
    if (params?.tipo) q.set('tipo', params.tipo)
    const s = q.toString()
    return `${COMMUNITY_BASE}/s/${section}${s ? `?${s}` : ''}`
  },
  post: (id: string, params?: { nuevos?: boolean; comment?: string | null }) => {
    const q = new URLSearchParams()
    if (params?.nuevos) q.set('nuevos', '1')
    if (params?.comment) q.set('c', params.comment)
    const s = q.toString()
    return `${COMMUNITY_BASE}/p/${id}${s ? `?${s}` : ''}`
  },
  newPost: (params?: { tipo?: string | null; seccion?: string | null; borrador?: string | null; receta?: string | null; titulo?: string | null }) => {
    const q = new URLSearchParams()
    if (params?.tipo) q.set('tipo', params.tipo)
    if (params?.seccion) q.set('seccion', params.seccion)
    if (params?.borrador) q.set('borrador', params.borrador)
    if (params?.receta) q.set('receta', params.receta)
    if (params?.titulo) q.set('titulo', params.titulo)
    const s = q.toString()
    return `${COMMUNITY_BASE}/nueva${s ? `?${s}` : ''}`
  },
  edit: (id: string) => `${COMMUNITY_BASE}/editar/${id}`,
  drafts: `${COMMUNITY_BASE}/borradores`,
  saved: `${COMMUNITY_BASE}/guardados`,
  search: (q?: string) => `${COMMUNITY_BASE}/buscar${q ? `?q=${encodeURIComponent(q)}` : ''}`,
  news: `${COMMUNITY_BASE}/novedades`,
  // «✨ Novedades» de la barra: las publicaciones más recientes (la lista de comentarios sin leer sigue en `news`, ligada a los avisos personales).
  recent: `${COMMUNITY_BASE}/recientes`,
  // «👥 Seguidos»: el mismo listado, solo con las cuentas que sigo.
  following: `${COMMUNITY_BASE}/recientes?ver=seguidos`,
  medals: `${COMMUNITY_BASE}/medallas`,
  rules: `${COMMUNITY_BASE}/normas`,
  profile: (id: string) => `${COMMUNITY_BASE}/u/${id}`,
  myProfile: `${COMMUNITY_BASE}/mi-perfil`,
  // El Centro de Mando de Comunidad está dentro del Centro de Administración (área «Comunidad y moderación»).
  admin: '/administracion?area=comunidad',
}

export interface Crumb {
  label: string
  to?: string
  // Estado de navegación que viaja con el enlace (p. ej. «recupera la lista tal como estaba»).
  state?: unknown
}

// Último filtro (tema, tipo y orden) de cada sección de Comunidad, en esta pestaña. Al volver a la sección desde una publicación con la miga «Recetas y cocina» (en el móvil no hay
// botón «atrás»), la lista reaparece con lo que la persona había elegido en vez de empezar de cero. Solo se guarda en esta sesión del navegador: nada viaja al servidor.
const SECTION_QUERY_KEY = 'community:section-query:'

export function rememberSectionQuery(section: CommunitySection, search: string): void {
  try {
    const q = search.replace(/^\?/, '')
    if (q) window.sessionStorage.setItem(SECTION_QUERY_KEY + section, q)
    else window.sessionStorage.removeItem(SECTION_QUERY_KEY + section)
  } catch {
    // sin almacenamiento (ventana privada): no pasa nada, la sección empieza limpia.
  }
}

export function savedSectionQuery(section: CommunitySection): string {
  try {
    const q = window.sessionStorage.getItem(SECTION_QUERY_KEY + section)
    return q ? `?${q}` : ''
  } catch {
    return ''
  }
}

// Migas: Inicio › Comunidad › [Recetas y cocina | Hogar y familia] › Publicación. NO llevan el título de la publicación (ni recortado): el título completo
// va debajo, como encabezado de la propia página. Las páginas especiales (perfiles, buscador…) adaptan el último tramo sin enseñar datos privados.
export function postCrumbs(section: CommunitySection): Crumb[] {
  const s = SECTIONS.find((x) => x.id === section)
  // La miga de la sección vuelve con el filtro que había (orden, temas y tipo) y recupera la lista y el desplazamiento.
  return [
    { label: 'Inicio', to: '/' },
    { label: 'Comunidad', to: paths.home },
    { label: s?.title ?? 'Sección', to: paths.section(section) + savedSectionQuery(section), state: { restoreList: true } },
    { label: 'Publicación' },
  ]
}

export function sectionCrumbs(section: CommunitySection): Crumb[] {
  const s = SECTIONS.find((x) => x.id === section)
  return [{ label: 'Inicio', to: '/' }, { label: 'Comunidad', to: paths.home }, { label: s?.title ?? 'Sección' }]
}

// Migas de «Mis medallas» y «Mis ajustes»: pasan por «Mi perfil» para poder volver a él (con su punto de desplazamiento si se vuelve con «atrás»).
export function myProfileSubCrumbs(label: string, profileId: string | null | undefined): Crumb[] {
  return [
    { label: 'Inicio', to: '/' },
    { label: 'Comunidad', to: paths.home },
    { label: 'Mi perfil', to: profileId ? paths.profile(profileId) : paths.myProfile },
    { label },
  ]
}

export function pageCrumbs(label: string): Crumb[] {
  return [{ label: 'Inicio', to: '/' }, { label: 'Comunidad', to: paths.home }, { label }]
}

export const homeCrumbs: Crumb[] = [{ label: 'Inicio', to: '/' }, { label: 'Comunidad' }]
