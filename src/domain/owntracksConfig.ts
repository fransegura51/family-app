// Configuración de OwnTracks para mandar la posición de UN miembro a PEPA con la app cerrada (ver
// supabase/functions/owntracks-ingest y la migración 0213). OwnTracks permite importar toda su configuración con un
// único enlace `owntracks:///config?inline=<base64 del JSON>`, así que quien lo conecta no teclea nada.

export const OWNTRACKS_SITE = 'https://owntracks.org/'

// Mismo umbral que aplica el servidor (ingest_member_location): una posición peor que esto no se guarda.
export const MAX_ACCURACY_M = 150

export interface OwnTracksSetupInput {
  endpointUrl: string
  memberId: string
  token: string
  memberName: string
}

// Identificador corto (2 letras, solo ASCII) que OwnTracks enseña como «cara» del dispositivo.
export function trackerId(name: string): string {
  const letters = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z]/g, '')
    .toUpperCase()
  return letters.length >= 2 ? letters.slice(0, 2) : (letters + 'PE').slice(0, 2)
}

// «monitoring» 2 = Move: GPS continuo con filtro de desplazamiento. Se elige sobre «Significant» (1) porque este usa
// antenas y avisa de una llegada con minutos y cientos de metros de retraso, que no sirve con lugares de 150 m. Cuesta
// más batería; se puede cambiar dentro de OwnTracks.
export function buildOwnTracksConfig(input: OwnTracksSetupInput): Record<string, string | number | boolean> {
  return {
    _type: 'configuration',
    mode: 3, // HTTP
    url: input.endpointUrl,
    auth: true,
    username: input.memberId,
    password: input.token,
    deviceId: 'pepa',
    tid: trackerId(input.memberName),
    monitoring: 2,
    locatorDisplacement: 50,
    locatorInterval: 120,
    ignoreInaccurateLocations: MAX_ACCURACY_M,
    extendedData: false,
  }
}

// El JSON es solo ASCII (el nombre solo entra como 2 letras), así que btoa es seguro. Se codifica como componente de
// URL para que '+', '/' y '=' del base64 no se interpreten como parte de la consulta.
export function ownTracksConfigLink(input: OwnTracksSetupInput): string {
  const json = JSON.stringify(buildOwnTracksConfig(input))
  return `owntracks:///config?inline=${encodeURIComponent(btoa(json))}`
}
