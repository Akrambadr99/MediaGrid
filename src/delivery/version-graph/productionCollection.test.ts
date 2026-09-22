import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { archiveProduction, claimProductionRights, createProduction, productionById,
  productionRightsInbox, productionRows, productionSummary, readProductionCollection,
  reprocessProductions, saveProductionCollection, seedProductionCollection, setGrantValidity } from './productionCollection'

describe('persisted production and rights collection', () => {
  it('holds six independent productions and keeps named review ownership after storage round-trip', () => {
    const storage = new MemoryStorage()
    const initial = readProductionCollection(storage)
    expect(initial.productions).toHaveLength(6)
    expect(productionRightsInbox(initial)).toHaveLength(3)
    const peer = productionById(initial, 'PROD-79')
    const claimed = claimProductionRights(initial, 'PROD-78', 'rights-maya', productionById(initial, 'PROD-78').ledger.revision)
    expect(productionById(claimed, 'PROD-78').ledger.rightsReviews?.[0]?.assigneeId).toBe('rights-maya')
    expect(productionById(claimed, 'PROD-79')).toEqual(peer)
    expect(() => claimProductionRights(claimed, 'PROD-78', 'rights-omar',
      productionById(claimed, 'PROD-78').ledger.revision)).toThrow(/already claimed/)
    saveProductionCollection(storage, claimed)
    expect(readProductionCollection(storage)).toEqual(claimed)
    storage.clear()
    expect(readProductionCollection(storage)).toEqual(seedProductionCollection())
  })

  it('propagates grant changes only to linked manifests and keeps US delivery intact', () => {
    const initial = seedProductionCollection()
    const unrelated = productionById(initial, 'PROD-80')
    const result = setGrantValidity(initial, 'RG-EU-4', false, 'rights controller', 1)
    expect(result.updated).toEqual(['PROD-77', 'PROD-78', 'PROD-79'])
    expect(productionById(result.collection, 'PROD-78').ledger.rightsReviews?.[0]?.status).toBe('stale')
    expect(productionById(result.collection, 'PROD-80')).toEqual(unrelated)
    expect(result.collection.events[0]).toMatchObject({ targetId: 'RG-EU-4', relatedIds: result.updated })
    expect(() => setGrantValidity(result.collection, 'RG-EU-4', true, 'rights controller', 1)).toThrow(/revision changed/)
  })

  it('returns partial reprocessing outcomes without bypassing manifest validation', () => {
    const invalid = setGrantValidity(seedProductionCollection(), 'RG-EU-4', false, 'rights controller', 1).collection
    const blocked = reprocessProductions(invalid, ['PROD-78', 'PROD-80'])
    expect(blocked.skipped).toEqual(['PROD-80'])
    expect(blocked.blocked.map(item => item.id)).toEqual(['PROD-78'])
    const restored = setGrantValidity(invalid, 'RG-EU-4', true, 'rights controller', 2).collection
    const result = reprocessProductions(restored, ['PROD-78', 'PROD-79', 'PROD-77', 'PROD-80'])
    expect(result.updated).toEqual(['PROD-78', 'PROD-79'])
    expect(result.blocked.map(item => item.id)).toEqual(['PROD-77'])
    expect(result.skipped).toEqual(['PROD-80'])
  })

  it('enforces grant references and retains archived production history', () => {
    const initial = seedProductionCollection()
    expect(() => archiveProduction(initial, 'PROD-78')).toThrow(/Open rights review/)
    const created = createProduction(initial, 'PROD-83', 'STREAM-EU', 'RG-EU-4')
    expect(productionById(created, 'PROD-83').ledger.revision).toBe(0)
    expect(() => createProduction(created, 'PROD-83', 'STREAM-EU', 'RG-EU-4')).toThrow(/unique/)
    expect(() => createProduction(created, 'PROD-84', 'STREAM-US', 'RG-EU-4')).toThrow(/territory/)
    const archived = archiveProduction(created, 'PROD-83')
    expect(productionRows(archived).some(item => item.id === 'PROD-83')).toBe(false)
    expect(productionRows(archived, 'PROD-83', 'archived')).toHaveLength(1)
    expect(productionSummary(archived).archived).toBe(2)
  })
})
