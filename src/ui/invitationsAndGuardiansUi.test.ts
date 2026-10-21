// «Dar acceso a PEPA» visible, invitación al crear una ficha, y «Es mi hijo/a» (Fase A). Lo que las pantallas prometen, comprobado sobre su código. La seguridad real vive en el servidor
// (src/data/invitationGate.test.ts y supabase/local-sql-tests): ocultar o enseñar un botón nunca es la seguridad.
import { describe, expect, it } from 'vitest'
import access from '@/ui/AccessInvitePanel.tsx?raw'
import family from '@/ui/FamilyScreen.tsx?raw'
import guardian from '@/ui/GuardianshipPanel.tsx?raw'
import reauth from '@/ui/ReauthStep.tsx?raw'
import onboarding from '@/ui/OnboardingScreen.tsx?raw'
import invitationsData from '@/data/invitations.ts?raw'

describe('Familia: «Dar acceso a PEPA» a la vista', () => {
  it('las fichas sin cuenta dicen «Sin acceso a PEPA» (los bebés no tienen cuenta)', () => {
    expect(family).toContain("{!m.linkedProfileId && m.memberType !== 'baby' && (")
    expect(family).toContain('Sin acceso a PEPA')
  })
  it('el botón visible sale solo a quien corresponde (administradora de la familia, o madre/padre vinculado solo para su hijo menor) y el servidor lo vuelve a comprobar', () => {
    expect(family).toContain('{canGiveAccess(m, profile, me, links) && <AccessInvitePanel member={m} inviterName={profile.displayName} />}')
    expect(invitationsData).toContain("supabase.rpc('create_member_invitation'")
  })
  it('NO se quita la opción de siempre del menú ⋯ hasta comprobar que la nueva funciona (la antigua sigue igual y solo para administradoras)', () => {
    expect(family).toContain('{!m.linkedProfileId && <InviteCodeButton memberId={m.id} memberName={m.name} />}')
    expect(family).toContain('🔑 Generar código de acceso')
    expect(family).toContain("generateMemberInviteCode(memberId)")
    expect(family).toContain('{isAdmin && menuOpenId === m.id && (')
  })
  it('al crear una ficha se ofrece «¿Quieres darle acceso ahora?» (no a bebés) y se aclara que crear la ficha no crea ninguna cuenta', () => {
    expect(family).toContain("if (memberType !== 'baby') {")
    expect(family).toContain('<p>¿Quieres darle acceso a PEPA ahora?</p>')
    expect(family).toContain('Crear la ficha no crea ninguna cuenta.')
    expect(family).toContain('<AccessInvitePanel member={offer.member} inviterName={inviterName} autoStart onClose={finishOffer} />')
    expect(family).toContain('inviterName={profile.displayName}')
  })
  it('«Ahora no» continúa exactamente como antes (pregunta de modo de cuentas o recarga de la lista)', () => {
    expect(family).toContain('const proceed = () => {')
    expect(family).toContain('if (isFinancialAdult(memberType) && existingAdults === 1) setShowModePrompt(true)')
    expect(family).toContain('Ahora no')
  })
})

describe('Panel de invitación: generar, copiar, compartir, caducidad, sin duplicar', () => {
  it('pide la invitación al servidor, que reutiliza la vigente en vez de crear otra, y enseña cuándo caduca', () => {
    expect(access).toContain('createMemberInvitation(member.id, regenerate)')
    expect(access).toContain('formatInvitationExpiry(invite.expiresAt)')
    expect(access).toContain('Caduca')
    expect(access).toContain('un solo uso')
    expect(access).toContain('Ya había una invitación vigente: es esta (no se ha creado otra).')
  })
  it('se puede copiar, compartir y mandar por WhatsApp con las instrucciones', () => {
    expect(access).toContain('navigator.clipboard.writeText(message)')
    expect(access).toContain('navigator.share({ text: message })')
    expect(access).toContain('whatsappShareUrl(message)')
    expect(access).toContain("buildInvitationMessage({ kind: 'member'")
  })
  it('generar otra invalida la anterior y pide confirmación (dos toques)', () => {
    expect(access).toContain('<ConfirmButton')
    expect(access).toContain('La invitación anterior dejará de valer')
    expect(access).toContain('generate(true)')
  })
  it('es un código de INVITACIÓN: el texto lo distingue del código de 6 cifras del correo', () => {
    expect(access).toContain('Invitación para que {member.name} cree su cuenta en PEPA')
    expect(access).not.toContain('OtpCodeField')
  })
})

describe('«Es mi hijo/a»: declaración honesta, identificación reciente y registro en el servidor', () => {
  it('se enseña solo en fichas de menores que no son la tuya ni de las que ya eres tutora (el servidor lo vuelve a comprobar)', () => {
    expect(family).toContain('{canDeclareGuardianship(m, profile, me, links) &&')
    expect(family).toContain('👪 Es mi hijo/a')
    expect(family).toContain('<GuardianshipPanel')
  })
  it('primero se lee y se acepta la declaración, que no se presenta como verificación documental', () => {
    expect(guardian).toContain('guardianshipDeclarationText(child.name, relationship)')
    expect(guardian).toContain('Confirmo esta declaración')
    expect(guardian).toContain('disabled={!accepted}')
    expect(guardian).toContain('PEPA no la comprueba con documentos')
    expect(guardian).not.toMatch(/verificad|certificad|acreditad/i)
  })
  it('después se confirma que eres tú (contraseña o código del correo) y SOLO entonces se registra en el servidor', () => {
    expect(guardian).toContain("setStep('verify')")
    expect(guardian).toContain('<ReauthStep')
    const registerCalls = guardian.match(/declareGuardianship\(/g) ?? []
    expect(registerCalls.length).toBe(1)
    expect(guardian.indexOf('declareGuardianship(')).toBeLessThan(guardian.indexOf('<ReauthStep'))
    expect(guardian).toMatch(/onVerified=\{async \(\) => \{\s*await register\(\)/)
    expect(guardian).toContain('GUARDIANSHIP_DECLARATION_VERSION')
    expect(reauth).toContain('run(() => confirmCurrentPassword(password), e)')
    expect(reauth).toContain('if (email) await verifyIdentityCode(email, code)')
    expect(reauth).toContain('await onVerified()')
    expect(reauth.indexOf('await identify()')).toBeLessThan(reauth.indexOf('await onVerified()'))
  })
  it('se pueden declarar varias personas por menor: no hay límite de tutores en la pantalla', () => {
    expect(family).not.toMatch(/links\.filter\([^)]*\)\.length\s*[<>]=?\s*\d/)
    expect(family).toContain('sin límite de personas')
  })
  it('los nombres de las personas vinculadas se ven en la ficha del menor', () => {
    expect(family).toContain('guardianNamesOf(m, order, links)')
    expect(family).toContain('GUARDIAN_RELATIONSHIP_LABELS[g.relationship].toLowerCase()')
  })
  it('los vínculos solo se piden si hay menores y la persona es adulta o administradora (una consulta más, solo entonces)', () => {
    expect(family).toContain("const canSeeLinks = profile.role === 'admin' || profile.role === 'adult'")
    expect(family).toContain("if (canSeeLinks && m.some((x) => x.memberType === 'child' || x.memberType === 'baby')) loadLinks()")
  })
})

describe('lo que NO se ha habilitado todavía (aplazado o pendiente de revisar)', () => {
  it('la revocación de vínculos no está en la app: ni botón ni llamada (diseño en revisión)', () => {
    for (const [name, text] of [['FamilyScreen', family], ['GuardianshipPanel', guardian], ['AccessInvitePanel', access], ['data/invitations', invitationsData]] as const) {
      expect(text, name).not.toMatch(/revoke_own_guardianship|revokeGuardianship|Retirar (mi )?vínculo/i)
    }
  })
  it('Fase B aplazada: ninguna pantalla cambia el correo de otra cuenta; «Cambiar correo» sigue solo en la ficha propia', () => {
    expect((family.match(/<ChangeEmailPanel/g) ?? []).length).toBe(1)
    expect(family).toContain('{m.linkedProfileId === profile.id && <ChangeEmailPanel compact onChanged={loadEmails} />}')
    for (const text of [family, guardian, access]) expect(text).not.toMatch(/updateUserById|requestChildEmailChange|changeChildEmail/)
  })
  it('la pantalla de alta ya no manda a «Familia → tu nombre» (la ruta real es «Dar acceso a PEPA» en la ficha)', () => {
    expect(onboarding).toContain('«Dar acceso a PEPA» en tu ficha')
    expect(onboarding).not.toContain('Familia → tu nombre')
  })
})
