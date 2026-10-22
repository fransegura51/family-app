import pepaAvatar from '@/assets/pepa/pepa-avatar.jpg'

// Representación OFICIAL de Pepa (la misma imagen del botón «Hablar con PEPA»), pequeña y discreta. No se redibuja ni se recorta más que en círculo.
export function PepaFace({ size = 36 }: { size?: number }) {
  return <img src={pepaAvatar} alt="" aria-hidden="true" className="help-pepa-face" width={size} height={size} />
}
