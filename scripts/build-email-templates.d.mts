export const LOGO_URL: string
export const SUPPORT_EMAIL: string
export const SITE_URL: string
export const OTP_EXPIRY_TEXT: string
export const TEMPLATES: Record<string, { supabaseName: string; subject: string; html: string }>
export function previewHtml(html: string): string
export function writeAll(root: string): void
