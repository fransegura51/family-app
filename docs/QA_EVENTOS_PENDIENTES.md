# QA manual pendiente — Eventos (Comida, Menú, Invitados, RSVP, Recetas, Preparativos)

Documento interno de pruebas. **Ninguna prueba está marcada como validada**: las marca el equipo al probarla en iPhone.
Se conservan todas las pruebas de la tanda; las nuevas se añaden a partir de la 206.

Estado: `[ ]` pendiente · `[x]` validada por el equipo (solo lo marca el equipo).

## Comida / resúmenes
1. [ ] Abrir Comida y bebida y comprobar «Resumen de decisiones».
2. [ ] Desplegar TOMADAS / POR DECIDIR.
3. [ ] `por_decidir` (p. ej. «Tenemos que decidirlo») aparece en POR DECIDIR.
4. [ ] Pendiente → tomada: se mueve a TOMADAS.
5. [ ] Tomada → pendiente: vuelve a POR DECIDIR.
6. [ ] Preguntas no aplicables no aparecen.
7. [ ] Resumen de Celebración / Ceremonia y celebración.
8. [ ] Resumen de La pareja.
9. [ ] Resumen de Invitados e invitaciones.
10. [ ] Resumen de Momentos especiales.

## Menú / encabezados
11. [ ] Crear encabezado o nota manual.
12. [ ] Un encabezado no tiene 🛒.
13. [ ] Un encabezado no tiene receta.
14. [ ] Un encabezado no tiene responsable ni categoría de plato.
15. [ ] Reordenar encabezados y platos.
16. [ ] Persistencia tras salir y volver a entrar.
17. [ ] «Cambio de Tercio» sigue siendo encabezado y conserva su posición.

## «No hay que comprarlo»
18. [ ] Marcar un plato como «No hay que comprarlo».
19. [ ] Sigue apareciendo en el menú.
20. [ ] Sale del carrito individual (🛒).
21. [ ] Sale de «Preparar compra del menú».
22. [ ] Desmarcar la opción.
23. [ ] Vuelve a aparecer en la compra.
24. [ ] Receta, responsable y posición intactos antes y después.

## Compra del menú
25. [ ] Abrir «Preparar compra del menú».
26. [ ] Revisar los ingredientes propuestos.
27. [ ] Cantidades conocidas, desconocidas y escaladas se ven como corresponde.
28. [ ] Editar una cantidad.
29. [ ] Elegir y cambiar la tienda.
30. [ ] Desmarcar una línea.
31. [ ] Confirmar.
32. [ ] Comprobar que llega a Compras.
33. [ ] Las cantidades desconocidas no aparecen inventadas.
34. [ ] Reintento seguro: confirmar dos veces no duplica.

## Importación de menú
35. [ ] Importar una imagen real.
36. [ ] Revisión antes de guardar.
37. [ ] Desmarcar un texto decorativo.
38. [ ] El orden coincide con el documento.
39. [ ] Encabezados y notas se importan como tales.
40. [ ] «Cambio de Tercio» se conserva.
41. [ ] La clasificación por sección es correcta.
42. [ ] Cambiar la sección no altera la secuencia.
43. [ ] Importar después de un elemento elegido.
44. [ ] Persistencia tras recargar.
45. [ ] Cancelar la importación no guarda nada.
46. [ ] Importar un PDF.
47. [ ] El original aparece en «Documentos originales».
48. [ ] Abrir el original correcto.
49. [ ] Aparece como «Menú importado».
50. [ ] Segunda importación aparece como «Menú importado 2».
51. [ ] No se ven UUID ni nombres técnicos.
52. [ ] Interrupción durante la importación: el menú queda consistente.

## Opciones de menú
53. [ ] Crear una opción.
54. [ ] Renombrar una opción.
55. [ ] Cambiar la audiencia.
56. [ ] Los recuentos son correctos.
57. [ ] Renombrar una opción ya elegida muestra aviso.
58. [ ] Cambiar la audiencia de una opción ya elegida muestra aviso.
59. [ ] Borrar una opción ya elegida muestra aviso.
60. [ ] Nunca se reasignan elecciones automáticamente.

## Menú infantil
61. [ ] Probar todas las opciones (Mismo menú, Menú infantil, Alternativa concreta, Incluido restaurante/catering, Todavía no, Otro).
62. [ ] «Todavía no» aparece como pendiente.
63. [ ] El pendiente es visible.
64. [ ] No vuelve a preguntar el número de niños.
65. [ ] Resolver y persistir.
66. [ ] Quitar la necesidad de menú infantil desde Invitados.
67. [ ] La respuesta antigua deja de estar operativa.
68. [ ] Volver a necesitar menú infantil: comportamiento correcto.

## Necesidades y alternativas
69. [ ] Necesidades existentes intactas.
70. [ ] Alternativas existentes intactas.
71. [ ] Una alternativa segura no elimina el conflicto original.
72. [ ] Los estados de revisión persisten.
73. [ ] Alternativa vacía + confirmado: observar y documentar.

## RSVP real (solo con enlace de prueba)
74. [ ] Enlace RSVP real de prueba.
75. [ ] Declarar una alergia o necesidad.
76. [ ] No aparece como confirmada.
77. [ ] Aparece como «Declarado por un invitado (sin confirmar)».
78. [ ] Aceptar eligiendo persona, categoría y tipo.
79. [ ] Pasa a necesidad operativa.
80. [ ] Una necesidad equivalente no se duplica.
81. [ ] Rechazar otra declaración.
82. [ ] La rechazada queda registrada y no es operativa.
83. [ ] No se puede declarar por una persona ajena a la invitación.
84. [ ] El enlace público no revela datos de otros invitados.
85. [ ] No saturar producción para probar el límite de peticiones.

## Raciones
86. [ ] Receta con raciones enteras.
87. [ ] Editar a 6,5.
88. [ ] Persistencia del valor.
89. [ ] Importar un rango «6-7».
90. [ ] Propone 6,5 y conserva la fuente.
91. [ ] Cambiar manualmente el valor.
92. [ ] El texto usa el valor corregido.
93. [ ] Guardar y ver la ficha.
94. [ ] Vaciar Raciones.
95. [ ] Guardar con Raciones vacías.
96. [ ] No se muestra ninguna cantidad calculada sin raciones.
97. [ ] La fuente original se conserva.
98. [ ] La compra no reconstruye raciones desde la fuente.

## Documentos originales
99. [ ] Acceso a «Documentos originales».
100. [ ] Cada alias abre el original correcto.
101. [ ] Varias importaciones: numeración correcta.

## Regresiones generales
102. [ ] Orden del menú.
103. [ ] Añadir plato manual.
104. [ ] Editar un plato no lo mueve.
105. [ ] Borrar un plato.
106. [ ] Gestionar secciones.
107. [ ] Una sección con platos no se oculta.
108. [ ] Arrastrar con ☰.
109. [ ] Flechas ▲ ▼.
110. [ ] Comida incluida en el lugar.
111. [ ] Tarta.
112. [ ] Bebidas.
113. [ ] Momentos de comida: el Plan del día no inventa horas.
114. [ ] Primer baile.
115. [ ] Plan del día: orden, edición y sin hora.
116. [ ] No aparecen tareas, presupuestos ni proveedores falsos.

## Preparativos
117. [ ] Abrir Preparativos y comprobar que las tareas existentes siguen presentes.
118. [ ] Crear una tarea manual sin fecha.
119. [ ] Guardarla sin fecha ni hora.
120. [ ] Añadir fecha sin hora.
121. [ ] Añadir hora con fecha.
122. [ ] Nunca aparece 00:00 inventado.
123. [ ] Añadir una nota corta.
124. [ ] La nota corta se ve entera en una línea.
125. [ ] Añadir una nota larga.
126. [ ] Truncado visual con puntos suspensivos.
127. [ ] El editor muestra la nota completa.
128. [ ] Cambiar prioridad: Alta, Media, Baja, Sin prioridad.
129. [ ] La prioridad persiste.
130. [ ] Una tarea generada tiene prioridad asignada por PEPA.
131. [ ] Se ve la explicación del motivo.
132. [ ] Cambiar manualmente una prioridad sugerida.
133. [ ] Tras salir y volver, PEPA no la sobrescribe.
134. [ ] Una tarea Alta sin fecha funciona.
135. [ ] Una tarea con fecha vencida influye en la recomendación.
136. [ ] Una tarea con fecha próxima influye sin inventar fechas.
137. [ ] La fecha del evento no es obligatoria.
138. [ ] PEPA no inventa la fecha del evento.
139. [ ] PEPA no inventa la fecha de una tarea.
140. [ ] Revisar «Pepa te recomienda».
141. [ ] Las recomendaciones no son simplemente las tres primeras.
142. [ ] Cada recomendación muestra su motivo.
143. [ ] Completar una tarea recomendada.
144. [ ] Sale de las recomendaciones y entra la siguiente relevante.
145. [ ] Tarea de duración o preparación (p. ej. clases de baile) si existe caso.
146. [ ] Una tarea de práctica puede ser Alta aunque no tenga fecha.
147. [ ] Mostrar en Calendario sin recordatorio.
148. [ ] Mostrar en Calendario con recordatorio.
149. [ ] Recordatorio «Sin aviso».
150. [ ] Recordatorio «El mismo día».
151. [ ] Recordatorio «1 día antes».
152. [ ] Recordatorio «1 semana antes».
153. [ ] Recordatorio «Personalizado».
154. [ ] La campana es visible en la tarjeta.
155. [ ] El estado de la campana es coherente con el recordatorio.
156. [ ] La campana no sustituye a «Mostrar en Calendario».
157. [ ] Una tarea sin fecha no genera aviso temporal ficticio.
158. [ ] Calendario contiene una sola entrada lógica por tarea.
159. [ ] Vista familiar.
160. [ ] Vista personal de un miembro.
161. [ ] Sin duplicados entre visualizaciones.
162. [ ] Los colores familiares siguen funcionando.
163. [ ] Crear una persona externa.
164. [ ] El nombre es obligatorio.
165. [ ] La etiqueta es opcional.
166. [ ] La persona externa solo aparece en ese evento.
167. [ ] No aparece en otro evento.
168. [ ] No necesita cuenta, email ni teléfono.
169. [ ] No aparece vinculada en Invitados.
170. [ ] Editar el nombre.
171. [ ] Editar la etiqueta.
172. [ ] Asignarla a una tarea.
173. [ ] Nombre y etiqueta visibles en la tarjeta.
174. [ ] No tiene color propio.
175. [ ] Asignar un miembro familiar y una persona externa.
176. [ ] El color depende solo de los miembros familiares.
177. [ ] Asignar varios familiares.
178. [ ] Asignar varias personas externas.
179. [ ] Mezclar varios de ambos tipos.
180. [ ] Los responsables múltiples persisten.
181. [ ] Filtrar por un familiar.
182. [ ] Filtrar por una persona externa.
183. [ ] Filtrar por varios responsables.
184. [ ] Una tarea compartida aparece al coincidir cualquiera.
185. [ ] Filtrar «Sin asignar».
186. [ ] Limpiar filtros.
187. [ ] El filtro no modifica datos.
188. [ ] Borrar una persona externa sin asignaciones.
189. [ ] Borrar una persona externa con asignaciones.
190. [ ] El aviso indica el número de asignaciones.
191. [ ] Cancelar el borrado.
192. [ ] Elegir «conservar asignaciones».
193. [ ] La persona deja de ser seleccionable.
194. [ ] Las tareas conservan una referencia histórica.
195. [ ] La referencia conserva nombre y etiqueta.
196. [ ] Elegir «quitar asignaciones».
197. [ ] Las tareas quedan sin esa persona.
198. [ ] El histórico conserva la información que corresponde.
199. [ ] Completar una tarea con varios responsables.
200. [ ] Revisar histórico y completadas.
201. [ ] Reabrir o reconciliar una tarea automática, si existe el flujo.
202. [ ] Los datos manuales enriquecidos no se pierden.
203. [ ] No se crean duplicados de tareas automáticas.
204. [ ] El menú ⋯ sigue ofreciendo Editar y Borrar.
205. [ ] La tarjeta sigue compacta y no se rompe en iPhone.

## Nuevas pruebas (a partir de la 206)
206. [ ] Tarea nueva sin prioridad elegida: aparece con prioridad propuesta por PEPA.
207. [ ] Crear «Buscar clases de baile» sin fecha: PEPA la propone como Alta por práctica.
208. [ ] Cambiar esa prioridad a Baja: sigue Baja tras salir y volver (no se recalcula).
209. [ ] «Sin prioridad» se guarda y se mantiene.
210. [ ] Hora solo se puede poner con fecha; quitar la fecha quita la hora.
211. [ ] Marcar una tarea como hecha: se guarda la fecha de completado; desmarcar la limpia.
212. [ ] Persona externa: añadirla desde el editor, editarla, asignarla a dos tareas.
213. [ ] Borrar una persona externa con asignaciones: aparece la pregunta con el número y tres opciones.
214. [ ] Conservar asignaciones: la tarea muestra «Nombre · Relación» como referencia histórica.
215. [ ] Quitarla de las tareas: desaparece de todas las tareas.
216. [ ] «Pepa te recomienda» muestra una explicación por cada tarea recomendada.
217. [ ] Completar una recomendada: sale del bloque y entra la siguiente relevante.
218. [ ] La nota se ve en una línea y se corta con puntos suspensivos; el editor muestra el texto completo.
219. [ ] Filtro por responsable: NO existe todavía (pendiente de la siguiente tanda).
220. [ ] Campana de recordatorio en la tarjeta: NO existe todavía (pendiente).
221. [ ] Calendario: la tarea enlazada tiene una sola entrada; el responsable sincronizado es el principal.
222. [ ] Tarea antigua sin prioridad guardada: muestra la prioridad propuesta por PEPA sin haberla editado (sin backfill).
223. [ ] Al cambiar la prioridad de una tarea antigua, queda guardada con origen usuario.
224. [ ] «Sin prioridad» elegida por el usuario se mantiene y no vuelve a proponerse.
225. [ ] Prioridad estructurada > palabra del título: «¿Necesitáis clases de baile?» = sí en Momentos especiales hace Alta por práctica aunque el título no diga «clases».
226. [ ] Keyword fallback en tarea manual: «Buscar clases de baile» creada a mano se propone como Alta y se indica como sugerencia.
227. [ ] Prioridad elegida manualmente no se sobrescribe al volver a abrir o reconciliar.
228. [ ] Filtro por responsable: un familiar muestra solo sus tareas.
229. [ ] Filtro múltiple: Paco + Jennifer muestra tareas de cualquiera de los dos.
230. [ ] Filtro «Sin asignar» muestra solo tareas sin ningún responsable activo.
231. [ ] Limpiar filtros vuelve a mostrar todas las pendientes.
232. [ ] El filtro no cambia prioridades ni datos (comprobar tras salir y volver).
233. [ ] El filtro no altera «Pepa te recomienda» del evento.
234. [ ] Campana sin aviso: icono neutro y estado «Sin aviso».
235. [ ] Campana con «El mismo día»: estado activo; se refleja al reabrir la pantalla.
236. [ ] Campana con «1 día antes».
237. [ ] Campana con «1 semana antes».
238. [ ] Campana «Personalizado» abre el editor completo para elegir cantidad y unidad.
239. [ ] Tarea sin fecha: la campana está desactivada y explica que hace falta fecha; no se crea ningún aviso.
240. [ ] Tarea con fecha pero sin «Mostrar en Calendario»: la campana explica que hay que activarlo primero.
241. [ ] Una sola entrada lógica de calendario por tarea; no aparecen copias por responsable.
242. [ ] Calendario muestra la tarea como tarea (kind task) en las tarjetas nuevas que se enlacen desde ahora.
243. [ ] Tarea con varios responsables familiares: visible desde las vistas de cada uno, sin duplicarse.
244. [ ] Tarea con familiar + persona externa: la externa aparece en la tarjeta y no aporta color ni entrada propia.
245. [ ] Persona externa no tiene color en el calendario.
246. [ ] Reconciliación (cambio de fecha o título) no pierde responsables múltiples.
247. [ ] Documentos originales plegados por defecto al entrar en la pantalla de Menú.
248. [ ] Documentos originales desplegados muestran Menú importado, Menú importado 2…
249. [ ] Volver a plegar funciona.
250. [ ] Cada alias abre exactamente su documento original.
251. [ ] El bloque está entre «Importar menú» y «Gestionar secciones», en su propia línea, bien alineado en iPhone.
252. [ ] Importar menú y Gestionar secciones siguen funcionando igual.
253. [ ] Persona externa: borrar con asignaciones muestra el número y tres opciones (conservar, quitar, cancelar).
254. [ ] Conservar: la tarea muestra «Nombre · Relación» como referencia y la persona no aparece como seleccionable.
255. [ ] Quitar: la persona desaparece de todas las tareas.
256. [ ] Editar nombre o relación de una persona externa actualiza sus asignaciones activas.
257. [ ] Menú infantil: con la necesidad activa y la respuesta «Todavía no decidido», aparece en POR DECIDIR del resumen.
258. [ ] Quitar «Menú infantil» de Invitados: la respuesta antigua no genera tareas ni presupuesto; los datos no se borran.
259. [ ] Volver a marcar «Menú infantil» en Invitados: la respuesta antigua vuelve a aplicar.

## Nuevas pruebas (a partir de la 260) — recordatorio/calendario, resúmenes, prioridad PEPA, ficha compacta
260. [ ] Recordatorio con fecha pero «Mostrar en Calendario» desactivado: la campana explica la limitación real (no hay soporte para un aviso sin entrada de calendario) — nunca sugiere que basta con activar el interruptor como si fuera solo una decisión de UX.
261. [ ] «Mostrar en Calendario» activado con «Sin aviso»: se muestra en Calendario sin ningún recordatorio.
262. [ ] «Mostrar en Calendario» activado con un aviso (el mismo día/1 día/1 semana/personalizado): ambos coexisten.
263. [ ] Quitar el aviso (pasar a «Sin aviso») conserva «Mostrar en Calendario» activado.
264. [ ] Quitar «Mostrar en Calendario» borra también el recordatorio (consecuencia real de la arquitectura, nunca en silencio: el editor dice que al desactivarlo se pierde el aviso).
265. [ ] Tarea nueva enlazada a Calendario se crea con kind=task (confirmar en Calendario que no aparece como "evento").
266. [ ] Las 2 tareas enlazadas antes de este cambio ("Enviar las invitaciones", "Encargar la tarta") ya aparecen como tarea en Calendario tras el backfill (0207) — revisar que no cambiaron de responsable ni de fecha.
267. [ ] Ningún evento real cambió de tipo en Calendario tras el backfill.
268. [ ] Resumen de decisiones de Celebración/Ceremonia y celebración: TOMADAS/POR DECIDIR correctos (edad si es cumpleaños, fecha, lugar, servicios solo si aplica).
269. [ ] Resumen de decisiones de La pareja: vestuario/peluquería/complementos/floral/alianzas/detalle especial, con revelado progresivo (la resolución no aparece hasta elegir el tipo).
270. [ ] Resumen de decisiones de Invitados: lista, preguntas en la invitación, momentos, niños y sus necesidades, invitación.
271. [ ] Resumen de decisiones de Momentos especiales: la pregunta de clases de baile solo aparece si "primer_baile" está entre los seleccionados.
272. [ ] Una pregunta no aplicable (p. ej. la edad en una boda, o "qué incluye el lugar" sin lugar contratado) no aparece ni en tomadas ni en pendientes.
273. [ ] Cambiar una decisión (p. ej. de "todavía no lo sabemos" a una respuesta concreta) actualiza el resumen correspondiente sin recargar la pantalla a mano.
274. [ ] Menú infantil pendiente: aparece el aviso compacto "⏳ Falta decidir el menú infantil" en Comida y bebida sin tener que abrir el Resumen.
275. [ ] PEPA recalcula sola la prioridad de una tarea que gestiona (origen PEPA) cuando se acerca su fecha, sin que nadie la edite.
276. [ ] La prioridad gestionada por PEPA también puede bajar si la fecha se aleja o se quita.
277. [ ] Una prioridad elegida por el usuario (incluida «Sin prioridad») nunca cambia sola, por muy cerca que esté la fecha.
278. [ ] PEPA propone subir una prioridad fijada por el usuario cuando se acerca su fecha, con el motivo explicado.
279. [ ] Aceptar la propuesta cambia la prioridad de la tarea; la tarjeta lo refleja al momento.
280. [ ] Rechazar la propuesta mantiene la prioridad del usuario y la propuesta no vuelve a aparecer mientras el motivo sea el mismo.
281. [ ] Si después cambia el motivo de forma relevante (p. ej. pasa de "30 días" a "7 días" o cambia la decisión de origen), puede aparecer una propuesta nueva aunque la anterior se rechazara.
282. [ ] «Sin prioridad» elegida por el usuario también puede recibir una propuesta de PEPA (asignarle prioridad), nunca se le asigna sola.
283. [ ] La tarjeta compacta de Preparativos muestra solo un punto de color (rojo/amarillo/verde) para Alta/Media/Baja, sin la palabra; «Sin prioridad» no muestra ningún punto.
284. [ ] El editor de la tarea sigue mostrando los nombres completos (Alta/Media/Baja/Sin prioridad) en el selector.

## Nuevas pruebas (a partir de la 285) — ficha compacta, chips, personas externas, overflow
285. [ ] Responsables familiares se muestran como chips en fila, no como lista vertical de checkboxes.
286. [ ] Selección múltiple de responsables funciona igual que antes (marcar/desmarcar varios).
287. [ ] Los chips de responsables hacen wrap (pasan a la siguiente línea) en una pantalla estrecha, sin scroll horizontal.
288. [ ] Las personas externas no muestran permanentemente los campos Nombre/Relación: aparecen solo al tocar «+ Añadir persona externa».
289. [ ] Cancelar el alta de una persona externa no crea nada.
290. [ ] Guardar el alta crea la persona, la selecciona como chip y pliega el formulario otra vez.
291. [ ] Una persona externa ya creada aparece como chip seleccionable junto a los familiares, con borde discontinuo y su relación (si tiene).
292. [ ] Editar una persona externa desde el menú ⋯ de su chip actualiza su nombre/relación en todas sus asignaciones activas.
293. [ ] Borrar una persona externa desde el menú ⋯ sigue ofreciendo conservar/quitar cuando tiene asignaciones.
294. [ ] La ficha de edición completa no tiene scroll horizontal en iPhone (ancho estrecho), en ningún estado (alta de externa abierta, menú ⋯ abierto, recordatorio personalizado abierto).
295. [ ] Fecha y Hora comparten fila en pantallas anchas y se apilan sin desbordar en pantallas estrechas.
296. [ ] Todas las funciones de la ficha anterior siguen accesibles (prioridad, nota, Mostrar en Calendario, Recordatorio, Guardar) tras la compactación.

## Nuevas pruebas (a partir de la 297) — importación interrumpida, idempotencia de compra, concurrencia de opciones, RSVP
297. [ ] Documento subido y app cerrada antes de confirmar los platos: al volver a entrar, el documento aparece como «⏳ Documento sin importar» en Documentos originales.
298. [ ] Descartar un documento pendiente lo quita (y su archivo), sin tocar ningún otro documento ni plato.
299. [ ] Completar la importación normal de un documento marca ese documento como importado; deja de verse como pendiente.
300. [ ] Un documento pendiente nunca cuenta en la numeración «Menú importado N» de los documentos ya importados.
301. [ ] Si la importación falla por un dato inválido, el documento sigue en pendiente (no queda "completado" sin platos).
302. [ ] Confirmar la compra del menú y cerrar la app justo después: al volver a abrir «Preparar compra del menú» para el mismo evento, un reintento no duplica las líneas ya añadidas a Compras.
303. [ ] Doble toque en «Añadir a Compras»: no se duplica nada.
304. [ ] Tras una compra confirmada con éxito, la siguiente compra del mismo evento usa un identificador distinto (no se bloquea con la anterior).
305. [ ] Cantidades null/vacías y varias tiendas siguen funcionando igual en la revisión de compra.
306. [ ] Renombrar una opción de menú que otra sesión acaba de elegir: el aviso muestra el número real (recién llegado), no uno desactualizado.
307. [ ] Cambiar la audiencia de una opción ya elegida: mismo aviso con recuento real antes de guardar.
308. [ ] Borrar una opción ya elegida: el aviso muestra cuántas personas la habían elegido en ese momento, con recuento real.
309. [ ] Ninguna de las tres acciones anteriores reasigna ni borra elecciones de invitados por su cuenta.
310. [ ] RSVP: un token inexistente devuelve "no encontrado", sin filtrar si existe o no otro evento.
311. [ ] RSVP: las necesidades declaradas por un invitado se guardan solo como pendientes (event_guest_declared_needs), nunca directamente como necesidad confirmada.
312. [ ] RSVP: superar el límite de peticiones devuelve "demasiadas peticiones" sin guardar nada parcial.

## Nuevas pruebas (a partir de la 313) — bug real «1 día antes» y varios avisos por tarea
313. [ ] «1 día antes» (regresión del bug encontrado): se guarda sin error, la campana queda en 🔔 y lo conserva al salir y volver a entrar.
314. [ ] «El mismo día» se guarda sin error (antes violaba la constraint siempre).
315. [ ] «1 semana antes» se guarda sin error.
316. [ ] Marcar «1 semana antes» + «1 día antes» a la vez: ambos quedan activos (✓ en los dos en el menú de la campana).
317. [ ] Marcar «1 semana antes» + «1 día antes» + «El mismo día»: los tres quedan activos.
318. [ ] Desde los tres anteriores, quitar únicamente «1 día antes»: los otros dos siguen activos.
319. [ ] «Sin aviso» quita los tres de golpe; la campana pasa a 🔕.
320. [ ] Personalizado (p. ej. 3 horas antes) coexiste con «1 semana antes» y «1 día antes» ya activos.
321. [ ] Cambiar el personalizado activo (p. ej. de 3 horas a 5 horas) reemplaza solo ese aviso, sin tocar los presets activos.
322. [ ] Persistencia: salir del evento y volver a entrar conserva exactamente la misma combinación de avisos (ni de más ni de menos).
323. [ ] Consistencia entre campana rápida y «Editar tarea»: lo que la campana muestra marcado coincide exactamente con lo que el editor muestra marcado, en todo momento.
324. [ ] Tarea sin fecha: la campana sigue desactivada con su explicación; no se puede marcar ningún aviso.
325. [ ] Tocar varias opciones del menú de la campana sin cerrarlo entre toques: las tres se activan correctamente, sin perder ninguna por toques rápidos.
326. [ ] Mientras se está guardando un toque, un segundo toque inmediato no duplica ni pierde el primero (reintentar tras un segundo si hace falta).
327. [ ] Si el guardado de un toque falla (p. ej. sin conexión), la campana vuelve a mostrar el estado real tras el error, nunca un aviso fingido.
328. [ ] Una tarea con tres avisos sigue teniendo una sola entrada en Calendario (no se duplica, no cambia de kind, responsable, fecha, hora ni prioridad).
329. [ ] «Mostrar en Calendario» sigue siendo el mismo interruptor de siempre; desactivarlo sigue quitando todos los avisos de esa tarea (consecuencia ya documentada, no en silencio).

## Nuevas pruebas (a partir de la 330) — "+ Nueva tarea", filtro AND y "👥 Colaboradores"
330. [ ] El alta rápida inferior ("+ Añadir tarea") ya no existe, ni con filtros activos ni sin ellos.
331. [ ] "+ Nueva tarea" aparece justo debajo de los filtros de responsables y antes de la lista, con y sin filtros activos.
332. [ ] "+ Nueva tarea" abre el mismo formulario completo que "Editar tarea" (título, fecha, hora, prioridad, responsables, externos, nota, Mostrar en Calendario, recordatorios).
333. [ ] Crear una tarea sin fecha funciona (no se inventa fecha ni hora; Mostrar en Calendario queda desactivado).
334. [ ] Crear una tarea con fecha, Mostrar en Calendario y un recordatorio: se guarda y aparece correctamente en la lista y en Calendario.
335. [ ] Crear una tarea con varios recordatorios a la vez (p. ej. 1 semana + 1 día) funciona igual que al editar.
336. [ ] Crear una tarea sin tocar la prioridad: PEPA la propone (igual que el alta rápida de antes).
337. [ ] Crear una tarea eligiendo expresamente "Sin prioridad": se guarda así, sin que PEPA la sobrescriba.
338. [ ] Al guardar la nueva tarea, el modal se cierra y la lista se refresca mostrándola, respetando el filtro activo si corresponde.
339. [ ] Crear varias tareas seguidas no duplica ninguna ni altera las demás tareas existentes.
340. [ ] Filtro "Jennifer + Paco": solo aparecen tareas con los dos asignados a la vez.
341. [ ] Filtro de una sola persona sigue funcionando como antes (muestra solo sus tareas).
342. [ ] Filtro "Jennifer + un colaborador externo": solo tareas con los dos.
343. [ ] Filtro con tres responsables (dos familiares + un externo): solo tareas con los tres.
344. [ ] Una tarea con solo parte de los responsables seleccionados no aparece con el filtro AND.
345. [ ] "Sin asignar" sigue mostrando solo tareas sin ningún responsable.
346. [ ] Seleccionar "Sin asignar" y luego una persona: se limpia "Sin asignar" y queda solo la persona.
347. [ ] Seleccionar una persona y luego "Sin asignar": se limpian las personas y queda solo "Sin asignar".
348. [ ] "Todos"/"Limpiar filtros" vuelve a mostrar todas las tareas pendientes.
349. [ ] "👥 Colaboradores" es accesible desde Preparativos sin entrar en ninguna tarea.
350. [ ] Añadir un colaborador desde "👥 Colaboradores" (nombre + relación opcional).
351. [ ] Editar el nombre/relación de un colaborador desde "👥 Colaboradores" actualiza sus asignaciones activas.
352. [ ] Borrar un colaborador sin tareas asignadas: confirmación sencilla.
353. [ ] Borrar un colaborador con tareas asignadas: aparece el aviso con el número y las opciones conservar/quitar/cancelar.
354. [ ] "Conservar" deja la referencia histórica (nombre · relación) en las tareas que lo tenían.
355. [ ] "Quitar" elimina al colaborador de todas las tareas donde estaba asignado.
356. [ ] Dentro de Nueva/Editar tarea ya NO hay manera de editar o borrar un colaborador existente (sin menú ⋯).
357. [ ] "+ Añadir persona externa" dentro de una tarea sigue funcionando como alta rápida.
358. [ ] Un colaborador creado desde "+ Añadir persona externa" aparece inmediatamente seleccionable y seleccionado en esa tarea, sin salir del formulario.
359. [ ] Ese mismo colaborador aparece después en "👥 Colaboradores".
360. [ ] Ese mismo colaborador aparece como filtro de responsable en Preparativos en cuanto tiene alguna tarea asignada.
361. [ ] La tarjeta de tarea sigue mostrando el mismo contenido de siempre (checkbox, título, fecha/hora, Atrasada, prioridad, responsables, nota, campana, menú ⋯ de la tarea) sin cambios.
362. [ ] El menú ⋯ de la tarjeta (Editar/Borrar la tarea) sigue funcionando igual; no se ha mezclado con nada de colaboradores.
363. [ ] "Pepa te recomienda" sigue funcionando con tareas nuevas, con varios responsables y con colaboradores externos, sin errores.
