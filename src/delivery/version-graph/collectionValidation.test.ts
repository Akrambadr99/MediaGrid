import { describe, expect, it, vi } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { StoredDataError } from '../../workspace/storageValidation'
import { productionCollectionRule } from './collectionValidation'
import { productionById, readProductionCollection, saveProductionCollection, seedProductionCollection } from './productionCollection'
import type { ProductionCollection } from './productionCollection'
import { adoptReviewedVersion, cancelManifest, initialManifestLedger, reprocessManifest, reviseRights } from './manifestLedger'

const key = 'mediagrid:production-collection:v1'
const legacyKey = 'mediagrid:production:PROD-77:delivery:v1'
const seed = seedProductionCollection()
const record = productionById(seed, 'PROD-78')
function withLedger(ledger: unknown) { return { ...seed, productions: [{ ...record, ledger }] } }

describe('production collection storage integrity', () => {
  it('seeds only absent data without writing', () => {
    const storage = new MemoryStorage()
    const write = vi.spyOn(storage, 'setItem')
    expect(readProductionCollection(storage)).toEqual(seed)
    expect(write).not.toHaveBeenCalled()
  })

  it.each(['', '{broken', 'null', '[]', '{}'])('preserves unreadable saved text %j', raw => {
    const storage = new MemoryStorage()
    storage.setItem(key, raw)
    const write = vi.spyOn(storage, 'setItem')
    expect(() => readProductionCollection(storage)).toThrow(StoredDataError)
    expect(storage.getItem(key)).toBe(raw)
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    ['null ledger', withLedger(null)],
    ['manifest shape', withLedger({ ...record.ledger, manifest: [] })],
    ['asset identity', withLedger({ ...record.ledger, manifest: { ...record.ledger.manifest, assetId: 13 } })],
    ['caption version', withLedger({ ...record.ledger, manifest: { ...record.ledger.manifest, captionsVersion: -1 } })],
    ['audio version', withLedger({ ...record.ledger, manifest: { ...record.ledger.manifest, audioVersion: '13' } })],
    ['rights state', withLedger({ ...record.ledger, rightsValid: 'true' })],
    ['review state', withLedger({ ...record.ledger, rightsReviews: [{ ...record.ledger.rightsReviews?.[0], status: 'approved' }] })],
    ['review outcome', withLedger({ ...record.ledger, rightsReviews: [{ ...record.ledger.rightsReviews?.[0], outcome: 'published' }] })],
    ['review assignee', withLedger({ ...record.ledger, rightsReviews: [{ ...record.ledger.rightsReviews?.[0], assigneeId: 22 }] })],
    ['review version', withLedger({ ...record.ledger, rightsReviews: [{ ...record.ledger.rightsReviews?.[0], candidateVersion: 1.5 }] })],
    ['history actor', withLedger({ ...record.ledger, history: [{ revision: 1, action: 'old', assetId: 'MASTER-v13', actor: 22 }] })],
    ['grant shape', { ...seed, grants: [null] }],
    ['event references', { ...seed, events: [{ sequence: 1, action: 'old', targetId: 'PROD-78', relatedIds: [1], actor: 'producer', sourceRevision: 1 }] }],
  ])('rejects malformed %s before it reaches a screen', (_name, candidate) => {
    const storage = new MemoryStorage()
    const raw = JSON.stringify(candidate)
    storage.setItem(key, raw)
    const write = vi.spyOn(storage, 'setItem')
    expect(() => readProductionCollection(storage)).toThrow(StoredDataError)
    expect(storage.getItem(key)).toBe(raw)
    expect(write).not.toHaveBeenCalled()
  })

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, NaN])('rejects invalid revision %s without overwriting', revision => {
    const storage = new MemoryStorage()
    saveProductionCollection(storage, seed)
    const before = storage.getItem(key)
    const write = vi.spyOn(storage, 'setItem')
    expect(() => saveProductionCollection(storage, withLedger({ ...record.ledger, revision }) as ProductionCollection)).toThrow(StoredDataError)
    expect(storage.getItem(key)).toBe(before)
    expect(write).not.toHaveBeenCalled()
  })

  it.each([
    ['production', { ...seed, productions: [record, record] }],
    ['grant', { ...seed, grants: [...seed.grants, ...seed.grants] }],
    ['review', withLedger({ ...record.ledger, rightsReviews: [...(record.ledger.rightsReviews ?? []), ...(record.ledger.rightsReviews ?? [])] })],
  ])('rejects ambiguous duplicate %s identity', (_name, candidate) => {
    expect(() => productionCollectionRule(candidate)).toThrow(/duplicate identifiers/)
  })

  it('round-trips optional fields, nullable assignee, and unknown metadata', () => {
    const value = { ...seed, futureMetadata: { version: 2 }, productions: [...seed.productions,
      { ...record, id: 'PROD-EXTRA', ledger: { ...record.ledger, rightsReviews: undefined,
        futureEvidence: { retained: true }, history: [{ revision: 1, action: 'historic', assetId: 'MASTER-v13' }] } }] }
    expect(productionCollectionRule(value)).toBe(value)
    const storage = new MemoryStorage()
    saveProductionCollection(storage, value)
    expect(readProductionCollection(storage)).toEqual(JSON.parse(JSON.stringify(value)))
    expect(productionById(readProductionCollection(storage), 'PROD-78').ledger.rightsReviews?.[0]?.assigneeId).toBeNull()
  })

  it('preserves invalid rights, stale adopted review evidence, and cancelled-manifest history', () => {
    const adopted = adoptReviewedVersion(record.ledger, 13, 'rights approver')
    const blocked = reviseRights(adopted, false)
    const stale = reprocessManifest(reviseRights(blocked, true))
    const cancelled = cancelManifest(reviseRights(reviseRights(record.ledger, false), true))
    for (const ledger of [blocked, stale, cancelled]) {
      const value = withLedger(ledger) as ProductionCollection
      const storage = new MemoryStorage()
      saveProductionCollection(storage, value)
      expect(readProductionCollection(storage)).toEqual(value)
    }
    expect(stale.reviewRightsRevision).not.toBe(stale.rightsRevision)
    expect(cancelled.manifest).toBeNull()
    expect(cancelled.rightsReviews?.[0]?.status).toBe('stale')
  })

  it('validates migrated legacy output without rewriting the legacy record', () => {
    const storage = new MemoryStorage()
    const legacy = { ...initialManifestLedger, rightsRevision: undefined, rightsValid: undefined,
      reviewRightsRevision: undefined, manifestOwner: undefined, reviewApprover: undefined, rightsReviews: undefined }
    const raw = JSON.stringify(legacy)
    storage.setItem(legacyKey, raw)
    const write = vi.spyOn(storage, 'setItem')
    expect(productionById(readProductionCollection(storage), 'PROD-77').ledger).toEqual(initialManifestLedger)
    expect(storage.getItem(legacyKey)).toBe(raw)
    expect(write).not.toHaveBeenCalled()
  })

  it.each(['', JSON.stringify({ ...initialManifestLedger, manifest: { assetId: 'MASTER-v13' } })])(
    'identifies the damaged legacy key without resetting it', raw => {
      const storage = new MemoryStorage()
      storage.setItem(legacyKey, raw)
      const write = vi.spyOn(storage, 'setItem')
      expect(() => readProductionCollection(storage)).toThrow(expect.objectContaining({ key: legacyKey, operation: 'read' }))
      expect(storage.getItem(legacyKey)).toBe(raw)
      expect(storage.getItem(key)).toBeNull()
      expect(write).not.toHaveBeenCalled()
    })

  it('reports a safe field path without saved private values', () => {
    const storage = new MemoryStorage()
    storage.setItem(key, JSON.stringify(withLedger({ ...record.ledger, manifestOwner: { secret: 'private-value' } })))
    expect(() => readProductionCollection(storage)).toThrow(/\$\.productions\[0\]\.ledger\.manifestOwner/)
    expect(() => readProductionCollection(storage)).not.toThrow(/private-value/)
  })
})
