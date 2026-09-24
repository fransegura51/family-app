// Abre una pestaña aparte con un HTML ya construido y lanza el diálogo
// de imprimir del propio navegador (gratis, sin librería PDF — "Guardar
// como PDF" ya está en ese diálogo en cualquier móvil u ordenador).
// Mismo mecanismo que ya usa Economía (FinanceScreen.tsx →
// openBudgetReport), generalizado aquí para cualquier HTML ya
// construido — sin tocar ese archivo ni ese módulo.
export function openPrintReport(html: string): void {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  win.print()
}
