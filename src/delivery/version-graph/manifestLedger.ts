import type { StoragePort, StorageReader } from '../../platform/storage-port'
import { assetVersions, buildManifest, rightsGrants, target } from './deliveryManifest'
import type { AssetVersion, DeliveryTarget, RightsGrant } from './deliveryManifest'

export interface DeliveryManifest {
  targetId: string
  assetId: string
  rightsId: string
  deliveredAt: string
  captionsVersion: number
  audioVersion: number
  rightsRevision: number
}
export interface ManifestLedger {
  manifest: DeliveryManifest | null
  adoptedReviewVersion: number | null
  rightsRevision: number
  rightsValid: boolean
  reviewRightsRevision: number | null
  manifestOwner: string
  reviewApprover: string | null
  rightsReviews?: readonly RightsReview[] | undefined
  revision: number
  history: readonly { revision: number; action: string; assetId: string; actor?: string }[]
}
export interface RightsReview {
  id: string
  assetId: string
  candidateVersion: number
  rightsRevision: number
  manifestRevision: number
  requestedBy: string
  assignee: string
  assigneeId?: string | null
  status: 'open' | 'stale' | 'completed' | 'superseded' | 'cancelled'
  supersedesId?: string
  outcome?: 'adopted' | 'changes_requested'
}
const key = 'mediagrid:production:PROD-77:delivery:v1'
export const initialManifestLedger: ManifestLedger = { manifest: null, adoptedReviewVersion: null, rightsRevision: 0, rightsValid: true, reviewRightsRevision: null, manifestOwner: 'delivery producer', reviewApprover: null, rightsReviews: [], revision: 0, history: [] }
export function readManifestLedger(storage: StorageReader): ManifestLedger {
  const raw = storage.getItem(key)
  if (!raw) return initialManifestLedger
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('manifest' in value) ||
    (value.manifest !== null && typeof value.manifest !== 'object') ||
    !('adoptedReviewVersion' in value) || (value.adoptedReviewVersion !== null && typeof value.adoptedReviewVersion !== 'number') ||
    !('revision' in value) || typeof value.revision !== 'number' ||
    !('history' in value) || !Array.isArray(value.history)) throw new Error('Invalid delivery-manifest record.')
  const record = value as Omit<ManifestLedger, 'rightsRevision' | 'rightsValid' | 'reviewRightsRevision' | 'manifest' | 'manifestOwner' | 'reviewApprover'> &
    Partial<Pick<ManifestLedger, 'rightsRevision' | 'rightsValid' | 'reviewRightsRevision' | 'manifestOwner' | 'reviewApprover'>> &
    { manifest: (Omit<DeliveryManifest, 'rightsRevision'> & Partial<Pick<DeliveryManifest, 'rightsRevision'>>) | null }
  return { ...record, rightsRevision: record.rightsRevision ?? 0, rightsValid: record.rightsValid ?? true,
    reviewRightsRevision: record.reviewRightsRevision ?? (record.adoptedReviewVersion === null ? null : 0),
    manifest: record.manifest ? { ...record.manifest, rightsRevision: record.manifest.rightsRevision ?? 0 } : null,
    manifestOwner: record.manifestOwner ?? 'delivery producer', reviewApprover: record.reviewApprover ?? null,
    rightsReviews: record.rightsReviews ?? [] }
}
export function rightsInbox(state: ManifestLedger, actor: string): RightsReview[] {
  return (state.rightsReviews ?? []).filter(item => item.assignee === actor && item.status === 'open')
}
export function requestRightsReview(state: ManifestLedger, version: number, actor: string, assignee = 'rights approver'): ManifestLedger {
  if (actor !== state.manifestOwner || assignee !== 'rights approver' || actor === assignee) throw new Error('Manifest producer must hand off to independent rights approval.')
  if (reviewBlockers(state, version).length || state.adoptedReviewVersion !== null) throw new Error('A current rights-cleared manifest is required.')
  if (state.rightsReviews?.some(item => item.status === 'open')) throw new Error('A rights review is already open.')
  const previous = [...(state.rightsReviews ?? [])].reverse().find(item => item.status === 'stale')
  const revision = state.revision + 1
  const request: RightsReview = { id: `RIGHTS-${String(version)}-${String(revision)}`, assetId: state.manifest?.assetId ?? '',
    candidateVersion: version, rightsRevision: state.rightsRevision, manifestRevision: revision,
    requestedBy: actor, assignee, assigneeId: null, status: 'open', ...(previous ? { supersedesId: previous.id } : {}) }
  return { ...state, revision, rightsReviews: [...(state.rightsReviews ?? []).map(item => item.id === previous?.id ?
    { ...item, status: 'superseded' as const } : item), request],
    history: [...state.history, { revision, action: 'rights-review-requested', assetId: request.assetId, actor }] }
}
function withEvent(state: ManifestLedger, action: string, assetId: string, actor?: string): ManifestLedger {
  const revision = state.revision + 1
  return { ...state, revision, history: [...state.history, { revision, action, assetId, ...(actor ? { actor } : {}) }] }
}
export function recordManifest(state: ManifestLedger, asset: AssetVersion, target: DeliveryTarget, rights: readonly RightsGrant[]): ManifestLedger {
  if (state.manifest) throw new Error('A delivery manifest already exists.')
  if (!state.rightsValid) throw new Error('Active rights grant is invalid.')
  const manifest = { ...buildManifest(asset, target, rights), rightsRevision: state.rightsRevision }
  return withEvent({ ...state, manifest }, 'manifest-created', asset.id)
}
export function reviewBlockers(state: ManifestLedger, candidateVersion: number): string[] {
  if (!state.manifest) return ['A rights-cleared delivery manifest is required before review adoption.']
  if (!state.rightsValid) return ['Active rights grant is invalid; review cannot proceed.']
  if (state.manifest.rightsRevision !== state.rightsRevision) return ['Published manifest is stale after a rights revision. Reprocess it before review.']
  if (state.manifest.assetId !== 'MASTER-v' + String(candidateVersion)) return ['Candidate version does not match the published delivery manifest.']
  return []
}
export function rightsReviewPolicy(state: ManifestLedger, version: number, actor: string): { allowed: boolean; blockers: string[]; queue: 'manifest' | 'rights-review' | 'rights-recovery' } {
  const blockers = reviewBlockers(state, version)
  if (actor !== 'rights approver') blockers.push('Only rights approval may adopt a published version.')
  if (actor === state.manifestOwner) blockers.push('Manifest producer cannot approve their own delivery.')
  return { allowed: blockers.length === 0, blockers, queue: !state.manifest ? 'manifest' : reviewStaleReasons(state).length ? 'rights-recovery' : 'rights-review' }
}
export function adoptReviewedVersion(state: ManifestLedger, version: number, actor: string, reviewerId?: string): ManifestLedger {
  const blockers = rightsReviewPolicy(state, version, actor).blockers
  if (blockers.length) throw new Error(blockers[0])
  if (state.adoptedReviewVersion !== null) throw new Error('A review version is already adopted.')
  if (state.rightsReviews?.length && !rightsInbox(state, actor).some(item =>
    item.candidateVersion === version && item.rightsRevision === state.rightsRevision && item.manifestRevision === state.revision))
    throw new Error('A current rights request must be assigned to this approver.')
  if (state.rightsReviews?.some(item => item.status === 'open' && item.assigneeId &&
    item.assigneeId !== reviewerId)) throw new Error('Rights review belongs to another named approver.')
  return withEvent({ ...state, adoptedReviewVersion: version, reviewRightsRevision: state.rightsRevision, reviewApprover: actor,
    rightsReviews: state.rightsReviews?.map(item => item.status === 'open' ?
      { ...item, status: 'completed' as const, outcome: 'adopted' as const } : item) }, 'review-adopted', 'MASTER-v' + String(version), actor)
}
export function reviewStaleReasons(state: ManifestLedger): string[] {
  return state.adoptedReviewVersion !== null &&
    (!state.rightsValid || state.reviewRightsRevision !== state.rightsRevision) ?
    ['Adopted review is stale after a rights revision.'] : []
}
export function reviseRights(state: ManifestLedger, valid: boolean): ManifestLedger {
  if (state.rightsValid === valid) throw new Error('Rights status has not changed.')
  return withEvent({ ...state, rightsRevision: state.rightsRevision + 1, rightsValid: valid,
    rightsReviews: state.rightsReviews?.map(item => item.status === 'open' ?
      { ...item, status: 'stale' as const } : item) },
    valid ? 'rights-restored' : 'rights-invalidated', state.manifest?.assetId ?? 'PROD-77')
}
export function reprocessManifest(state: ManifestLedger): ManifestLedger {
  if (!state.manifest || !state.rightsValid) throw new Error('A manifest and active rights grant are required for reprocessing.')
  if (state.manifest.rightsRevision === state.rightsRevision) throw new Error('Manifest already uses current rights evidence.')
  const asset = assetVersions.find(item => item.id === state.manifest?.assetId)
  if (!asset || state.manifest.targetId !== target.id) throw new Error('Published asset or target is unavailable for reprocessing.')
  const rebuilt = buildManifest(asset, target, rightsGrants)
  return withEvent({ ...state, manifest: { ...rebuilt, rightsRevision: state.rightsRevision },
    rightsReviews: state.rightsReviews?.map(item => item.status === 'open' ?
      { ...item, status: 'stale' as const } : item) },
    'manifest-reprocessed', state.manifest.assetId)
}
export function revalidateReview(state: ManifestLedger, actor: string): ManifestLedger {
  if (!reviewStaleReasons(state).length) throw new Error('No stale review adoption exists.')
  if (!state.manifest || !state.rightsValid || state.manifest.rightsRevision !== state.rightsRevision) throw new Error('Reprocess the manifest against current rights first.')
  if (actor !== 'rights approver' || actor === state.manifestOwner) throw new Error('Independent rights approver authorization is required.')
  return withEvent({ ...state, reviewRightsRevision: state.rightsRevision },
    'review-revalidated', state.manifest.assetId, actor)
}
export function cancelManifest(state: ManifestLedger): ManifestLedger {
  if (!state.manifest) throw new Error('No manifest exists to cancel.')
  if (state.adoptedReviewVersion !== null) throw new Error('Adopted review depends on this delivery manifest.')
  return withEvent({ ...state, manifest: null, rightsReviews: state.rightsReviews?.map(item => item.status === 'open' ?
    { ...item, status: 'cancelled' as const } : item) }, 'manifest-cancelled', state.manifest.assetId)
}
export function saveManifestLedger(storage: StoragePort, state: ManifestLedger): ManifestLedger {
  storage.setItem(key, JSON.stringify(state))
  return state
}
