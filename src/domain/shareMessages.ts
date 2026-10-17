// Mensajes amables al compartir enlaces (el enlace va SIEMPRE dentro del texto: en Android algunas apps pierden el campo `url` aparte).

// Lista de deseos con invitados. La vista previa de WhatsApp es de marca (la web no puede poner el nombre en la tarjeta sin un servidor de HTML); el nombre va en el propio mensaje.
export function buildWishlistShareText(ownerName: string, url: string): string {
  const name = ownerName.replace(/\s+/g, ' ').trim()
  const head = name ? `🎁 Lista de deseos de ${name}` : '🎁 Lista de deseos'
  return `${head}\nÁbrela para ver los regalos y reservar uno, sin crear cuenta:\n${url}`
}

export function wishlistShareTitle(ownerName: string): string {
  const name = ownerName.replace(/\s+/g, ' ').trim()
  return name ? `Lista de deseos de ${name}` : 'Lista de deseos'
}
