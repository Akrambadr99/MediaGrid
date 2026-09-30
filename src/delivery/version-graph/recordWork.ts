import type { StoragePort } from '../../workspace/repository'
import { readProductionCollection } from './productionCollection'

export function activeRecordWork(storage: StoragePort) {
  return readProductionCollection(storage).productions.filter(item => !item.archived).map(item => ({ productionId: item.id, targetId: item.targetId, ledger: item.ledger }))
}
export function selectedRecordWork(storage: StoragePort, id: string) {
  const record = activeRecordWork(storage).find(item => item.productionId === id)
  if (!record) throw new Error('Active record not found.')
  return record
}
