import { array, booleanValue, nonEmptyText, nonNegativeInteger, nullable, object,
  oneOf, optional, text, uniqueBy } from '../../workspace/storageValidation'
import type { DeliveryManifest, ManifestLedger, RightsReview } from './manifestLedger'
import type { GrantRecord, ProductionCollection, ProductionEvent, ProductionRecord } from './productionCollection'

const manifest = object<DeliveryManifest>({ targetId: text, assetId: text, rightsId: text, deliveredAt: text,
  captionsVersion: nonNegativeInteger, audioVersion: nonNegativeInteger, rightsRevision: nonNegativeInteger })
const review = object<RightsReview>({ id: nonEmptyText, assetId: text, candidateVersion: nonNegativeInteger,
  rightsRevision: nonNegativeInteger, manifestRevision: nonNegativeInteger, requestedBy: text, assignee: text,
  assigneeId: optional(nullable(text)), status: oneOf('open', 'stale', 'completed', 'superseded', 'cancelled'),
  supersedesId: optional(text), outcome: optional(oneOf('adopted', 'changes_requested')) })
const history = object<ManifestLedger['history'][number]>({ revision: nonNegativeInteger, action: text,
  assetId: text, actor: optional(text) })
const ledger = object<ManifestLedger>({ manifest: nullable(manifest), adoptedReviewVersion: nullable(nonNegativeInteger),
  rightsRevision: nonNegativeInteger, rightsValid: booleanValue, reviewRightsRevision: nullable(nonNegativeInteger),
  manifestOwner: text, reviewApprover: nullable(text), rightsReviews: optional(uniqueBy(array(review), 'id')),
  revision: nonNegativeInteger, history: array(history) })
const production = object<ProductionRecord>({ id: nonEmptyText, targetId: text, grantId: text, ledger, archived: booleanValue })
const grant = object<GrantRecord>({ id: nonEmptyText, revision: nonNegativeInteger, valid: booleanValue, territory: text })
const event = object<ProductionEvent>({ sequence: nonNegativeInteger, action: text, targetId: text,
  relatedIds: array(text), actor: text, sourceRevision: nonNegativeInteger })

// Invalid rights and revision-mismatched manifests are legitimate blocked work, not malformed storage.
export const productionCollectionRule = object<ProductionCollection>({ productions: uniqueBy(array(production), 'id'),
  grants: uniqueBy(array(grant), 'id'), events: uniqueBy(array(event), 'sequence') })
