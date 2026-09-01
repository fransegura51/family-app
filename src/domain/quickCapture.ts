// Divide una frase dictada/escrita en varios apuntes sueltos — "leche,
// patata, huevo" son tres cosas que apuntar, no una sola con ese nombre
// larguísimo. Separa por comas y por " y " (muy natural al hablar en
// español: "leche, patata y huevo").
export function splitEntries(text: string): string[] {
  return text
    .split(/,| y /i)
    .map((s) => s.trim())
    .filter(Boolean)
}
