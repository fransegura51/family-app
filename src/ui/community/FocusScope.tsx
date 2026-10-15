import type { ReactNode } from 'react'
import { useDialogFocus } from '@/ui/community/useDialogFocus'

// Envoltorio que da a una ventana emergente el foco de teclado correcto (entra, no se escapa con el tabulador y vuelve al botón que la abrió) cuando la ventana
// se dibuja de forma condicional dentro de otra pantalla y no tiene un componente propio donde usar `useDialogFocus`. No añade nada visible (`display: contents`).
export function FocusScope({ children }: { children: ReactNode }) {
  const ref = useDialogFocus<HTMLDivElement>()
  return (
    <div ref={ref} style={{ display: 'contents' }}>
      {children}
    </div>
  )
}
