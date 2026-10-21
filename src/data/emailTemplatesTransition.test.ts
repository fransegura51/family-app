// Plantillas de TRANSICIÓN (con botón de enlace) que se pegan HOY en Supabase mientras la web desplegada siga siendo la actual, frente a las definitivas (solo código de 6 cifras)
// que se pegan junto con el despliegue de la web nueva. Se leen los archivos generados por scripts/build-email-templates.mjs.
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { LOGO_URL, TEMPLATES, TRANSITION_TEMPLATES } from '../../scripts/build-email-templates.mjs'

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../..', p), 'utf8')

describe('plantillas de transición (hoy)', () => {
  it('son exactamente las tres que la web actual usa con enlace: confirmar registro, recuperar contraseña y cambiar correo', () => {
    expect(Object.keys(TRANSITION_TEMPLATES).sort()).toEqual(['confirmation', 'email_change', 'recovery'])
    for (const [name, t] of Object.entries(TRANSITION_TEMPLATES)) {
      expect(t.supabaseName, name).toBe(TEMPLATES[name].supabaseName)
      expect(t.subject, name).toBe(TEMPLATES[name].subject)
    }
  })

  it('llevan el botón con el enlace de Supabase (que la web actual sabe usar) y NO el código de 6 cifras', () => {
    for (const [name, t] of Object.entries(TRANSITION_TEMPLATES)) {
      expect(t.html, name).toContain('href="{{ .ConfirmationURL }}"')
      expect(t.html, name).not.toContain('{{ .Token }}')
    }
  })

  it('en español, con el logotipo oficial publicado, soporte y sin scripts ni imágenes de terceros', () => {
    for (const [name, t] of Object.entries(TRANSITION_TEMPLATES)) {
      expect(t.html, name).toContain('<html lang="es">')
      expect(t.html, name).toContain(`src="${LOGO_URL}"`)
      expect(t.html, name).toContain('info@pepafamilyapp.es')
      expect(t.html, name).not.toMatch(/<script/i)
      expect(t.html, name).not.toMatch(/https?:\/\/(?!pepafamilyapp\.es)[a-z0-9.-]+\//i)
      expect(t.html, name).not.toMatch(/Reset your password|Confirm your signup|Change Email/i)
    }
    expect(TRANSITION_TEMPLATES.email_change.html).toContain('{{ .NewEmail }}')
  })

  it('los archivos guardados son los que genera el script (hoy y definitivas)', () => {
    for (const [name, t] of Object.entries(TRANSITION_TEMPLATES)) expect(read(`supabase/email-templates/transition/${name}.html`), name).toBe(t.html)
    for (const [name, t] of Object.entries(TEMPLATES)) expect(read(`supabase/email-templates/${name}.html`), name).toBe(t.html)
  })

  it('las definitivas siguen siendo solo código (sin enlace): no se mezclan con las de transición', () => {
    for (const [name, t] of Object.entries(TEMPLATES)) {
      expect(t.html, name).toContain('{{ .Token }}')
      expect(t.html, name).not.toContain('{{ .ConfirmationURL }}')
    }
  })
})
