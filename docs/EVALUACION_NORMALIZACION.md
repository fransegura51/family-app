# Evaluación del catálogo maestro y de la normalización de productos

Documento del bloque «Catálogo maestro y normalización inteligente» (NORM-1, 27/10/2026). Explica **cómo hacer la prueba limpia con una familia sin historial**, qué mide el informe y qué cifras hay hoy.

Regla de esta evaluación: **no se presenta una estimación como un resultado medido.** Lo que se mide sobre todos los artículos sale solo; los aciertos (producto, clase, formato) solo cuentan lo que una persona ha revisado.

## 1. Prueba limpia con una familia sin historial

La prueba no necesita un entorno aparte. El aislamiento sale de tres cosas:

1. **Una familia distinta** (la que creéis o elegís). Sus tickets, clases y grupos son suyos; no se tocan los de la familia actual.
2. **El informe no usa nada guardado para responder.** No consulta el aprendizaje compartido, no usa las clases que haya guardadas en los productos ni los grupos del comparador. Solo aplica el catálogo maestro (versión indicada en el informe) y las reglas generales. Lo que ya esté clasificado o agrupado a mano en esa familia se cuenta **aparte** como «intervención de la persona».
3. **El aprendizaje compartido sigue intacto** para el uso normal de PEPA; la prueba simplemente no lo mira.

Pasos (todo desde el móvil o el ordenador, sin comandos):

1. Entra con la familia de prueba (una familia nueva, sin compras).
2. Registra en ella **los mismos tickets originales** que ya habéis usado durante el desarrollo: Compras → «Subir ticket» → foto o PDF → «Leer ticket» → revisar → guardar. No hace falta clasificar ni emparejar nada a mano.
3. Entra en **Centro de Administración → Sistema → «🧪 Evaluación del catálogo de productos»** (solo cuentas propietarias) y pulsa **«Calcular el informe»**.
4. Mira los números de «Medido sobre todos los artículos» y recorre las listas «No identificados», «Probables» y «Clase distinta de antes».
5. Abre **«Ver la muestra»** (40 artículos al azar, reproducible) y di, para cada uno, si PEPA acertó el **producto**, la **clase** y, si leyó alguno, el **formato**. Con «Otra muestra» se saca otra distinta.
6. Pulsa **«📋 Copiar el informe»** y pégalo donde queráis guardarlo (queda con la fecha y la versión del catálogo).

Para comparar con el comportamiento anterior con los mismos tickets: la columna «Clase frente al clasificador anterior» del informe lo hace (igual / nueva / distinta / solo la antigua). Para comparar el **antes y el después de las agrupaciones**, abrid «Comparar precios» en la familia de prueba: PEPA propone sus grupos como «pendientes de revisar» y el informe cuenta los que habría propuesto.

Contaminación que hay que evitar: no confirméis grupos ni clases en la familia de prueba antes de calcular el informe (aunque, si lo hacéis, el informe los separa y no los usa).

## 2. Qué mide el informe

Sobre **todos** los artículos de la familia (sin juicio humano):

- Identificados con seguridad / probables / solo la clase / no identificados.
- Identidad completa (los que pueden agruparse solos: producto + atributos obligatorios conocidos).
- Clase frente al clasificador por palabras clave anterior.
- Formato leído del nombre (sin inventar): reconocido / al peso / falta.
- Agrupaciones que PEPA propondría partiendo de cero, cuántas con varias tiendas, comparaciones útiles ahora y artículos con compras sin agrupar.
- Intervenciones ya hechas por la persona (clase fijada a mano, grupos puestos a mano): no cuentan como automático.

Sobre la **muestra revisada** (juicio humano): producto correcto, clase correcta, identificación completa (producto **y** clase: una clase acertada no basta), formato correcto e identificaciones incorrectas. El resultado dice siempre «revisados X de Y».

## 3. Cifras de hoy (con corpus de prueba, NO con tickets reales)

El normalizador se ha medido con dos corpus redactados a mano para este bloque (`src/domain/catalog/corpus.ts` y `corpusB.ts`). **No salen de los tickets de ninguna familia**, así que no sustituyen a la prueba limpia; sirven de red de seguridad.

| | Corpus A (de ajuste, 280 líneas) | Corpus B («ciego», 183 líneas) |
|---|---|---|
| Producto identificado correctamente | 280 de 280 | **primera pasada sin ajustar: 168 de 183** (10 incorrectas, 5 sin identificar) → tras corregir los huecos que destapó: 182 de 183 |
| Clase correcta (catálogo) | 277 de 277 | primera pasada: 167 de 176 (5 incorrectas, 4 sin identificar) → después: 177 de 177 |
| Clase correcta con el clasificador anterior | 151 de 277 (35 incorrectas, 91 sin respuesta) | 83 de 177 (34 incorrectas, 60 sin respuesta) |
| Atributos (talla, etapa, tipo de leche…) | 24 de 24 | primera pasada: 13 de 16 → después: 16 de 16 |
| Formato leído del nombre | 15 de 15 | 21 de 21 |
| Identificaciones «seguras» incorrectas | 0 de 268 | primera pasada: 10 de 167 → después: 1 de 169 («MEJILLONES NATURAL»: ¿fresco o en conserva?) |
| Artículos que se agruparían solos | 261 (0 incorrectos) | 164 (1 incorrecto) |

Lectura honesta: la segunda columna después de los ajustes **ya no es ciega**. Lo que sí es una medición limpia es la **primera pasada del corpus B** (antes de ajustar nada): 168/183 (92 %) de productos, 10 errores «seguros» (6 %), frente a un clasificador anterior que solo acertaba la clase en 83 de 177 (47 %). Con tickets reales habrá más huecos: el catálogo es una lista curada de 586 entradas y no reconoce todo.

## 4. Límites conocidos

- El catálogo no aprende de las correcciones de las familias; el aprendizaje compartido sigue siendo por texto y clase. Aprender identidades compartidas (producto, no solo clase) sería un paso posterior.
- Lo que el catálogo no reconoce queda «sin clasificar» o con la regla por palabras anterior; nunca se inventa.
- «MEJILLONES NATURAL», «LASAÑA» a secas y otros nombres ambiguos se resuelven con una decisión explícita del catálogo (y se pueden corregir a mano).
- Las tres clases nuevas (Alimentación infantil, Platos preparados, Higiene y cuidado del bebé) vienen de la migración 0334, aplicada en producción el 27/10/2026 (las familias nuevas las reciben al crearse).
- La lectura de envases con IA y la validación en móvil siguen pendientes de las pruebas reales de la persona responsable.
