import { describe, expect, it } from 'vitest'
import { assetVersions, rightsGrants, target } from './deliveryManifest'
import { adoptReviewedVersion, initialManifestLedger, recordManifest, requestRightsReview, reviseRights } from './manifestLedger'
import { claimRightsReview, releaseRightsClaim, rightsBundle, rightsEligibility, rightsReviewerLoad, rightsWorkInbox } from './rightsWorkload'

function pending() {
  const asset = assetVersions.find(item => item.id === 'MASTER-v13')
  if (!asset) throw new Error('Missing master fixture.')
  return requestRightsReview(recordManifest(initialManifestLedger, asset, target, rightsGrants), 13, 'delivery producer')
}

describe('territory-aware rights work', () => {
  it('groups related productions by rights grant and enforces named reviewer capacity', () => {
    const first = pending()
    const second = pending()
    const records = [{ productionId: 'PROD-77', ledger: first }, { productionId: 'PROD-78', ledger: second }]
    expect(rightsBundle(records, first.manifest?.rightsId ?? '')).toHaveLength(2)
    expect(rightsEligibility(records, first, 'rights-ana')).toContain('Rights reviewer is unavailable.')
    const claimed = claimRightsReview(records[0]!, 'rights-omar', records, first.revision)
    const current = [{ productionId: 'PROD-77', ledger: claimed }, records[1]!]
    expect(rightsReviewerLoad(current, 'rights-omar')).toBe(1)
    expect(() => claimRightsReview(current[1]!, 'rights-omar', current, second.revision)).toThrow(/at capacity/)
    expect(rightsWorkInbox(current, 'rights-omar')[0]?.productionId).toBe('PROD-77')
    expect(() => adoptReviewedVersion(claimed, 13, 'rights approver', 'rights-maya')).toThrow(/another named/)
    expect(adoptReviewedVersion(claimed, 13, 'rights approver', 'rights-omar').adoptedReviewVersion).toBe(13)
  })

  it('releases an uncompleted claim and blocks it after rights revision', () => {
    const state = pending()
    const record = { productionId: 'PROD-77', ledger: state }
    const claimed = claimRightsReview(record, 'rights-maya', [record], state.revision)
    expect(releaseRightsClaim(claimed, 'rights-maya').rightsReviews?.[0]?.assigneeId).toBeNull()
    const invalid = reviseRights(claimed, false)
    expect(rightsWorkInbox([{ ...record, ledger: invalid }])[0]?.actionable).toBe(false)
    expect(() => releaseRightsClaim(invalid, 'rights-maya')).toThrow(/current/)
  })
})
