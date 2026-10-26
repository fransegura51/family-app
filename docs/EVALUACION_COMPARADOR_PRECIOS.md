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
