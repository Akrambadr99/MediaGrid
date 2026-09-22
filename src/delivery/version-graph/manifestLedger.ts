import type { StoragePort } from '../../workspace/repository'
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
  revision: number
  history: readonly { revision: number; action: string; assetId: string }[]
}
const key = 'mediagrid:production:PROD-77:delivery:v1'
export const initialManifestLedger: ManifestLedger = { manifest: null, adoptedReviewVersion: null, rightsRevision: 0, rightsValid: true, reviewRightsRevision: null, revision: 0, history: [] }
export function readManifestLedger(storage: StoragePort): ManifestLedger {
  const raw = storage.getItem(key)
  if (!raw) return initialManifestLedger
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('manifest' in value) ||
    (value.manifest !== null && typeof value.manifest !== 'object') ||
    !('adoptedReviewVersion' in value) || (value.adoptedReviewVersion !== null && typeof value.adoptedReviewVersion !== 'number') ||
    !('revision' in value) || typeof value.revision !== 'number' ||
    !('history' in value) || !Array.isArray(value.history)) throw new Error('Invalid delivery-manifest record.')
  const record = value as Omit<ManifestLedger, 'rightsRevision' | 'rightsValid' | 'reviewRightsRevision' | 'manifest'> &
    Partial<Pick<ManifestLedger, 'rightsRevision' | 'rightsValid' | 'reviewRightsRevision'>> &
    { manifest: (Omit<DeliveryManifest, 'rightsRevision'> & Partial<Pick<DeliveryManifest, 'rightsRevision'>>) | null }
  return { ...record, rightsRevision: record.rightsRevision ?? 0, rightsValid: record.rightsValid ?? true,
    reviewRightsRevision: record.reviewRightsRevision ?? (record.adoptedReviewVersion === null ? null : 0),
    manifest: record.manifest ? { ...record.manifest, rightsRevision: record.manifest.rightsRevision ?? 0 } : null }
}
function withEvent(state: ManifestLedger, action: string, assetId: string): ManifestLedger {
  const revision = state.revision + 1
  return { ...state, revision, history: [...state.history, { revision, action, assetId }] }
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
export function adoptReviewedVersion(state: ManifestLedger, version: number): ManifestLedger {
  const blockers = reviewBlockers(state, version)
  if (blockers.length) throw new Error(blockers[0])
  if (state.adoptedReviewVersion !== null) throw new Error('A review version is already adopted.')
  return withEvent({ ...state, adoptedReviewVersion: version, reviewRightsRevision: state.rightsRevision }, 'review-adopted', 'MASTER-v' + String(version))
}
export function reviewStaleReasons(state: ManifestLedger): string[] {
  return state.adoptedReviewVersion !== null &&
    (!state.rightsValid || state.reviewRightsRevision !== state.rightsRevision) ?
    ['Adopted review is stale after a rights revision.'] : []
}
export function reviseRights(state: ManifestLedger, valid: boolean): ManifestLedger {
  if (state.rightsValid === valid) throw new Error('Rights status has not changed.')
  return withEvent({ ...state, rightsRevision: state.rightsRevision + 1, rightsValid: valid },
    valid ? 'rights-restored' : 'rights-invalidated', state.manifest?.assetId ?? 'PROD-77')
}
export function reprocessManifest(state: ManifestLedger): ManifestLedger {
  if (!state.manifest || !state.rightsValid) throw new Error('A manifest and active rights grant are required for reprocessing.')
  if (state.manifest.rightsRevision === state.rightsRevision) throw new Error('Manifest already uses current rights evidence.')
  const asset = assetVersions.find(item => item.id === state.manifest?.assetId)
  if (!asset || state.manifest.targetId !== target.id) throw new Error('Published asset or target is unavailable for reprocessing.')
  const rebuilt = buildManifest(asset, target, rightsGrants)
  return withEvent({ ...state, manifest: { ...rebuilt, rightsRevision: state.rightsRevision } },
    'manifest-reprocessed', state.manifest.assetId)
}
export function revalidateReview(state: ManifestLedger): ManifestLedger {
  if (!reviewStaleReasons(state).length) throw new Error('No stale review adoption exists.')
  if (!state.manifest || !state.rightsValid || state.manifest.rightsRevision !== state.rightsRevision) throw new Error('Reprocess the manifest against current rights first.')
  return withEvent({ ...state, reviewRightsRevision: state.rightsRevision },
    'review-revalidated', state.manifest.assetId)
}
export function cancelManifest(state: ManifestLedger): ManifestLedger {
  if (!state.manifest) throw new Error('No manifest exists to cancel.')
  if (state.adoptedReviewVersion !== null) throw new Error('Adopted review depends on this delivery manifest.')
  return withEvent({ ...state, manifest: null }, 'manifest-cancelled', state.manifest.assetId)
}
export function saveManifestLedger(storage: StoragePort, state: ManifestLedger): ManifestLedger {
  storage.setItem(key, JSON.stringify(state))
  return state
}
