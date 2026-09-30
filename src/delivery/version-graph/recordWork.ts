import type { StorageReader } from '../../platform/storage-port'
import { readProductionCollection } from './productionCollection'

export function activeRecordWork(storage: StorageReader) {
  return readProductionCollection(storage).productions.filter(item => !item.archived).map(item => ({ productionId: item.id, targetId: item.targetId, ledger: item.ledger }))
}
export function selectedRecordWork(storage: StorageReader, id: string) {
  const record = activeRecordWork(storage).find(item => item.productionId === id)
  if (!record) throw new Error('Active record not found.')
  return record
}
