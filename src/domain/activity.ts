import type { ActivityEntry } from '@/data/activity'

const TABLE_LABELS: Record<string, string> = {
  family_members: 'un miembro',
  calendar_events: 'un evento',
  tasks: 'una tarea',
  shopping_items: 'un producto de la lista',
  expenses: 'un gasto',
  automation_rules: 'una regla de automatización',
}

const ACTION_LABELS: Record<ActivityEntry['action'], string> = {
  insert: 'creó',
  update: 'modificó',
  delete: 'eliminó',
}

export function describeActivity(entry: ActivityEntry): string {
  const who = entry.actorName ?? 'Alguien'
  const what = TABLE_LABELS[entry.tableName] ?? entry.tableName
  const verb = ACTION_LABELS[entry.action]
  return `${who} ${verb} ${what}`
}
