export const LOGO_URL: string
export const SUPPORT_EMAIL: string
export const SITE_URL: string
export const OTP_EXPIRY_TEXT: string
export const TEMPLATES: Record<string, { supabaseName: string; subject: string; html: string }>
export function previewHtml(html: string): string
export function writeAll(root: string): void
export const INVITATION_TEMPLATES: Record<string, { subject: string; html: string }>
export const INVITATION_SAMPLE: { invite_code: string; expires_text: string; register_url: string; inviter_name: string; recipient_name: string }
export function renderInvitation(html: string, vars: { invite_code?: string; expires_text?: string; register_url?: string; inviter_name?: string | null; recipient_name?: string | null }): string
