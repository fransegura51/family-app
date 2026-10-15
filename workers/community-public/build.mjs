// Empaqueta el Worker en UN solo archivo (dist/worker.js) con todo dentro (también el generador de HTML de src/domain).
// Sirve para pegarlo en el editor del panel de Cloudflare («Edit code») sin instalar nada más. Usa el esbuild del proyecto.
import { build } from 'esbuild'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
await build({
  entryPoints: [join(here, 'src/index.ts')],
  outfile: join(here, 'dist/worker.js'),
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'neutral',
  legalComments: 'none',
  logLevel: 'info',
})
