import { describe, expect, it, vi } from 'vitest'
import { compareCollectionSnapshot, createCollectionSnapshot } from '../../workspace/collectionSnapshot'
import { collectionSnapshotAdapter as adapter } from './collectionSnapshot'
import { createProduction, seedProductionCollection, setGrantValidity } from './productionCollection'

const key = 'mediagrid:production-collection:v1'
const createdAt = '2026-09-30T12:00:00.000Z'
function storage(raw: string | null = null) {
  const values = new Map<string, string>(raw === null ? [] : [[key, raw]])
  values.set('unrelated:workflow', 'preserve this value')
  return { values, getItem: (id: string) => values.get(id) ?? null,
    setItem: vi.fn((id: string, value: string) => { values.set(id, value) }) }
}
function snapshot(payload: unknown, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ format: 'collection-snapshot', version: 1, product: adapter.product,
    scope: adapter.scope, createdAt, payload, ...extra })
}

describe('MediaGrid primary collection snapshot adapter', () => {
  it('exports complete productions, rights grants, archived work and metadata without storage writes', () => {
    const collection = { ...seedProductionCollection(), sourceMetadata: { note: 'preserved evidence' } }
    const raw = JSON.stringify(collection); const port = storage(raw)
    expect(JSON.parse(createCollectionSnapshot(adapter, port, createdAt))).toEqual({
      format: 'collection-snapshot', version: 1, product: 'MediaGrid', scope: 'production-collection', createdAt, payload: collection,
    })
    expect(collection.productions.some(record => record.archived)).toBe(true)
    expect(port.values.get(key)).toBe(raw)
    expect(port.values.get('unrelated:workflow')).toBe('preserve this value')
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('reviews a seeded collection without materializing new saved data', () => {
    const port = storage()
    const result = compareCollectionSnapshot(createCollectionSnapshot(adapter, port, createdAt), adapter, port)
    expect(result.payloadChanged).toBe(false)
    expect(result.rows).toHaveLength(8)
    expect(result.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.values.has(key)).toBe(false)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('includes independently keyed grant records alongside production records', () => {
    const groups = adapter.groups(seedProductionCollection())
    expect(groups.map(group => group.key)).toEqual(['productions', 'grants'])
    expect(groups.flatMap(group => group.records).map(record => record.id)).toContain('RG-EU-4')
    expect(groups.flatMap(group => group.records).map(record => record.id)).toContain('PROD-78')
  })

  it('detects nested manifest history changes even when the operational revision is unchanged', () => {
    const seed = seedProductionCollection()
    const candidate = { ...seed, productions: seed.productions.map(record => record.id === 'PROD-78' ? {
      ...record, ledger: { ...record.ledger, history: record.ledger.history.map((event, index) =>
        index === 0 ? { ...event, assetId: 'Updated supporting evidence' } : event) },
    } : record) }
    const port = storage(JSON.stringify(seed))
    const result = compareCollectionSnapshot(snapshot(candidate), adapter, port)
    expect(result.rows.find(row => row.id === 'PROD-78')?.status).toBe('changed')
    expect(result.rows.filter(row => row.status === 'changed')).toHaveLength(1)
    expect(result.payloadChanged).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('detects grant-only changes and production additions without rewriting related rights sources', () => {
    const seed = seedProductionCollection(); const port = storage(JSON.stringify(seed))
    const grantOnly = { ...seed, grants: seed.grants.map(record => record.id === 'RG-EU-4' ?
      { ...record, revision: record.revision + 1 } : record) }
    expect(compareCollectionSnapshot(snapshot(grantOnly), adapter, port).rows.find(row => row.id === 'RG-EU-4')?.status).toBe('changed')
    const added = compareCollectionSnapshot(snapshot(createProduction(seed, 'PROD-83', 'STREAM-EU', 'RG-EU-4')), adapter, port)
    expect(added.rows.filter(row => row.status === 'added')).toHaveLength(1)
    expect(added.rows.filter(row => row.status === 'changed')).toHaveLength(0)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('compares a real grant invalidation with stale reviews while preserving unrelated and archived productions', () => {
    const seed = seedProductionCollection(); const port = storage(JSON.stringify(seed))
    const candidate = setGrantValidity(seed, 'RG-EU-4', false, 'rights supervisor', 1).collection
    const result = compareCollectionSnapshot(snapshot(candidate), adapter, port)
    expect(result.rows.filter(row => row.status === 'changed').map(row => row.id).sort())
      .toEqual(['PROD-77', 'PROD-78', 'PROD-79', 'RG-EU-4'])
    expect(candidate.productions.find(record => record.id === 'PROD-78')?.ledger.rightsReviews?.[0]?.status).toBe('stale')
    expect(result.rows.find(row => row.id === 'PROD-82')?.status).toBe('unchanged')
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('reports event and collection metadata changes without treating repeated event targets as unique records', () => {
    const seed = seedProductionCollection(); const port = storage(JSON.stringify(seed))
    const candidate = { ...seed, events: [
      { sequence: 1, action: 'review-note', targetId: 'PROD-78', relatedIds: [], actor: 'reviewer', sourceRevision: 1 },
      { sequence: 2, action: 'review-note', targetId: 'PROD-78', relatedIds: [], actor: 'reviewer', sourceRevision: 1 },
    ], sourceMetadata: { reviewed: true } }
    const result = compareCollectionSnapshot(snapshot(candidate), adapter, port)
    expect(result.payloadChanged).toBe(true)
    expect(result.rows).toHaveLength(8)
    expect(result.rows.every(row => row.status === 'unchanged')).toBe(true)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects malformed nested data, duplicate identities and invalid rights flags without writes', () => {
    const seed = seedProductionCollection(); const raw = JSON.stringify(seed); const port = storage(raw)
    for (const candidate of [
      { ...seed, productions: [null] },
      { ...seed, productions: [...seed.productions, seed.productions[0]] },
      { ...seed, grants: seed.grants.map(record => ({ ...record, valid: 'false' })) },
    ]) expect(() => compareCollectionSnapshot(snapshot(candidate), adapter, port)).toThrow()
    expect(port.values.get(key)).toBe(raw)
    expect(port.setItem).not.toHaveBeenCalled()
  })

  it('rejects other products, scopes, versions and truncated text without writes', () => {
    const seed = seedProductionCollection(); const port = storage(JSON.stringify(seed))
    for (const raw of [snapshot(seed, { product: 'DifferentProduct' }), snapshot(seed, { scope: 'unrelated' }),
      snapshot(seed, { version: 99 }), '{private truncated JSON']) {
      expect(() => compareCollectionSnapshot(raw, adapter, port)).toThrow()
    }
    expect(port.setItem).not.toHaveBeenCalled()
    expect(port.values.get('unrelated:workflow')).toBe('preserve this value')
  })

  it('does not turn corrupt current storage into an apparently valid empty export', () => {
    const port = storage('{private damaged current collection')
    expect(() => createCollectionSnapshot(adapter, port, createdAt)).toThrow()
    expect(port.values.get(key)).toBe('{private damaged current collection')
    expect(port.setItem).not.toHaveBeenCalled()
  })
})
