// Interruptor de seguridad del aprendizaje compartido en las LECTURAS de clase (Fase 5).
// Por defecto está activo. Si algo va mal en producción, se apaga en ese navegador con:
//     localStorage.setItem('pepa:shared-class', 'off')
// y las pantallas vuelven al comportamiento anterior (clase guardada → reglas por palabras clave), sin desplegar nada.
// Solo afecta a las lecturas: la escritura de correcciones manuales no depende de él.
const KEY = 'pepa:shared-class'

export function isSharedClassEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off'
  } catch {
    return true
  }
}

export function setSharedClassEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, 'off')
  } catch {
    // sin almacenamiento: se queda el valor por defecto
  }
}
