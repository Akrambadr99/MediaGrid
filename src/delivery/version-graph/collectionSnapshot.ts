import type { SnapshotAdapter } from '../../workspace/collectionSnapshot'
import { readProductionCollection, type ProductionCollection } from './productionCollection'
import { productionCollectionRule } from './collectionValidation'

/** Delivery records and their rights grants only; other browser-local workflows remain separate. */
export const collectionSnapshotAdapter: SnapshotAdapter<ProductionCollection> = {
  product: 'MediaGrid',
  scope: 'production-collection',
  label: 'Production rights collection',
  read: readProductionCollection,
  validate: productionCollectionRule,
  groups: collection => [
    { key: 'productions', label: 'Productions', records: collection.productions.map(record => ({
      id: record.id, label: `${record.targetId} · ${record.grantId}${record.archived ? ' · Archived' : ''}`, value: record,
    })) },
    { key: 'grants', label: 'Rights grants', records: collection.grants.map(record => ({
      id: record.id, label: `${record.territory} · ${record.valid ? 'Valid' : 'Invalid'}`, value: record,
    })) },
  ],
}
