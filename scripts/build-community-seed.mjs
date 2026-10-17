// Genera el script de carga de las 20 publicaciones iniciales de Comunidad a partir de los textos de `supabase/seed/community_initial_posts/*.md`.
//
//   node scripts/build-community-seed.mjs                      → valida y reescribe supabase/seed/community_seed_proposals.sql
//   node scripts/build-community-seed.mjs --review <ruta.md>   → además escribe el documento de revisión legible (para la dueña)
//   node scripts/build-community-seed.mjs --check              → solo valida (no escribe nada); código de salida 1 si algo falla
//
// El script SQL resultante NO se ejecuta nunca desde aquí: es un cambio de datos que solo se carga con autorización expresa. Carga las publicaciones como
// PROPUESTAS (status = 'proposed'); nada se publica sin aprobación humana. Es idempotente por `seed_key` (identificador estable): si la propuesta ya existe NO
// se toca (así no se pisan ediciones hechas en el Centro de Mando ni lo ya aprobado o publicado).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dir = path.join(root, 'supabase', 'seed', 'community_initial_posts')
const out = path.join(root, 'supabase', 'seed', 'community_seed_proposals.sql')

export const TOPICS = {
  recetas: ['platos-principales', 'entrantes-aperitivos-tapas', 'recetas-faciles', 'postres-dulces', 'cocina-saludable', 'menus-planificacion', 'trucos-de-cocina', 'aprovechamiento-alimentos'],
  hogar: ['ahorro-economia', 'organizacion-familiar', 'crianza-educacion', 'limpieza-hogar', 'actividades-familia', 'manualidades-decoracion'],
}
export const ALLOWED_LINKS = ['https://fransegura51.github.io/family-app/descargas/PEPA_Kit_Rutinas_Imprimible_Completo.pdf', 'https://pepafamilyapp.es/descargas/PEPA_Kit_Rutinas_Imprimible_Completo.pdf']
const EXPECTED = 20

export function parsePost(file, text) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g, '\n'))
  if (!m) throw new Error(`${file}: falta la cabecera «---»`)
  const meta = {}
  for (const line of m[1].split('\n')) {
    const kv = /^([a-z_]+):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1]] = kv[2].trim()
  }
  return { file, ...meta, body: m[2].trim() }
}

export function validate(posts, payloads) {
  const errors = []
  const keys = new Set()
  const titles = new Set()
  if (posts.length !== EXPECTED) errors.push(`hay ${posts.length} publicaciones y deben ser exactamente ${EXPECTED}`)
  for (const p of posts) {
    const f = p.file
    for (const k of ['seed_key', 'section', 'topic', 'title']) if (!p[k]) errors.push(`${f}: falta ${k}`)
    if (!/^inicial-\d\d-[a-z0-9-]+$/.test(p.seed_key ?? '')) errors.push(`${f}: seed_key inválida (${p.seed_key})`)
    if (keys.has(p.seed_key)) errors.push(`${f}: seed_key duplicada`)
    keys.add(p.seed_key)
    if (titles.has(p.title)) errors.push(`${f}: título duplicado`)
    titles.add(p.title)
    if (!TOPICS[p.section]?.includes(p.topic)) errors.push(`${f}: el tema «${p.topic}» no es válido en la sección «${p.section}»`)
    if (!p.title || p.title.length < 3 || p.title.length > 140) errors.push(`${f}: el título debe tener entre 3 y 140 caracteres`)
    if (!p.body || p.body.length < 200) errors.push(`${f}: cuerpo demasiado corto`)
    if (p.body.length > 10000) errors.push(`${f}: el cuerpo supera 10.000 caracteres (${p.body.length})`)
    if (/^#{1,6}\s/m.test(p.body)) errors.push(`${f}: usa títulos con # (Comunidad no los pinta)`)
    if (/^\s*\|.*\|\s*$/m.test(p.body)) errors.push(`${f}: usa tablas (Comunidad no las pinta)`)
    if (/<[a-z][^>]*>/i.test(p.body)) errors.push(`${f}: contiene HTML`)
    if (/```/.test(p.body)) errors.push(`${f}: contiene bloques de código`)
    if (/\$[a-z]*\$/.test(p.body) || /\$[a-z]*\$/.test(p.title)) errors.push(`${f}: contiene un delimitador de dólares del script SQL`)
    for (const u of p.body.match(/https?:\/\/[^\s)\]>]+/g) ?? []) if (!ALLOWED_LINKS.includes(u)) errors.push(`${f}: enlace no autorizado ${u}`)
    if (/\n\n\s*[-*] [^\n]*\n\n\s*[-*] /.test(p.body)) errors.push(`${f}: líneas en blanco entre viñetas de una misma lista`)
  }
  for (const [k, v] of Object.entries(payloads)) if (!keys.has(k)) errors.push(`payload sin publicación: ${k}`)
  return errors
}

export function load() {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort()
  const posts = files.map((f) => parsePost(f, fs.readFileSync(path.join(dir, f), 'utf8')))
  const payloads = {}
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.payload.json'))) {
    const key = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) // valida que el JSON es correcto
    const base = f.replace('.payload.json', '.md')
    const owner = posts.find((p) => p.file === base)
    if (!owner) throw new Error(`${f}: no hay publicación ${base}`)
    payloads[owner.seed_key] = key
  }
  return { posts, payloads }
}

const q = (s) => `$b$${s}$b$`

export function buildSql(posts, payloads) {
  const rows = posts
    .map((p) => `      (${q(p.seed_key)}, ${q(p.section)}, ${q(p.topic)}, ${q(p.title)},\n       ${q(p.body)},\n       $j$${JSON.stringify(payloads[p.seed_key] ? { menu: payloads[p.seed_key] } : {})}$j$::jsonb, ${q(payloads[p.seed_key] ? 'menu' : 'tip')})`)
    .join(',\n')
  return `-- COMUNIDAD PEPA — las ${posts.length} publicaciones iniciales como PROPUESTAS (no se publican solas).
-- ARCHIVO GENERADO por scripts/build-community-seed.mjs a partir de supabase/seed/community_initial_posts/*.md: NO se edita a mano (edita los .md y regenera).
--
-- Se cargan como propuestas («Consejo de Pepa»; la 05 es de tipo «menu», «Menú semanal de Pepa», sin programación semanal: se publica al aprobarla; status =
-- 'proposed') en el mismo circuito que el lote semanal: la administración las revisa en el Centro de Mando → Contenido oficial, las edita si quiere y APRUEBA
-- una a una (basta la aprobación de cualquiera de los dos administradores). Nada se publica sin esa aprobación. Al aprobar la 05 se vuelve a validar el menú.
--
-- NO es una migración: no se aplica sola. Se ejecuta a mano UNA vez, después de aplicar las migraciones de Comunidad y con autorización expresa (es un cambio de datos).
-- Idempotente por seed_key (identificador estable): si una propuesta ya existe NO se toca (no se pisan ediciones del Centro de Mando ni lo aprobado o publicado).

do $seed$
declare
  r record;
  v_id uuid;
begin
  for r in
    select * from (values
${rows}
    ) as t(seed_key, section, topic_id, title, body, payload, kind)
  loop
    if not exists (select 1 from public.community_official_items i where i.seed_key = r.seed_key) then
      insert into public.community_official_items (seed_key, kind, section, topic_id, title, body, payload, batch_week, proposed_by)
      values (r.seed_key, r.kind, r.section, r.topic_id, r.title, r.body, r.payload, date_trunc('week', now())::date, 'Semilla inicial')
      returning id into v_id;
      insert into public.community_official_item_versions (item_id, version, snapshot)
      values (v_id, 1, jsonb_build_object('kind', r.kind, 'section', r.section, 'topic_id', r.topic_id, 'title', r.title, 'body', r.body, 'payload', r.payload));
    end if;
  end loop;
end
$seed$;
`
}

export function buildReview(posts) {
  const names = { recetas: 'Recetas y cocina', hogar: 'Hogar y familia' }
  const lines = [
    '# Las 20 publicaciones iniciales — texto definitivo para tu revisión',
    '',
    'Estado: **PROPUESTAS. No están publicadas, ni cargadas en la base de datos, ni aprobadas.** Generado desde `supabase/seed/community_initial_posts/`.',
    '',
  ]
  for (const p of posts) {
    const n = /^(\d\d)-/.exec(p.file)?.[1] ?? '??'
    lines.push(`## ${Number(n)}. ${p.title}`, `*${names[p.section]} · tema \`${p.topic}\` · clave \`${p.seed_key}\` · ${p.body.length} caracteres*`, '', p.body, '', '- [ ] Aprobar  - [ ] Editar  - [ ] Rechazar', '')
  }
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { posts, payloads } = load()
  const errors = validate(posts, payloads)
  if (errors.length) {
    console.error('ERRORES:\n- ' + errors.join('\n- '))
    process.exit(1)
  }
  if (process.argv.includes('--check')) {
    console.log(`OK: ${posts.length} publicaciones válidas`)
    process.exit(0)
  }
  fs.writeFileSync(out, buildSql(posts, payloads), 'utf8')
  const ri = process.argv.indexOf('--review')
  if (ri > 0) fs.writeFileSync(process.argv[ri + 1], buildReview(posts), 'utf8')
  console.log(`OK: ${posts.length} publicaciones → ${path.relative(root, out)}${ri > 0 ? ' + documento de revisión' : ''}`)
}
