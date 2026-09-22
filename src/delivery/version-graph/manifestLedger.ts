import type { StoragePort } from '../../workspace/repository'
import { buildManifest } from './deliveryManifest'
import type { AssetVersion, DeliveryTarget, RightsGrant } from './deliveryManifest'

export interface DeliveryManifest {
  targetId: string
  assetId: string
  rightsId: string
  deliveredAt: string
  captionsVersion: number
  audioVersion: number
}
export interface ManifestLedger {
  manifest: DeliveryManifest | null
  adoptedReviewVersion: number | null
  revision: number
  history: readonly { revision: number; action: string; assetId: string }[]
}
const key = 'mediagrid:production:PROD-77:delivery:v1'
export const initialManifestLedger: ManifestLedger = { manifest: null, adoptedReviewVersion: null, revision: 0, history: [] }
export function readManifestLedger(storage: StoragePort): ManifestLedger {
  const raw = storage.getItem(key)
  if (!raw) return initialManifestLedger
  const value: unknown = JSON.parse(raw)
  if (!value || typeof value !== 'object' || !('manifest' in value) ||
    (value.manifest !== null && typeof value.manifest !== 'object') ||
    !('adoptedReviewVersion' in value) || (value.adoptedReviewVersion !== null && typeof value.adoptedReviewVersion !== 'number') ||
    !('revision' in value) || typeof value.revision !== 'number' ||
    !('history' in value) || !Array.isArray(value.history)) throw new Error('Invalid delivery-manifest record.')
  return value as ManifestLedger
}
function withEvent(state: ManifestLedger, action: string, assetId: string): ManifestLedger {
  const revision = state.revision + 1
  return { ...state, revision, history: [...state.history, { revision, action, assetId }] }
}
export function recordManifest(state: ManifestLedger, asset: AssetVersion, target: DeliveryTarget, rights: readonly RightsGrant[]): ManifestLedger {
  if (state.manifest) throw new Error('A delivery manifest already exists.')
  const manifest = buildManifest(asset, target, rights)
  return withEvent({ ...state, manifest }, 'manifest-created', asset.id)
}
export function reviewBlockers(state: ManifestLedger, candidateVersion: number): string[] {
  if (!state.manifest) return ['A rights-cleared delivery manifest is required before review adoption.']
  if (state.manifest.assetId !== 'MASTER-v' + String(candidateVersion)) return ['Candidate version does not match the published delivery manifest.']
  return []
}
export function adoptReviewedVersion(state: ManifestLedger, version: number): ManifestLedger {
  const blockers = reviewBlockers(state, version)
  if (blockers.length) throw new Error(blockers[0])
  if (state.adoptedReviewVersion !== null) throw new Error('A review version is already adopted.')
  return withEvent({ ...state, adoptedReviewVersion: version }, 'review-adopted', 'MASTER-v' + String(version))
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
