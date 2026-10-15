-- COMUNIDAD PEPA — 20 publicaciones SEMILLA como PROPUESTAS (no se publican solas).
--
-- La especificación pide arrancar con unas 20 publicaciones reales aprobadas y no fingir actividad de terceros. Estas son consejos oficiales de «Pepa»
-- (identidad oficial, claramente marcada «Consejo de Pepa»), útiles de verdad y sin consejos médicos, legales ni financieros. Se cargan como PROPUESTAS
-- (status = 'proposed') en el mismo circuito que el lote semanal: la administración las revisa en el Centro de Mando → Contenido oficial, las edita si quiere
-- y APRUEBA una a una (basta la aprobación de cualquiera de los dos administradores). Nada se publica sin esa aprobación.
--
-- NO es una migración: no se aplica sola. Se ejecuta a mano UNA vez, después de aplicar las migraciones 0260-0275 y con autorización (es un cambio de datos).
-- Es idempotente: no duplica propuestas con el mismo título.

do $seed$
declare
  r record;
begin
  for r in
    select * from (values
      ('recetas', 'trucos-de-cocina', 'Congela el pan en rebanadas',
       $b$Si en casa no se acaba el pan antes de que se ponga duro, **córtalo en rebanadas y congélalo**.

- Mete las rebanadas en una bolsa o recipiente con cierre.
- Cuando quieras una, sácala y **tuéstala directamente**, sin descongelar.
- Así tienes pan «recién hecho» y no tiras nada.$b$),
      ('recetas', 'aprovechamiento-alimentos', 'Plátanos muy maduros: no los tires',
       $b$Los plátanos con la piel muy oscura **siguen siendo perfectos para cocinar**.

- Pélalos, trocéalos y **congélalos** para batidos y helados caseros.
- Aplástalos con un tenedor para hacer un pan o un bizcocho de plátano: no hace falta casi azúcar porque ya son muy dulces.$b$),
      ('recetas', 'trucos-de-cocina', 'Pelar ajos sin esfuerzo',
       $b$Apoya el diente de ajo sobre la tabla y **aplástalo con el lado plano del cuchillo** (con un golpe firme de la palma). La piel se separa sola y se retira enseguida.

Si vas a usar muchos, mételos en un bote con tapa y **agítalos con fuerza unos segundos**: muchas pieles se sueltan.$b$),
      ('recetas', 'recetas-faciles', 'Tortilla francesa jugosa en 3 minutos',
       $b$Una cena rápida que nunca falla:

1. Bate 2 huevos con una pizca de sal.
2. Calienta una sartén con un poco de aceite a fuego medio-alto.
3. Echa los huevos y mueve la sartén suavemente 20 segundos.
4. Dobla la tortilla por la mitad y retírala **cuando todavía esté un poco jugosa por dentro**: seguirá cuajándose en el plato.$b$),
      ('recetas', 'menus-planificacion', 'Menú semanal en 10 minutos',
       $b$Planificar no tiene por qué ser un lío. Prueba esta fórmula:

- **2 días de legumbres** (lentejas, garbanzos…).
- **2 días de pescado o huevos**.
- **2 días de carne o pollo**.
- **1 día libre**: sobras, pizza casera o lo que apetezca.

Escribe el menú en PEPA y la lista de la compra sale sola. Dejar el domingo para decidir, y no el lunes a las 8, lo cambia todo.$b$),
      ('recetas', 'cocina-saludable', 'Más verdura sin que nadie se queje',
       $b$Si en casa cuesta que coman verdura, **escóndela en lo que ya les gusta**:

- Ralla o tritura zanahoria, calabacín o pimiento en el **sofrito** de la salsa de tomate.
- Añade espinacas a las **croquetas o albóndigas**.
- Tritura la verdura cocida en una **crema** y sírvela con picatostes.

Poco a poco puedes ir dejando trocitos más grandes.$b$),
      ('recetas', 'aprovechamiento-alimentos', 'Caldo casero con las sobras de verdura',
       $b$Guarda en una **bolsa en el congelador** las puntas de puerro, las cáscaras limpias de zanahoria, los tallos de apio y los restos de cebolla (sin partes estropeadas).

Cuando la bolsa esté llena, cúbrela con agua, hierve **45 minutos** y cuela. Tienes un caldo casero gratis. Congélalo en porciones.$b$),
      ('recetas', 'trucos-de-cocina', 'Hierbas frescas que duran meses',
       $b$Si compras un manojo de perejil, cilantro o albahaca y no lo gastas:

1. Pica las hojas.
2. Rellena una cubitera hasta la mitad y cúbrelas con **aceite de oliva**.
3. Congela.

Cada cubito se echa directamente a la sartén o a la sopa.$b$),
      ('recetas', 'aprovechamiento-alimentos', 'El pan duro tiene mil vidas',
       $b$Antes de tirar pan duro, piensa en esto:

- **Pan rallado**: tritúralo y guárdalo en un bote.
- **Picatostes** para sopas y ensaladas: dados con aceite al horno.
- **Torrijas** y **migas**: clásicos de aprovechamiento de toda la vida.$b$),
      ('recetas', 'recetas-faciles', 'Arroz blanco que sale bien siempre',
       $b$Una proporción fácil de recordar para el arroz de grano redondo o largo normal: **1 medida de arroz por 2 de agua**.

1. Sofríe el arroz un minuto con un poco de aceite y sal.
2. Añade el agua caliente, hierve y baja el fuego al mínimo con tapa.
3. A los **10-12 minutos** apaga el fuego y déjalo **5 minutos de reposo** sin destapar.

Cada variedad pide un poco más o menos agua: apunta en PEPA la proporción que mejor os sale.$b$),
      ('hogar', 'ahorro-economia', 'Haz la lista de la compra con la nevera abierta',
       $b$Antes de salir a comprar, **abre la nevera y la despensa y mira lo que ya tienes**.

- Apunta solo lo que falta.
- Lleva la lista (en PEPA la tienes compartida con tu familia).
- Evita ir con hambre: se compra más y peor.

Es el truco más simple para tirar menos comida y gastar menos.$b$),
      ('hogar', 'ahorro-economia', 'La regla de las 24 horas',
       $b$¿Un capricho que no es urgente? **Espera 24 horas antes de comprarlo**.

Si mañana lo sigues queriendo, cómpralo sin culpa. Muchas veces el impulso ya ha pasado. Para compras grandes, prueba con una semana.$b$),
      ('hogar', 'organizacion-familiar', 'Una reunión familiar de 10 minutos',
       $b$El domingo por la tarde, **10 minutos con toda la familia**:

- Qué hay esta semana (citas, cumpleaños, planes).
- Quién hace qué.
- Una cosa buena que pasó.

Con el calendario compartido de PEPA delante, nadie se olvida de nada y se evitan las discusiones del «yo no sabía».$b$),
      ('hogar', 'organizacion-familiar', 'Tareas de casa por turnos, a la vista',
       $b$Una tabla visible con **un turno por persona y semana** funciona mejor que pedirlo cada día:

- Cambia el reparto cada semana para que nadie se quede siempre con lo peor.
- Las tareas pequeñas (poner la mesa, sacar la basura) pueden hacerlas incluso los más peques.
- Celebrad cuando se cumple.$b$),
      ('hogar', 'crianza-educacion', 'Rutinas de mañana con un tablero visual',
       $b$A los peques les ayuda **ver** lo que toca hacer. Haz un tablero con dibujos o fotos: despertarse, vestirse, desayunar, lavarse los dientes, mochila.

- Que lo marquen ellos al terminar cada paso.
- Mantén siempre el mismo orden.
- Menos gritos y más autonomía.$b$),
      ('hogar', 'limpieza-hogar', 'Vinagre y bicarbonato: qué sí y qué no',
       $b$El **vinagre blanco** sirve para quitar cal de grifos y abrillantar cristales; el **bicarbonato**, para frotar sin rayar y neutralizar olores.

**Importante: nunca mezcles lejía con vinagre ni con amoniaco.** Se desprenden gases tóxicos. Usa cada producto por separado, ventila la estancia y enjuaga bien entre uno y otro.$b$),
      ('hogar', 'limpieza-hogar', 'La regla de los 5 minutos al día',
       $b$No hace falta una limpieza enorme cada fin de semana. Prueba **5 minutos al día** con un temporizador:

- Lunes: baño.
- Martes: cocina.
- Miércoles: polvo.
- Jueves: suelos.
- Viernes: lo que haga falta.

Entre varios en casa, aún menos. La casa se mantiene y el sábado queda libre.$b$),
      ('hogar', 'actividades-familia', 'Noche de juegos de mesa sin gastar',
       $b$Una noche a la semana, **apagad las pantallas** y jugad.

- Cartas, dominó, el «ahorcado» o el «tres en raya» no cuestan nada.
- Dejad que los peques elijan el juego por turnos.
- Poned una merienda o unas palomitas caseras y ya tenéis plan.$b$),
      ('hogar', 'manualidades-decoracion', 'Reutiliza los tarros de cristal',
       $b$Los tarros de conservas **lavados y sin etiqueta** se pueden usar para muchas cosas:

- Guardar legumbres, pasta y especias.
- Macetas para hierbas aromáticas.
- Portalápices o lámparas con una vela pequeña (con cuidado).

Para quitar la etiqueta, déjalos en agua caliente con jabón y frota con bicarbonato.$b$),
      ('hogar', 'actividades-familia', 'Paseo de 20 minutos con una misión',
       $b$Convierte el paseo en un juego: **una misión por salida**.

- Buscar tres hojas de formas distintas.
- Encontrar algo rojo, algo redondo y algo suave.
- Hacer una foto a cada árbol diferente.

Veinte minutos al aire libre le sientan bien a toda la familia, y sin gastar nada.$b$)
    ) as t(section, topic_id, title, body)
  loop
    if not exists (select 1 from public.community_official_items i where i.title = r.title and i.kind = 'tip') then
      insert into public.community_official_items (kind, section, topic_id, title, body, batch_week, proposed_by)
      values ('tip', r.section, r.topic_id, r.title, r.body, date_trunc('week', now())::date, 'Semilla inicial');
      insert into public.community_official_item_versions (item_id, version, snapshot)
      select i.id, 1, jsonb_build_object('kind', 'tip', 'section', r.section, 'topic_id', r.topic_id, 'title', r.title, 'body', r.body)
      from public.community_official_items i where i.title = r.title and i.kind = 'tip' order by i.proposed_at desc limit 1;
    end if;
  end loop;
end
$seed$;
