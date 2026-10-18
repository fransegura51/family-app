-- COMUNIDAD PEPA — las 20 publicaciones iniciales como PROPUESTAS (no se publican solas).
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
      ($b$inicial-01-pan-congelado$b$, $b$recetas$b$, $b$trucos-de-cocina$b$, $b$Congela el pan en rebanadas$b$,
       $b$Si en casa no se acaba el pan de molde o la barra antes de que se endurezca, congélalo en rebanadas y saca solo lo que vayas a comer.

**Cómo hacerlo bien:**

1. Congélalo cuanto más fresco, mejor: el mismo día que lo compras, no cuando ya está seco.
2. Si no viene cortado, córtalo en rebanadas de 1-1,5 cm. La barra, en trozos del largo de un bocadillo.
3. Ponlas sueltas en una bandeja o plato durante una hora en el congelador, así no se pegan entre sí. Si tienes prisa, separa cada rebanada con un trozo de papel de horno.
4. Pásalas a una bolsa de congelación, saca el aire todo lo que puedas, ciérrala y apunta la fecha.

**Cómo usarlas:**

- **Tostadas y desayunos:** directas del congelador a la tostadora, sin descongelar. Si tu tostadora tiene función de descongelar, úsala. Si no, programa un poco más de tiempo que de costumbre.
- **Sándwiches calientes:** monta el sándwich con el pan congelado y ponlo en la sartén o la sandwichera, algo más de tiempo y fuego suave para que se caliente por dentro.
- **Para comer frío:** saca las rebanadas unos 15-20 minutos antes, a temperatura ambiente.
- **Barra:** pasa los trozos congelados por el horno caliente unos minutos y recuperan la corteza.

Una vez descongelado, no lo vuelvas a congelar. Por eso conviene sacar solo lo necesario.

El pan congelado está bien durante varias semanas, pero cuanto más tiempo pasa, más pierde sabor y textura. Con 1-2 meses vas sobrado.

¿Tú qué haces con el pan que sobra? 🥖$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-02-platanos-maduros$b$, $b$recetas$b$, $b$aprovechamiento-alimentos$b$, $b$Plátanos muy maduros: no los tires$b$,
       $b$Un plátano con la piel llena de manchas oscuras es justo el que mejor sirve para cocinar: está más dulce y se aplasta solo. Antes de usarlo, una comprobación rápida.

**Muy maduro, pero bueno:** piel manchada o casi negra, pulpa blanda pero entera y firme, olor dulce.

**Mejor tirarlo:** moho (en la piel o dentro), líquido que gotea, pulpa viscosa o aguada, olor agrio o a fermentado.

**1. Tortitas de plátano (2 raciones, unas 6 tortitas pequeñas)**

- 1 plátano muy maduro
- 1 huevo
- 4 cucharadas soperas de copos de avena finos o 40 g de harina
- 1/2 cucharadita de levadura química
- Una pizca de canela (opcional)

Aplasta el plátano con un tenedor hasta que quede en puré, mezcla con el huevo y añade el resto. Deja reposar 5 minutos. Cocina cucharadas de masa en una sartén antiadherente a fuego medio-bajo, unos 2 minutos por cada lado, hasta que se dore. Si las haces muy grandes cuesta darles la vuelta.

**2. Bizcocho de plátano (molde de unos 22-24 cm de largo)**

- 3 plátanos muy maduros (unos 300 g de pulpa)
- 2 huevos
- 80 g de azúcar
- 80 ml de aceite de girasol o de oliva suave
- 200 g de harina
- 2 cucharaditas de levadura química

Tritura o aplasta los plátanos y mézclalos con los huevos, el azúcar y el aceite. Añade la harina con la levadura y mezcla justo hasta que no queden grumos. Hornea a 180 °C unos 40-45 minutos. Está hecho cuando un palillo sale limpio. Déjalo enfriar antes de cortarlo.

Con los plátanos tan dulces, puedes bajar el azúcar a 60 g sin que se note. Y si tienes nueces o pepitas de chocolate, 50 g van de lujo.

**3. Helado de plátano (sin azúcar ni nata)**

Pela los plátanos, córtalos en rodajas y congélalos en una bandeja o en una bolsa, mínimo 4 horas. Para 2 raciones, tritura 2 plátanos congelados con 2-3 cucharadas de yogur o de leche hasta que quede cremoso. Tómalo al momento, queda como un helado suave.

Variantes: una cucharada de cacao en polvo, un puñado de fresas congeladas, o crema de cacahuete (si no hay alergias en casa).

**Y si no te da tiempo a nada:** pélalos, trocéalos y congélalos en bolsa. Te sirven para batidos y para cualquiera de estas recetas cuando quieras. 🍨$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-03-pelar-ajos$b$, $b$recetas$b$, $b$trucos-de-cocina$b$, $b$Pelar ajos sin esfuerzo$b$,
       $b$Ningún truco funciona igual con todos los ajos: depende del tamaño, de lo frescos o secos que estén y de cómo se haya pegado la piel. Estos tres son los que más resultado dan.

- **Aplastar con el cuchillo.** Pon el diente sobre la tabla, apoya encima el plano de un cuchillo grande y presiona con la palma de la mano (no hace falta golpear fuerte). La piel se rompe y sale casi entera. Así, además, el ajo ya está medio listo para picar.
- **Agitar en un bote.** Separa los dientes de una o dos cabezas, mételos en un bote con tapa (o entre dos cuencos del mismo tamaño, boca con boca) y agita fuerte unos 20-30 segundos. Funciona mejor con ajos secos y con muchos a la vez. Si algún diente se resiste, se pela a mano y listo.
- **Agua tibia.** Si la piel está pegada, deja los dientes 5-10 minutos en agua tibia. Se ablanda y sale mucho mejor.

**Para separar los dientes sin esfuerzo:** pon la cabeza sobre la tabla y golpéala con la palma de la mano para que se abra.

Un detalle: si el ajo está viejo y tiene un brote verde en el centro, retíralo antes de usarlo en crudo, porque amarga un poco. 😉$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-04-tortilla-francesa$b$, $b$recetas$b$, $b$recetas-faciles$b$, $b$Tortilla francesa: mucho más que huevo batido$b$,
       $b$La tortilla francesa es la cena de emergencia perfecta, y con lo que tengas por la nevera se convierte en algo mucho mejor. Siete ideas, todas para **1 ración (2 huevos)** y en menos de 15 minutos.

**La regla de oro:** la verdura va siempre cocinada antes y bien escurrida. Si entra cruda o con agua, la tortilla se rompe y queda aguada. Bate los huevos con una pizca de sal, usa una sartén antiadherente de 20-22 cm, poco aceite y fuego medio-alto. Cuando los bordes cuajen, añade el relleno, dobla y deja 30 segundos más. Si la comen peques, que cuaje del todo.

**1. Espinacas y queso.** Saltea un puñado grande de espinacas frescas (unos 50 g) 1 minuto, escúrrelas y exprímelas. Ponlas sobre el huevo con 30 g de queso rallado o en lonchas.

**2. Champiñones salteados.** Lamina 100 g de champiñones y sáltalos en una sartén sin amontonarlos, a fuego fuerte, unos 5 minutos, hasta que suelten el agua y se doren. Un poco de ajo y perejil les va genial.

**3. Calabacín y cebolla.** Pocha 1/4 de cebolla y 1/2 calabacín pequeño en dados con un chorrito de aceite, unos 8-10 minutos a fuego medio, hasta que estén blandos. Escúrrelos y mézclalos con el huevo batido.

**4. Jamón y queso.** Dos lonchas de jamón cocido y una de queso, en trozos, sobre el huevo ya cuajado. Tapa 30 segundos para que el queso se funda. El clásico que nunca falla con los niños.

**5. Tomate y hierbas.** Un tomate pequeño y maduro en dados, sin semillas, escurrido unos minutos con una pizca de sal. Mézclalo con el huevo y una cucharada de perejil, albahaca u orégano picados.

**6. Patata.** Con 1 patata pequeña (100-120 g) ya cocida (sirve la que sobró hervida o hecha al microondas), córtala en dados y dórala en la sartén 5 minutos. Echa encima el huevo batido: queda casi como una tortilla de patata, pero en la mitad de tiempo.

**7. Atún y cebolla.** Una lata pequeña de atún bien escurrida y 2 cucharadas de cebolla muy picada (mejor pochada un par de minutos). Mezcla con el huevo.

**Para que sea una comida o cena completa**, acompáñala con algo que tengas ya hecho:

- Espinacas y queso, con pan tostado y un tomate aliñado.
- Champiñones, con arroz blanco o una ensalada verde.
- Calabacín y cebolla, con patatas cocidas o una crema de verduras.
- Jamón y queso, con ensalada de lechuga y maíz, y fruta de postre.
- Tomate y hierbas, con pan con aceite y una ensalada de legumbres.
- Patata, con pimientos asados o una ensalada.
- Atún y cebolla, con una ensalada de garbanzos.

Si sois varios en casa, cada uno puede elegir su relleno: son tortillas pequeñas y salen rápido. 😋$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-05-menu-semanal$b$, $b$recetas$b$, $b$menus-planificacion$b$, $b$Menú semanal para personas con poco tiempo para cocinar 🍽️⏱️$b$,
       $b$¡Estrenamos los menús semanales de Pepa! ❤️

Sabemos que pensar cada día qué preparar para comer y cenar puede convertirse en otra tarea más.

Por eso, todos los sábados Pepa te traerá un nuevo menú para la semana siguiente, con siete comidas y siete cenas variadas, prácticas y pensadas para facilitar la organización familiar.

Encontrarás recetas fáciles, ideas para ahorrar tiempo y platos que puedes preparar con antelación.

Puedes importar el menú completo, elegir días o recetas individuales, ajustar las raciones y añadir los ingredientes a Compras.

Pepa te da las ideas. Tú decides cómo organizarte. ❤️

**Este es el menú de esta semana** (cantidades para 4 personas):

**Lunes**

- **Comida: lentejas estofadas con verduras y huevo duro**, con fruta de temporada.
- **Cena: crema de calabaza y zanahoria**, acompañada de tostadas con queso fresco, tomate y albahaca fresca.

**Martes**

- **Comida: arroz tres delicias con pollo y verduras.**
- **Cena: salmón con calabacín y limón.**

**Miércoles**

- **Comida: merluza al horno con patatas y verduras.**
- **Cena: sopa de verduras con fideos y pollo desmenuzado.**

**Jueves**

- **Comida: macarrones con tomate, pavo y verduras**, con zanahoria rallada con limón y maíz.
- **Cena: tortilla de calabacín**, con ensalada de tomate.

**Viernes**

- **Comida: garbanzos con espinacas y bacalao**, con fruta de temporada.
- **Cena: pizzas pequeñas de tortilla de trigo con verduras y queso.**

**Sábado**

- **Comida: hamburguesas caseras de ternera**, con patatas al horno y ensalada de lechuga y tomate.
- **Cena: quesadillas de pollo, pimiento y queso**, con ensalada de lechuga y maíz.

**Domingo**

- **Comida: pollo asado con patatas y verduras**, con ensalada de lechuga y manzana.
- **Cena: revuelto de champiñones y calabacín**, con tostada integral.

Cada receta trae sus propios consejos de conservación y seguridad. Si en casa hay alergias o intolerancias, revisa las etiquetas y adapta los platos con cuidado: es una propuesta de ideas para organizarte, no una dieta ni un plan nutricional.$b$,
       $j${"menu":{"version":1,"servings":4,"days":[{"day":"lunes","meals":{"comida":{"title":"Lentejas estofadas con verduras y huevo duro","side":"Fruta de temporada","recipes":[{"title":"Lentejas estofadas con verduras y huevo duro","servings":4,"ingredients":[{"name":"lentejas","quantity":"320","unit":"g"},{"name":"huevo","quantity":"4","unit":"unidades"},{"name":"cebolla","quantity":"1","unit":"unidades"},{"name":"zanahoria","quantity":"2","unit":"unidades"},{"name":"pimiento rojo","quantity":"1","unit":"unidades"},{"name":"patata","quantity":"300","unit":"g"},{"name":"ajo","quantity":"2","unit":"dientes"},{"name":"pimentón dulce","quantity":"1","unit":"cucharaditas"},{"name":"hoja de laurel","quantity":"1","unit":"unidades"},{"name":"aceite de oliva","quantity":"3","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Pica la cebolla, el pimiento y la zanahoria en dados pequeños y lamina los ajos. Lava las lentejas en un colador y revísalas por si hubiera alguna piedrecita (las pardinas no necesitan remojo).","En una olla, calienta el aceite y sofríe la cebolla, el pimiento, la zanahoria y el ajo a fuego medio unos 8 minutos, hasta que estén blandos.","Aparta la olla del fuego, añade el pimentón y remueve 20 segundos (si se quema amarga). Vuelve al fuego e incorpora las lentejas y el laurel.","Cubre con agua fría hasta dos dedos por encima de las lentejas. Cuando hierva, baja el fuego y cuece tapado a fuego suave unos 20 minutos.","Añade la patata pelada y cortada en dados y la sal. Cuece 20 minutos más, hasta que las lentejas y la patata estén tiernas; si se queda seco, añade un poco de agua caliente.","Mientras tanto, pon los huevos en un cazo con agua fría, llévalos a ebullición y cuécelos 10 minutos desde que hierva, hasta que clara y yema estén bien cuajadas. Pásalos por agua fría, pélalos y córtalos en cuartos.","Retira el laurel y deja reposar las lentejas 10 minutos. Sirve con el huevo duro por encima. Si te gusta más espeso, chafa un cucharón de lentejas contra la pared de la olla.","Alérgenos presentes: huevo. Guarda las sobras en la nevera antes de dos horas, tómalas en 3 días como máximo y recaliéntalas hasta que hiervan."],"tags":["menú semanal","comida","plato principal","legumbres","cuchara","huevo"],"tip":"Truco de Pepa: con lentejas cocidas de bote (unos 800 g ya escurridas) ahorras más de una hora y la receta queda en unos 30 minutos. Sofríe las verduras, añade la patata con 400 ml de agua y cuece 15 minutos; incorpora las lentejas aclaradas y cuece 5 minutos más. Los huevos se cuecen mientras tanto.","freeze":{"ideal":true,"note":"Congela las lentejas sin el huevo duro (se vuelve gomoso): cuécelo al servir. Enfría el guiso en menos de dos horas, repártelo en raciones en tarros o bolsas aptas para congelar y guárdalo hasta 3 meses. Descongela en la nevera, recalienta hasta que hierva, una sola vez, y no lo vuelvas a congelar."},"time":{"active":25,"total":70}},{"title":"Fruta de temporada","servings":4,"simple":true,"ingredients":[{"name":"fruta de temporada","quantity":"4","unit":"unidades"}],"steps":[],"tags":["menú semanal","acompañamiento","postre","sin cocinar"]}]},"cena":{"title":"Crema de calabaza y zanahoria","side":"Tostadas con queso fresco, tomate y albahaca fresca","recipes":[{"title":"Crema de calabaza y zanahoria","servings":4,"ingredients":[{"name":"calabaza","quantity":"500","unit":"g"},{"name":"zanahoria","quantity":"3","unit":"unidades"},{"name":"cebolla","quantity":"1","unit":"unidades"},{"name":"patata","quantity":"150","unit":"g"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Pela la calabaza, la zanahoria, la patata y la cebolla y trocéalas en dados de unos 2 cm.","En una olla, calienta el aceite y rehoga la cebolla 3 minutos. Añade el resto de las verduras y remueve 2 minutos.","Cubre con agua justo hasta el nivel de las verduras (unos 700 ml), añade la sal y cuece tapado 20 minutos, hasta que todo esté muy tierno.","Tritura hasta que quede fina. Si ha quedado muy espesa, añade un poco de agua caliente; prueba y ajusta de sal.","Sirve caliente con un hilo de aceite. Se conserva en la nevera hasta 3 días."],"tags":["menú semanal","cena","plato principal","verdura","cena ligera","crema"],"tip":"Truco de Pepa: la calabaza y la zanahoria ya peladas y troceadas, frescas en bolsa o congeladas, te ahorran la parte más pesada. Si son congeladas, no hace falta descongelarlas: añádelas directas a la olla y calcula unos 5 minutos más de cocción.","freeze":{"ideal":true,"note":"Cuando la crema esté fría (en menos de dos horas), repártela en raciones en tarros o bolsas aptas para congelar, dejando un dedo libre arriba, y guárdala hasta 3 meses. Descongela en la nevera y recalienta removiendo hasta que hierva, una sola vez. No la vuelvas a congelar."},"time":{"active":20,"total":40}},{"title":"Tostadas con queso fresco, tomate y albahaca fresca","servings":4,"ingredients":[{"name":"pan integral","quantity":"8","unit":"rebanadas"},{"name":"queso fresco","quantity":"150","unit":"g"},{"name":"tomate","quantity":"2","unit":"unidades"},{"name":"albahaca fresca","quantity":"12","unit":"hojas"},{"name":"aceite de oliva","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lava los tomates y las hojas de albahaca y sécalos bien. Corta el tomate en rodajas finas.","Tuesta las rebanadas de pan integral.","Unta el queso fresco sobre cada tostada y coloca encima las rodajas de tomate.","Reparte las hojas de albahaca (enteras o rotas con la mano), un hilo de aceite y una pizca de sal. Sirve enseguida para que el pan no se reblandezca.","Alérgenos presentes: gluten (pan) y lácteos (queso fresco). Comprueba que el queso fresco esté elaborado con leche pasteurizada."],"tags":["menú semanal","acompañamiento","sin cocinar","rápida"],"time":{"active":10,"total":10}}]}}},{"day":"martes","meals":{"comida":{"title":"Arroz tres delicias con pollo y verduras","side":"","recipes":[{"title":"Arroz tres delicias con pollo y verduras","servings":4,"ingredients":[{"name":"arroz","quantity":"300","unit":"g"},{"name":"pechuga de pollo","quantity":"400","unit":"g"},{"name":"huevo","quantity":"3","unit":"unidades"},{"name":"guisantes","quantity":"150","unit":"g"},{"name":"zanahoria","quantity":"2","unit":"unidades"},{"name":"aceite de oliva","quantity":"3","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Cuece el arroz en abundante agua con sal durante el tiempo que marque el paquete (unos 12 minutos). Escúrrelo, pásalo por agua fría y resérvalo.","Pela la zanahoria y córtala en dados muy pequeños. Cuécela 5 minutos con los guisantes (congelados o de bote) y escurre.","Bate los huevos con una pizca de sal y haz una tortilla fina en una sartén con una cucharada de aceite, bien cuajada por los dos lados. Córtala en tiras.","Corta la pechuga en dados de 1-2 cm y sálala. En una sartén grande, calienta el resto del aceite y cocina el pollo a fuego medio-alto 6-8 minutos, removiendo, hasta que no quede nada rosado por dentro (corta un trozo grande para comprobarlo).","Añade la zanahoria y los guisantes y saltea 2 minutos. Incorpora el arroz y saltea a fuego fuerte 3-4 minutos, removiendo, hasta que esté bien caliente.","Mezcla con la tortilla en tiras, prueba y ajusta de sal. Sirve enseguida.","Lávate las manos y la tabla con agua caliente y jabón tras manejar el pollo crudo. Si sobra arroz, enfríalo rápido, guárdalo en la nevera en menos de una hora, tómalo al día siguiente y recaliéntalo una sola vez, hasta que esté muy caliente.","Alérgenos presentes: huevo."],"tags":["menú semanal","comida","plato principal","arroz","pollo","con niños"],"tip":"Truco de Pepa para ahorrar tiempo. ¿No tienes tiempo de preparar el arroz? También puedes comprar arroz tres delicias congelado o arroz precocinado en vasitos que se calientan en el microondas en aproximadamente un minuto, según el producto. Añade el pollo y las verduras que necesites para completar el plato.","time":{"active":30,"total":40}}]},"cena":{"title":"Salmón con calabacín y limón","side":"","recipes":[{"title":"Salmón con calabacín y limón","servings":4,"ingredients":[{"name":"lomos de salmón","quantity":"4","unit":"unidades"},{"name":"calabacín","quantity":"2","unit":"unidades"},{"name":"limón","quantity":"1","unit":"unidades"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lava los calabacines y córtalos en rodajas de 1 cm. Exprime medio limón y corta el otro medio en gajos para servir.","En una sartén grande, calienta una cucharada de aceite a fuego medio-alto y saltea el calabacín 6-8 minutos, removiendo, hasta que esté tierno y con algo de color. Sálalo, pásalo a una fuente y mantenlo caliente.","Seca los lomos de salmón con papel de cocina y sálalos ligeramente. En la misma sartén, calienta el aceite restante a fuego medio-alto y cocina los lomos primero por el lado de la piel 4 minutos. Usa una tabla y un cuchillo solo para el pescado crudo y lávate las manos después de tocarlo.","Dales la vuelta y cocina 2-3 minutos más, hasta que por dentro estén opacos y se separen en lascas (no debe quedar crudo, sobre todo en los platos de los pequeños).","Rocía el salmón con el zumo de limón, revisa con un tenedor que no queden espinas y sirve sobre el calabacín, con los gajos de limón.","Alérgenos presentes: pescado. Si sobra, guárdalo en la nevera en menos de dos horas y tómalo en 1 o 2 días."],"tags":["menú semanal","cena","plato principal","pescado","cena ligera","rápida"],"tip":"Truco de Pepa: el salmón se vende congelado en lomos sueltos y puedes tenerlo en el congelador para usarlo cuando te convenga. Sigue las instrucciones del envase para descongelarlo (lo habitual es pasarlo a la nevera con antelación) o para cocinarlo directamente desde congelado, si el producto lo permite.","time":{"active":15,"total":20}}]}}},{"day":"miércoles","meals":{"comida":{"title":"Merluza al horno con patatas y verduras","side":"","recipes":[{"title":"Merluza al horno con patatas y verduras","servings":4,"ingredients":[{"name":"lomos de merluza","quantity":"4","unit":"unidades"},{"name":"patata","quantity":"600","unit":"g"},{"name":"pimiento rojo","quantity":"1","unit":"unidades"},{"name":"cebolla","quantity":"1","unit":"unidades"},{"name":"tomate","quantity":"2","unit":"unidades"},{"name":"ajo","quantity":"2","unit":"dientes"},{"name":"aceite de oliva","quantity":"4","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Precalienta el horno a 200 ºC, con calor arriba y abajo. Pela las patatas, córtalas en rodajas de 1 cm y cuécelas en agua con sal 10-12 minutos, hasta que estén casi tiernas. Escúrrelas. (Si las cocinaste con antelación o usas patatas cocidas envasadas, sáltate este paso.)","Corta el pimiento y la cebolla en tiras finas y el tomate en rodajas, y lamina los ajos.","Extiende las patatas y las verduras con el ajo en una fuente grande, riégalas con tres cucharadas de aceite y añade sal. Hornea 20 minutos, removiendo a mitad de tiempo.","Sala los lomos de merluza, colócalos sobre las verduras y riégalos con la cucharada de aceite restante. Hornea 12-15 minutos más, según el grosor. Usa una tabla y un cuchillo solo para el pescado crudo y lávate las manos después de tocarlo.","Está lista cuando la carne es blanca y opaca y se separa en lascas. Aunque compres lomos sin espinas, revisa con un tenedor antes de servir, sobre todo los platos de los pequeños.","Alérgenos presentes: pescado. Guarda las sobras en la nevera en menos de dos horas, tómalas en 1 o 2 días y recaliéntalas hasta que estén calientes por dentro."],"tags":["menú semanal","comida","plato principal","pescado","horno"],"tip":"Truco de Pepa: cuece las patatas con antelación (hasta 2 días antes), déjalas enfriar, guárdalas tapadas en la nevera y caliéntalas directamente en el horno con las verduras. También hay patatas cocidas envasadas, muy prácticas cuando vas con prisa: mira en la etiqueta si hay que escurrirlas.","time":{"active":25,"total":60}}]},"cena":{"title":"Sopa de verduras con fideos y pollo desmenuzado","side":"","recipes":[{"title":"Sopa de verduras con fideos y pollo desmenuzado","servings":4,"ingredients":[{"name":"pechuga de pollo","quantity":"300","unit":"g"},{"name":"fideos finos","quantity":"120","unit":"g"},{"name":"zanahoria","quantity":"2","unit":"unidades"},{"name":"cebolla","quantity":"1","unit":"unidades"},{"name":"puerro","quantity":"1","unit":"unidades"},{"name":"caldo de verduras","quantity":"1500","unit":"ml"},{"name":"aceite de oliva","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Pica la cebolla, el puerro bien lavado y la zanahoria pelada en dados muy pequeños.","En una olla, rehoga la cebolla y el puerro con el aceite 3 minutos y añade la zanahoria. Sofríe 2 minutos más.","Vierte el caldo, añade la pechuga entera con una pizca de sal y, cuando hierva, cuece a fuego suave 15 minutos, hasta que la zanahoria esté tierna y el pollo hecho por dentro (corta la parte más gruesa: debe ser blanca, sin nada rosado).","Saca la pechuga, déjala templar un par de minutos y desmenúzala con dos tenedores.","Devuelve el pollo a la olla, añade los fideos y cuece el tiempo que indique el paquete (3-4 minutos). Prueba, ajusta de sal y sirve caliente.","Lávate las manos y la tabla con agua caliente y jabón tras manejar el pollo crudo. Alérgenos presentes: gluten (fideos).","Si sobra, guárdala en la nevera en menos de dos horas, tómala en 2 días y recaliéntala hasta que hierva; los fideos seguirán absorbiendo caldo."],"tags":["menú semanal","cena","plato principal","sopa","pollo","cena ligera","con niños"],"tip":"Truco de Pepa: si tienes pollo ya cocido (restos de otro día o pechuga cocida envasada), desmenúzalo y añádelo con los fideos: te ahorras los 15 minutos de cocción del pollo. Con caldo de verduras de brik, la cena queda lista en unos 25 minutos.","time":{"active":20,"total":40}}]}}},{"day":"jueves","meals":{"comida":{"title":"Macarrones con tomate, pavo y verduras","side":"Zanahoria rallada con limón y maíz","recipes":[{"title":"Macarrones con tomate, pavo y verduras","servings":4,"ingredients":[{"name":"macarrones","quantity":"320","unit":"g"},{"name":"carne picada de pavo","quantity":"300","unit":"g"},{"name":"cebolla","quantity":"1","unit":"unidades"},{"name":"zanahoria","quantity":"1","unit":"unidades"},{"name":"pimiento verde","quantity":"1","unit":"unidades"},{"name":"ajo","quantity":"1","unit":"dientes"},{"name":"tomate triturado","quantity":"500","unit":"g"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"orégano","quantity":"1","unit":"pizca"},{"name":"queso rallado","quantity":"40","unit":"g"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Pica muy fina la cebolla, el pimiento y el ajo y ralla la zanahoria (así los peques casi no las ven).","En una sartén grande, calienta el aceite y sofríe la cebolla, el pimiento, el ajo y la zanahoria 8 minutos a fuego medio, hasta que estén blandos.","Añade el pavo y cocínalo desmenuzándolo hasta que no quede nada rosado (unos 6 minutos).","Incorpora el tomate, el orégano y la sal y cuece a fuego suave 15 minutos, removiendo de vez en cuando.","Mientras, cuece los macarrones en agua con sal según el paquete (unos 10 minutos). Escúrrelos y mézclalos con la salsa.","Sirve con el queso rallado por encima.","Lávate las manos y la tabla con agua caliente y jabón tras manejar el pavo crudo. Alérgenos presentes: gluten (pasta) y lácteos (queso rallado).","Si sobra, guárdalo en la nevera en menos de dos horas, tómalo en 2 o 3 días y recaliéntalo hasta que esté muy caliente."],"tags":["menú semanal","comida","plato principal","pasta","pavo","con niños"],"tip":"Truco de Pepa: la salsa se puede hacer el día antes (aguanta 2 o 3 días en la nevera) y el día que toca solo cueces la pasta, unos 10 minutos. Si vas con prisa, usa zanahoria ya rallada de bolsa o pásala por el rallador grueso.","freeze":{"ideal":true,"note":"Congela solo la salsa (con el pavo y las verduras), sin la pasta ni el queso: recalentada se queda blanda. Fría, repártela en raciones en bolsas o tarros aptos (hasta 3 meses). Descongela en la nevera, recalienta hasta que hierva, mézclala con pasta recién cocida y no la vuelvas a congelar."},"time":{"active":25,"total":40}},{"title":"Zanahoria rallada con limón y maíz","servings":4,"ingredients":[{"name":"zanahoria","quantity":"3","unit":"unidades"},{"name":"maíz dulce","quantity":"100","unit":"g"},{"name":"limón","quantity":"1","unit":"unidades"},{"name":"aceite de oliva","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Pela y ralla las zanahorias.","Mézclalas con el maíz escurrido y aliña con el zumo del limón, el aceite y la sal."],"tags":["menú semanal","acompañamiento","ensalada","sin cocinar"],"time":{"active":5,"total":5}}]},"cena":{"title":"Tortilla de calabacín","side":"Ensalada de tomate","recipes":[{"title":"Tortilla de calabacín","servings":4,"ingredients":[{"name":"huevo","quantity":"6","unit":"unidades"},{"name":"calabacín","quantity":"2","unit":"unidades"},{"name":"cebolla","quantity":"1","unit":"unidades"},{"name":"aceite de oliva","quantity":"4","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lava los calabacines y córtalos en rodajas finas o en dados pequeños. Pica la cebolla en trozos pequeños.","En una sartén de unos 24 cm, calienta tres cucharadas de aceite a fuego medio-bajo y cocina el calabacín y la cebolla con una pizca de sal 12-15 minutos, removiendo, hasta que estén muy tiernos sin dorarse.","Bate los huevos con una pizca de sal en un bol grande. Escurre las verduras del exceso de aceite y mézclalas con el huevo.","Vuelve a poner la cucharada de aceite restante en la sartén, vierte la mezcla y cuaja a fuego medio 4-5 minutos.","Dale la vuelta con un plato y cuaja 3-4 minutos más. Debe quedar bien cuajada por dentro, sin partes líquidas. Deja reposar 5 minutos antes de cortar.","Alérgenos presentes: huevo. Si sobra, guárdala en la nevera en menos de dos horas y tómala en 2 días."],"tags":["menú semanal","cena","plato principal","huevos","verdura","cena ligera"],"time":{"active":20,"total":40}},{"title":"Ensalada de tomate","servings":4,"ingredients":[{"name":"tomate","quantity":"4","unit":"unidades"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"vinagre","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lava los tomates y córtalos en gajos o en rodajas.","Aliña con el aceite, el vinagre y la sal justo antes de servir."],"tags":["menú semanal","acompañamiento","ensalada","sin cocinar"],"time":{"active":5,"total":5}}]}}},{"day":"viernes","meals":{"comida":{"title":"Garbanzos con espinacas y bacalao","side":"Fruta de temporada","recipes":[{"title":"Garbanzos con espinacas y bacalao","servings":4,"ingredients":[{"name":"garbanzos cocidos","quantity":"600","unit":"g"},{"name":"espinacas","quantity":"300","unit":"g"},{"name":"bacalao desalado","quantity":"400","unit":"g"},{"name":"cebolla","quantity":"1","unit":"unidades"},{"name":"ajo","quantity":"3","unit":"dientes"},{"name":"pimentón dulce","quantity":"1","unit":"cucharaditas"},{"name":"aceite de oliva","quantity":"3","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Si has comprado bacalao salado seco, desálalo con antelación: ponlo en agua fría en la nevera, con la piel hacia arriba, y cambia el agua tres veces al día durante uno o dos días, según el grosor. Más cómodo: el bacalao ya desalado, que se vende refrigerado o congelado (descongélalo en la nevera, siguiendo las instrucciones del envase).","Quita la piel y las espinas del bacalao y córtalo en trozos de 2-3 cm; pasa los dedos por cada trozo para asegurarte de que no queda ninguna espina. Pica la cebolla y lamina los ajos. Aclara los garbanzos cocidos (unos 600 g ya escurridos, de bote o cocidos en casa) bajo el grifo y escúrrelos. Usa una tabla y un cuchillo solo para el pescado crudo y lávate las manos después de tocarlo.","En una cazuela, calienta el aceite y sofríe la cebolla 6 minutos a fuego medio. Añade el ajo 1 minuto más.","Retira del fuego, añade el pimentón y remueve unos segundos. Vuelve al fuego e incorpora las espinacas (si son frescas, en tandas; si son congeladas, directas).","Cuando las espinacas se reduzcan, añade los garbanzos y 200 ml de agua. Cuece a fuego suave 10 minutos y chafa unos pocos garbanzos contra la cazuela para que ligue el caldo.","Añade el bacalao, tapa y cuece 4-5 minutos más, hasta que esté opaco y se separe en lascas. Prueba antes de salar, porque el bacalao desalado aún puede llevar sal; ajusta de sal y sirve caliente.","Alérgenos presentes: pescado (bacalao). Para menores de 4 años, chafa los garbanzos. Guarda las sobras en la nevera en menos de dos horas, tómalas en 2 días y recaliéntalas hasta que hiervan."],"tags":["menú semanal","comida","plato principal","legumbres","pescado","cuchara"],"tip":"Truco de Pepa: con garbanzos cocidos de bote y bacalao ya desalado (lo hay refrigerado y congelado, en lomos o en migas) te ahorras dos días de desalado y más de una hora de cocción. Si es congelado, descongélalo en la nevera, siguiendo las instrucciones del envase.","time":{"active":20,"total":35}},{"title":"Fruta de temporada","servings":4,"simple":true,"ingredients":[{"name":"fruta de temporada","quantity":"4","unit":"unidades"}],"steps":[],"tags":["menú semanal","acompañamiento","postre","sin cocinar"]}]},"cena":{"title":"Pizzas pequeñas de tortilla de trigo con verduras y queso","side":"","recipes":[{"title":"Pizzas pequeñas de tortilla de trigo con verduras y queso","servings":4,"ingredients":[{"name":"tortillas de trigo","quantity":"8","unit":"unidades"},{"name":"tomate triturado","quantity":"250","unit":"g"},{"name":"queso rallado","quantity":"200","unit":"g"},{"name":"champiñones","quantity":"150","unit":"g"},{"name":"pimiento rojo","quantity":"1","unit":"unidades"},{"name":"orégano","quantity":"1","unit":"pizca"},{"name":"aceite de oliva","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Precalienta el horno a 220 ºC y prepara dos bandejas con papel de horno.","Mezcla el tomate con el aceite, la sal y el orégano. Lamina los champiñones y corta el pimiento en tiras muy finas.","Coloca las tortillas pequeñas (de unos 20 cm) en las bandejas, reparte el tomate por encima, luego la mitad del queso, las verduras y el resto del queso.","Hornea 6-8 minutos, hasta que el queso se derrita y los bordes estén dorados. Deja templar un minuto y corta en porciones.","Alérgenos presentes: gluten (tortillas) y lácteos (queso). Si sobran, guárdalas en la nevera en menos de dos horas, tómalas en 1 o 2 días y recaliéntalas hasta que estén calientes por dentro."],"tags":["menú semanal","cena","plato principal","con niños","horno","rápida"],"time":{"active":15,"total":25}}]}}},{"day":"sábado","meals":{"comida":{"title":"Hamburguesas caseras de ternera","side":"Patatas al horno y ensalada de lechuga y tomate","recipes":[{"title":"Hamburguesas caseras de ternera","servings":4,"ingredients":[{"name":"carne picada de ternera","quantity":"600","unit":"g"},{"name":"huevo","quantity":"1","unit":"unidades"},{"name":"pan rallado","quantity":"40","unit":"g"},{"name":"cebolla","quantity":"0.5","unit":"unidades"},{"name":"pan de hamburguesa","quantity":"4","unit":"unidades"},{"name":"lechuga","quantity":"0.5","unit":"unidades"},{"name":"tomate","quantity":"1","unit":"unidades"},{"name":"queso en lonchas","quantity":"4","unit":"lonchas"},{"name":"aceite de oliva","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Pica la cebolla muy fina. Mezcla en un bol la carne, el huevo, el pan rallado, la cebolla y la sal sin amasar demasiado.","Forma 4 hamburguesas de unos 2 cm de grosor y apriétalas bien.","Cocínalas en una plancha o sartén con el aceite, a fuego medio-alto, unos 5 minutos por lado. Deben quedar hechas por dentro, sin nada rosado y con el jugo claro.","Añade una loncha de queso sobre cada una el último minuto para que se funda.","Tuesta ligeramente los panes y monta con la hamburguesa, la lechuga y el tomate en rodajas.","Lávate las manos y la tabla con agua caliente y jabón tras manejar la carne cruda."],"tags":["menú semanal","comida","plato principal","carne","con niños"],"freeze":{"ideal":true,"note":"Congela las hamburguesas crudas, ya formadas y separadas con papel de horno, en una bolsa o recipiente cerrado (hasta 3 meses). Descongélalas en la nevera, nunca en la encimera, y cocínalas bien hechas, sin nada rosado dentro. No vuelvas a congelar lo descongelado."},"time":{"active":20,"total":30}},{"title":"Patatas al horno","servings":4,"ingredients":[{"name":"patata","quantity":"800","unit":"g"},{"name":"aceite de oliva","quantity":"3","unit":"cucharadas"},{"name":"pimentón dulce","quantity":"1","unit":"cucharaditas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Precalienta el horno a 200 ºC. Lava bien las patatas y córtalas en gajos con piel.","Mézclalas en un bol con el aceite, el pimentón y la sal y extiéndelas en una bandeja sin que se amontonen.","Hornea 35-40 minutos, dándoles la vuelta a mitad de tiempo, hasta que estén doradas y blandas por dentro."],"tags":["menú semanal","acompañamiento","horno","con niños"],"time":{"active":10,"total":50}},{"title":"Ensalada de lechuga y tomate","servings":4,"ingredients":[{"name":"lechuga","quantity":"0.5","unit":"unidades"},{"name":"tomate","quantity":"2","unit":"unidades"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"vinagre","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lava y trocea la lechuga. Corta el tomate en gajos.","Mezcla y aliña con el aceite, el vinagre y la sal justo antes de servir."],"tags":["menú semanal","acompañamiento","ensalada","sin cocinar"],"time":{"active":5,"total":5}}]},"cena":{"title":"Quesadillas de pollo, pimiento y queso","side":"Ensalada de lechuga y maíz","recipes":[{"title":"Quesadillas de pollo, pimiento y queso","servings":4,"ingredients":[{"name":"tortillas de trigo","quantity":"8","unit":"unidades"},{"name":"pechuga de pollo","quantity":"300","unit":"g"},{"name":"pimiento rojo","quantity":"1","unit":"unidades"},{"name":"queso rallado","quantity":"200","unit":"g"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Corta la pechuga en dados de 1 cm y el pimiento en tiras finas. Sala el pollo.","En una sartén, calienta el aceite a fuego medio-alto y cocina el pollo 6-7 minutos, removiendo, hasta que no quede nada rosado (corta un trozo para comprobarlo). Añade el pimiento y cocina 5 minutos más, hasta que esté blando. Reserva el relleno.","Limpia la sartén y caliéntala sin aceite. Pon una tortilla pequeña (de unos 20 cm), reparte queso sobre una mitad y añade un poco de relleno.","Dobla la tortilla por la mitad y cocina 2 minutos por lado a fuego medio, hasta que esté dorada y el queso fundido.","Repite con las demás y corta cada quesadilla en triángulos.","Lávate las manos y la tabla con agua caliente y jabón tras manejar el pollo crudo. Alérgenos presentes: gluten (tortillas) y lácteos (queso)."],"tags":["menú semanal","cena","plato principal","pollo","con niños","rápida"],"tip":"Truco de Pepa: el relleno de pollo y pimiento se puede hacer por la mañana o el día antes y guardar en la nevera, tapado, hasta 2 días. A la hora de cenar solo queda montar y dorar las quesadillas; el relleno debe calentarse bien dentro de la tortilla.","time":{"active":30,"total":40}},{"title":"Ensalada de lechuga y maíz","servings":4,"ingredients":[{"name":"lechuga","quantity":"0.5","unit":"unidades"},{"name":"maíz dulce","quantity":"100","unit":"g"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"vinagre","quantity":"1","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lava y trocea la lechuga y mézclala con el maíz escurrido.","Aliña con el aceite, el vinagre y la sal justo antes de servir."],"tags":["menú semanal","acompañamiento","ensalada","sin cocinar"],"time":{"active":5,"total":5}}]}}},{"day":"domingo","meals":{"comida":{"title":"Pollo asado con patatas y verduras","side":"Ensalada de lechuga y manzana","recipes":[{"title":"Pollo asado con patatas y verduras","servings":4,"ingredients":[{"name":"muslos de pollo","quantity":"8","unit":"unidades"},{"name":"patata","quantity":"800","unit":"g"},{"name":"zanahoria","quantity":"3","unit":"unidades"},{"name":"cebolla","quantity":"2","unit":"unidades"},{"name":"pimiento rojo","quantity":"1","unit":"unidades"},{"name":"ajo","quantity":"3","unit":"dientes"},{"name":"limón","quantity":"1","unit":"unidades"},{"name":"pimentón dulce","quantity":"1","unit":"cucharaditas"},{"name":"aceite de oliva","quantity":"4","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Precalienta el horno a 200 ºC. Lava las patatas y córtalas en gajos gruesos; pela las zanahorias y córtalas en rodajas gruesas; corta las cebollas en gajos y el pimiento en tiras.","Extiende las patatas y las verduras con los ajos sin pelar en una fuente grande o en dos bandejas, para que no se amontonen, añade sal y riégalas con dos cucharadas de aceite.","Sala los muslos, mézclalos con el pimentón, el zumo de medio limón y el aceite restante y colócalos sobre las verduras, con la piel hacia arriba.","Hornea 55-60 minutos, dando la vuelta a las patatas y a los muslos a mitad de tiempo y regándolos con su jugo.","Está listo cuando el jugo sale claro, la carne junto al hueso no está rosada (74 ºC en el centro si tienes termómetro) y las patatas están tiernas. Reposa 5 minutos y sirve con el limón restante.","Lávate las manos y la tabla con agua caliente y jabón tras manejar el pollo crudo. Si sobra, guarda el pollo y las verduras en la nevera en menos de dos horas, tómalos en 2 o 3 días y recaliéntalos hasta que estén calientes por dentro, una sola vez."],"tags":["menú semanal","comida","plato principal","pollo","horno","domingo"],"time":{"active":20,"total":80}},{"title":"Ensalada de lechuga y manzana","servings":4,"ingredients":[{"name":"lechuga","quantity":"0.5","unit":"unidades"},{"name":"manzana","quantity":"2","unit":"unidades"},{"name":"limón","quantity":"1","unit":"unidades"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lava y trocea la lechuga. Corta la manzana en cubos o láminas y rocíala con el zumo de limón para que no se oscurezca.","Mezcla y aliña con el aceite y la sal justo antes de servir."],"tags":["menú semanal","acompañamiento","ensalada","sin cocinar","con niños"],"time":{"active":5,"total":5}}]},"cena":{"title":"Revuelto de champiñones y calabacín","side":"Tostada integral","recipes":[{"title":"Revuelto de champiñones y calabacín","servings":4,"ingredients":[{"name":"huevo","quantity":"6","unit":"unidades"},{"name":"champiñones","quantity":"250","unit":"g"},{"name":"calabacín","quantity":"1","unit":"unidades"},{"name":"ajo","quantity":"1","unit":"dientes"},{"name":"aceite de oliva","quantity":"2","unit":"cucharadas"},{"name":"sal","quantity":"1","unit":"pizca"}],"steps":["Lamina los champiñones, corta el calabacín en dados pequeños y pica el ajo.","Calienta el aceite en una sartén grande y saltea el ajo 30 segundos. Añade el calabacín y los champiñones y cocina 8-10 minutos, hasta que suelten el agua y se doren.","Bate los huevos con la sal, viértelos y remueve a fuego medio hasta que cuajen del todo (que no queden partes líquidas). Sirve enseguida."],"tags":["menú semanal","cena","plato principal","huevos","verdura","cena ligera","rápida"],"time":{"active":15,"total":20}},{"title":"Tostada integral","servings":4,"simple":true,"ingredients":[{"name":"pan integral","quantity":"4","unit":"rebanadas"}],"steps":[],"tags":["menú semanal","acompañamiento","sin cocinar","rápida"]}]}}}]}}$j$::jsonb, $b$menu$b$),
      ($b$inicial-06-verdura$b$, $b$recetas$b$, $b$cocina-saludable$b$, $b$Más verdura sin que nadie se queje$b$,
       $b$Meter verdura "de tapadillo" funciona para sumar raciones, pero no enseña a nadie a comerla. Lo que mejor suele funcionar en casa es combinar dos cosas: **verdura integrada en los platos de siempre** y **verdura visible en la mesa, sin presión**.

**Verdura integrada (ideas que funcionan)**

- **Albóndigas y hamburguesas más jugosas.** Ralla 1 calabacín mediano (unos 200 g), exprímelo bien con un paño o con las manos para quitar el agua y mézclalo con 500 g de carne picada, 1 huevo y 2-3 cucharadas de pan rallado. La zanahoria rallada fina también va bien. Se notan más jugosas, no más verdes.
- **Salsa de tomate con zanahoria.** Pocha 1 cebolla y 2 zanahorias en trozos pequeños, añade el tomate triturado, cuece 20 minutos y tritura. La zanahoria rebaja la acidez y espesa. Sirve para pasta, pizzas y albóndigas.
- **Salsa de calabaza para pasta.** Asa 250 g de calabaza en trozos (200 °C, unos 30 minutos), tritúrala con un chorro de leche o caldo y un puñado de queso rallado. Mezcla con la pasta caliente.
- **Puré mitad y mitad.** Mitad patata, mitad coliflor, calabaza o zanahoria, con un poco de aceite o mantequilla. Textura de puré de siempre, con más verdura dentro.
- **Cremas y sopas.** Triturar cualquier verdura con patata y un chorrito de aceite de oliva suaviza el sabor.

**Verdura visible (para que la conozcan de verdad)**

- **Cámbiala de formato.** La misma zanahoria puede ser en bastones crudos con un dip de yogur, rallada en ensalada, asada en rodajas o en tiras tipo pasta. Muchas veces no rechazan la verdura, sino una textura concreta.
- **Asada en lugar de hervida.** Calabacín, zanahoria, boniato o coliflor en el horno a 200 °C, con aceite y sal, se doran y saben más dulces. Los de láminas finas quedan crujientes tipo chips.
- **Siempre en la mesa.** Un platito con tomates cherry o pepino troceado, aunque no lo toquen. Verla de forma habitual cuenta.

**Cómo ponerlo en práctica sin guerras**

Si cocinas con verdura integrada, no hace falta mentir: si preguntan, responde que lleva calabacín. Que la verdura sea un ingrediente más y no un secreto ayuda a normalizarla.

A muchos peques les hace falta probar un alimento muchas veces antes de aceptarlo. Ofrécelo sin insistir, sin chantajes ni premios (el postre no debería ser el "pago" por la verdura) y deja que sean ellos quienes decidan cuánto comen.

Y si los invitas a ayudar (lavar, rallar, mezclar), muchas veces acaban probando lo que han cocinado. 🥕$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-07-caldo-casero$b$, $b$recetas$b$, $b$aprovechamiento-alimentos$b$, $b$Caldo casero con restos de verduras$b$,
       $b$Un caldo de verduras no necesita verdura "buena": aprovecha recortes limpios y verdura que ya no luce, pero sigue sana. Se hace en una hora y rinde para varias comidas.

**Truco base:** ten una bolsa en el congelador y ve echando los recortes limpios (tras lavar bien las verduras). Cuando tengas unos 500 g, toca caldo.

**Qué sí puedes usar**

- Parte verde del puerro (bien lavada, que guarda tierra), puntas y hojas de apio.
- Zanahoria: pieles y puntas, si la has cepillado o lavado bien.
- Cebolla y cebolleta: puntas y capas externas limpias. De la piel, solo un trozo pequeño para dar color.
- Tallos de perejil, champiñones y sus pies, calabacín, calabaza, pimiento, tomate maduro.
- Verduras que se han quedado blandas o arrugadas pero huelen bien y no tienen moho ni babas.

**Qué moderar o evitar**

- **Brócoli, coliflor, repollo, coles:** dan un olor y un sabor fuertes. Mejor un tallo pequeño como mucho.
- **Remolacha:** tiñe el caldo de rosa y lo vuelve muy dulce.
- **Piel de cebolla en exceso, alcachofa, espárragos y berenjena:** amargan o dominan.
- **Patata:** enturbia el caldo. Y nada de piel verde ni brotados.
- **Cualquier cosa con moho, babosa o con mal olor:** a la basura. El caldo no arregla lo estropeado.

**Receta (unos 2 litros)**

1. Pon unos 500 g de verduras en una olla con 2,5 litros de agua fría, 1 hoja de laurel y 5 granos de pimienta.
2. Para más sabor, dora antes unos minutos la cebolla y la zanahoria en un poco de aceite, o añade 1 cucharada de tomate concentrado.
3. Lleva a ebullición, baja el fuego y cuece suave, destapado, unos 45-60 minutos.
4. Cuela. No presiones la verdura, para que el caldo salga limpio.
5. Sala al final, y poco: así puedes usarlo luego en cualquier receta.

**Enfriar y conservar con seguridad**

No dejes el caldo en la olla horas a temperatura ambiente. Enfríalo pronto, antes de 2 horas:

- Repártelo en recipientes pequeños y poco profundos, o en frascos, y déjalos reposar en un baño de agua fría con hielo.
- Cuando deje de humear, tápalo y a la nevera. Aguanta 3-4 días.
- Para más tiempo, congélalo en porciones (bolsas planas, o tarros dejando 2-3 cm libres). Úsalo en unos 3 meses. En cubitos congelados tienes caldo para cualquier arroz o sopa.
- Al usarlo, caliéntalo hasta que hierva. No vuelvas a congelar lo descongelado.

Es la mejor base para cremas, arroces, legumbres y sopas de pasta. 🍜$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-08-hierbas-congeladas$b$, $b$recetas$b$, $b$trucos-de-cocina$b$, $b$Hierbas frescas que duran meses$b$,
       $b$El manojo de perejil que compras para una receta y se pudre en la nevera tiene solución: congélalo en porciones listas para cocinar. Pierden textura, así que no sirven para decorar, pero en sartén, cazuela o salsa saben a recién picadas.

**Cómo hacerlo**

1. Lava las hierbas y sécalas muy bien (con papel de cocina o centrifugadora). El agua forma cristales de hielo.
2. Pica o tritura con el resto de ingredientes de la mezcla.
3. Rellena una cubitera. Cada cubito son 1-2 cucharadas.
4. Congela y, cuando estén duros, pásalos a una bolsa o un bote. Apunta lo que es y la fecha.

Duran con buen sabor unos 3 meses.

**Cuatro combinaciones**

- **Perejil y ajo.** 2 puñados de perejil (unos 30 g de hojas), 2 dientes de ajo y 4 cucharadas de aceite de oliva, triturados. Para pollo, pescado, patatas salteadas, gambas al ajillo, sofritos y arroces. Mezclado con mantequilla blanda, sirve para pan de ajo.
- **Albahaca y ajo.** 2 puñados de albahaca, 1 diente de ajo y 4 cucharadas de aceite. Un cubito en la pasta caliente, con queso rallado, es un pesto exprés. También para salsa de tomate, sopas y pizza casera.
- **Romero y tomillo.** Hojas picadas, 1 cucharada de cada y 2-3 cucharadas de aceite, sin ajo. Para patatas y verduras al horno, carnes asadas, legumbres y caldos.
- **Cilantro y ralladura de lima.** 1 puñado de cilantro, la ralladura de 1 lima (solo la parte verde) y 3 cucharadas de aceite. Para arroz, curris, tacos, guacamole, sopas y pescado.

**Muy importante con el ajo y el aceite**

No guardes nunca ajo en aceite a temperatura ambiente ni en la nevera durante días: hay riesgo de botulismo. Estas mezclas solo valen **congeladas de inmediato y mantenidas congeladas**. Saca el cubito y échalo directamente a la sartén o a la cazuela. No lo descongeles para dejarlo en la encimera ni lo vuelvas a guardar.

Si prefieres no usar aceite, congela las hierbas picadas en cubitera cubiertas de agua o de caldo. Van muy bien en sopas y guisos. 🧊$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-09-pan-duro$b$, $b$recetas$b$, $b$aprovechamiento-alimentos$b$, $b$El pan duro tiene mil vidas$b$,
       $b$Pan duro es pan seco, no pan malo. Cuatro recetas para no tirarlo, con cantidades y pasos.

**Antes de empezar:** si ves moho en el pan, aunque sea una mancha pequeña, tíralo entero. No sirve cortar esa parte.

**1. Pan rallado casero**

Trocea el pan y sécalo en el horno a 150 °C unos 15-20 minutos, hasta que esté quebradizo. Si ya está muy duro, puedes saltarte este paso. Tritúralo o rállalo. Para un rebozado con más sabor, mezcla 100 g con 1 cucharadita de ajo en polvo y perejil seco. Guárdalo en un bote bien cerrado, en un sitio seco, o en el congelador. Úsalo en un mes si lo guardas en el armario.

**2. Picatostes (para sopas, cremas y ensaladas)**

- 200 g de pan duro en dados de 1,5 cm
- 2 cucharadas de aceite de oliva
- Sal y, si quieres, orégano o ajo en polvo

Mezcla todo en un bol y extiéndelo en una bandeja. Hornea a 180 °C unos 10-12 minutos, removiendo a la mitad. Deben quedar dorados y crujientes. Déjalos enfriar antes de guardarlos en un bote.

**3. Torrijas (4 personas, unas 8)**

- 8 rebanadas de pan de torrijas o barra, de 2 cm
- 500 ml de leche
- 3 cucharadas de azúcar
- 1 rama de canela y un trozo de piel de limón
- 2 huevos
- Aceite de oliva suave o girasol para freír

Calienta la leche con el azúcar, la canela y el limón sin que hierva. Apártala y déjala templar. Empapa el pan unos 30-60 segundos por lado (más si está muy duro) hasta que esté blando pero entero. Escúrrelo, pásalo por el huevo batido y fríelo en abundante aceite a fuego medio-alto hasta que dore por ambos lados. Escurre sobre papel y espolvorea con azúcar y canela.

**4. Migas (4 raciones)**

- 300 g de pan duro, de una barra de varios días
- 100 ml de agua con una pizca de sal
- 4 cucharadas de aceite de oliva
- 3-4 dientes de ajo en láminas
- 100 g de chorizo o panceta en trozos (opcional)

Corta el pan en trozos pequeños o desmigalo, rocíalo con el agua con sal, mézclalo y déjalo tapado con un paño de 2 a 3 horas (o de un día para otro). Dora el ajo y el chorizo en el aceite, añade el pan y remueve a fuego medio-bajo unos 15-20 minutos, hasta que queden sueltas y doradas. Van muy bien con uvas, pimientos fritos o un huevo frito encima. 🍇$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-10-arroz-blanco$b$, $b$recetas$b$, $b$recetas-faciles$b$, $b$Arroz blanco que sale bien siempre$b$,
       $b$No hay una proporción de agua que valga para todos los arroces: cambia con la variedad, la marca y el método. Estas son medidas orientativas. Una «medida» es un vaso o una taza, la misma para el arroz y para el agua. Si el paquete indica otra cosa, hazle caso y apunta la que te funcione.

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

**Cinco ideas para transformarlo (para 2 raciones, con unos 250-300 g de arroz ya cocido)**

1. **Con curry.** Sofríe 1/2 cebolla picada en 1 cucharada de aceite 5 minutos. Añade 1 cucharadita de curry y remueve 30 segundos. Echa el arroz y un puñado de guisantes o pasas, y calienta bien.
2. **A la cubana.** Arroz blanco con 150 ml de salsa de tomate y un huevo frito encima. Si quieres, añade unos trozos de salchicha o plátano frito.
3. **Con ajo y limón.** Dora 2 dientes de ajo laminados en 2 cucharadas de aceite, añade el arroz, la ralladura de medio limón y un chorrito de zumo al final. Con perejil por encima.
4. **Salteado con verduras.** Sofríe zanahoria, calabacín, pimiento y cebolleta en dados pequeños 3-4 minutos a fuego fuerte. Añade el arroz y 1-2 cucharadas de salsa de soja. Remata con un huevo revuelto. Sale mejor con arroz del día anterior, bien enfriado.
5. **Cremoso con champiñones** (con arroz redondo crudo, 150 g). Pocha 1/2 cebolla, añade 200 g de champiñones laminados y dóralos. Echa el arroz, rehoga y ve añadiendo unos 500 ml de caldo caliente poco a poco durante 18 minutos, removiendo a menudo. Al final, 30 g de queso rallado o 1 cucharada de mantequilla.

**Con el arroz que sobra, ojo**

El arroz cocinado no debe quedarse horas fuera: puede desarrollar bacterias cuyas toxinas no se eliminan al recalentar. Enfríalo en menos de una hora, extendido en una bandeja o en un recipiente poco profundo, y a la nevera antes de 2 horas. Consúmelo en 24 horas y recaliéntalo una sola vez, hasta que humee por todo. 🔥$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-11-compra-provechosa$b$, $b$hogar$b$, $b$ahorro-economia$b$, $b$Consejos para hacer más provechosa la compra 🛒$b$,
       $b$Quizá ya hacéis varios de estos; aquí van unas cuantas ideas para sacarle más partido a la compra sin complicaros la vida. Quedaos con las que os encajen.

**Mirad nevera y despensa antes de salir.** Un vistazo rápido (o una foto con el móvil) evita comprar por tercera vez lo que ya tenéis y os recuerda qué hay que gastar pronto.

**Una lista compartida, para que nada se apunte dos veces.** En la Lista de la compra de PEPA toda la familia apunta lo que se acaba en el momento, y se agrupa por tienda. En el supermercado, «Modo compra» va sumando lo que marcáis como comprado con el último precio que recuerda cada producto, así sabéis por dónde va el carro antes de llegar a caja. 🧾

**Comparad por kilo o por litro, no por envase.** El precio por unidad de medida suele venir en la etiqueta, en letra pequeña. El formato grande no siempre es el más barato, y el «ahorro» de un envase gigante no existe si luego caduca a medias.

**Haced la cuenta de las promociones.** Un 3×2 en un producto a 2,40 € supone pagar 4,80 € por tres: 1,60 € cada uno. Si otra marca equivalente cuesta 1,40 € suelto, el 3×2 no os ahorra nada. Y si el producto no se conserva bien o no vais a gastar los tres, el ahorro se queda en la estantería.

**Pensad en el coste por ración.** Una bandeja de 6 € que da para cuatro raciones sale a 1,50 € cada una; una de 4 € que solo da para dos, a 2 €. Lo que parece caro a veces rinde más.

**Productos a punto de caducar, solo si los vais a gastar.** Con rebaja pueden ser un chollo, pero solo si ese mismo día o al siguiente los coméis o los congeláis. Si no, es dinero que acaba en la basura. 🥫

**No compréis con hambre, si podéis evitarlo.** Es de las pocas cosas que de verdad cambian el contenido del carro. Un tentempié antes de salir es más barato que lo que acaba entrando por impulso.

**Mirad vuestro propio historial de precios.** En Compras, la pestaña Historial guarda el último precio de lo que compráis y, cuando un producto también se compró el mes anterior, os muestra si ha subido (🔺) o bajado (🔻). Tocando un producto veis cada cuánto lo compráis y podéis comparar su precio entre tiendas. Se va construyendo con lo que compráis y guardáis, así que cuanto más lo uséis, más útil resulta.

No hace falta aplicar todo a la vez: con una o dos costumbres nuevas ya se nota.

¿Cuál es el truco que más os ahorra en la compra de cada semana?$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-12-comprar-con-cabeza$b$, $b$hogar$b$, $b$ahorro-economia$b$, $b$¿Lo necesito o simplemente me apetece? 6 trucos para comprar con cabeza$b$,
       $b$Comprar algo que nos apetece no tiene nada de malo. Lo que suele salir caro es lo que compramos sin haberlo pensado. Seis trucos para quedaros con la compra que de verdad os compensa. 🛍️

**1. Esperad 24 horas.** Si no es algo que necesitáis hoy, dejadlo reposar un día. Muchas ganas se apagan solas por la mañana. Para compras grandes, alargad la espera a una semana o más; si el producto sigue siendo igual de buena idea, no se va a escapar.

**2. Calculad el coste total, no solo el precio.** Muchas compras traen gastos detrás: accesorios, recambios, suscripciones, consumibles, mantenimiento. Un aparato barato con recambios caros sale más caro que otro un poco más caro que no los necesita. Una buena pregunta: «¿cuánto nos va a costar tenerlo un año?».

**3. Desconfiad de la urgencia artificial.** Cuentas atrás, «solo quedan 2 unidades», «última oportunidad»… A veces es verdad, pero otras muchas está diseñado para que decidáis rápido y sin pensar. Si la oferta es buena de verdad, aguantará una noche; y si desaparece, otra vendrá.

**4. Tres preguntas antes de pagar.** Pueden ser estas:

- ¿Lo necesito o me apetece? (Las dos respuestas valen, pero conviene saber cuál es.)
- ¿Lo voy a usar de verdad, o lo imagino usándolo?
- ¿Cabe en el presupuesto de este mes sin quitárselo a algo más importante?

**5. Guardad la idea en vez de comprarla ya.** La Lista de deseos de PEPA (dentro de Pequeños Grandes) permite crear una lista por persona y celebración y guardar cada artículo con su enlace, una foto y el precio. Apuntarlo ahí os deja volver unas semanas después con la cabeza fría: si ya no os dice nada, os habéis ahorrado la compra; si sigue apeteciendo igual, comprarlo será una decisión, no un impulso. Tened en cuenta que es una lista pensada para regalos, y que la ve el resto de la familia; si se acerca un cumpleaños, quizá os saquen de dudas. 🎁

**6. Reservad una partida para caprichos, sin culpa.** Si vuestro presupuesto lo permite, separad una cantidad pequeña al mes solo para gustos, sin tener que justificarla. Así los caprichos dejan de ser una fuga de dinero y se convierten en parte del plan. Cuando se acaba, se acaba hasta el mes siguiente.

Ninguno de estos trucos pretende quitaros el placer de comprar, sino que cada euro vaya donde de verdad queréis que vaya.

¿Cuál es la última cosa que llevabais semanas queriendo comprar y al final no hizo falta?$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-13-diez-minutos-en-familia$b$, $b$hogar$b$, $b$organizacion-familiar$b$, $b$Diez minutos en familia que pueden cambiar tu semana ❤️$b$,
       $b$Hay semanas que se nos escapan entre horarios, cansancio y mensajes a medias. Una idea sencilla: **reservar diez minutos a la semana para juntaros todos**. Sin reuniones solemnes ni orden del día; en el sofá, en la mesa tras la cena o con un chocolate caliente. 🍫

Lo importante es que sea corto, que se repita (el mismo día, más o menos) y que cada uno tenga voz. Si una semana no sale, no pasa nada: se retoma la siguiente.

**Qué se puede hacer en esos diez minutos**

1. **Mirar la semana que viene.** Qué hay en el calendario: médicos, extraescolares, cumpleaños, cenas, días con horarios raros. Muchos líos de última hora se evitan solo con verlo juntos.
2. **Repartir lo que toca.** Quién lleva a quién, quién hace la compra, quién se encarga de qué. Mejor decidirlo ahora que discutirlo el miércoles a las ocho de la tarde.
3. **Elegir un plan divertido.** Cada semana, una persona propone algo que le apetezca: una peli, un paseo, una partida, hacer pizza. Aunque sea pequeño, es algo que esperar con ganas.
4. **Lo mejor y lo más difícil de la semana.** Cada uno cuenta una cosa buena y una que le costó, sin que nadie opine ni arregle nada. Se escucha y ya. Con niños es oro: es de esas preguntas que abren conversaciones que no salen solas.
5. **Un pequeño objetivo común.** Algo que lograr entre todos: terminar un puzle entre todos, ir un día a pie al cole, cenar sin pantallas dos noches. Una cosa, no diez.

**Si hay peques**

Con los más pequeños funciona mejor lo visual. Dibujos o tarjetas con los planes de la semana (el cole, el abuelo, la piscina) les ayudan a saber qué toca. También pueden dibujar su momento favorito en lugar de contarlo, y colocar en un panel las tareas y los planes con pegatinas.

**Cómo encajarlo con PEPA**

Si ya usáis PEPA, el Calendario es un buen punto de partida: la vista Familiar muestra una columna por persona, y es fácil ver quién tiene qué. Lo que salga de la reunión, como la cena en casa de los abuelos o la cita con el pediatra, se puede apuntar como Evento, y lo que quede por hacer, como Tarea para quien corresponda, con repetición si es algo semanal. Pero un papel en la nevera hace el mismo trabajo, ¡lo importante es juntaros! 📅

¿Cuál sería el momento ideal de la semana para esos diez minutos en vuestra casa?$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-14-repartir-tareas$b$, $b$hogar$b$, $b$organizacion-familiar$b$, $b$¿Otra vez me toca a mí? 7 ideas para repartir las tareas de casa sin discusiones 🏡$b$,
       $b$Casi todas las discusiones por las tareas no son por la tarea, sino por la sensación de que unos hacen más que otros. Una premisa antes de empezar: **un reparto justo no siempre es un reparto idéntico**. Dependerá de edades, horarios y energía de cada uno, y lo que importa es que todos sientan que aportan.

**1. Que se vea quién hace qué.** Lo que no se ve, no se reparte bien. Un cuadrante en la nevera sirve; también las Tareas del Calendario de PEPA, que se asignan a una persona concreta, se pueden repetir cada semana y se ven por persona en la vista Familiar. Así nadie tiene que pedir ni recordar nada.

**2. Tareas a la medida de cada edad.** Orientativamente: con 3-5 años, llevar su ropa sucia al cesto o poner las servilletas; con 6-9, hacer la cama, poner y quitar la mesa o dar de comer a la mascota; con 10 o más, sacar la basura, barrer o tender ropa ligera. Cada niño es distinto, así que lo mejor es ir probando.

**3. Rotad las que nadie quiere.** Si siempre le toca lo mismo a la misma persona, acaba harta. Con las menos agradables (baños, cubo de la basura), una rotación semanal quita el «siempre yo» sin hacerla una condena.

**4. Dejad elegir entre opciones.** A los niños les cuesta menos hacer algo que han elegido. En lugar de «recoge el cuarto», probad con «¿prefieres poner la mesa o quitarla?». Siguen haciendo lo que toca, pero con un poco de control.

**5. Convertidlo en reto, de vez en cuando.** Un bingo de tareas con una cuadrícula para ir tachando, o «misiones secretas» que cada uno saca de un sobre. No hace falta cada día: con una vez a la semana se rompe la rutina. 🎲

**6. Reconoced el esfuerzo.** Un «gracias, se nota» concreto («has dejado el baño genial») vale más que un premio genérico. Y vale entre adultos: lo que se hace en silencio también merece un gracias.

**7. Celebrad lo que lográis juntos.** Una semana con la casa en marcha merece un plan: la peli con palomitas, el helado del domingo. Que se asocie hacer las cosas entre todos con algo bueno.

**Sobre los puntos**

En PEPA, las tareas del Calendario pueden llevar puntos opcionales que se canjean por recompensas que elegís vosotros en Puntos y recompensas; el adulto aprueba cada canje. No hace falta ponérselos a todas, y probablemente no conviene: las rutinas del día a día son cosa de todos. Los puntos encajan mejor en tareas extra o retos puntuales. Y el catálogo de premios puede ser de planes más que de cosas: elegir la película, o decidir el menú del viernes. ⭐

¿Cuál es la tarea que en vuestra casa nadie quiere y cómo la habéis resuelto?$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-15-tablero-rutinas$b$, $b$hogar$b$, $b$crianza-educacion$b$, $b$¡Yo solito! Crea con tus hijos un tablero de rutinas con velcro 🎨$b$,
       $b$Un tablero de rutinas es una de esas manualidades que se hacen en una tarde y se usan durante meses. Y lo mejor es que la mitad del trabajo (elegir, dibujar, recortar) es justo lo que hace que los peques lo sientan suyo.

**Lo que necesitáis**

- Cartulina o cartón fino para el tablero
- Papel o cartulina para las tarjetas
- Rotuladores, lápices de colores o imágenes impresas
- Tijeras (con los peques, siempre vigilados)
- Velcro adhesivo, por las dos caras
- Opcional: láminas autoadhesivas transparentes o plastificadora

**Paso a paso**

1. **Elegid las rutinas.** Sentaos juntos y decidid qué queréis que tenga el tablero. Con 4 o 6 tarjetas ya hay de sobra para empezar; siempre podéis añadir más.
2. **Dibujad o imprimid las imágenes.** Una por rutina: un dibujo hecho por el peque, una foto suya o una imagen impresa. Si aún no lee, que mande la imagen; si ya lee, añadid la palabra debajo.
3. **Recortad las tarjetas** todas del mismo tamaño. Los pequeños pueden ayudar con tijeras de punta redonda; los más pequeños, colorear mientras un adulto recorta.
4. **Plastificad las tarjetas (opcional).** Lo hace un adulto. Así aguantan salpicaduras y manos con prisa.
5. **Preparad el tablero con dos zonas:** «Por hacer» a un lado y «¡Conseguido!» al otro. Dibujad en cada zona casillas del tamaño de las tarjetas y dejad que decoren a su gusto.
6. **Pegad el velcro.** Un trozo en cada casilla y su pareja en la parte de atrás de cada tarjeta. Cuando se completa una rutina, el peque despega la tarjeta y la lleva a «¡Conseguido!». Mover la tarjeta con su propia mano hace que se sientan protagonistas ✨

Los trocitos de velcro son pequeños: pegadlos vosotros y guardad los sobrantes fuera del alcance de los menores de 3 años.

**Ideas de rutinas según el momento del día**

- **Mañana:** levantarme, hacer la cama, vestirme, desayunar, lavarme los dientes, preparar la mochila.
- **Tarde:** merendar, recoger los juguetes, un ratito de lectura, ayudar a poner la mesa.
- **Noche:** cenar, ponerme el pijama, lavarme los dientes, escoger un cuento, dormir.

**Adaptadlo a la edad**

- **3 a 4 años:** tres o cuatro tarjetas solo con dibujos y un adulto cerca. Se trata de que entiendan el juego, no de que lo hagan solos.
- **5 a 7 años:** más tarjetas y ellos mueven las suyas. Pueden elegir el orden del día.
- **8 años en adelante:** que diseñen su propio tablero, con sus tareas y alguna tarjeta personal, como «leer lo que me guste».

Un truco: haced una **tarjeta comodín** en blanco para «lo que yo quiera» o «un abrazo». Y recordad que el tablero es una ayuda, no un reglamento: si un día el orden cambia, no pasa nada. Cuando la tarjeta llegue a «¡Conseguido!», una sonrisa o un choque de manos ya es celebración suficiente.

🎁 ¿Preferís saltaros la parte de preparar los dibujos y las plantillas? ¡En PEPA os lo ponemos fácil! Hemos preparado un kit gratuito de rutinas infantiles, con tableros, tarjetas ilustradas para niños y niñas, y tarjetas en blanco para personalizar. Solo tenéis que imprimir (al 100 %, a tamaño real), recortar y montar vuestra manualidad juntos. ❤️

[Descargar el kit de rutinas de PEPA (PDF)](https://pepafamilyapp.es/descargas/PEPA_Kit_Rutinas_Imprimible_Completo.pdf)$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-16-limpieza-trucos$b$, $b$hogar$b$, $b$limpieza-hogar$b$, $b$Vinagre, bicarbonato y otros trucos de limpieza: ¿funcionan de verdad? 🧽$b$,
       $b$Funcionan, pero cada uno para lo suyo. Antes de los trucos, tres ideas claras:

- **El vinagre** es un ácido suave: sirve para disolver ciertas incrustaciones de cal en superficies que lo toleren. **Nunca en piedra natural sensible** (mármol, caliza, travertino…), que el ácido ataca y le quita el brillo. Probad antes en una zona poco visible.
- **El bicarbonato** es un abrasivo muy suave, y puede ayudar con ciertos olores. Comprobad que la superficie no se raya fácilmente.
- **La espuma al mezclar vinagre y bicarbonato no significa un limpiador más potente**: se neutralizan en parte. Mejor usarlos por separado.

⚠️ **Nunca mezcléis lejía con vinagre, ácidos, amoniaco, alcohol ni otros productos de limpieza**: se pueden liberar gases peligrosos. Respetad las etiquetas y ventilad.

**1. Polvo grasiento sobre los muebles de cocina.** Con el tiempo, el polvo se mezcla con la grasa del aire y forma una capa pegajosa. Agua tibia, unas gotas de lavavajillas y una microfibra bien escurrida; después, seca. Para que cueste menos la próxima vez, podéis cubrir la parte superior con papel o film que luego quitáis y cambiáis, solo si es un mueble compatible y lejos de zonas de calor. Subid con un taburete estable. 🧼

**2. Manchas de tomate en recipientes de plástico.** El tomate se agarra a los restos de grasa que quedan en el plástico. Lavad pronto con agua caliente (si el recipiente lo tolera) y lavavajillas, hasta que no queden restos grasos. Para salsas de tomate, el vidrio apto para microondas no se tiñe.

**3. Alcachofa de ducha que ya no suelta el chorro.** Casi siempre es cal en las boquillas. Si es compatible con su acabado (revisad las indicaciones del fabricante), se puede sumergir un rato (sin dejarla horas) en agua con vinagre; luego, aclarad bien y limpiad cada orificio con un cepillo de dientes viejo o un palillo. Con acabados delicados, mejor un desincrustante específico siguiendo su etiqueta.

**4. Olor en el fregadero.** Antes de echar mezclas, buscad el origen: restos de comida en la rejilla o el tapón, grasa acumulada en el sifón, un sifón dañado o seco. Limpiad la rejilla y, si os animáis, el sifón (con un cubo debajo). Aclarad con agua caliente del grifo, no hirviendo, que puede dañar tuberías de plástico. Si el olor persiste o afecta a varios desagües, puede haber un problema que merezca la visita de un fontanero.

**5. Marcas de agua en los grifos.** Cuando el agua se seca sola, deja la cal en forma de manchas. Tras limpiarlos, pasad una microfibra seca. Con eso y un repaso rápido tras usar el fregadero, las marcas casi no vuelven a aparecer.

Menos productos, usados con criterio, suelen limpiar mejor que muchos mezclados.

¿Cuál es vuestro truco de limpieza que de verdad funciona?$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-17-cinco-minutos$b$, $b$hogar$b$, $b$organizacion-familiar$b$, $b$Cinco minutos que pueden ahorrarte media hora de trabajo 🏡$b$,
       $b$A veces la casa no se desordena por falta de ganas, sino porque cada pequeño gesto aplazado se acumula. Cinco ideas para que no pase.

**1. A veces cuesta lo mismo dejarlo bien que dejarlo mal.** Un envoltorio vacío sobre la encimera tarda lo mismo en llegar a la basura que en quedarse allí… pero luego hay que recogerlo. Lo mismo con las bolsas de compra vacías colgadas de una silla: guardarlas en su sitio al vaciarlas cuesta diez segundos. Es el mismo esfuerzo, solo que mejor colocado.

**2. La cesta de las cosas viajeras.** Todas las casas tienen objetos que viven en una habitación que no es la suya: el juguete en el salón, el libro en la cocina, la taza en el cuarto. En vez de ir llevando cada cosa a su sitio en el momento, dejadlas en una cesta y, cuando está llena (o una vez al día), cada uno devuelve lo suyo a su habitación. Un solo viaje, no veinte. 🧺

**3. Adaptad la organización a vuestros hábitos reales.** Si las mochilas acaban siempre en el suelo de la entrada, ponedles ganchos justo ahí en vez de pelearos. Si las llaves aparecen en cualquier sitio, un recipiente junto a la puerta. Es más fácil colocar el orden donde ya ocurre el desorden que obligar a todos a cambiar de costumbre.

**4. Cinco minutos a una zona.** Elegid una (la encimera, la entrada, el sofá) y poned un temporizador, o una canción. Cuando termina, se acabó, aunque no esté perfecto. Sin convertirlo en obligación: si un día no apetece, se salta. Si os engancháis y seguís un poco más, genial; si no, ya está hecho.

**5. Dejad listas dos o tres cosas por la noche.** La ropa del día siguiente, la mochila del cole, la botella de agua, lo que hay que llevar. Con dos o tres cosas ya cambia la mañana: es mucho más fácil decidir con calma por la noche que con prisa a las ocho. ☀️

No buscamos casas perfectas, sino evitar recoger varias veces lo que podríamos haber dejado bien desde el principio.

¿Cuál es ese objeto que siempre aparece fuera de su sitio en vuestra casa?$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-18-noche-de-juegos$b$, $b$hogar$b$, $b$actividades-familia$b$, $b$Una noche de juegos en familia sin gastar un euro 🎲$b$,
       $b$No hace falta un armario lleno de juegos de mesa 🎉 Con papel, lápiz y objetos de casa se monta una noche en la que todos se ríen, desde el más peque hasta los abuelos. Estos son cinco juegos que funcionan con casi cualquier edad.

**1. ¿Quién soy?**

Cada jugador escribe un personaje, animal u objeto en un papelito y se lo pone a otro jugador en la frente (sujeto con una diadema o, sencillamente, apoyado con la mano). Cada uno ve el papel de los demás, pero no el suyo. Por turnos, hacéis preguntas que solo se pueden responder con sí o no: «¿Soy un animal?», «¿Vivo en casa?». Gana quien lo adivina antes... o jugad hasta que todos lo hayan descubierto. Con peques, que el personaje sea algo que conozcan y que el adulto sople alguna pista.

**2. Dibuja y adivina**

Un jugador saca un papelito con una palabra y la dibuja sin hablar ni escribir letras. Los demás tienen un minuto para adivinar. Si queréis más risas, dibujad con **la mano contraria**: los resultados son legendarios. Para que nadie compita contra nadie, jugad en equipo contra el reloj.

**3. El misterio del objeto desaparecido**

Colocad entre 8 y 10 objetos en una bandeja o sobre la mesa (una cuchara, un calcetín, un peluche, un lápiz…). Todos los miran durante medio minuto. Después cierran los ojos y una persona retira uno. ¿Cuál falta? Podéis subir el nivel quitando dos a la vez o cambiando uno de sitio. Es un juego tranquilo, ideal para empezar o para cerrar la noche.

**4. Las olimpiadas del salón**

Pruebas cortas y seguras, sin correr ni trepar, con los muebles apartados:

- **Calcetines a la cesta:** hacéis bolas con calcetines limpios y las lanzáis a una cesta; los más peques se acercan.
- **La torre más alta:** construir una torre con vasos de plástico o de cartón en un minuto.
- **Tarareo:** uno tararea una canción y los demás la adivinan.
- **Carrera de caracoles:** gana quien llegue último de un extremo al otro del pasillo, caminando, sin parar nunca.

Cada familia inventa las suyas. Adaptad distancias y tiempos para que todos tengan opciones, y mezclad equipos de mayores y pequeños.

**5. La historia más disparatada**

Escribid en papelitos palabras sorpresa («dragón», «pijama», «helado»…) y metedlas en un cuenco. Empieza uno con «Había una vez…» y cada persona añade una frase incluyendo la palabra que saque. Al final, alguien lee la historia entera en voz alta. Si queréis, dibujadla o grabadla con el móvil.

**Ambiente sin comprar nada**

- Cambiad la luz: lámparas tenues y una manta en el suelo ya cambian el ambiente.
- Poned una lista de canciones de fondo, una por jugador.
- Dad nombre al equipo («Los Calcetines Voladores») y haced medallas de papel.
- Dejad el marcador en una hoja pegada a la pared; los puntos se pueden dar también por «mejor risa» o «mejor dibujo».

**Que cada semana organice uno**

Turnaos: cada noche, una persona es la anfitriona o el anfitrión. Elige los juegos, prepara los papeles y decide el nombre de la noche. Los más peques también pueden, con ayuda. Apuntad la fecha en el Calendario de PEPA para que todos la esperen.

Y recordad: lo que se recuerda de estas noches nunca es quién ganó, sino quién se rio más 😄$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-19-tarros-de-cristal$b$, $b$hogar$b$, $b$manualidades-decoracion$b$, $b$Antes de tirar un tarro de cristal, ¡dale otra oportunidad! 🫙❤️$b$,
       $b$Nuestras abuelas guardaban cada tarro de cristal como un tesoro, esperando la próxima tanda de mermelada. Y seguro que en vuestra familia alguien prepara tomate casero. Antes de llevar el tarro al contenedor, aquí van seis ideas para darle una segunda vida.

**1. Recetas familiares en pequeñas cantidades.** Mermelada, tomate o salsa de toda la vida, preparados en poca cantidad para consumirlos en pocos días y guardarlos en la nevera. Es una forma preciosa de recuperar la receta de la abuela 🍅

**2. Desayuno listo en la nevera.** Mezclad en el tarro avena, leche y yogur, y añadid plátano en trozos. Cerrad y guardad en la nevera por la noche: al día siguiente, desayuno hecho. Cada uno puede personalizar su tarro con la fruta que más le guste.

**3. Un tarro de galletas para regalar.** Poned los ingredientes secos en capas dentro de un tarro decorado con tela o lazo. Por ejemplo, para un tarro de un litro:

- 150 g de harina mezclada con media cucharadita de bicarbonato y una pizca de sal
- 100 g de azúcar moreno
- 100 g de copos de avena
- 100 g de pepitas de chocolate

En la etiqueta, escribid las instrucciones completas: «Precalienta el horno a 180 °C. Vierte el contenido del tarro en un bol y añade 120 g de mantequilla blanda y 1 huevo. Mezcla bien, haz bolitas, colócalas separadas sobre papel de horno, aplástalas un poco y hornea de 10 a 12 minutos. Deja enfriar antes de comer». Anotad también los ingredientes (por si hay alergias) y pedid que se prepare en las próximas semanas.

**4. Cubremacetas para hierbas aromáticas.** Meted una maceta pequeña con agujeros de drenaje dentro del tarro, con perejil, cebollino o menta. Tras regar, vaciad el agua que quede en el fondo del tarro para que las raíces no se encharquen.

**5. El tarro de planes familiares.** Cada uno escribe o dibuja en papelitos planes que le apetezcan: «picnic en el parque», «noche de pelis con manta», «hacer pizzas». Doblad los papeles y metedlos en el tarro. Cada fin de semana, sacad uno al azar, y el plan que salga es el plan que hacéis.

**6. El tarro de los recuerdos bonitos.** A lo largo del año, cada vez que pase algo que os haga sonreír, escribidlo en un papel con la fecha y guardadlo en el tarro. El 31 de diciembre, o en un cumpleaños, abridlo y leed juntos todo lo bueno del año ✨

Antes de reutilizar cualquier tarro, comprobad que esté limpio y sin grietas ni bordes saltados, que la tapa no esté deteriorada y que sea adecuado para el uso que le vais a dar.$b$,
       $j${}$j$::jsonb, $b$tip$b$),
      ($b$inicial-20-pequenos-exploradores$b$, $b$hogar$b$, $b$actividades-familia$b$, $b$El paseo de los pequeños exploradores: 6 misiones para descubrir lo que nunca vemos 🔎🌳$b$,
       $b$Con unos veinte minutos y ganas de mirar, el paseo de siempre se convierte en una aventura. Elegid una misión (o las que queráis) antes de salir, y que sean los peques quienes lleven la brújula 🧭

**1. Detective de los cinco colores.** Antes de salir, elegid cinco colores, uno de ellos difícil (morado o naranja). Cada explorador tiene que encontrar un objeto o un elemento natural de cada color. Vale una flor, un cartel, una puerta o una piedra, pero no vale la ropa que llevéis puesta. Gana quien encuentre el más sorprendente 🎨

**2. Bingo de sonidos.** Parad un minuto en silencio y escuchad con los ojos cerrados. Cada uno cuenta cuántos sonidos distintos ha oído: un pájaro, una campana, unos pasos, un coche lejano, el viento… Luego los comparáis. Siempre hay alguien que ha oído algo que los demás no. Podéis hacer un bingo dibujando antes seis sonidos posibles.

**3. Fotografía misteriosa.** Un jugador fotografía de cerca un detalle de la calle (la textura de un muro, un buzón, una hoja) sin decir dónde está. Los demás tienen que localizarlo durante el paseo. Fotografiad solo objetos, nunca a personas desconocidas.

**4. Tres cosas nuevas en una calle conocida.** Elegid una calle que pisáis todos los días y buscad tres cosas que no habíais visto nunca: una por encima de vuestra cabeza, otra a la altura de los pies y otra que se pueda oler o escuchar. Casi nadie mira hacia arriba, y ahí hay tejados, balcones, nidos y cornisas.

**5. Guardianes de la naturaleza.** Observad hojas caídas, cortezas, árboles e insectos sin tocarlos ni molestarlos y sin arrancar nada. ¿Cuántas formas de hoja distintas encontráis? ¿Qué hace esa hormiga? Al volver a casa, cada uno dibuja lo que más le llamó la atención. No probéis ni cojáis plantas, bayas ni setas.

**6. Ruta sorpresa.** En cada cruce seguro, y con un adulto decidiendo cuándo se puede cruzar, un explorador distinto elige la dirección: izquierda, derecha o recto. Fijad antes una hora de vuelta y una zona que conozcáis para no alejaros demasiado.

Al volver, subid vuestras mejores fotos a la Galería de PEPA y tendréis un álbum de exploradores para repasar cuando queráis 📷

Porque a veces no hace falta ir muy lejos para descubrir algo nuevo. Solo mirar con otros ojos.

¿Qué es lo más curioso que habéis descubierto paseando por vuestro barrio o pueblo?$b$,
       $j${}$j$::jsonb, $b$tip$b$)
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
