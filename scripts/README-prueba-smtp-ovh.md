# Prueba del correo de PEPA con OVH

Sirve para comprobar **una sola cosa**: si OVH deja enviar un correo con remitente `no-reply@pepafamilyapp.es` identificándose con el buzón `info@pepafamilyapp.es`.

- Envía **un único correo** de prueba, a la dirección que tú escribas.
- La **contraseña no se guarda en ningún archivo, no se muestra y no queda en el historial** (se escribe sin ver nada, solo asteriscos).
- **No toca** Supabase, ni el DNS, ni nada de PEPA. Solo habla con el servidor de correo de OVH.

## Cómo se ejecuta (el modo fácil)

1. Abre la carpeta del proyecto: `C:\Users\Usuario\Documents\proyectos claude\family-app-cuentas\scripts`
2. Haz **doble clic** en **`Probar-correo-OVH.cmd`**. Se abre una ventana negra.
3. Te pregunta: *¿A qué dirección quieres enviar la prueba?* Escribe **tu Gmail** completo y pulsa Intro.
4. Te pregunta: *¿Continuar? (s/n)*. Escribe **s** y pulsa Intro.
5. Te pide la **contraseña del buzón `info@pepafamilyapp.es`** (la del correo de OVH). Al escribirla **no se ve nada, solo asteriscos**. Es normal. Pulsa Intro.
6. Espera unos segundos. Verás una lista con `[BIEN]` o `[FALLO]` y, al final, qué significa y qué hacer.
7. Pulsa una tecla para cerrar la ventana.

**No escribas la contraseña en el chat con Claude.** Solo en esa ventana.

## Qué puede salir

| Resultado | Qué significa |
|---|---|
| `[BIEN] OVH ACEPTÓ enviar…` | OVH deja usar el alias como remitente. Mira tu Gmail (y Spam). |
| `OVH NO aceptó el usuario y la contraseña` | La contraseña está mal escrita o falta activar algo en OVH. |
| `OVH NO deja usar no-reply@… como remitente` | El alias solo sirve para recibir. Hay alternativas sencillas (las explica el propio programa). |
| `No se pudo completar la conexión` | Tu red bloquea el correo. Prueba con los datos del móvil. |

## Si todo sale bien: qué mirar en Gmail

1. Abre el correo «Prueba de correo de PEPA». Si no está en la bandeja, mira en **Spam**.
2. Pulsa los **tres puntos** → **Mostrar original**.
3. Comprueba:
   - **De:** pone `no-reply@pepafamilyapp.es` (no `info@…`).
   - **SPF: PASS**, **DKIM: PASS**, **DMARC: PASS**.
4. Cuéntale a Claude qué has visto.

## Otras formas de ejecutarlo (opcional)

En PowerShell, dentro de la carpeta `family-app-cuentas`:

```
node scripts/prueba-smtp-ovh.mjs
node scripts/prueba-smtp-ovh.mjs --puerto=587
node scripts/prueba-smtp-ovh.mjs --destino=tucorreo@gmail.com
```

`--puerto=587` prueba el otro puerto (con cifrado STARTTLS) por si el 465 está bloqueado en tu red.

## Para quien programa

Las pruebas automáticas (`src/data/smtpTestScript.test.ts`) usan un servidor SMTP falso y comprueban, entre otras cosas, que la contraseña no aparece en nada de lo que se muestra, que no se escribe en disco, que se envía un único correo y que cada resultado se distingue.
