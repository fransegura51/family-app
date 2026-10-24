import type { TourDef } from '@/help/tours/types'
import {
  tutConfiguracionAccesosNuevos,
  tutConfiguracionNombreFamilia,
  tutConfiguracionSincronizacion,
  tutEconomiaModoCuentas,
  tutEconomiaMesContable,
  tutPepaBotones,
  tutPepaSinTarjeta,
} from '@/help/tours/defs/g10/ajustes'
import {
  tutAyudaResenas,
  tutCuentasBorrarCuenta,
  tutCuentasCerrarSesion,
  tutCuentasCorreoContrasena,
  tutCuentasEntrar,
  tutCuentasOlvidePin,
  tutCuentasPin,
  tutNotificacionesActivar,
  visitaCuentas,
  visitaNotificaciones,
} from '@/help/tours/defs/g10/cuentas'

// Grupo g10: ajustes de Configuración (Pepa, Economía, nombre de la familia, accesos), avisos del móvil, Cuenta, reseñas de la Ayuda y las visitas de Avisos y Cuenta.
export const TOURS_G10: TourDef[] = [
  visitaNotificaciones,
  visitaCuentas,
  tutPepaBotones,
  tutPepaSinTarjeta,
  tutEconomiaMesContable,
  tutEconomiaModoCuentas,
  tutConfiguracionNombreFamilia,
  tutConfiguracionAccesosNuevos,
  tutConfiguracionSincronizacion,
  tutNotificacionesActivar,
  tutCuentasPin,
  tutCuentasOlvidePin,
  tutCuentasCorreoContrasena,
  tutCuentasCerrarSesion,
  tutCuentasBorrarCuenta,
  tutCuentasEntrar,
  tutAyudaResenas,
]
