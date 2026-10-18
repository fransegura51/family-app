-- COMUNIDAD PEPA — «Arroz blanco que sale bien siempre»: las cinco ideas se desarrollan UNA sola vez, en sus fichas importables (19/10/2026).
-- Quita del cuerpo del artículo las cinco recetas numeradas (estaban duplicadas con las fichas), mueve «Cómo guardar el arroz cocinado» antes del apartado nuevo
-- «🍳 Cinco ideas para transformar tu arroz blanco» y deja las fichas con la diferencia entre arroz ya cocido (las cuatro primeras) y arroz crudo (la quinta); ya no se llaman
-- «de aprovechamiento». Conserva las claves de las cinco fichas.
-- NO es una migración y NO se ha ejecutado en producción: se aplica a mano, con autorización expresa. Una sola transacción; idempotente.
-- Seguridad: solo actúa si el texto y las recetas actuales son EXACTAMENTE los publicados el 17/10/2026 (comprobación md5) o ya son los nuevos; si alguien los ha editado desde
-- entonces, se detiene sin escribir. Valida las recetas con private.community_validate_post_recipes antes de escribir. Al cambiar el texto sube la versión de contenido
-- (quien ya lo había leído lo verá como «Actualizada»).
do $upd$
declare
  c_key constant text := 'inicial-10-arroz-blanco';
  c_old_body_md5 constant text := 'ece6c494806b4f89dd853afd0b94d7f6';
  c_old_recipes_md5 constant text := '67b8988c2d99e771f53193cfb7684447';
  c_body constant text := $b$No hay una proporción de agua que valga para todos los arroces: cambia con la variedad, la marca y el método. Estas son medidas orientativas. Una «medida» es un vaso o una taza, la misma para el arroz y para el agua. Si el paquete indica otra cosa, hazle caso y apunta la que te funcione.

**Dos formas de cocerlo**

- **Por absorción:** el arroz se cuece tapado, a fuego suave, con una cantidad de agua medida que se bebe entera. No se escurre. Queda con más sabor y más tierno.
- **En abundante agua:** como la pasta, destapado y con sal (unas 6-8 medidas de agua por 1 de arroz). Se escurre al acabar. Es la más fácil para que quede suelto y no se pase.

**Según el tipo de arroz** (por absorción, con el agua ya caliente)

- **Redondo:** no lo laves, porque su almidón da ternura. Rehógalo 1 minuto en aceite caliente, con un diente de ajo si quieres. 2 medidas de agua por 1 de arroz y 15-18 minutos tapado a fuego suave. Con 2,5-3 medidas y removiendo de vez en cuando, queda meloso.
- **Bomba:** absorbe más líquido y aguanta mejor el punto. Rehógalo igual y usa 2,5-3 medidas de agua o caldo, unos 16-18 minutos. Sin remover queda entero y suelto; removiendo, más cremoso.
- **Largo:** lávalo en un colador hasta que el agua salga casi clara. Usa 1,75-2 medidas de agua por 1 de arroz, tapado y a fuego mínimo, 12-15 minutos. En abundante agua, 10-12 minutos.
- **Basmati:** lávalo y déjalo en remojo en agua fría 20-30 minutos; escúrrelo. 1,5 medidas de agua por 1 de arroz, tapado y a fuego mínimo, 10-12 minutos. En abundante agua, 8-10 minutos.
- **Vaporizado:** no hace falta lavarlo y casi no se pasa. Por absorción, 2 medidas de agua y 18-20 minutos tapado. En abundante agua, 15-18 minutos, y se escurre.

**Cuándo tapar, remover y dejar reposar**

- **Tapado o destapado:** por absorción, siempre tapado y sin levantar la tapa; así no se escapa el vapor que lo cuece. En abundante agua, destapado.
- **Remover:** nada más hervir, mueve el arroz una vez y no lo toques más. Si lo remueves, suelta almidón y se apelmaza. Solo se remueve a propósito cuando lo quieres meloso.
- **Reposo:** al acabar, apártalo del fuego y déjalo tapado 5-10 minutos. Termina de hidratarse y los granos se separan.
- **Suelto:** lava el arroz largo y el basmati, rehoga el redondo, no remuevas, no destapes, deja reposar y ahueca con un tenedor.
- **Meloso:** arroz redondo o bomba sin lavar, caldo caliente, remover a menudo y servir enseguida, un poco antes de que se seque del todo.

**Cómo guardar el arroz cocinado**

El arroz cocinado no debe quedarse horas fuera: puede desarrollar bacterias cuyas toxinas no se eliminan al recalentar. Enfríalo en menos de una hora, extendido en una bandeja o en un recipiente poco profundo, y a la nevera antes de 2 horas. Consúmelo en 24 horas y recaliéntalo una sola vez, hasta que humee por todo. 🔥

**🍳 Cinco ideas para transformar tu arroz blanco**

¿Te gustaría variar de vez en cuando y preparar algo diferente con arroz? Aquí tienes cinco ideas para darle un toque distinto a tus comidas, desde opciones rápidas hasta platos más completos. Elige la que más te apetezca y descubre cómo prepararla.$b$;
  c_recipes constant jsonb := $r$[{"key":"arroz-con-curry","title":"Arroz blanco con curry","servings":2,"tags":["arroz","arroz ya cocido","plato único"],"ingredients":[{"name":"arroz blanco ya cocido","quantity":"250-300","unit":"g"},{"name":"cebolla picada","quantity":"1/2","unit":"unidad"},{"name":"aceite","quantity":"1","unit":"cucharada"},{"name":"curry","quantity":"1","unit":"cucharadita"},{"name":"guisantes o pasas","quantity":"1","unit":"puñado"}],"steps":["Sofríe 1/2 cebolla picada en 1 cucharada de aceite 5 minutos.","Añade 1 cucharadita de curry y remueve 30 segundos.","Echa el arroz y un puñado de guisantes o pasas, y calienta bien."],"tip":"Parte de arroz blanco ya cocido (de otro día o cocido antes, como se explica arriba). Si lo guardas, enfríalo en menos de una hora, tenlo en la nevera y consúmelo en 24 horas; recaliéntalo una sola vez, hasta que humee por todo."},{"key":"arroz-a-la-cubana","title":"Arroz a la cubana","servings":2,"tags":["arroz","arroz ya cocido","rápida"],"ingredients":[{"name":"arroz blanco ya cocido","quantity":"250-300","unit":"g"},{"name":"salsa de tomate","quantity":"150","unit":"ml"},{"name":"huevo frito","quantity":"1","unit":"unidad"},{"name":"salchicha o plátano frito (opcional)","quantity":"","unit":""}],"steps":["Sirve el arroz blanco con 150 ml de salsa de tomate.","Pon un huevo frito encima.","Si quieres, añade unos trozos de salchicha o plátano frito."],"tip":"Parte de arroz blanco ya cocido (de otro día o cocido antes, como se explica arriba). Si lo guardas, enfríalo en menos de una hora, tenlo en la nevera y consúmelo en 24 horas; recaliéntalo una sola vez, hasta que humee por todo."},{"key":"arroz-con-ajo-y-limon","title":"Arroz con ajo y limón","servings":2,"tags":["arroz","arroz ya cocido","rápida"],"ingredients":[{"name":"arroz blanco ya cocido","quantity":"250-300","unit":"g"},{"name":"ajo laminado","quantity":"2","unit":"dientes"},{"name":"aceite","quantity":"2","unit":"cucharadas"},{"name":"ralladura de limón","quantity":"1/2","unit":"limón"},{"name":"zumo de limón","quantity":"1","unit":"chorrito"},{"name":"perejil","quantity":"","unit":""}],"steps":["Dora 2 dientes de ajo laminados en 2 cucharadas de aceite.","Añade el arroz y la ralladura de medio limón.","Termina con un chorrito de zumo de limón y perejil por encima."],"tip":"Parte de arroz blanco ya cocido (de otro día o cocido antes, como se explica arriba). Si lo guardas, enfríalo en menos de una hora, tenlo en la nevera y consúmelo en 24 horas; recaliéntalo una sola vez, hasta que humee por todo."},{"key":"arroz-salteado-con-verduras","title":"Arroz salteado con verduras","servings":2,"tags":["arroz","arroz ya cocido","verdura"],"ingredients":[{"name":"arroz blanco ya cocido, del día anterior y bien enfriado","quantity":"250-300","unit":"g"},{"name":"zanahoria en dados pequeños","quantity":"","unit":""},{"name":"calabacín en dados pequeños","quantity":"","unit":""},{"name":"pimiento en dados pequeños","quantity":"","unit":""},{"name":"cebolleta en dados pequeños","quantity":"","unit":""},{"name":"salsa de soja","quantity":"1-2","unit":"cucharadas"},{"name":"huevo revuelto","quantity":"1","unit":"unidad"}],"steps":["Sofríe la zanahoria, el calabacín, el pimiento y la cebolleta en dados pequeños 3-4 minutos a fuego fuerte.","Añade el arroz y 1-2 cucharadas de salsa de soja.","Remata con un huevo revuelto."],"tip":"Parte de arroz ya cocido. Sale mejor con arroz del día anterior, bien enfriado. Enfríalo en menos de una hora tras cocerlo, guárdalo en la nevera y recaliéntalo una sola vez, hasta que humee por todo."},{"key":"arroz-cremoso-con-champinones","title":"Arroz cremoso con champiñones","servings":2,"tags":["arroz","arroz crudo","champiñones","plato único"],"ingredients":[{"name":"arroz redondo crudo","quantity":"150","unit":"g"},{"name":"cebolla","quantity":"1/2","unit":"unidad"},{"name":"champiñones laminados","quantity":"200","unit":"g"},{"name":"caldo caliente","quantity":"500","unit":"ml"},{"name":"queso rallado o mantequilla","quantity":"30 g o 1 cucharada","unit":""}],"steps":["Pocha 1/2 cebolla, añade 200 g de champiñones laminados y dóralos.","Echa el arroz, rehoga y ve añadiendo unos 500 ml de caldo caliente poco a poco durante 18 minutos, removiendo a menudo.","Al final, añade 30 g de queso rallado o 1 cucharada de mantequilla."],"tip":"Parte de arroz redondo crudo: se cocina en la propia sartén, así que no necesitas arroz cocido."}]$r$::jsonb;
  i public.community_official_items%rowtype;
  v_err text;
  v_posts integer := 0;
begin
  select * into i from public.community_official_items where seed_key = c_key for update;
  if not found then
    raise exception 'No existe el elemento oficial %', c_key;
  end if;
  if md5(i.body) not in (c_old_body_md5, md5(c_body)) then
    raise exception 'El texto actual de % no es el esperado (md5 %): alguien lo ha editado. No se escribe nada.', c_key, md5(i.body);
  end if;
  if md5((i.payload -> 'recipes')::text) not in (c_old_recipes_md5, md5(c_recipes::text)) then
    raise exception 'Las recetas actuales de % no son las esperadas (md5 %): alguien las ha editado. No se escribe nada.', c_key, md5((i.payload -> 'recipes')::text);
  end if;
  v_err := private.community_validate_post_recipes(c_recipes);
  if v_err is not null then
    raise exception 'Las recetas nuevas no son válidas: %', v_err;
  end if;
  update public.community_official_items set body = c_body, payload = payload || jsonb_build_object('recipes', c_recipes) where id = i.id;
  if i.published_post_id is not null then
    update public.community_posts p set body = c_body, recipes = c_recipes
    where p.id = i.published_post_id and p.official_item_id = i.id
      and md5(p.body) in (c_old_body_md5, md5(c_body)) and md5(p.recipes::text) in (c_old_recipes_md5, md5(c_recipes::text));
    get diagnostics v_posts = row_count;
  end if;
  raise notice 'Arroz reestructurado: publicaciones %', v_posts;
end
$upd$;

select i.status, p.status as post_status, length(p.body) as body_chars, p.body = i.body as body_igual, p.recipes = (i.payload -> 'recipes') as recetas_iguales, jsonb_array_length(p.recipes) as fichas, p.content_rev
from public.community_official_items i left join public.community_posts p on p.id = i.published_post_id where i.seed_key = 'inicial-10-arroz-blanco';
