# Evaluación del comparador de precios (COMP-2, 26/10/2026)

Datos reales de producción (solo lectura, 1.188 precios en 3 familias; la familia principal tiene 1.068, el 99 % de Mercadona o Hiperber). Medido **antes** de que nadie rellene formatos nuevos.

## 1. ¿Qué porcentaje de productos tiene datos suficientes para comparar?

| Medida | Resultado |
|---|---|
| Productos con algún precio | 470 |
| Con formato fiable hoy (vendido por kg o con el tamaño en el nombre) | **55 (11,7 %)**: 13 por kg + 42 con tamaño en el nombre |
| Sin formato utilizable | 415 (88,3 %) |
| Comprados más de una vez | 198 |

La causa es el ticket: los nombres vienen abreviados y sin tamaño («LECHE ASTURIANA S», «CERVEZA ESTRELLA», «HIELO CUBITO BOLS»). Por eso hacía falta guardar el formato aparte.

## 2. ¿Cuántos pueden compararse de verdad entre establecimientos?

* Productos con precio en **dos o más tiendas con el mismo nombre**: **1** de 470.
* Con formato fiable **y** dos tiendas: **1**.
* Se probó el motor real con 14 parejas Mercadona ↔ Hiperber que a una persona le parecen «lo mismo» (leche, cerveza, picos, croissant, magdalena, galletas, queso, burger, salchicha…): **13 salen como «distintos» y 1 como «posible»** (hielo). Los nombres abreviados y las marcas distintas hacen que el motor, a propósito, no las empareje solo.

**Conclusión: el cuello de botella no es el tamaño del envase, es saber que dos productos son «el mismo».** Con los formatos perfectamente rellenados, la comparación entre tiendas seguiría siendo prácticamente nula con estos datos, porque la familia compra casi todo en una sola tienda por producto y los productos de cada tienda se llaman distinto.

## 3. ¿Son fiables las comparaciones?

Las que salen lo son: solo se comparan precios exactos de la misma base (€/kg, €/l, €/ud), con fecha, y se avisa de que son precios históricos pagados por la familia. Un pack de 6 y uno de 12 se comparan por €/l o €/ud, no por el precio del paquete. No se compara lo que no tiene formato.

## 4. ¿Cuántas preguntas añade al registrar compras?

Por diseño, pocas: el formato se pregunta solo si el producto (o un equivalente reconocido) ya se compró en otra tienda, y solo en un apartado plegado. Con los datos actuales eso son **0 a 2 preguntas por ticket**, porque casi no hay productos reconocidos en dos tiendas. Lo que el nombre o dos compras anteriores iguales ya dicen se aplica sin preguntar. Todo lo demás es un apartado opcional plegado («Completar otros productos») que nadie tiene que abrir.

## 5. ¿Aporta información práctica?

* **Hoy: muy poca** (1 producto comparable). La vista «Dónde habéis pagado menos» saldrá prácticamente vacía con los datos actuales.
* La parte con más valor práctico que ya existe y sí funciona con estos datos es la **evolución en el tiempo** de un mismo producto en una misma tienda (198 productos comprados más de una vez).

## 6. Propuesta concreta de simplificación (antes de ampliar nada)

1. **No ampliar la petición de formatos.** Mantener el apartado plegado actual (cuesta casi nada) pero no pedir más datos.
2. **Resolver el verdadero problema —saber que dos productos son el mismo— con un solo gesto:** en la ficha de un producto, «Es el mismo que…» con un buscador de productos de otra tienda (ya existe «¿Es lo mismo? Sí/No» solo cuando el motor sospecha). Una decisión por pareja, que se recuerda para siempre.
3. Si en 2–3 meses el listado «Dónde habéis pagado menos» sigue vacío, **retirar** la petición de formato y dejar solo la ficha de evolución de precios.

Esta propuesta **no está implementada**: queda para decidir.

## Actualización 26/10/2026 — nuevo diseño con productos comunes (sin publicar)

La evaluación anterior concluía que el cuello de botella era **reconocer que dos productos son el mismo**, no el tamaño. El nuevo diseño ataca justo eso:

* **Productos comunes**: un artículo pertenece a un solo grupo (por ejemplo «Leche semidesnatada») y se compara con todos los demás del grupo por €/l, €/kg o €/ud, aunque cambien tienda, marca y envase. Ya no hace falta emparejar de dos en dos.
* **Cola «Emparejar»** priorizada, con búsqueda de cualquier producto o artículo, sin límite de tiendas y sin excluir productos no alimentarios.
* **Formatos**: al registrar la compra (por línea, para todos los artículos o con foto del envase).
* **Medición con datos reales (27/10/2026)**: se pasó el motor real (`relationBetween`, `productSignature`, lectura de formato del nombre) por los 290 artículos de supermercado de la familia principal (Mercadona, Hiperber, Charter; sin Amazon ni tiendas de un solo uso). Resultado:
  * **Hoy (sin agrupar nada)**: **1** comparación útil real (el pepino, por kg, entre Mercadona y el mercado). El motor solo reconoce solo **2 pares entre tiendas** (banderillas y limón, «idénticos»), y ninguno tiene formato, así que no dan precio por unidad.
  * **Formato ya legible**: **33 de 290 (11 %)** (por kg o con el tamaño en el nombre: «500G», «P-6», «1L»…). El resto necesita el formato que se indica al registrar la compra.
  * **Agrupables por la persona**: unos **24 productos comunes reales** (cerveza, cerveza sin alcohol, refrescos de cola y de naranja, leche, croissants, picos, magdalenas, galletas, hielo, bolsas, mini empanadas, hamburguesas, quesos, longanizas, limón, fuet, patatas fritas, batidos, rollos de cocina, panecillos…) que juntan **unos 100 artículos (≈ 35 %)** con compras en **dos o más tiendas**. Las palabras clave solas sugerirían 20 grupos con 66 artículos, con falsos amigos («bizcocho choco» frente a «bizcocho nuez», «gel baño» frente a «croissant m/baño»): por eso la agrupación es una decisión de la persona y no automática, salvo los idénticos.
  * **Comparaciones fiables esperables**: cada grupo se comparará por €/l, €/kg o €/ud en cuanto sus artículos tengan formato; estimación prudente **10–15 comparaciones útiles** con unos 60–90 minutos de agrupar y completar formatos repartidos en varias sesiones (la cola va por orden de utilidad y se puede dejar a medias). No se ha agrupado ningún artículo en nombre de la familia.
  * Otras dos familias (72 y 48 precios): casi sin productos repetidos entre tiendas; no hay comparaciones esperables hoy.

### Coste estimado de «Fotografiar envase» (no medido)

* La función usa la IA que PEPA ya tiene (`ai_config`: Gemini, modelo `gemini-flash-lite-latest`) con su control de interruptor, cuenta adulta y registro de uso; el **tope propio es 40 lecturas al día por familia**.
* Una lectura = de 1 a 3 imágenes reducidas en el móvil (del orden de 300–1.300 tokens de entrada por imagen) + unos 700 tokens de instrucciones y unos 150 de salida: unos **3.000 tokens de entrada y 150 de salida como máximo**.
* Los precios públicos de los modelos Flash-Lite varían según la versión y las fuentes consultadas no coinciden (de 0,10 $ a 0,30 $ por millón de tokens de entrada y de 0,40 $ a 2,50 $ por millón de salida; hay que confirmarlo en la página oficial de precios de Google antes de fiarse). Con el precio más alto citado, una lectura costaría **alrededor de 0,0013 $ (≈ 0,1 céntimo)**; con el más bajo, **≈ 0,0004 $**. El máximo diario por familia (40 lecturas) quedaría por debajo de **0,06 $**.
* Hoy la IA corre en el nivel gratuito de Google AI Studio, así que el coste directo sería cero mientras no se supere su límite.
* Para gastar lo mínimo: las fotos se reducen en el móvil, solo se llama cuando la persona pulsa «📷 Fotografiar envase», un formato ya confirmado se reutiliza en las compras siguientes (no se vuelve a preguntar) y el EAN, cuando se lee, se guarda aparte como ayuda. **No se guardan las fotos.**

## Agrupación automática sobre el historial real (27/10/2026)

Motor `src/domain/autoGrouping.ts` aplicado a los 403 artículos con compras de la familia principal (ejecución real, no estimación):

- **12 productos comunes propuestos con 24 artículos**, todos «pendientes de revisar»: 5 juntan tiendas distintas (banderilla dulce, batido de cacao, limón, mini empanadillas de pisto, picos campero) y 7 son el mismo producto en otro tamaño dentro de Mercadona (burger, guacamole, naranja zero, papel higiénico, patata, tostada 0,0, refresco Coca-Cola de Hiperber).
- **Comparaciones útiles al instante: 3** (burger 500 g/1 kg, guacamole 200/500 g, patata 3/5 kg: el nombre ya trae el tamaño, son provisionales hasta confirmar). Las otras 9 necesitan el formato (cuánto contiene cada envase) para compararse por litro o kilo.
- Quedan **pendientes de emparejar ≈ 375 artículos**: el motor no agrupa por «tipo de producto» (cervezas de distintas marcas, croissants de distinto relleno…) porque eso ya son decisiones de la familia, no coincidencias fiables; siguen saliendo en «Emparejar» con su sugerencia.
- Idempotente: una segunda pasada sobre los datos ya agrupados propone 0 grupos nuevos. Huellas de `product_prices`, `products` y `receipts` idénticas antes y después.
