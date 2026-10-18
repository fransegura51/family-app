# Plantilla editorial del artículo de menú semanal de Comunidad

Este archivo NO es una publicación: empieza por `_` y ni el generador de la semilla (`scripts/build-community-seed.mjs`) ni los tests lo cargan como una de las
20 publicaciones iniciales. Sirve para escribir con el mismo estilo el artículo que acompaña a cada menú semanal. La publicación del menú (sección Recetas,
tema `menus-planificacion`, tipo menú) lleva debajo el importador, que se queda tal cual.

## Reglas (se comprueban con `validateWeeklyMenuArticle`, en `src/domain/communityMenuArticle.ts`)

1. Artículo BREVE: como máximo 3.000 caracteres (el de estreno ronda los 2.000). Texto plano de Comunidad: negritas con `**` y viñetas con `- `; sin enlaces,
   títulos `#`, tablas ni HTML.
2. Después de la introducción va SOLO el resumen de la semana: siete días (Lunes a Domingo, en ese orden), cada uno con una línea de comida y otra de cena,
   con su acompañamiento tras «con». Los platos son exactamente los del menú (mismo título, empezando en minúscula tras «Comida:» o «Cena:»).
3. En el texto NO van tiempos de preparación (los enseña el importador), NI trucos de congelación, NI explicaciones largas, NI «por qué funciona»,
   NI listas de trucos o de seguridad.
4. Los consejos propios de cada plato van en la FICHA de su receta (payload del menú), con estos límites del servidor:
   - `tip` (el «Truco de Pepa», que se importa a las notas de la receta): de 1 a 400 caracteres; solo en recetas con pasos, no en acompañamientos sencillos.
   - `freeze`: `{ "ideal": true, "note": "…" }`, nota de 1 a 300 caracteres (qué congelar, cómo repartir, descongelar en la nevera, recalentar hasta que hierva una
     sola vez, no volver a congelar). Solo si el plato se congela bien; el resto no lleva `freeze`.
   - `time`: `{ "active": n, "total": n }` en minutos (enteros, total >= active).
   - Seguridad alimentaria (carne y huevo bien hechos, espinas del pescado, tabla y manos tras tocar carne o pescado crudos, conservación de las sobras y
     alérgenos presentes) dentro de los pasos de cada receta.
5. La última línea recuerda, en una frase, que cada receta trae sus consejos de conservación y seguridad, que hay que revisar etiquetas si hay alergias o
   intolerancias y que es una propuesta de ideas, no una dieta ni un plan nutricional.
6. Esta plantilla no activa nada: la publicación automática de menús (`weekly_menu_autopublish`) sigue en 0 y cada menú se revisa y aprueba a mano.

## Versión de ESTRENO (la del primer menú)

```
¡Estrenamos los menús semanales de Pepa! ❤️

Sabemos que pensar cada día qué preparar para comer y cenar puede convertirse en otra tarea más.

Por eso, todos los sábados Pepa te traerá un nuevo menú para la semana siguiente, con siete comidas y siete cenas variadas, prácticas y pensadas para facilitar la organización familiar.

Encontrarás recetas fáciles, ideas para ahorrar tiempo y platos que puedes preparar con antelación.

Puedes importar el menú completo, elegir días o recetas individuales, ajustar las raciones y añadir los ingredientes a Compras.

Pepa te da las ideas. Tú decides cómo organizarte. ❤️
```

## Versión BREVE para los menús siguientes (cada sábado)

```
Ya está aquí el menú de la semana que viene: siete comidas y siete cenas para que no tengas que pensar qué cocinar. ❤️

Puedes importarlo entero, elegir días o recetas sueltas, ajustar las raciones y añadir los ingredientes a Compras.
```

## Resumen de la semana (igual en las dos versiones)

```
**Este es el menú de esta semana** (cantidades para 4 personas):

**Lunes**

- **Comida: [plato principal en minúscula]**, con [acompañamiento].
- **Cena: [plato principal en minúscula]**, con [acompañamiento].

**Martes**

(… hasta Domingo; si un plato no tiene acompañamiento: «- **Comida: [plato].**»)
```

## Cierre (igual en las dos versiones)

```
Cada receta trae sus propios consejos de conservación y seguridad. Si en casa hay alergias o intolerancias, revisa las etiquetas y adapta los platos con cuidado: es una propuesta de ideas para organizarte, no una dieta ni un plan nutricional.
```

## Antes de proponer el menú

- Ejecutar `validateWeeklyMenuArticle(texto, payload.menu)` (lo hace `npx vitest run src/domain/communityMenuArticle.test.ts` con el menú vigente) y arreglar lo que avise.
- Repasar que los consejos del artículo anterior que valgan para este menú están ya en `tip` o `freeze` de sus recetas.

Criterio editorial general de todos los artículos: ver `_criterio-editorial.md` (introducción breve, contenido útil, recetas importables desarrolladas una sola vez en sus fichas).
