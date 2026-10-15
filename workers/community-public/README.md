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
| `GET /c/img/<perfil>/<uuid>.<jpg\|jpeg\|png\|webp>` | Foto de Comunidad (ver «Fotos»). 200 con la imagen, o 404 neutro con noindex |
| `GET /c/report?type=post\|comment\|review&id=<uuid>` | Formulario «Denunciar contenido» para visitantes sin cuenta (ver «Denunciar contenido»). 400 neutro si el enlace no es válido |
| `POST /c/report` | Envía el aviso (única ruta que admite POST). 200 «Gracias»/«Ya lo teníamos»; 400/403/413/415/429/503 con una página neutra |
| `GET /c/sitemap.xml` | Mapa del sitio (hasta 5.000 publicaciones visibles, `lastmod`) |
| `GET /c/robots.txt` | robots con la línea `Sitemap:` (Google solo lee el robots de la **raíz**: ahí hay que añadir `Sitemap: https://pepafamilyapp.es/c/sitemap.xml`) |
| `GET /c`, `/c/` | 302 a `APP_BASE/comunidad` |
| cualquier otra / uuid inválido | 404 neutro con noindex (no consulta Supabase) |

Solo `GET` y `HEAD` (y `POST` únicamente en `/c/report`). El 404 sirve igual para «no existe», «oculta», «eliminada», «restringida» y «Comunidad aún sin lanzar»: la base devuelve `null` en todos los casos y así no se filtra cuál es.
Un fallo al hablar con Supabase responde **503** (`no-store`, `Retry-After: 30`, noindex): nunca se confunde con «borrado».

## Variables

| Nombre | Obligatoria | Ejemplo |
|---|---|---|
| `SUPABASE_URL` | sí | `https://objhgjgrinbhyzscjlbw.supabase.co` |
| `SUPABASE_ANON_KEY` | sí (secreto del panel) | clave pública «anon» (JWT `eyJ…`, se envía también como Bearer) o «publishable» (`sb_publishable_…`, solo `apikey`) |
| `APP_BASE` | sí | `https://fransegura51.github.io/family-app` |
| `PUBLIC_BASE` | sí | `https://pepafamilyapp.es/c` (enlace canónico = `${PUBLIC_BASE}/p/<id>`) |
| `DEFAULT_IMAGE` | no | imagen de la vista previa cuando no hay fotos (1200×630, < 300 KB) |
| `TURNSTILE_SITE_KEY` | no (va con la siguiente) | clave PÚBLICA de Cloudflare Turnstile (Text): la que se pega en la página |
| `TURNSTILE_SECRET` | no (va con la anterior) | clave SECRETA de Turnstile (**Secret**). Sin las dos, el formulario funciona sin Turnstile; con solo una, el Worker responde 503 en `/c/report` (error de configuración, no se arriesga a quedar sin protección) |
| `REPORT_SALT` | no, pero recomendada | texto largo y secreto (**Secret**) que se mezcla en la huella técnica de los avisos. Si falta se usa la constante pública `pepa-comunidad-avisos-v1` (protege menos) |

No hay variables nuevas para las fotos: se usan `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `PUBLIC_BASE`.

## Denunciar contenido (visitantes sin cuenta) — `src/report.ts`

Orden 2.4 de la dueña: un mecanismo seguro para que quien no tiene cuenta avise de contenido público inapropiado, revisable por la administración, **sin acceso a información privada
ni a funciones de usuarios registrados**.

- **Enlaces:** cada página pública de publicación lleva «Denunciar contenido» (pie) y cada comentario publicado, «Denunciar este comentario» → `/c/report?type=post|comment&id=<uuid>`.
  (El único identificador que se añade a la página es el del comentario, solo dentro de ese enlace; nunca ids de personas ni de familias.)
- **GET:** formulario HTML sin JavaScript obligatorio, en español: motivo (los mismos 8 que la app), detalle opcional (≤ 1000), contacto opcional (≤ 200), aviso de que no hace falta cuenta
  ni datos personales y enlace a la política de privacidad (`APP_BASE/privacidad.html`, donde está el correo de contacto). No consulta Supabase.
- **POST:** valida tipo, uuid, motivo y longitudes; comprueba Turnstile si está configurado (falla cerrado: si Cloudflare no responde, 503 y no se avisa); calcula la **huella técnica**
  `p_client_hash = SHA-256( IP + "|" + fecha UTC (AAAA-MM-DD) + "|" + REPORT_SALT )` en hexadecimal (cambia cada día y sin la sal no se puede deshacer; la IP no se guarda ni viaja a Supabase);
  llama a `community_visitor_report` con la clave anónima y responde con una página «Gracias, la administración lo revisará» / «Ya lo teníamos» / error neutro (429 si el servidor devuelve `RATE_LIMIT`).
- **El aviso nunca oculta nada solo.** Toda la protección de verdad contra abusos está en SQL (0268): 5 avisos por huella y día, deduplicación 24 h por huella+contenido+motivo, 5 abiertos por
  contenido y día y topes globales de 60/hora y 300/día. El Worker añade una primera barrera barata (forma del cuerpo, Turnstile, CSRF, campo trampa) para que el ruido ni llegue a Supabase.
- **Cabeceras:** `Cache-Control: no-store`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin`, `X-Robots-Tag: noindex, nofollow`, sin cookies,
  CSP `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; script-src 'none'`. **Solo el formulario con Turnstile activo** añade
  `script-src`, `frame-src` y `connect-src` hacia `https://challenges.cloudflare.com`; las páginas de resultado nunca llevan scripts.
- **Entradas anómalas:** métodos distintos de GET/HEAD/POST → 405; cuerpo > 8 KB → 413 (se lee con tope en streaming, sin fiarse de `content-length`); tipo que no sea
  `application/x-www-form-urlencoded` → 415; si el navegador manda `Origin` o `Sec-Fetch-Site`, deben ser de esta misma web (si no → 403; no hay cookies ni sesión, así que no hay nada que secuestrar).
  Un campo oculto («website») que solo rellenan los robots recibe un «gracias» falso sin avisar a nadie. Todo lo que se pinta va escapado y los errores no repiten lo recibido.
- **Coste:** abrir el formulario = 0 llamadas; enviar = 1 llamada a Supabase (y 1 a Turnstile si está activo).

### Crear la clave de Turnstile (gratis, opcional pero recomendable)

1. En Cloudflare: **Turnstile** (menú izquierdo) → **Add widget**. Nombre: `pepa-avisos`. **Hostname:** `pepafamilyapp.es` (y, mientras pruebas, `*.workers.dev`).
2. **Widget mode:** *Managed*. Pulsa **Create**. Cloudflare muestra la **Site key** (pública) y la **Secret key** (secreta).
3. En el Worker → **Settings → Variables and Secrets**: `TURNSTILE_SITE_KEY` = la Site key (*Text*) y `TURNSTILE_SECRET` = la Secret key (*Secret*). Añade también `REPORT_SALT` (*Secret*, una frase larga inventada).
4. **Deploy**. Abre un enlace «Denunciar contenido»: debe aparecer la casilla de comprobación de Cloudflare. Si borras las dos claves, el formulario sigue funcionando sin ella.

## Fotos (`/c/img/<ruta>`): el almacenamiento es PRIVADO

El bucket `community-media` ya **no es público** (migraciones `0266` y `0277`): no existe ninguna dirección pública de Supabase para las fotos, así que las de contenido
oculto o borrado no se pueden abrir con una dirección antigua. Las fotos de las páginas públicas (`og:image`, galería, comentarios, portada de receta) apuntan a esta ruta.

- **Qué hace:** valida la ruta, pide `GET ${SUPABASE_URL}/storage/v1/object/authenticated/community-media/<ruta>` con la clave pública (`apikey`, y `Authorization: Bearer` si la clave
  es JWT, igual que las funciones) y devuelve la imagen. La política de Storage «community media: read» (0277) deja leer al visitante anónimo **solo** los archivos que cuelgan de
  contenido PUBLICADO (foto de publicación, de comentario o portada de receta) y con Comunidad lanzada.
- **Ruta válida (lista cerrada):** `<uuid del perfil>/<uuid>.<jpg|jpeg|png|webp>`, en minúsculas, ≤ 200 caracteres. Nada de `..`, `%XX` (no se decodifica), `//`, mayúsculas, otras
  carpetas ni otras extensiones: eso es 404 **sin llamar a Supabase**. El Worker nunca acepta una URL completa del cliente (anti-SSRF): la dirección de Storage la construye él y no sigue redirecciones.
- **Respuestas:** 200 solo si Storage responde 200 con `image/jpeg|png|webp`, los primeros bytes corresponden a ese tipo (un SVG/HTML con nombre de foto se rechaza) y pesa ≤ 3 MB.
  Cualquier otro caso (400/401/403/404, redirección, tipo no permitido…) es el **mismo 404 neutro**, sin detalle: «oculta» e «inexistente» no se distinguen. Solo un fallo de red/servidor
  (≥ 500, 429, tiempo agotado) responde **503** (`no-store`) y nunca se guarda.
- **Cabeceras:** `Content-Type` de la imagen, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; sandbox`, `Cross-Origin-Resource-Policy: cross-origin`,
  `Access-Control-Allow-Origin: *` (la app descarga la foto de una receta publicada para copiarla a la Cocina), `Cache-Control: public, max-age=120, s-maxage=120`.
- **Caché y coste:** Cache API del Worker 120 s (404: 20 s). Una copia de la caché anuncia solo el tiempo que le queda. Así lo ocultado deja de servirse en **≤ 2 min** en el Worker y
  ≤ 4 min contando el navegador, y Supabase solo sirve cada foto una vez cada 2 minutos como mucho (ahorra egreso).
- **Quién NO pasa por aquí:** la autora viendo sus fotos aún sin publicar y la administración viendo contenido oculto usan, dentro de la app, direcciones firmadas de Supabase de 10 minutos
  (ver `src/ui/community/communityPhotoUrl.ts`); el Worker solo sirve lo público.

## Caché y cabeceras

- Cache API de Cloudflare, clave = dirección canónica (los `?utm_…` no la multiplican).
- Publicación: **60 s** fresca + **60 s** sirviendo la copia vieja mientras se renueva por detrás (stale-while-revalidate implementado a mano, porque la Cache API no lo hace sola). Lo borrado deja de verse en ≤ 2 min.
- 404: **10 s**. 503: nunca. Sitemap: 5 min + 5 min.
- `Cache-Control` al cliente: `public, max-age=60, stale-while-revalidate=60` (404: `max-age=10`).
- Seguridad: CSP `default-src 'none'; script-src 'none'; img-src 'self' <origen de PUBLIC_BASE> <imagen por defecto>; style-src 'unsafe-inline'; frame-ancestors 'none'…`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`.
- En `*.workers.dev` la Cache API no guarda nada (solo funciona en dominio propio); no falla, solo no cachea.
- Coste en Supabase: como mucho 2 llamadas (3 en encuestas) por publicación y minuto; el sitemap, 1 cada 5 min; cada foto, 1 cada 2 min.

## Estructura

```
workers/community-public/
  src/index.ts        entrada del Worker: SOLO `export default { fetch }` (workerd no admite otras exportaciones)
  src/handler.ts      rutas, llamadas a Supabase, caché y cabeceras (exporta `handle` para las pruebas)
  src/report.ts       «Denunciar contenido» de visitantes: formulario, validación, Turnstile, huella y llamada a Supabase (pruebas: src/domain/communityVisitorReportWorker.test.ts)
  wrangler.toml       configuración (variables no secretas, ruta comentada)
  build.mjs           empaqueta TODO en dist/worker.js (para pegar en el editor del panel de Cloudflare)
  tsconfig.json       comprobación de tipos propia (el tsconfig principal solo mira src/)
  .dev.vars.example   plantilla de variables para probar en local
```

La forma de la ruta de una foto (`isCommunityPhotoPath`) vive en `src/domain/communityPhotoPath.ts` y la comparten el Worker, el generador de HTML y la aplicación.
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
Para probar sin Supabase real, apunta `SUPABASE_URL` a un servidor falso que conteste a `POST /rest/v1/rpc/<nombre>` y a
`GET /storage/v1/object/authenticated/community-media/<ruta>` (se puede pasar por línea de órdenes:
`npx wrangler dev --local --var SUPABASE_URL:http://127.0.0.1:54399 --var PUBLIC_BASE:http://localhost:8787/c`; probado así con workerd: 200 en una foto visible, 404 igual en oculta y en tipo no permitido).
(`wrangler dev --local` usa el motor local `workerd`: no hace falta iniciar sesión.)

Otras comprobaciones:

```bash
npm run typecheck                                                          # tipos del Worker
npx vitest run src/domain/communityPublicPage.test.ts src/domain/communityPublicWorker.test.ts src/domain/communityVisitorReportWorker.test.ts   # desde la raíz del proyecto
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
