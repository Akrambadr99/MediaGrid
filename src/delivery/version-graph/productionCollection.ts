import type { StoragePort } from '../../workspace/repository'
import { assetVersions, rightsGrants, target } from './deliveryManifest'
import { initialManifestLedger, readManifestLedger, recordManifest, requestRightsReview,
  reviseRights, reprocessManifest } from './manifestLedger'
import type { ManifestLedger } from './manifestLedger'
import { claimRightsReview, rightsWorkInbox } from './rightsWorkload'

export interface ProductionRecord { id: string; targetId: string; grantId: string; ledger: ManifestLedger; archived: boolean }
export interface GrantRecord { id: string; revision: number; valid: boolean; territory: string }
export interface ProductionEvent { sequence: number; action: string; targetId: string; relatedIds: readonly string[]; actor: string; sourceRevision: number }
export interface ProductionCollection { productions: readonly ProductionRecord[]; grants: readonly GrantRecord[]; events: readonly ProductionEvent[] }
export interface ProductionBatchResult { collection: ProductionCollection; updated: string[]; skipped: string[]; blocked: { id: string; reason: string }[] }
const key = 'mediagrid:production-collection:v1'

function manifestFor(targetId: string): ManifestLedger {
  const delivery = targetId === 'STREAM-US' ? { ...target, id: 'STREAM-US', territory: 'US' } : target
  const readyAsset = assetVersions.find(asset => asset.qc === 'pass')
  if (!readyAsset) throw new Error('No release-ready asset is available.')
  return recordManifest(initialManifestLedger, readyAsset, delivery, rightsGrants)
}
function reviewFor(targetId: string): ManifestLedger {
  return requestRightsReview(manifestFor(targetId), 13, 'delivery producer')
}
export function seedProductionCollection(legacy: ManifestLedger = initialManifestLedger): ProductionCollection {
  return { productions: [
    { id: 'PROD-77', targetId: 'STREAM-EU', grantId: 'RG-EU-4', ledger: legacy, archived: false },
    { id: 'PROD-78', targetId: 'STREAM-EU', grantId: 'RG-EU-4', ledger: reviewFor('STREAM-EU'), archived: false },
    { id: 'PROD-79', targetId: 'STREAM-EU', grantId: 'RG-EU-4', ledger: reviewFor('STREAM-EU'), archived: false },
    { id: 'PROD-80', targetId: 'STREAM-US', grantId: 'RG-US-3', ledger: reviewFor('STREAM-US'), archived: false },
    { id: 'PROD-81', targetId: 'STREAM-US', grantId: 'RG-US-3', ledger: manifestFor('STREAM-US'), archived: false },
    { id: 'PROD-82', targetId: 'STREAM-EU', grantId: 'RG-EU-4', ledger: manifestFor('STREAM-EU'), archived: true },
  ], grants: [
    { id: 'RG-EU-4', revision: 1, valid: true, territory: 'EU' },
    { id: 'RG-US-3', revision: 1, valid: true, territory: 'US' },
  ], events: [] }
}
export function readProductionCollection(storage: StoragePort): ProductionCollection {
  const raw = storage.getItem(key)
  if (!raw) return seedProductionCollection(readManifestLedger(storage))
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('productions' in value) || !Array.isArray(value.productions) ||
    !('grants' in value) || !Array.isArray(value.grants) || !('events' in value) || !Array.isArray(value.events))
    throw new Error('Invalid production collection.')
  return value as ProductionCollection
}
export function saveProductionCollection(storage: StoragePort, collection: ProductionCollection): ProductionCollection {
  storage.setItem(key, JSON.stringify(collection))
  return collection
}
export function productionById(collection: ProductionCollection, id: string): ProductionRecord {
  const record = collection.productions.find(item => item.id === id)
  if (!record) throw new Error(`Production ${id} was not found.`)
  return record
}
export function productionRows(collection: ProductionCollection, query = '', filter = 'active'): ProductionRecord[] {
  const needle = query.trim().toLowerCase()
  return collection.productions.filter(item => (filter === 'all' || (filter === 'archived') === item.archived) &&
    (!needle || [item.id, item.targetId, item.grantId, item.ledger.manifest?.assetId ?? ''].some(value =>
      value.toLowerCase().includes(needle)))).toSorted((a, b) => a.id.localeCompare(b.id))
}
export function productionRightsInbox(collection: ProductionCollection, actorId?: string) {
  return rightsWorkInbox(collection.productions.filter(item => !item.archived).map(item => ({
    productionId: item.id, ledger: item.ledger,
  })), actorId)
}
export function productionSummary(collection: ProductionCollection) {
  const active = collection.productions.filter(item => !item.archived)
  const inbox = productionRightsInbox(collection)
  return { active: active.length, archived: collection.productions.length - active.length,
    published: active.filter(item => Boolean(item.ledger.manifest)).length,
    unclaimed: inbox.filter(item => item.status === 'open' && item.assigneeId === null).length,
    stale: inbox.filter(item => item.status === 'stale').length }
}
function log(collection: ProductionCollection, action: string, targetId: string, relatedIds: readonly string[],
  actor: string, sourceRevision: number): ProductionEvent {
  return { sequence: collection.events.length + 1, action, targetId, relatedIds, actor, sourceRevision }
}
function replace(collection: ProductionCollection, record: ProductionRecord, action: string, actor: string): ProductionCollection {
  return { ...collection, productions: collection.productions.map(item => item.id === record.id ? record : item),
    events: [...collection.events, log(collection, action, record.id, [record.grantId], actor, record.ledger.revision)] }
}
export function claimProductionRights(collection: ProductionCollection, id: string, reviewerId: string,
  expectedRevision: number): ProductionCollection {
  const record = productionById(collection, id)
  if (record.archived) throw new Error('Archived productions cannot be claimed.')
  const ledger = claimRightsReview({ productionId: id, ledger: record.ledger }, reviewerId,
    collection.productions.filter(item => !item.archived).map(item => ({ productionId: item.id, ledger: item.ledger })),
    expectedRevision)
  return replace(collection, { ...record, ledger }, 'rights-review-claimed', reviewerId)
}
export function setGrantValidity(collection: ProductionCollection, id: string, valid: boolean,
  actor: string, expectedRevision: number): ProductionBatchResult {
  const grant = collection.grants.find(item => item.id === id)
  if (!grant) throw new Error('Rights grant was not found.')
  if (grant.revision !== expectedRevision) throw new Error('Grant revision changed before update.')
  if (grant.valid === valid) return { collection, updated: [], skipped: [id], blocked: [] }
  const updated: string[] = []
  const skipped: string[] = []
  const productions = collection.productions.map(record => {
    if (record.archived || record.grantId !== id) { skipped.push(record.id); return record }
    if (record.ledger.rightsValid === valid) { skipped.push(record.id); return record }
    updated.push(record.id)
    return { ...record, ledger: reviseRights(record.ledger, valid) }
  })
  const revision = grant.revision + 1
  return { collection: { ...collection, productions, grants: collection.grants.map(item => item.id === id ?
    { ...item, revision, valid } : item), events: [...collection.events,
    log(collection, valid ? 'grant-restored' : 'grant-invalidated', id, updated, actor, revision)] },
    updated, skipped, blocked: [] }
}
export function reprocessProductions(collection: ProductionCollection, ids: readonly string[]): ProductionBatchResult {
  let next = collection
  const updated: string[] = []
  const skipped: string[] = []
  const blocked: { id: string; reason: string }[] = []
  for (const id of [...new Set(ids)]) {
    const record = next.productions.find(item => item.id === id)
    if (record?.ledger.manifest?.rightsRevision === record?.ledger.rightsRevision) { skipped.push(id); continue }
    try {
      const current = productionById(next, id)
      if (current.archived) throw new Error('Archived productions cannot be reprocessed.')
      const source = next.grants.find(item => item.id === current.grantId)
      if (!source?.valid) throw new Error('The linked rights grant is invalid.')
      next = replace(next, { ...current, ledger: reprocessManifest(current.ledger) }, 'manifest-reprocessed', 'delivery producer')
      updated.push(id)
    } catch (error) { blocked.push({ id, reason: error instanceof Error ? error.message : 'Reprocessing failed.' }) }
  }
  return { collection: next, updated, skipped, blocked }
}
export function createProduction(collection: ProductionCollection, id: string, targetId: string,
  grantId: string): ProductionCollection {
  if (!/^PROD-\d+$/.test(id) || collection.productions.some(item => item.id === id)) throw new Error('Choose a unique production ID.')
  const grant = collection.grants.find(item => item.id === grantId)
  if (!grant) throw new Error('A referenced rights grant is required.')
  if (targetId !== (grant.territory === 'EU' ? 'STREAM-EU' : 'STREAM-US')) throw new Error('Grant territory must match delivery target.')
  const record: ProductionRecord = { id, targetId, grantId, ledger: initialManifestLedger, archived: false }
  return { ...collection, productions: [...collection.productions, record], events: [...collection.events,
    log(collection, 'production-created', id, [grantId], 'delivery producer', record.ledger.revision)] }
}
export function archiveProduction(collection: ProductionCollection, id: string): ProductionCollection {
  const record = productionById(collection, id)
  if (record.archived) return collection
  if (record.ledger.rightsReviews?.some(item => item.status === 'open') || record.ledger.adoptedReviewVersion !== null)
    throw new Error('Open rights review or adopted version prevents archival.')
  return replace(collection, { ...record, archived: true }, 'production-archived', 'delivery producer')
}
