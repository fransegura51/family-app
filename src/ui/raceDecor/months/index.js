// Las doce propuestas mensuales (V2). Cada mes vive en su archivo y es una «fábrica» que crea su propio estado limpio.
// Ganchos que puede usar un mes (todos opcionales; ver common.js → base):
//   hills   detrás de los árboles, justo tras las colinas (fondo lejano: niños, Reyes Magos, sol…)
//   scenery al terminar el paisaje (cubrir flores con nieve, velo de cielo gris o de noche…)
//   ground  tras la pista y antes de los animales del paisaje (franja de césped de abajo)
//   back    detrás de los corredores · front delante, solo en zonas sin corredores
//   fauna   sustituir un animal del paisaje real (mariposa → pajarillo en los meses fríos)
import { enero } from './enero.js'
import { febrero } from './febrero.js'
import { marzo } from './marzo.js'
import { abril } from './abril.js'
import { mayo } from './mayo.js'
import { junio } from './junio.js'
import { julio } from './julio.js'
import { agosto } from './agosto.js'
import { septiembre } from './septiembre.js'
import { octubre } from './octubre.js'
import { noviembre } from './noviembre.js'
import { diciembre } from './diciembre.js'

export const MONTH_INFO = [
  { name: 'Enero', emoji: '⛄', note: 'Paisaje nevado como en diciembre. Del 1 al 6: los tres Reyes Magos con sus camellos cruzan despacio la colina del fondo. Del 7 al 31: niños jugando en la nieve, un lago helado con patinadores y un trineo. Un petirrojo sustituye a la mariposa.' },
  { name: 'Febrero', emoji: '🎭', note: 'Carnaval: confeti y serpentinas, banderines, máscaras en el prado, cañón de confeti, comparsa de niños disfrazados y una carroza en la colina. Flores de después del deshielo (campanillas, crocus, narcisos) y almendros en flor.' },
  { name: 'Marzo', emoji: '🌸', note: 'Primavera: pétalos cayendo, árboles en flor, flores en el prado, mariposas y pájaros, y un sol sonriente a la derecha del cielo.' },
  { name: 'Abril', emoji: '🌈', note: 'Aguaceros: se nubla todo el cielo (también las nubes blancas), llueve suave, se forman charcos y sale el arcoíris. Luego vuelve a despejarse.' },
  { name: 'Mayo', emoji: '🌼', note: 'Flores por todo el prado, abejas que revolotean, mariquitas paseando y alguna mariposa.' },
  { name: 'Junio', emoji: '☀️', note: 'Inicio de verano: sol sonriente, girasoles, mariposas y una pelota de playa que rueda.' },
  { name: 'Julio', emoji: '🍦', note: 'Vacaciones: niños jugando a la pelota, comiendo helado y corriendo en la colina; sombrilla y castillos de arena, burbujas, gaviotas y conchas.' },
  { name: 'Agosto', emoji: '🎈', note: 'Fiesta de verano: banderines, globos, cometas de juguete, sandías, fuegos artificiales pequeños y un lago donde los niños se bañan y saltan.' },
  { name: 'Septiembre', emoji: '🎒', note: 'Vuelta al cole: lápices, libros y mochilas (sin verde), letras cayendo, avioncitos de papel, el autobús escolar y un colegio con niños que llegan con su mochila.' },
  { name: 'Octubre', emoji: '🎃', note: 'Halloween de noche suave (cielo violeta): menos calabazas y más fantasmas, brujas y vampiros, cuencos y bolsas de chuches, murciélagos y niños disfrazados pidiendo caramelos.' },
  { name: 'Noviembre', emoji: '🍂', note: 'Otoño: hojas cayendo, árboles dorados con borde marrón rojizo, setas, búho posado en un árbol, remolinos de viento, gansos que migran y un petirrojo en lugar de mariposas.' },
  { name: 'Diciembre', emoji: '🎄', note: 'Navidad: paisaje nevado, flores de Pascua, luces parpadeantes, árboles decorados, regalos de distintos tamaños, Rudolph entre los arbustos y el trineo de Papá Noel (renos delante).' },
]

const FACTORIES = [enero, febrero, marzo, abril, mayo, junio, julio, agosto, septiembre, octubre, noviembre, diciembre]

// month: 0-11 (enero = 0). variant solo cambia enero: 'reyes' (1-6) o 'nieve' (7-31).
export function createMonth(month, variant) {
  return FACTORIES[month](1000 + month * 7919, { variant })
}
