# Comprobación práctica en iPhone y Android — Compras y Economía (24/10/2026)

Publicado el 24/10/2026 (commit `c08095d`): https://fransegura51.github.io/family-app/
Las apps de iPhone y Android cargan esta misma web: basta con **cerrar del todo la app y volver a abrirla** (si sigue la versión vieja, abrirla una segunda vez).

**Regla de oro:** usad datos pequeños y reconocibles (importes como 1,11 €, comercio «PRUEBA»). Al terminar, borrad cada compra de prueba con «Eliminar compra» (el borrado seguro es parte de lo que se comprueba) y comprobad que Economía y las carteras vuelven a como estaban. No toquéis movimientos del banco.

Cada prueba: hacedla en iPhone y en Android y apuntad Sí / No / Notas. Un «No» no se corrige en el momento: se anota y se me pasa.

| # | Qué comprobar | Cómo (2-3 min) | Debe pasar |
|---|---|---|---|
| 1 | **Compras manuales y líneas de ticket** (COM-1, COM-2) | Compras → Tickets → «✍️ Sin ticket»: tienda PRUEBA, 1,11 €, quién pagó y forma de pago. Guardar. Luego «📷 Con ticket», elegir una foto y, **sin pulsar «Leer ticket»**, pulsar «+ Añadir productos a mano», escribir 2 líneas y guardar | Se guarda la compra; las líneas salen en el historial; el aviso de importes dice si cuadra; una línea sin precio no se guarda |
| 2 | **Marcar «Comprado»** | En la lista, marcar un producto como comprado | Solo cambia de estado; no aparece en el Historial de precios ni crea gasto |
| 3 | **Catálogo compartido y clasificación** (CAT-1) | Añadir en un ticket una línea nueva (p. ej. «Lasaña», «Rúcula») | Se clasifica sola con la categoría razonable; se puede corregir; la corrección se recuerda en la siguiente |
| 4 | **Comparador de precios** (COMP-1) | Historial de precios → un producto que hayáis comprado en 2 supermercados; y la lista de la compra con ese producto | Precio por kg/l/ud comparable, ficha por tienda con fecha, aviso si el precio es antiguo; «es el mismo / equivalente / distinto» se puede cambiar |
| 5 | **Carteras de efectivo** (EFE-1) | Economía → Efectivo: crear una cartera de prueba con 20 € (opcional: es opcional, la app funciona sin ella) | Saldo correcto; traspaso entre carteras y «retirada del banco» solo mueven lo indicado |
| 6 | **Pago mixto** | Compra de PRUEBA de 6,00 € pagada 2,00 € en efectivo + 4,00 € con tarjeta | **Un solo gasto de 6,00 €**; la cartera baja 2,00 €; solo los 4,00 € quedan pendientes de casar con el banco |
| 7 | **Devolución / reembolso** | En esa compra: «Devolver» 1,00 € (efectivo) | Aparece como ingreso vinculado a la compra; la cartera sube 1,00 €; la compra muestra lo devuelto |
| 8 | **Detección de duplicados** | Apuntar una compra a mano con el mismo importe y fecha que un ticket que ya exista | Avisa de que puede ser la misma; «unir» no crea un segundo gasto; se puede deshacer |
| 9 | **Integración con Economía** (ECO-1) | Mirar Economía → Movimientos y el resumen del mes tras las pruebas 1-8 | Cada compra cuenta **una vez**; el efectivo no aparece como cargo bancario; devoluciones restan; «Eliminar compra» deja carteras y totales como antes |
| 10 | **Banco (no hacer nada)** | Tras la próxima sincronización (03/09/15/21 UTC) | Los cargos del banco no duplican las compras de prueba; si hay un pago mixto real, solo se casa la parte de tarjeta (yo lo reviso en la base de datos) |

**Qué me pasáis:** la tabla rellenada (Sí/No) y, si algo falla, una captura y el paso. Hasta entonces CAT-1, COM-1, COM-2, COMP-1, EFE-1 y ECO-1 siguen como «Implementado, pendiente de validación real»; solo pasan a «Aprobado» con vuestra confirmación expresa.
