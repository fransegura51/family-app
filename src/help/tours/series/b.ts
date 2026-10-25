import type { TutorialSeries } from '@/help/tours/series/types'

// Tutoriales principales («series») con sus capítulos: Compras y Economía. Los capítulos viven en defs/g2/{compras,comprasTickets,economia}.ts, defs/g8/compras.ts, defs/g9/economia.ts, defs/g10/ajustes.ts
// y defs/comAnadirProducto.ts. Lo que está implementado pero sin validar en iPhone y Android (efectivo, varios medios de pago, devoluciones, duplicados) NO tiene serie: ver planned/b.ts.
export const SERIES_B: TutorialSeries[] = [
  // ─────────────── Compras
  {
    id: 'ser-compras-lista',
    module: 'compras',
    title: 'Preparar y usar tu lista',
    summary: 'Apunta productos, edítalos, usa el Modo compra, finaliza la compra y comparte la lista.',
    chapters: ['com-anadir-producto', 'tut-compras-editar-producto', 'tut-compras-marcar-comprado', 'tut-compras-finalizar-compra', 'tut-compras-compartir'],
    cardIds: ['com-anadir-producto', 'com-compartir'],
    synonyms: ['lista de la compra', 'añadir producto', 'modo compra', 'tachar', 'finalizar compra', 'compartir la lista', 'comprado'],
  },
  {
    id: 'ser-compras-tiendas',
    module: 'compras',
    title: 'Tiendas y clases',
    summary: 'Crea y ordena tus tiendas, agrupa la lista por tienda y gestiona las clases de productos.',
    chapters: ['tut-compras-tiendas', 'tut-compras-asignar-tienda', 'tut-compras-clase-historial'],
    cardIds: ['com-tiendas'],
    synonyms: ['mercadona', 'tienda', 'cadenas', 'agrupar por tienda', 'clase de producto', 'clasificación de productos', 'sin tienda'],
  },
  {
    id: 'ser-compras-tickets',
    module: 'compras',
    title: 'Registrar compras y tickets',
    summary: 'Registra una compra con ticket o sin él, revisa sus datos y productos, y mira qué pasa en Economía.',
    chapters: ['tut-compras-registrar-compra', 'tut-compras-subir-ticket', 'tut-compras-revisar-ticket', 'tut-compras-pago-economia', 'tut-compras-guardar-ticket'],
    cardIds: ['com-ticket'],
    synonyms: ['subir ticket', 'foto del ticket', 'leer ticket', 'compra sin ticket', 'añadir productos a mano', 'forma de pago', 'tickets guardados'],
  },
  {
    id: 'ser-compras-historial',
    module: 'compras',
    title: 'Historial y comparación de precios',
    summary: 'Consulta tus compras registradas, lee el Historial, compara precios entre tiendas y mira la Estadística compras.',
    chapters: ['tut-compras-consultar-compras', 'tut-compras-historial-precios', 'tut-compras-ficha-producto', 'tut-compras-comparar-lista', 'tut-compras-estadistica'],
    cardIds: ['com-historial-precios'],
    synonyms: ['historial de precios', 'precio de un producto', 'más barato', 'comparar tiendas', 'estadística de compras', 'cuánto he gastado'],
  },

  // ─────────────── Economía
  {
    id: 'ser-economia-moverte',
    module: 'economia',
    title: 'Moverte por Economía',
    summary: 'Cambia de sección con el menú ☰, lee Mis cuentas y el Resumen, elige el periodo y localiza los gastos pendientes.',
    chapters: ['tut-economia-menu-pestanas', 'tut-economia-cuentas-resumen', 'tut-economia-periodo-fecha', 'tut-economia-ver-pendientes'],
    cardIds: ['eco-moverse', 'eco-pendientes'],
    synonyms: ['menú de economía', 'mis cuentas', 'resumen', 'periodo', 'fecha', 'conclusiones de pepa', 'pendientes de clasificar'],
  },
  {
    id: 'ser-economia-apuntar',
    module: 'economia',
    title: 'Registrar ingresos y gastos',
    summary: 'Apunta un gasto o un ingreso, encuentra y corrige un movimiento y conoce tus categorías y etiquetas.',
    chapters: ['tut-economia-apuntar-movimiento', 'tut-economia-cambiar-categoria', 'tut-economia-categorias-etiquetas'],
    cardIds: ['eco-nuevo-movimiento', 'eco-categorias', 'eco-pendientes'],
    synonyms: ['nuevo movimiento', 'apuntar gasto', 'cambiar categoría', 'etiquetas', 'categorías', 'clasificar pendientes', 'buscar un movimiento'],
  },
  {
    id: 'ser-economia-cuentas',
    module: 'economia',
    title: 'Cuentas, bancos y efectivo',
    summary: 'Conecta tu banco, sincroniza sus movimientos y entiende de quién es cada cuenta y qué ve cada persona.',
    chapters: ['tut-economia-conectar-banco', 'tut-economia-sincronizar', 'tut-economia-modo-cuentas'],
    cardIds: ['eco-banco', 'eco-modo-cuentas'],
    synonyms: ['conectar banco', 'sincronizar', '90 días', 'cuentas compartidas', 'cuentas separadas', 'de quién es la cuenta', 'open banking'],
  },
  {
    id: 'ser-economia-pagos',
    module: 'economia',
    title: 'Pagos previstos y conciliación',
    summary: 'Anota pagos que vendrán, mira lo que viene y revisa las propuestas de unir un cargo del banco con un pago previsto.',
    chapters: ['tut-economia-anadir-pago-previsto', 'tut-economia-ver-prevision', 'tut-economia-revisar-conciliacion'],
    cardIds: ['eco-prevision'],
    synonyms: ['previsión de pagos', 'pagos futuros', 'recibos', 'conciliar', 'visión 12 meses', 'pagos recurrentes', 'confirmar cargo'],
  },
  {
    id: 'ser-economia-numeros',
    module: 'economia',
    title: 'Entender tus números',
    summary: 'Mes contable y filtros de periodo, estadísticas, presupuestos e informe imprimible.',
    chapters: ['tut-economia-mes-contable', 'tut-economia-filtros-temporales', 'tut-economia-ver-estadisticas', 'tut-economia-crear-presupuesto', 'tut-economia-informe'],
    cardIds: ['eco-mes-contable', 'eco-estadisticas', 'eco-presupuesto'],
    synonyms: ['mes contable', 'filtros temporales', 'estadísticas', 'presupuesto', 'informe', 'evolución', 'comparado con el periodo anterior'],
  },
]
