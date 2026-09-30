import type { ExplorerPolicy } from '../../workspace/collectionExplorer'
import type { ProductionCollection, ProductionRecord } from './productionCollection'
import { reviewStaleReasons } from './manifestLedger'

export function productionTriage(collection: ProductionCollection): ExplorerPolicy<ProductionRecord> {
  return {
    searchText: record => [record.id, record.targetId, record.grantId, record.ledger.manifest?.assetId ?? ''].join(' '),
    revision: record => record.ledger.revision,
    states: [
      { value: 'rights-invalid', label: 'Rights unavailable' },
      { value: 'manifest-stale', label: 'Manifest needs reprocessing' },
      { value: 'adoption-stale', label: 'Adopted review needs revalidation' },
      { value: 'review-stale', label: 'Review needs renewal' },
      { value: 'review-open', label: 'Awaiting rights review' },
      { value: 'published', label: 'Published current manifest' },
      { value: 'draft', label: 'Unpublished draft' },
    ],
    state: record => {
      const ledger = record.ledger
      if (!ledger.rightsValid || !collection.grants.find(grant => grant.id === record.grantId)?.valid) return 'rights-invalid'
      if (!ledger.manifest) return 'draft'
      if (ledger.manifest.rightsRevision !== ledger.rightsRevision) return 'manifest-stale'
      if (reviewStaleReasons(ledger).length) return 'adoption-stale'
      if (ledger.rightsReviews?.some(review => review.status === 'stale' || (review.status === 'open' &&
        (review.manifestRevision !== ledger.revision || review.rightsRevision !== ledger.rightsRevision)))) return 'review-stale'
      if (ledger.rightsReviews?.some(review => review.status === 'open')) return 'review-open'
      return 'published'
    },
  }
}
