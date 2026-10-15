import { MODERATION_SECTIONS, type ModerationSection } from '@/domain/communityAdmin'
import { HiddenPanel, ReadmissionsPanel, RemovalsPanel } from '@/ui/community/admin/ModerationLists'
import { ReportsPanel } from '@/ui/community/admin/ModerationReports'

// Moderación: denuncias agrupadas, contenido oculto, readmisiones y solicitudes de eliminación. Cada apartado carga SOLO cuando se abre.
export function ModerationTab({ section, onSection, onChanged }: { section: ModerationSection; onSection: (s: ModerationSection) => void; onChanged: () => void }) {
  return (
    <div className="cadm-stack">
      <div className="cadm-filter" role="group" aria-label="Apartados de moderación">
        {MODERATION_SECTIONS.map((s) => (
          <button key={s.id} type="button" className={`cadm-chip-button${section === s.id ? ' active' : ''}`} aria-pressed={section === s.id} onClick={() => onSection(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      {section === 'denuncias' && <ReportsPanel onChanged={onChanged} />}
      {section === 'ocultos' && <HiddenPanel onChanged={onChanged} />}
      {section === 'readmisiones' && <ReadmissionsPanel onChanged={onChanged} />}
      {section === 'eliminacion' && <RemovalsPanel onChanged={onChanged} />}
    </div>
  )
}
