# Ficha de PEPA para la App Store (borrador, 14/10/2026)

Textos listos para copiar en App Store Connect cuando la cuenta de Apple (titular: Paco) esté activa. Los límites son los de Apple.
**El repositorio es público: aquí NO va ninguna contraseña.** La cuenta de prueba para el revisor se escribe solo en App Store Connect.

## Datos básicos
| Campo | Valor | Límite |
|---|---|---|
| Nombre | `PEPA: Organizador familiar` | 30 (son 27) |
| Subtítulo | `Calendario, compra y más` | 30 (son 24) |
| Identificador (Bundle ID) | `es.pepafamilyapp.app` | |
| Idioma principal | Español (España) | |
| Categoría principal | Estilo de vida (Lifestyle) | |
| Categoría secundaria | Productividad | |
| URL de privacidad | https://fransegura51.github.io/family-app/privacidad.html | |
| URL de marketing | https://fransegura51.github.io/family-app/ | |
| URL de soporte | https://fransegura51.github.io/family-app/soporte.html (creada el 14/10/2026) | |
| Derechos de autor | `2026 Francisco José Segura Hortelano` | |

Si «PEPA» ya está cogido por otra app, Apple lo dirá al crear la ficha. Plan B para el nombre: `PEPA Familia`, `PEPA: Agenda familiar`.

## Texto promocional (170 caracteres, se puede cambiar sin nueva revisión)
```
Toda tu familia en un solo sitio: calendario, lista de la compra, menús, gastos y ubicación. Y Pepa, la asistente que lo apunta todo con tu voz.
```

## Descripción (máx. 4000)
```
PEPA es la app para organizar la vida de toda la familia en un solo sitio, con una asistente que te entiende cuando le hablas.

Dile «Pepa, apunta leche y huevos en la compra» o «Pepa, el jueves tengo dentista a las cinco» y ella lo guarda por ti.

CALENDARIO FAMILIAR
Los planes de todos, cada uno con su color. Vista de mes, semana, día y agenda. Avisos para que nadie se olvide de nada y cumpleaños de la familia.

LISTA DE LA COMPRA
Una lista compartida que se actualiza al momento. Apunta por voz, guarda los tickets y consulta el historial de precios.

COCINA
Menú semanal, tus recetas y «¿Qué cocino hoy?»: dile qué ingredientes tienes y Pepa te propone qué cocinar. También busca recetas en internet.

ECONOMÍA DEL HOGAR
Gastos, presupuestos y previsión de pagos para llegar a fin de mes con tranquilidad.

UBICACIÓN (SOLO SI QUIERES)
Cada persona decide si comparte su ubicación. Recibe un aviso cuando alguien llega a casa, al cole o al trabajo, o pregunta: «Pepa, ¿dónde está Eric?».

EVENTOS Y CELEBRACIONES
Organiza cumpleaños y comidas: invitados, menú, quién lleva qué y lista de regalos.

DOCUMENTOS, FOTOS Y MÁS
Guarda los documentos importantes de la familia y compártelos solo con quien quieras. Álbum familiar, lista de deseos, premios para los más pequeños y contactos de confianza.

TU FAMILIA, PRIVADA
Cada familia tiene su espacio y nadie más lo ve. Tú decides qué se comparte y con quién. Puedes borrar tu cuenta y tus datos cuando quieras desde la propia app (Familia → Borrar mi cuenta).

Necesitas una cuenta para entrar. Algunas funciones (avisos, ubicación, micrófono) piden permiso y son opcionales.
```

## Palabras clave (100 caracteres, separadas por comas, sin espacios)
```
familia,calendario,compra,lista,recetas,menú,agenda,gastos,ubicación,cumpleaños,hogar,tareas,Pepa
```

## Novedades de la primera versión
```
Primera versión de PEPA para iPhone.
```

## Clasificación por edades
Cuestionario de Apple: sin violencia, sin contenido sexual, sin apuestas, sin acceso libre a internet para buscar contenido general (solo búsqueda de recetas), sin contenido generado por usuarios visible para desconocidos (todo es privado dentro de la familia). Se espera **4+**. Se contesta con calma en App Store Connect.

## Privacidad de la app («etiquetas de privacidad»)
Datos que se recogen, todos vinculados a la cuenta y **no usados para publicidad ni seguimiento**:
- Información de contacto: correo, nombre.
- Ubicación precisa (solo si la persona la activa).
- Contenido de usuario: fotos, documentos, eventos, listas.
- Información financiera: gastos que la familia apunta; con el banco conectado, movimientos (solo lectura).
- Identificadores: identificador de dispositivo para los avisos.
- Datos de uso: errores y estadísticas internas (sin publicidad).
«Seguimiento entre apps y webs» → **No**.

## Notas para el revisor (App Review Information)
Texto en inglés (los revisores lo leen en inglés):
```
PEPA is a private family organizer. Each family has its own space (calendar, shared shopping list, meal planning, household budget, documents, and optional location sharing) that only its members can access.

The app is a native shell that loads the PEPA web app over HTTPS (so features update without a new build) and adds native capabilities that a website cannot provide:
- Push notifications (reminders, arrival/departure alerts).
- Background location sharing, ONLY if the user opts in, with a clear explanation. Each person can turn it off at any time.
- Voice input: the user dictates to the assistant "Pepa" (speech recognition and speech synthesis of the device).
- Return links (es.pepafamilyapp.app://) when connecting Google Calendar or a bank account.

How to test:
1. Sign in with the demo account below ("Familia prueba").
2. Open the assistant (microphone button) and try: "Apunta leche en la compra", "El viernes tengo dentista a las cinco".
3. Location: Family → Location. Sharing is off by default and only starts after the user accepts.

Account deletion (guideline 5.1.1(v)): Family tab → bottom of the members list → "Borrar mi cuenta". The user must type BORRAR to confirm. Administrators can also delete the whole family.

No payments or subscriptions are offered in this version. There is no user-generated content visible to strangers: everything is private within each family.

Demo account:
  Email: (to be entered in App Store Connect only)
  Password: (to be entered in App Store Connect only)

Contact: Jennifer, jenniferhepburn@live.com
```

## Capturas de pantalla
Apple pide al menos las de **iPhone 6,9"** (1320 × 2868 px). Propuesta de 6 pantallas:
1. Inicio con las secciones.
2. Calendario familiar con colores.
3. Lista de la compra y Pepa apuntando por voz.
4. «¿Qué cocino hoy?» con recetas.
5. Ubicación con avisos de llegada.
6. Economía del hogar.

Hay que hacerlas con la «Familia prueba» (datos inventados, sin nombres reales). Se pueden sacar con el navegador a 440 × 956 px y reescalar, o con la propia app en el iPhone.

## Qué falta decidir
- Correo de contacto público: `pepafamily8@gmail.com` (decidido el 14/10/2026; ya está en la política de privacidad y en los términos).
- Teléfono público: el de Jennifer (decidido). Se escribe SOLO en App Store Connect, nunca en este repositorio (es público). Apple lo muestra en la ficha a los vendedores («traders») de la UE.
- Si en el futuro se cobra: precios y compras dentro de la app (Apple se queda 15-30 %).
