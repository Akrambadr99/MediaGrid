import type { ProductionCollection } from './productionCollection'

type Record = ProductionCollection['productions'][number]
function selected(path: string, id: string) { return path + (path.includes('?') ? '&' : '?') + 'record=' + encodeURIComponent(id) }
export function recordDetailPath(record: Record) { return selected('/productions/' + record.id + '/delivery/' + record.targetId, record.id) }
export function recordDecisionPath(record: Record) { return selected('/productions/' + record.id + '/reviews/R-2/compare', record.id) }
