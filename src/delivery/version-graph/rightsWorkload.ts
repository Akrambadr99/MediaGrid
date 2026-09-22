import type { ManifestLedger } from './manifestLedger'

export interface RightsReviewer {
  id: string
  name: string
  territories: readonly string[]
  maxOpenReviews: number
  available: boolean
}
export interface ProductionRightsRecord { productionId: string; ledger: ManifestLedger }
export interface RightsInboxItem {
  requestId: string
  productionId: string
  assetId: string
  targetId: string
  rightsId: string
  status: 'open' | 'stale'
  assigneeId: string | null
  sourceRevision: number
  actionable: boolean
}

export const rightsReviewers: readonly RightsReviewer[] = [
  { id: 'rights-maya', name: 'Maya Laurent', territories: ['STREAM-EU'], maxOpenReviews: 2, available: true },
  { id: 'rights-omar', name: 'Omar Haddad', territories: ['STREAM-EU', 'STREAM-US'], maxOpenReviews: 1, available: true },
  { id: 'rights-ana', name: 'Ana Silva', territories: ['STREAM-US'], maxOpenReviews: 2, available: false },
]

export function rightsWorkInbox(records: readonly ProductionRightsRecord[], actorId?: string): RightsInboxItem[] {
  return records.flatMap(({ productionId, ledger }) => (ledger.rightsReviews ?? []).filter(item =>
    item.status === 'open' || item.status === 'stale').map(item => ({
    requestId: item.id, productionId, assetId: item.assetId, targetId: ledger.manifest?.targetId ?? '',
    rightsId: ledger.manifest?.rightsId ?? '', status: item.status as 'open' | 'stale',
    assigneeId: item.assigneeId ?? null, sourceRevision: item.manifestRevision,
    actionable: item.status === 'open' && item.manifestRevision === ledger.revision &&
      item.rightsRevision === ledger.rightsRevision && ledger.rightsValid,
  }))).filter(item => actorId === undefined || item.assigneeId === actorId)
    .sort((a, b) => Number(b.actionable) - Number(a.actionable) ||
      Number(a.status === 'stale') - Number(b.status === 'stale') ||
      a.sourceRevision - b.sourceRevision || a.productionId.localeCompare(b.productionId) || a.requestId.localeCompare(b.requestId))
}

export function rightsReviewerLoad(records: readonly ProductionRightsRecord[], actorId: string): number {
  return rightsWorkInbox(records, actorId).filter(item => item.actionable).length
}

export function rightsEligibility(records: readonly ProductionRightsRecord[], state: ManifestLedger, actorId: string): string[] {
  const actor = rightsReviewers.find(item => item.id === actorId)
  const blockers: string[] = []
  if (!actor?.available) blockers.push('Rights reviewer is unavailable.')
  if (state.manifest && actor && !actor.territories.includes(state.manifest.targetId)) blockers.push('Reviewer lacks delivery territory scope.')
  if (actor && rightsReviewerLoad(records, actorId) >= actor.maxOpenReviews) blockers.push('Rights reviewer is at capacity.')
  if (actorId === state.manifestOwner) blockers.push('Manifest producer cannot independently review rights.')
  return blockers
}

export function claimRightsReview(record: ProductionRightsRecord, actorId: string,
  records: readonly ProductionRightsRecord[], expectedRevision: number): ManifestLedger {
  const state = record.ledger
  if (state.revision !== expectedRevision) throw new Error('Manifest revision changed before claim.')
  const review = (state.rightsReviews ?? []).find(item => item.status === 'open')
  if (review?.manifestRevision !== state.revision || review.rightsRevision !== state.rightsRevision ||
    !state.rightsValid || state.manifest?.rightsRevision !== state.rightsRevision)
    throw new Error('Only a current rights-cleared manifest review may be claimed.')
  if (review.assigneeId) throw new Error('Rights review is already claimed.')
  const blockers = rightsEligibility(records, state, actorId)
  if (blockers.length) throw new Error(blockers[0])
  const revision = state.revision + 1
  return { ...state, revision, rightsReviews: state.rightsReviews?.map(item => item.id === review.id ?
    { ...item, assigneeId: actorId, manifestRevision: revision } : item),
    history: [...state.history, { revision, action: 'rights-review-claimed', assetId: review.assetId, actor: actorId }] }
}

export function releaseRightsClaim(state: ManifestLedger, actorId: string): ManifestLedger {
  const review = (state.rightsReviews ?? []).find(item => item.status === 'open' && item.assigneeId === actorId)
  if (review?.manifestRevision !== state.revision) throw new Error('Only the current rights reviewer may release a claim.')
  const revision = state.revision + 1
  return { ...state, revision, rightsReviews: state.rightsReviews?.map(item => item.id === review.id ?
    { ...item, assigneeId: null, manifestRevision: revision } : item),
    history: [...state.history, { revision, action: 'rights-claim-released', assetId: review.assetId, actor: actorId }] }
}

export function rightsBundle(records: readonly ProductionRightsRecord[], rightsId: string): RightsInboxItem[] {
  return rightsWorkInbox(records).filter(item => item.rightsId === rightsId)
}
