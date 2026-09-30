import { describe, expect, it } from 'vitest'
import { productionTriage } from './collectionTriage'
import { productionById, seedProductionCollection, setGrantValidity } from './productionCollection'
import { adoptReviewedVersion, cancelManifest, reprocessManifest, revalidateReview, reviseRights } from './manifestLedger'

describe('production triage states', () => {
  it('distinguishes drafts, current reviews and published manifests without mutation', () => {
    const collection = seedProductionCollection()
    const before = JSON.stringify(collection)
    const policy = productionTriage(collection)
    expect(policy.state(productionById(collection, 'PROD-77'))).toBe('draft')
    expect(policy.state(productionById(collection, 'PROD-78'))).toBe('review-open')
    expect(policy.state(productionById(collection, 'PROD-81'))).toBe('published')
    expect(JSON.stringify(collection)).toBe(before)
  })
  it('prioritizes invalid linked grants and invalid ledger rights ahead of publication', () => {
    const collection = seedProductionCollection()
    const changed = setGrantValidity(collection, 'RG-EU-4', false, 'rights controller', 1).collection
    expect(productionTriage(changed).state(productionById(changed, 'PROD-78'))).toBe('rights-invalid')
    expect(productionTriage(changed).state(productionById(changed, 'PROD-81'))).toBe('published')
    const record = productionById(collection, 'PROD-81')
    expect(productionTriage(collection).state({ ...record, ledger: { ...record.ledger, rightsValid: false } })).toBe('rights-invalid')
  })
  it('distinguishes stale manifest evidence from stale review evidence', () => {
    const collection = seedProductionCollection()
    const record = productionById(collection, 'PROD-78')
    const policy = productionTriage(collection)
    const restored = reviseRights(reviseRights(record.ledger, false), true)
    expect(policy.state({ ...record, ledger: restored })).toBe('manifest-stale')
    expect(policy.state({ ...record, ledger: { ...record.ledger, revision: record.ledger.revision + 1 } })).toBe('review-stale')
    expect(policy.state({ ...record, ledger: { ...record.ledger,
      rightsReviews: record.ledger.rightsReviews?.map(review => ({ ...review, status: 'stale' })) } })).toBe('review-stale')
  })
  it('searches delivery and grant identity and exposes ledger revision', () => {
    const collection = seedProductionCollection()
    const record = productionById(collection, 'PROD-80')
    const policy = productionTriage(collection)
    expect(policy.searchText(record)).toContain('STREAM-US RG-US-3')
    expect(policy.revision(record)).toBe(record.ledger.revision)
  })
  it('keeps adopted-review recovery visible after the manifest is reprocessed', () => {
    const collection = seedProductionCollection()
    const record = productionById(collection, 'PROD-78')
    const policy = productionTriage(collection)
    const adopted = adoptReviewedVersion(record.ledger, 13, 'rights approver')
    const reprocessed = reprocessManifest(reviseRights(reviseRights(adopted, false), true))
    expect(policy.state({ ...record, ledger: reprocessed })).toBe('adoption-stale')
    const revalidated = revalidateReview(reprocessed, 'rights approver')
    expect(policy.state({ ...record, ledger: revalidated })).toBe('published')
  })
  it('treats a cancelled manifest as a draft instead of reviving historical stale requests', () => {
    const collection = seedProductionCollection()
    const record = productionById(collection, 'PROD-78')
    const cancelled = cancelManifest(reviseRights(reviseRights(record.ledger, false), true))
    expect(cancelled.rightsReviews?.some(review => review.status === 'stale')).toBe(true)
    expect(productionTriage(collection).state({ ...record, ledger: cancelled })).toBe('draft')
  })
})
