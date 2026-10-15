# Worker de lectura pública de Comunidad PEPA

Cloudflare Worker gratuito que sirve las **páginas públicas** de Comunidad (vista previa en WhatsApp, lectura sin registro, Google).
Pide los datos públicos a Supabase (funciones SQL de solo lectura) y devuelve HTML completo con Open Graph, JSON-LD y `robots`.

Guía para no técnicos (cuenta de Cloudflare, DNS, Search Console): `family-app/docs/comunidad/GUIA_ENLACES_PUBLICOS.md`.
Decisión y alternativas: `family-app/docs/comunidad/DECISIONES.md` §1.

## Rutas (decisión: prefijo `/c`)

El prefijo sale de la ruta de `PUBLIC_BASE` (con `https://pepafamilyapp.es/c` es `/c`; si algún día se usa un subdominio sin ruta, funciona igual con `/p/<id>`).

| Ruta | Respuesta |
|---|---|
| `GET /c/p/<uuid>` | Publicación. 200, o 404 «Esta publicación ya no está disponible» (noindex, sin datos) |
| `GET /c/sitemap.xml` | Mapa del sitio (hasta 5.000 publicaciones visibles, `lastmod`) |
| `GET /c/robots.txt` | robots con la línea `Sitemap:` (Google solo lee el robots de la **raíz**: ahí hay que añadir `Sitemap: https://pepafamilyapp.es/c/sitemap.xml`) |
| `GET /c`, `/c/` | 302 a `APP_BASE/comunidad` |
| cualquier otra / uuid inválido | 404 neutro con noindex (no consulta Supabase) |

Solo `GET` y `HEAD`. El 404 sirve igual para «no existe», «oculta», «eliminada», «restringida» y «Comunidad aún sin lanzar»: la base devuelve `null` en todos los casos y así no se filtra cuál es.
Un fallo al hablar con Supabase responde **503** (`no-store`, `Retry-After: 30`, noindex): nunca se confunde con «borrado».

## Variables

| Nombre | Obligatoria | Ejemplo |
|---|---|---|
| `SUPABASE_URL` | sí | `https://objhgjgrinbhyzscjlbw.supabase.co` |
| `SUPABASE_ANON_KEY` | sí (secreto del panel) | clave pública «anon» (JWT `eyJ…`, se envía también como Bearer) o «publishable» (`sb_publishable_…`, solo `apikey`) |
| `APP_BASE` | sí | `https://fransegura51.github.io/family-app` |
| `PUBLIC_BASE` | sí | `https://pepafamilyapp.es/c` (enlace canónico = `${PUBLIC_BASE}/p/<id>`) |
| `DEFAULT_IMAGE` | no | imagen de la vista previa cuando no hay fotos (1200×630, < 300 KB) |

Las fotos se sirven directamente desde el bucket público `community-media` de `SUPABASE_URL` (no pasan por el Worker).

## Caché y cabeceras

- Cache API de Cloudflare, clave = dirección canónica (los `?utm_…` no la multiplican).
- Publicación: **60 s** fresca + **60 s** sirviendo la copia vieja mientras se renueva por detrás (stale-while-revalidate implementado a mano, porque la Cache API no lo hace sola). Lo borrado deja de verse en ≤ 2 min.
- 404: **10 s**. 503: nunca. Sitemap: 5 min + 5 min.
- `Cache-Control` al cliente: `public, max-age=60, stale-while-revalidate=60` (404: `max-age=10`).
- Seguridad: CSP `default-src 'none'; script-src 'none'; img-src 'self' <bucket> <imagen por defecto>; style-src 'unsafe-inline'; frame-ancestors 'none'…`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- En `*.workers.dev` la Cache API no guarda nada (solo funciona en dominio propio); no falla, solo no cachea.
- Coste en Supabase: como mucho 2 llamadas (3 en encuestas) por publicación y minuto; el sitemap, 1 cada 5 min.

## Estructura

```
workers/community-public/
  src/index.ts        entrada del Worker: SOLO `export default { fetch }` (workerd no admite otras exportaciones)
  src/handler.ts      rutas, llamadas a Supabase, caché y cabeceras (exporta `handle` para las pruebas)
  wrangler.toml       configuración (variables no secretas, ruta comentada)
  build.mjs           empaqueta TODO en dist/worker.js (para pegar en el editor del panel de Cloudflare)
  tsconfig.json       comprobación de tipos propia (el tsconfig principal solo mira src/)
  .dev.vars.example   plantilla de variables para probar en local
```

El HTML lo genera `src/domain/communityPublicPage.ts` (TypeScript puro). `src/handler.ts` lo importa con ruta relativa
(`../../../src/domain/communityPublicPage`) y tanto `wrangler` como `build.mjs` (esbuild) lo empaquetan: **no hay copia que mantener**.

## Probar en local (sin cuenta ni despliegue)

```bash
cd workers/community-public
npm install                      # instala wrangler solo aquí (no toca el proyecto principal)
cp .dev.vars.example .dev.vars   # y escribe SUPABASE_ANON_KEY (la clave pública del proyecto)
npm run dev                      # = wrangler dev → http://localhost:8787
```

Con `.dev.vars` poniendo `PUBLIC_BASE=http://localhost:8787/c`, abre `http://localhost:8787/c/p/<uuid de una publicación>`.
Para probar sin Supabase real, apunta `SUPABASE_URL` a un servidor falso que conteste a `POST /rest/v1/rpc/<nombre>`.
(`wrangler dev --local` usa el motor local `workerd`: no hace falta iniciar sesión.)

Otras comprobaciones:

```bash
npm run typecheck                                                          # tipos del Worker
npx vitest run src/domain/communityPublicPage.test.ts src/domain/communityPublicWorker.test.ts   # desde la raíz del proyecto
npm run build                                                              # genera dist/worker.js (≈ 40 KB)
```

## Desplegar (lo hace quien tenga la cuenta; este paquete NO despliega nada)

Dos caminos, ver la guía:
1. **Panel de Cloudflare**: crear un Worker, «Edit code», pegar `dist/worker.js`, poner las variables (la clave como *Secret*).
2. **wrangler**: `npx wrangler login`, `npx wrangler secret put SUPABASE_ANON_KEY`, `npm run deploy`; descomentar `[[routes]]` en `wrangler.toml` cuando el dominio esté en Cloudflare.

## Límites conocidos

- Plan gratuito: 100.000 peticiones/día, 10 ms de CPU por petición (el render de una publicación con 50 comentarios queda muy por debajo) y 50 subrequests (usamos ≤ 3).
- El mapa del sitio lista las 5.000 publicaciones más recientes (un solo archivo). Si Comunidad crece más, habría que paginar con un índice de mapas.
- Hasta 50 comentarios raíz con sus respuestas por página (el resto se lee en la app).
- La base no distingue «borrada» de «nunca existió»: siempre 404 (Google lo trata igual que 410).
