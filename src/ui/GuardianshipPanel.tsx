import { useState } from 'react'
import { declareGuardianship } from '@/data/invitations'
import {
  GUARDIANSHIP_DECLARATION_VERSION,
  GUARDIAN_RELATIONSHIP_LABELS,
  guardianshipDeclarationText,
  guardianshipErrorMessage,
  type GuardianRelationship,
} from '@/domain/guardianship'
import type { FamilyMember } from '@/domain/types'
import { ReauthStep } from '@/ui/ReauthStep'

// «Es mi hijo/a»: la persona adulta declara que es madre/padre (o tutora legal) de la ficha de un menor. Es una DECLARACIÓN, y se dice así: PEPA no la comprueba con documentos.
// Pasos: 1) leer y aceptar la declaración; 2) confirmar que eres tú (contraseña o código del correo); 3) el servidor registra el vínculo con su titular, fecha y tipo.
// Lo que ve esta pantalla es solo comodidad: el servidor (declare_guardianship) vuelve a comprobar que eres adulta/o con cuenta, que la ficha es de un menor de 18 años de tu familia,
// que no eres tú misma y que te has identificado hace menos de 5 minutos. No da permisos sobre cuentas de otras personas adultas.
export function GuardianshipPanel({ child, onDone, onCancel }: { child: FamilyMember; onDone: () => void; onCancel: () => void }) {
  const [relationship, setRelationship] = useState<GuardianRelationship>('parent')
  const [accepted, setAccepted] = useState(false)
  const [step, setStep] = useState<'declare' | 'verify'>('declare')
  const [error, setError] = useState<string | null>(null)

  async function register() {
    setError(null)
    try {
      await declareGuardianship(child.id, relationship, GUARDIANSHIP_DECLARATION_VERSION)
      onDone()
    } catch (err) {
      // El mensaje se enseña en la pantalla de verificación: el error del servidor no se oculta.
      throw new Error(guardianshipErrorMessage(err) ?? 'No se pudo registrar el vínculo. Inténtalo de nuevo.')
    }
  }

  return (
    <div className="card" style={{ marginTop: 8, padding: 12 }}>
      <strong>{relationship === 'parent' ? 'Es mi hijo/a' : 'Soy su tutor/a'}: {child.name}</strong>
      {step === 'declare' && (
        <>
          <label style={{ display: 'block', marginTop: 8 }}>
            Mi relación
            <select value={relationship} onChange={(e) => setRelationship(e.target.value as GuardianRelationship)}>
              {(Object.keys(GUARDIAN_RELATIONSHIP_LABELS) as GuardianRelationship[]).map((r) => (
                <option key={r} value={r}>
                  {GUARDIAN_RELATIONSHIP_LABELS[r]}
                </option>
              ))}
            </select>
          </label>
          <p className="muted" style={{ fontSize: 13 }}>
            {guardianshipDeclarationText(child.name, relationship)}
          </p>
          <label className="checkbox-label">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} /> Confirmo esta declaración
          </label>
          {error && <p className="error">{error}</p>}
          <button type="button" disabled={!accepted} onClick={() => setStep('verify')}>
            Continuar
          </button>
          <button type="button" className="link-button" onClick={onCancel}>
            Cancelar
          </button>
        </>
      )}
      {step === 'verify' && (
        <ReauthStep
          actionLabel="Confirmar y registrar el vínculo"
          onCancel={onCancel}
          onVerified={async () => {
            await register()
          }}
        />
      )}
    </div>
  )
}
