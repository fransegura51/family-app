---
name: pepa-busqueda-voz
description: Skill para implementar en "Pepa Family" la función de búsqueda por voz activada por wake word ("Hey Pepa"), tipo asistente de voz (similar a "Hey Google" / "Hey Siri"), que permite pedir búsquedas y acciones sin tocar el móvil (ej. "Hey Pepa, búscame un restaurante cercano"). Úsalo siempre que el usuario mencione "Hey Pepa", "búsqueda por voz", "asistente de voz", "wake word", "manos libres" o "búscame un restaurante" en el contexto de Pepa Family. Define la arquitectura por fases (PWA actual → app nativa futura), qué APIs usar en cada fase, cómo interpretar la intención de voz, y los límites gratuitos a respetar mientras el proyecto esté en fase de pruebas sin cobrar.
---

# Búsqueda por voz "Hey Pepa" — Pepa Family

Función de asistente de voz dentro de la app: el usuario dice **"Hey Pepa"**
seguido de una petición ("búscame un restaurante cercano", "añade leche a la
lista de la compra", "qué tengo mañana en el calendario") y la app ejecuta la
acción sin necesidad de tocar la pantalla.

Se implementa en **dos fases** porque hoy la app es una PWA y en el futuro
pasará a app nativa (store). No construir nada que dé por hecho la fase 2
antes de tiempo — cada fase debe funcionar de forma independiente y útil por
sí misma.

## Fase 1 — Ahora mismo, en la PWA (sin coste)

Objetivo: que la función sea usable ya, aunque no sea 100% manos libres
(los navegadores no permiten "escucha continua en segundo plano" de forma
fiable ni respetuosa con la batería/privacidad).

1. **Activación**: botón de micrófono flotante, siempre visible en la UI
   (no wake word continuo en esta fase). Al pulsar, empieza a escuchar.
2. **Transcripción de voz a texto**: usar la **Web Speech API** del
   navegador (`SpeechRecognition`), en español. Es gratuita y nativa del
   navegador — no requiere backend ni cuota.
3. **Interpretación de la intención**: enviar el texto transcrito a Gemini
   (ya integrado en el proyecto para la función de foto del frigo) con un
   prompt que clasifique la petición en una de las intenciones soportadas
   (ver tabla abajo) y extraiga los parámetros relevantes (ej. tipo de
   sitio buscado, texto de la tarea, fecha del evento).
4. **Ejecución de la acción** según la intención detectada.
5. **Feedback**: mostrar en pantalla lo que ha entendido Pepa antes de
   ejecutar (evita errores de interpretación) y responder con voz
   (`SpeechSynthesis`, también nativa del navegador, gratis) si el usuario
   tiene la app en modo manos libres (ej. usándola en el coche).

### Intenciones a soportar desde el inicio

| Intención | Ejemplo de frase | Acción |
|---|---|---|
| Buscar sitio cercano | "búscame un restaurante cercano" | Llamada a Google Places API con la geolocalización del navegador |
| Añadir a lista de la compra | "añade leche a la compra" | Inserta ítem en el módulo de compras |
| Añadir evento/tarea | "recuérdame recoger a Eric a las 5" | Inserta en calendario/tareas |
| Consultar calendario | "qué tengo mañana" | Lee y responde (por voz si está en modo manos libres) los eventos del día pedido |

Dejar la clasificación de intenciones como una lista fácil de ampliar
(no hardcodear un switch gigante) porque irán añadiéndose más con el tiempo.

### Búsqueda de sitios (el caso "restaurante cercano")

- Usar **Google Places API** (mismo ecosistema de Google Cloud que ya usáis
  para Gemini) para obtener resultados reales con nombre, distancia,
  valoración y enlace.
- Alternativa más simple para probar ya sin dar de alta la API: generar un
  enlace directo a Google Maps con la query y la ubicación
  (`https://www.google.com/maps/search/?api=1&query=...`) y abrirlo — cero
  coste, cero configuración, aunque menos integrado visualmente.
- Empezar por la alternativa simple (enlace a Maps) para validar el flujo
  completo de voz → intención → acción, y pasar a Places API cuando se
  quiera mostrar resultados dentro de la propia app.

### Permisos y privacidad

- Pedir permiso de micrófono y de geolocalización de forma explícita y
  contextual (justo antes de usarlos, no al abrir la app).
- No grabar ni almacenar audio — solo se procesa el texto ya transcrito.
  Dejarlo así de claro en la política de privacidad cuando se redacte.

## Fase 2 — App nativa, wake word real ("Hey Pepa" sin tocar el móvil)

Se activa cuando el proyecto pase de PWA a app nativa (store). No construir
esto todavía, pero dejar la lógica de intención/acción de la Fase 1
desacoplada de la entrada de voz, para poder enchufar aquí el wake word sin
reescribir el resto.

Dos caminos posibles, no excluyentes:

1. **Wake word propio con Picovoice Porcupine**: permite entrenar una
   palabra de activación personalizada ("Hey Pepa") con escucha en segundo
   plano de bajo consumo. Tiene plan gratuito para uso personal/bajo
   volumen — revisar límites exactos antes de escalar a muchas familias.
2. **Integración con el asistente del sistema** (Google Assistant App
   Actions / Siri Shortcuts): en vez de wake word propio, el usuario dice
   "Hey Google, pregunta a Pepa por un restaurante cercano" o se define un
   Shortcut de Siri. Es gratis y más robusto (no consume batería en segundo
   plano porque lo gestiona el propio sistema operativo), pero la frase de
   activación no es un "Hey Pepa" puro, sino a través del asistente nativo.

Recomendación: empezar explorando la opción 2 (integración con asistente
del sistema) por ser gratuita y no depender de mantener un modelo de wake
word propio; dejar Porcupine como opción si más adelante se quiere la
experiencia de marca "Hey Pepa" literal.

## Costes y límites a vigilar (fase de pruebas, sin cobrar)

- Web Speech API y SpeechSynthesis: gratis, sin límite relevante para pocas
  familias de prueba.
- Gemini (clasificación de intención): usa la misma cuota gratuita que ya
  tenéis para la función de foto del frigo — vigilar que ambos usos no
  agoten juntos el límite de peticiones/día del tier gratuito.
- Google Places API: tiene capa gratuita con cuota mensual de créditos;
  revisar el límite antes de invitar a muchas familias si se activa esta
  opción en vez del enlace directo a Maps.
- Picovoice Porcupine (fase 2): plan gratuito limitado a uso personal/bajo
  volumen — no dar por hecho que escala gratis a muchas familias sin
  revisarlo primero.

## Cómo trabajar en esto (para Claude Code)

1. Construir primero el flujo completo de la Fase 1 con la intención
   "buscar sitio cercano" únicamente (usando el enlace directo a Maps, sin
   Places API todavía) para validar voz → texto → intención → acción de
   punto a punto antes de añadir más intenciones.
2. Diseñar la capa de "intención detectada" como una estructura de datos
   simple (tipo `{ intent: string, params: object }`) que sea el punto de
   enchufe común tanto para la entrada por botón de la Fase 1 como para el
   wake word de la Fase 2 — así la Fase 2 solo cambia la entrada, no la
   lógica de acciones.
3. No implementar Picovoice ni ninguna integración de asistente nativo
   todavía — es trabajo de la Fase 2, cuando exista app nativa.
4. Mantenerse en planes gratuitos en todo momento, igual que el resto del
   proyecto en esta fase de pruebas sin cobrar.
