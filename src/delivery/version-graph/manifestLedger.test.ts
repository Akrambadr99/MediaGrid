import { describe, expect, it } from 'vitest'
import { MemoryStorage } from '../../data/memory-storage'
import { assetVersions, rightsGrants, target } from './deliveryManifest'
import { adoptReviewedVersion, cancelManifest, readManifestLedger, recordManifest, reviewBlockers, saveManifestLedger } from './manifestLedger'
describe('manifest to review adoption dependency', () => {
  const master = assetVersions.find(item => item.version === 13)
  if (!master) throw new Error('Missing master fixture.')
  it('persists a rights-cleared manifest and gates candidate version', () => {
    const storage = new MemoryStorage()
    expect(reviewBlockers(readManifestLedger(storage), 13)).toHaveLength(1)
    saveManifestLedger(storage, recordManifest(readManifestLedger(storage), master, target, rightsGrants))
    expect(reviewBlockers(readManifestLedger(storage), 13)).toEqual([])
    expect(reviewBlockers(readManifestLedger(storage), 14)).toHaveLength(1)
  })
  it('protects manifest cancellation once review depends on it', () => {
    const manifested = recordManifest(readManifestLedger(new MemoryStorage()), master, target, rightsGrants)
    expect(cancelManifest(manifested).manifest).toBeNull()
    const adopted = adoptReviewedVersion(manifested, 13)
    expect(() => cancelManifest(adopted)).toThrow(/depends/)
    expect(adopted.history.map(item => item.action)).toEqual(['manifest-created', 'review-adopted'])
  })
})
