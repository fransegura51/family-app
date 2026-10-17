// Genera supabase/seed/community_post_recipes_patch.sql a partir de supabase/seed/community_post_recipes.json (recetas estructuradas de las publicaciones iniciales, 0282).
// El parche es IDEMPOTENTE: solo rellena `recipes` donde todavía está vacío (no pisa ediciones) y valida con la base de datos (private.community_validate_post_recipes).
// Uso: node scripts/build-community-post-recipes.mjs   (se vuelve a ejecutar cada vez que cambie el JSON; la prueba `communityPostRecipesContent` comprueba que está al día)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = JSON.parse(fs.readFileSync(path.join(root, 'supabase/seed/community_post_recipes.json'), 'utf8'))

// `anchor` es solo para revisar (y la prueba lo comprueba contra el texto): no se guarda en la base de datos.
const clean = (list) => list.map(({ anchor, ...recipe }) => recipe)

const blocks = Object.entries(data)
  .filter(([key]) => !key.startsWith('_'))
  .map(([seedKey, list]) => {
    const json = JSON.stringify(clean(list))
    if (json.includes('$j$')) throw new Error('el JSON contiene $j$')
    return `      ($j$${seedKey}$j$, $j$${json}$j$::jsonb)`
  })

const sql = `-- COMUNIDAD PEPA — recetas estructuradas de las publicaciones iniciales (0282). ARCHIVO GENERADO por scripts/build-community-post-recipes.mjs a partir de
-- supabase/seed/community_post_recipes.json: NO se edita a mano.
--
-- NO es una migración: no se aplica sola. Se ejecuta a mano UNA vez, DESPUÉS de aplicar la migración 0282 y con autorización expresa (es un cambio de datos sobre
-- publicaciones ya publicadas). Idempotente: solo rellena las publicaciones (y sus contenidos oficiales) que todavía no tienen recetas; no pisa nada editado.
-- Cada lista se valida con la base de datos antes de guardarse (si algo no valía, se detiene con un error y no se guarda nada).

do $patch$
declare
  r record;
  v_err text;
  v_n integer := 0;
begin
  for r in
    select * from (values
${blocks.join(',\n')}
    ) as t(seed_key, recipes)
  loop
    v_err := private.community_validate_post_recipes(r.recipes);
    if v_err is not null then
      raise exception 'Recetas no válidas en %: %', r.seed_key, v_err;
    end if;
    -- El contenido oficial guarda las recetas (para que se publiquen igual si hay que volver a publicarlo)...
    update public.community_official_items i set payload = i.payload || jsonb_build_object('recipes', r.recipes)
    where i.seed_key = r.seed_key and not (i.payload ? 'recipes');
    -- ...y la publicación YA publicada las muestra y deja importarlas.
    update public.community_posts p set recipes = r.recipes
    where p.official_item_id = (select i2.id from public.community_official_items i2 where i2.seed_key = r.seed_key) and p.recipes is null;
    get diagnostics v_n = row_count;
  end loop;
end
$patch$;
`

fs.writeFileSync(path.join(root, 'supabase/seed/community_post_recipes_patch.sql'), sql)
console.log(`community_post_recipes_patch.sql generado: ${blocks.length} publicaciones, ${Object.entries(data).filter(([k]) => !k.startsWith('_')).reduce((n, [, l]) => n + l.length, 0)} recetas`)
