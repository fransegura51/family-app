export const DEFAULTS: { host: string; port: number; user: string; from: string; fromName: string }
export function buildTestMessage(opts: { from: string; fromName: string; to: string; now?: Date }): string
export interface SmtpStep {
  ok: boolean
  titulo: string
  detalle: string
}
export type SmtpVerdict = 'OK' | 'AUTH_FALLIDA' | 'REMITENTE_RECHAZADO' | 'DESTINATARIO_RECHAZADO' | 'DATOS_RECHAZADOS' | 'CONEXION'
export function runSmtpTest(opts: {
  host?: string
  port?: number
  user?: string
  pass: string
  from?: string
  fromName?: string
  to: string
  transport?: 'tls' | 'starttls' | 'plain'
  onLog?: (step: SmtpStep) => void
}): Promise<{ veredicto: SmtpVerdict; pasos: SmtpStep[] }>
export function explainVerdict(veredicto: SmtpVerdict, opts?: { from?: string; user?: string; to?: string }): string[]
