import { describe, expect, it } from 'vitest'
import { adoptReviewedVersion, initialManifestLedger, recordManifest, reprocessManifest, requestRightsReview, reviseRights, rightsInbox } from './manifestLedger'
import { assetVersions, rightsGrants, target } from './deliveryManifest'

describe('rights review handoff', () => {
  it('stales pending work on rights change and requires reprocessing before replacement', () => {
    const asset = assetVersions.find(item => item.id === 'MASTER-v13')
    if (!asset) throw new Error('Expected MASTER-v13 fixture.')
    let state = recordManifest(initialManifestLedger, asset, target, rightsGrants)
    state = requestRightsReview(state, 13, 'delivery producer')
    expect(rightsInbox(state, 'rights approver')).toHaveLength(1)
    state = reprocessManifest(reviseRights(reviseRights(state, false), true))
    expect(rightsInbox(state, 'rights approver')).toHaveLength(0)
    expect(() => adoptReviewedVersion(state, 13, 'rights approver')).toThrow(/current rights request/)
    state = requestRightsReview(state, 13, 'delivery producer')
    expect(adoptReviewedVersion(state, 13, 'rights approver').rightsReviews?.map(item => item.status)).toEqual(['superseded', 'completed'])
  })
})
