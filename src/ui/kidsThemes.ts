import rocketScene from '@/assets/ninos/cohete/scene.webp'
import rocketBoyStand from '@/assets/ninos/cohete/boy-stand.webp'
import rocketBoyCelebrate from '@/assets/ninos/cohete/boy-celebrate.webp'
import rocketGirlStand from '@/assets/ninos/cohete/girl-stand.webp'
import rocketGirlCelebrate from '@/assets/ninos/cohete/girl-celebrate.webp'
import dinoScene from '@/assets/ninos/dinosaurios/scene.webp'
import dinoBoyStand from '@/assets/ninos/dinosaurios/boy-stand.webp'
import dinoBoyCelebrate from '@/assets/ninos/dinosaurios/boy-celebrate.webp'
import dinoGirlStand from '@/assets/ninos/dinosaurios/girl-stand.webp'
import dinoGirlCelebrate from '@/assets/ninos/dinosaurios/girl-celebrate.webp'
import treeScene from '@/assets/ninos/arbol/scene.webp'
import treeBoyStand from '@/assets/ninos/arbol/boy-stand.webp'
import treeBoyCelebrate from '@/assets/ninos/arbol/boy-celebrate.webp'
import treeGirlStand from '@/assets/ninos/arbol/girl-stand.webp'
import treeGirlCelebrate from '@/assets/ninos/arbol/girl-celebrate.webp'
import oceanScene from '@/assets/ninos/fondo-marino/scene.webp'
import oceanBoyStand from '@/assets/ninos/fondo-marino/boy-stand.webp'
import oceanBoyCelebrate from '@/assets/ninos/fondo-marino/boy-celebrate.webp'
import oceanGirlStand from '@/assets/ninos/fondo-marino/girl-stand.webp'
import oceanGirlCelebrate from '@/assets/ninos/fondo-marino/girl-celebrate.webp'
import castleScene from '@/assets/ninos/castillo/scene.webp'
import castleBoyStand from '@/assets/ninos/castillo/boy-stand.webp'
import castleBoyCelebrate from '@/assets/ninos/castillo/boy-celebrate.webp'
import castleGirlStand from '@/assets/ninos/castillo/girl-stand.webp'
import castleGirlCelebrate from '@/assets/ninos/castillo/girl-celebrate.webp'
import jungleScene from '@/assets/ninos/selva/scene.webp'
import jungleBoyStand from '@/assets/ninos/selva/boy-stand.webp'
import jungleBoyCelebrate from '@/assets/ninos/selva/boy-celebrate.webp'
import jungleGirlStand from '@/assets/ninos/selva/girl-stand.webp'
import jungleGirlCelebrate from '@/assets/ninos/selva/girl-celebrate.webp'
import rainbowScene from '@/assets/ninos/arcoiris/scene.webp'
import rainbowBoyStand from '@/assets/ninos/arcoiris/boy-stand.webp'
import rainbowBoyCelebrate from '@/assets/ninos/arcoiris/boy-celebrate.webp'
import rainbowGirlStand from '@/assets/ninos/arcoiris/girl-stand.webp'
import rainbowGirlCelebrate from '@/assets/ninos/arcoiris/girl-celebrate.webp'
import fireScene from '@/assets/ninos/bomberos/scene.webp'
import fireBoyStand from '@/assets/ninos/bomberos/boy-stand.webp'
import fireBoyCelebrate from '@/assets/ninos/bomberos/boy-celebrate.webp'
import fireGirlStand from '@/assets/ninos/bomberos/girl-stand.webp'
import fireGirlCelebrate from '@/assets/ninos/bomberos/girl-celebrate.webp'
import farmScene from '@/assets/ninos/granja/scene.webp'
import farmBoyStand from '@/assets/ninos/granja/boy-stand.webp'
import farmBoyCelebrate from '@/assets/ninos/granja/boy-celebrate.webp'
import farmGirlStand from '@/assets/ninos/granja/girl-stand.webp'
import farmGirlCelebrate from '@/assets/ninos/granja/girl-celebrate.webp'
import monsterScene from '@/assets/ninos/monstruos/scene.webp'
import monsterBoyStand from '@/assets/ninos/monstruos/boy-stand.webp'
import monsterBoyCelebrate from '@/assets/ninos/monstruos/boy-celebrate.webp'
import monsterGirlStand from '@/assets/ninos/monstruos/girl-stand.webp'
import monsterGirlCelebrate from '@/assets/ninos/monstruos/girl-celebrate.webp'
import thumbCohete from '@/assets/ninos/themes/cohete.webp'
import thumbDinosaurios from '@/assets/ninos/themes/dinosaurios.webp'
import thumbArbol from '@/assets/ninos/themes/arbol.webp'
import thumbFondoMarino from '@/assets/ninos/themes/fondo-marino.webp'
import thumbCastillo from '@/assets/ninos/themes/castillo.webp'
import thumbSelva from '@/assets/ninos/themes/selva.webp'
import thumbArcoiris from '@/assets/ninos/themes/arcoiris.webp'
import thumbBomberos from '@/assets/ninos/themes/bomberos.webp'
import thumbGranja from '@/assets/ninos/themes/granja.webp'
import thumbMonstruos from '@/assets/ninos/themes/monstruos.webp'

// Temas del medidor infantil. Cada tema con `meter` tiene su escena con una
// columna lisa que hace de regla (calibrada a mano sobre la imagen final:
// x/ancho de la columna y las filas de píxeles de su base y su punta) y los
// astronautas/personajes sueltos que se colocan a la altura medida. Los
// temas sin `meter` todavía no tienen su medidor dibujado.
export interface KidsMeter {
  scene: string
  sceneWidth: number
  sceneHeight: number
  column: { x: number; width: number; top: number; bottom: number }
  minCm: number
  maxCm: number
  // Cada personaje con su tamaño real en píxeles (para respetar su proporción).
  sprites: {
    boy: { stand: KidsSprite; celebrate: KidsSprite }
    girl: { stand: KidsSprite; celebrate: KidsSprite }
  }
}

export interface KidsSprite {
  src: string
  width: number
  height: number
}

export interface KidsTheme {
  id: string
  name: string
  thumb: string
  meter?: KidsMeter
}

export const KIDS_THEMES: KidsTheme[] = [
  {
    id: 'cohete',
    name: 'Cohete',
    thumb: thumbCohete,
    meter: {
      scene: rocketScene,
      sceneWidth: 573,
      sceneHeight: 1743,
      // Columna lisa del cohete: 40 cm en la base y 160 cm arriba.
      column: { x: 224, width: 120, top: 322, bottom: 1570 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: rocketBoyStand, width: 194, height: 404 },
          celebrate: { src: rocketBoyCelebrate, width: 274, height: 436 },
        },
        girl: {
          stand: { src: rocketGirlStand, width: 248, height: 410 },
          celebrate: { src: rocketGirlCelebrate, width: 287, height: 399 },
        },
      },
    },
  },
  {
    id: 'dinosaurios',
    name: 'Dinosaurios',
    thumb: thumbDinosaurios,
    meter: {
      scene: dinoScene,
      sceneWidth: 625,
      sceneHeight: 1742,
      // El cuello del diplodocus hace de regla: 40 cm en el suelo, 160 cm en la cabeza.
      column: { x: 398, width: 65, top: 221, bottom: 1564 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: dinoBoyStand, width: 213, height: 396 },
          celebrate: { src: dinoBoyCelebrate, width: 228, height: 368 },
        },
        girl: {
          stand: { src: dinoGirlStand, width: 225, height: 385 },
          celebrate: { src: dinoGirlCelebrate, width: 257, height: 383 },
        },
      },
    },
  },
  {
    id: 'arbol',
    name: 'Árbol',
    thumb: thumbArbol,
    meter: {
      scene: treeScene,
      sceneWidth: 644,
      sceneHeight: 1755,
      // El tronco hueco del árbol hace de regla.
      column: { x: 326, width: 78, top: 360, bottom: 1562 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: treeBoyStand, width: 212, height: 392 },
          celebrate: { src: treeBoyCelebrate, width: 227, height: 363 },
        },
        girl: {
          stand: { src: treeGirlStand, width: 226, height: 396 },
          celebrate: { src: treeGirlCelebrate, width: 257, height: 384 },
        },
      },
    },
  },
  {
    id: 'fondo-marino',
    name: 'Fondo marino',
    thumb: thumbFondoMarino,
    meter: {
      scene: oceanScene,
      sceneWidth: 626,
      sceneHeight: 1747,
      // La columna de coral hace de regla.
      column: { x: 304, width: 84, top: 247, bottom: 1542 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: oceanBoyStand, width: 211, height: 418 },
          celebrate: { src: oceanBoyCelebrate, width: 236, height: 394 },
        },
        girl: {
          stand: { src: oceanGirlStand, width: 206, height: 397 },
          celebrate: { src: oceanGirlCelebrate, width: 235, height: 403 },
        },
      },
    },
  },
  {
    id: 'castillo',
    name: 'Castillo',
    thumb: thumbCastillo,
    meter: {
      scene: castleScene,
      sceneWidth: 627,
      sceneHeight: 1731,
      // La torre central del castillo hace de regla.
      column: { x: 281, width: 91, top: 343, bottom: 1576 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: castleBoyStand, width: 215, height: 412 },
          celebrate: { src: castleBoyCelebrate, width: 234, height: 419 },
        },
        girl: {
          stand: { src: castleGirlStand, width: 247, height: 417 },
          celebrate: { src: castleGirlCelebrate, width: 230, height: 407 },
        },
      },
    },
  },
  {
    id: 'selva',
    name: 'Selva',
    thumb: thumbSelva,
    meter: {
      scene: jungleScene,
      sceneWidth: 638,
      sceneHeight: 1749,
      // El tronco con lianas hace de regla.
      column: { x: 290, width: 80, top: 264, bottom: 1543 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: jungleBoyStand, width: 212, height: 392 },
          celebrate: { src: jungleBoyCelebrate, width: 233, height: 372 },
        },
        girl: {
          stand: { src: jungleGirlStand, width: 226, height: 384 },
          celebrate: { src: jungleGirlCelebrate, width: 264, height: 383 },
        },
      },
    },
  },
  {
    id: 'arcoiris',
    name: 'Arcoíris',
    thumb: thumbArcoiris,
    meter: {
      scene: rainbowScene,
      sceneWidth: 600,
      sceneHeight: 1744,
      // La columna bajo el arcoíris hace de regla.
      column: { x: 286, width: 79, top: 276, bottom: 1546 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: rainbowBoyStand, width: 184, height: 426 },
          celebrate: { src: rainbowBoyCelebrate, width: 237, height: 409 },
        },
        girl: {
          stand: { src: rainbowGirlStand, width: 240, height: 387 },
          celebrate: { src: rainbowGirlCelebrate, width: 252, height: 384 },
        },
      },
    },
  },
  {
    id: 'bomberos',
    name: 'Bomberos',
    thumb: thumbBomberos,
    meter: {
      scene: fireScene,
      sceneWidth: 650,
      sceneHeight: 1747,
      // La torre del parque de bomberos hace de regla.
      column: { x: 291, width: 96, top: 286, bottom: 1535 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: fireBoyStand, width: 224, height: 444 },
          celebrate: { src: fireBoyCelebrate, width: 243, height: 395 },
        },
        girl: {
          stand: { src: fireGirlStand, width: 229, height: 391 },
          celebrate: { src: fireGirlCelebrate, width: 260, height: 388 },
        },
      },
    },
  },
  {
    id: 'granja',
    name: 'Granja',
    thumb: thumbGranja,
    meter: {
      scene: farmScene,
      sceneWidth: 635,
      sceneHeight: 1743,
      // El silo del granero hace de regla.
      column: { x: 277, width: 92, top: 316, bottom: 1539 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: farmBoyStand, width: 250, height: 426 },
          celebrate: { src: farmBoyCelebrate, width: 246, height: 414 },
        },
        girl: {
          stand: { src: farmGirlStand, width: 229, height: 388 },
          celebrate: { src: farmGirlCelebrate, width: 236, height: 383 },
        },
      },
    },
  },
  {
    id: 'monstruos',
    name: 'Monstruos',
    thumb: thumbMonstruos,
    meter: {
      scene: monsterScene,
      sceneWidth: 615,
      sceneHeight: 1732,
      // La torre del castillo de monstruos hace de regla.
      column: { x: 288, width: 88, top: 300, bottom: 1463 },
      minCm: 40,
      maxCm: 160,
      sprites: {
        boy: {
          stand: { src: monsterBoyStand, width: 215, height: 449 },
          celebrate: { src: monsterBoyCelebrate, width: 262, height: 423 },
        },
        girl: {
          stand: { src: monsterGirlStand, width: 226, height: 393 },
          celebrate: { src: monsterGirlCelebrate, width: 251, height: 388 },
        },
      },
    },
  },
]

export const DEFAULT_KIDS_THEME_ID = 'cohete'
