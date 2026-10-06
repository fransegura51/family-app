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
