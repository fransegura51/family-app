import { describe, expect, it } from 'vitest'
import voiceCapture from '@/ui/VoiceCapture.tsx?raw'
import locationScreen from '@/ui/LocationScreen.tsx?raw'
import locationMap from '@/ui/LocationMap.tsx?raw'

// «Pepa, ¿dónde está Eric?»: las piezas tienen que seguir conectadas entre sí (el contestar, abrir el mapa centrado y el botón de Google Maps).
describe('«¿dónde está X?»: conexiones entre piezas', () => {
  it('VoiceCapture da a Pepa quién comparte, la dirección y si la cuenta ve Ubicación, y abre el mapa en esa persona', () => {
    expect(voiceCapture).toContain('consents: () => listConsents()')
    expect(voiceCapture).toContain("canSeeLocation: () => canAccessSection('ubicacion')")
    expect(voiceCapture).toContain("outcome.kind === 'member-location'")
    expect(voiceCapture).toContain('requestMemberFocus(')
  })
  it('la pantalla de Ubicación recoge el aviso, selecciona a esa persona y ofrece abrirla en Google Maps', () => {
    expect(locationScreen).toContain('consumeMemberFocus()')
    expect(locationScreen).toContain('focusMemberId={memberFocus}')
    expect(locationScreen).toContain('Abrir en Google Maps')
  })
  it('el mapa se centra y se acerca a la persona pedida', () => {
    expect(locationMap).toContain('focusMemberId')
    expect(locationMap).toContain('map.setZoom(16)')
  })
})
