import type { ProductionCollection } from './productionCollection'
import { assetVersions } from './deliveryManifest'

type Record = ProductionCollection['productions'][number]
function selected(path: string, id: string) { return path + (path.includes('?') ? '&' : '?') + 'record=' + encodeURIComponent(id) }
export function recordDetailPath(record: Record) { return selected('/productions/' + record.id + '/delivery/' + record.targetId, record.id) }
export function recordDecisionPath(record: Record) {
  const version = assetVersions.find(asset => asset.id === record.ledger.manifest?.assetId)?.version ?? 12
  return selected('/productions/' + record.id + '/reviews/R-2/compare?version=' + String(version), record.id)
}
