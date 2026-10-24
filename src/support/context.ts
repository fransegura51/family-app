import { Capacitor } from '@capacitor/core'
import { isNativeApp } from '@/services/nativeApp'

// Contexto técnico MÍNIMO que acompaña a una incidencia, para que soporte pueda reproducir el problema sin pedirte datos. Es una lista cerrada de claves cortas; el servidor
// descarta cualquier otra (private.support_clean_context, migración 0310). NUNCA incluye: correo, nombre, identificadores de personas o familias, contenido de pantallas, textos
// escritos por la persona, direcciones completas (solo la sección), ubicación, contraseñas ni tokens. La persona ve exactamente esto antes de enviar.
declare const __APP_VERSION__: string | undefined

export interface SupportContextItem {
  key: string
  label: string
  value: string
}

function osFamily(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'otro'
}

function browserFamily(ua: string): string {
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/OPR\//i.test(ua)) return 'Opera'
  if (/CriOS|Chrome\//i.test(ua)) return 'Chrome'
  if (/FxiOS|Firefox\//i.test(ua)) return 'Firefox'
  if (/Safari\//i.test(ua)) return 'Safari'
  return 'otro'
}

export function appVersion(): string {
  return typeof __APP_VERSION__ === 'string' && __APP_VERSION__ ? __APP_VERSION__ : 'desconocida'
}

export function collectSupportContext(section: string, errorId?: string): Record<string, string> {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const native = isNativeApp()
  const ctx: Record<string, string> = {
    app_version: appVersion(),
    platform: native ? `app ${Capacitor.getPlatform()}` : 'web',
    mode: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches ? 'instalada' : 'navegador',
    os: osFamily(ua),
    browser: browserFamily(ua),
    device: typeof window !== 'undefined' && window.innerWidth < 768 ? 'móvil' : 'ordenador',
    section,
    locale: typeof navigator !== 'undefined' ? (navigator.language ?? '').slice(0, 10) : '',
  }
  if (errorId) ctx.error_id = errorId.slice(0, 80)
  return Object.fromEntries(Object.entries(ctx).filter(([, v]) => v))
}

const CONTEXT_LABELS: Record<string, string> = {
  app_version: 'Versión de PEPA',
  platform: 'Plataforma',
  mode: 'Cómo la usas',
  os: 'Sistema',
  browser: 'Navegador',
  device: 'Dispositivo',
  section: 'Sección',
  locale: 'Idioma',
  error_id: 'Código de error',
}

export function describeContext(ctx: Record<string, string>): SupportContextItem[] {
  return Object.entries(ctx).map(([key, value]) => ({ key, label: CONTEXT_LABELS[key] ?? key, value }))
}
