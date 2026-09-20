// Petición real: "darle al usuario a elegir qué clases de tonos quiere:
// pastel, saturados... y según la elección general cambiar todos los
// colores de la app", y luego "bifurcar las definiciones de color de los
// menús y las estadísticas": dos ajustes independientes, por dispositivo
// (localStorage), como el orden del menú.
//  - Interfaz (menús, tarjetas, filas, calendario...): pastel, vivo o neutro.
//  - Estadísticas y gráficos (dónuts, leyendas, barras): pastel o vivo.
//
// Los colores se calculan al cargar cada pantalla (y algunos al cargar la
// propia app), así que cambiar de estilo recarga la app entera — es lo
// único que garantiza que TODO se repinta con el estilo nuevo.
export type ColorTheme = 'pastel' | 'vivo' | 'neutro'
export type ChartColorTheme = 'pastel' | 'vivo'

const UI_KEY = 'familyapp:color-theme'
const CHART_KEY = 'familyapp:chart-color-theme'

export function getColorTheme(): ColorTheme {
  try {
    const raw = localStorage.getItem(UI_KEY)
    return raw === 'vivo' || raw === 'neutro' || raw === 'pastel' ? raw : 'pastel'
  } catch {
    return 'pastel'
  }
}

export function getChartColorTheme(): ChartColorTheme {
  try {
    return localStorage.getItem(CHART_KEY) === 'vivo' ? 'vivo' : 'pastel'
  } catch {
    return 'pastel'
  }
}

// El CSS reacciona al ajuste de interfaz (fondos de fila, fines de semana,
// texto secundario más oscuro sobre fondos vivos...) con este atributo.
export function applyColorTheme(): void {
  document.documentElement.dataset.colorTheme = getColorTheme()
  document.documentElement.dataset.chartTheme = getChartColorTheme()
}

export function saveColorTheme(theme: ColorTheme): void {
  try {
    localStorage.setItem(UI_KEY, theme)
  } catch {
    // localStorage no disponible (privado/bloqueado): el cambio no se recuerda entre visitas.
  }
  applyColorTheme()
}

export function saveChartColorTheme(theme: ChartColorTheme): void {
  try {
    localStorage.setItem(CHART_KEY, theme)
  } catch {
    // Ídem.
  }
  applyColorTheme()
}
