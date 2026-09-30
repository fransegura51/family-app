# El mapa con Google Maps

La app usa Google Maps (mapa, buscador de direcciones y reconocimiento de
sitios) en vez de OpenStreetMap, más cuatro extras: quién está más cerca de
un lugar, el tiempo real en coche hasta allí, y compartir un lugar como
imagen. El código ya está hecho; falta la parte que solo puede hacer
Jennifer en Google (activar la facturación, nadie más puede meter una
tarjeta) para que funcione de verdad.

**Mientras no haya clave configurada, el mapa simplemente no se pinta** — el
resto de "Ubicación" (chips de miembros, lugares frecuentes, reglas) y el
resto de la app siguen funcionando exactamente igual.

## Qué archivos tocan esto

| Qué | Archivo |
|---|---|
| Carga el script de Google Maps una vez | `src/services/googleMapsLoader.ts` |
| Buscar una dirección (autocompletar) / coordenadas → dirección | `src/services/geocoding.ts` |
| Reconocer el nombre de un sitio nuevo | `src/services/reverseGeocode.ts` |
| Tiempo real en coche hasta un lugar | `src/services/drivingEta.ts` |
| Imagen de un lugar para compartir | `src/services/placeMapImage.ts` |
| Mapa de "Ubicación" (con fotos y tráfico en vivo) | `src/ui/LocationMap.tsx` |
| Mapa del selector de sitio (Calendario/Eventos) | `src/ui/LocationPickerModal.tsx` |
| "Quién está más cerca", botón de tiempo en coche y de compartir, en cada lugar frecuente | `src/ui/LocationScreen.tsx` (`PlaceRow`) |
| Dónde se lee la clave al compilar | `.github/workflows/deploy.yml` (secreto `VITE_GOOGLE_MAPS_API_KEY`) |

## Pasos en Google Cloud (los hace Jennifer)

Se reutiliza el mismo proyecto de Google Cloud que ya existe para "Conectar
con Google Calendar" — no hace falta crear uno nuevo.

1. **Activar la facturación.** En [console.cloud.google.com/billing](https://console.cloud.google.com/billing), vincular una tarjeta al proyecto. Es obligatorio aunque el uso real se quede en 0 €.
2. **Activar 5 APIs**, en *APIs y servicios → Biblioteca*:
   - **Maps JavaScript API**
   - **Places API (New)**
   - **Geocoding API**
   - **Routes API** — nueva, para el tiempo real en coche
   - **Maps Static API** — nueva, para compartir un lugar como imagen
3. **Crear la clave**, en *APIs y servicios → Credenciales → Crear credenciales → Clave de API*.
   - **Restringirla por sitio web** (HTTP referrer): añadir `https://fransegura51.github.io/family-app/*` (y el dominio propio, si algún día se usa uno).
   - **Restringirla a esas 5 APIs**, para que no sirva para nada más si se filtrara.
4. **Poner cupos diarios** — esto es lo que de verdad evita pagar de más, el aviso por email no corta nada, el cupo sí. En *Google Maps Platform → Cuotas*, elegir cada API en el desplegable de arriba y, en la fila **"Map loads per day"** (o "Requests per day"), pulsar los tres puntos ⋮ → **Editar cuota**:
   - **Maps JavaScript API** → 300 al día
   - **Geocoding API** → 300 al día
   - **Places API (New)** → 150 al día (cada método: Autocomplete, Place Details)
   - **Routes API** → 100 al día
   - **Maps Static API** → 50 al día

   Con estos números, el gasto se queda en 0 € mientras uséis PEPA vosotros y las familias de prueba. Al llegar a un cupo, esa función deja de responder el resto del día — no os van a cobrar de más, se corta antes.

   ⚠️ **Comprobado el 30/09/2026: mientras la cuenta esté en la "prueba gratuita" de Google (el crédito de bienvenida, ~90 días), este paso está bloqueado** — el propio Google avisa de que no se pueden cambiar cupos en ese estado. En cuanto la cuenta pase a facturación normal (se acabe el crédito o los 90 días, o se actualice a mano), hay que volver aquí y poner estos 3 cupos. Mientras tanto, hay dos redes de seguridad ya activas sin este paso:
   - El propio crédito de bienvenida (unos 257 € cuando se escribió esto) absorbe cualquier gasto antes de tocar la tarjeta.
   - Un freno metido en el código (`src/services/googleMapsUsageGuard.ts`): cada móvil deja de pedir mapas o búsquedas a Google si supera un uso alto en un mismo día (80 cargas de mapa, 40 búsquedas). No es un tope de gasto real — es para que un fallo o un bucle no dispare llamadas sin control mientras no se pueda poner el cupo de verdad.
5. **Alerta de presupuesto** (recomendable, y esta sí funciona en la prueba gratuita), en *Facturación → Presupuestos y alertas*: crear un presupuesto de, por ejemplo, 5 €/mes con avisos al 50/90/100%.
6. **Añadir la clave a GitHub**: en el repositorio, *Settings → Secrets and variables → Actions → New repository secret*, nombre `VITE_GOOGLE_MAPS_API_KEY`, valor la clave del paso 3. Al hacer `git push`, el siguiente despliegue ya la usa.

## Si no convence y hay que volver a OpenStreetMap

Es un único commit para deshacer (revertir estos cambios trae de vuelta
Leaflet + Nominatim, gratis y sin clave, tal como estaba). No hace falta
tocar nada en Google Cloud para volver: basta con dejar de usar la clave.

## Cuánto puede llegar a costar si se sube el cupo más adelante

Con el uso típico de hoy (una persona abre "Ubicación" un par de veces al
día, y de vez en cuando elige un sitio en un evento):

| Personas usando el mapa a diario | Coste al mes |
|---|---|
| Hasta ~150 | 0 € (el cupo de arriba ni se nota) |
| 500 | ≈ 140 € |
| 1.000 | ≈ 430 € |
| 5.000 | ≈ 3.250 € |

Si algún día se decide crecer y aceptar ese gasto, hay que subir los cupos
del paso 4 (o quitarlos) para que el mapa no se corte al llegar al límite.
