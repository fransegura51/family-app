// Petición real: "darle al usuario a elegir qué clases de tonos quiere:
// pastel, saturados... y según la elección general cambiar todos los
// colores de la app". Por dispositivo (localStorage), como el orden del
// menú: cada persona de la familia puede preferir el suyo.
//
// Los colores se calculan al cargar cada pantalla (y algunos al cargar la
// propia app), así que cambiar de estilo recarga la app entera — es lo
// único que garantiza que TODO se repinta con el estilo nuevo.
export type ColorTheme = 'pastel' | 'vivo'

const STORAGE_KEY = 'familyapp:color-theme'
const DEFAULT_THEME: ColorTheme = 'pastel'

export function getColorTheme(): ColorTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw === 'vivo' || raw === 'pastel' ? raw : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

// El CSS reacciona al mismo ajuste (fondos de fila, fines de semana,
// texto secundario más oscuro sobre fondos vivos...) con este atributo.
export function applyColorTheme(theme: ColorTheme = getColorTheme()): void {
  document.documentElement.dataset.colorTheme = theme
}

export function saveColorTheme(theme: ColorTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // localStorage no disponible (privado/bloqueado): el cambio no se recuerda entre visitas.
  }
  applyColorTheme(theme)
}
