import type { StoragePort } from '../../platform/storage-port'
import { bindRecord } from '../../workspace/recordStorage'
import { readProductionCollection, saveProductionCollection } from './productionCollection'
import { readManifestLedger } from './manifestLedger'

export function openSelectedRecord(storage: StoragePort, id = 'PROD-77') {
  return bindRecord(storage, id, {
    key: 'mediagrid:production:PROD-77:delivery:v1',
    collectionKey: 'mediagrid:production-collection:v1',
    read: readProductionCollection, save: saveProductionCollection,
    find: (collection, target) => collection.productions.find(item => item.id === target),
    value: record => record.ledger, archived: record => record.archived,
    replace: (collection, target, raw) => {
      const value = readManifestLedger({ getItem: () => raw })
      const record = collection.productions.find(item => item.id === target)
      if (value.manifest && value.manifest.targetId !== record?.targetId) throw new Error('Manifest target must match the selected production.')
      return { ...collection, productions: collection.productions.map(item => item.id === target ? { ...item, ledger: value } : item),
        events: [...collection.events, { sequence: collection.events.length + 1, action: 'detail-updated', targetId: target, relatedIds: [], actor: 'detail workflow', sourceRevision: value.revision }] }
    },
  })
}
