import { describe, expect, it } from 'vitest'
import { assetVersions, buildManifest, deliveryFindings, rightsGrants, target } from './deliveryManifest'
describe('rights-aware delivery manifest', () => {
  it('explains version and QC defects independently', () => {
    expect(deliveryFindings(assetVersions[0]!, target, rightsGrants)).toEqual([
      'MASTER-v12 quality control is pending.', 'Captions are behind the target specification.',
    ])
  })
  it('uses territory, platform, and half-open rights window', () => {
    expect(deliveryFindings(assetVersions[1]!, { ...target, deliveryAt: '2026-10-01' }, rightsGrants))
      .toContain('No rights grant covers this territory, platform, and delivery date.')
    expect(deliveryFindings(assetVersions[1]!, { ...target, territory: 'US' }, rightsGrants)).toEqual([])
  })
  it('creates a version-pinned manifest only after all gates pass', () => {
    expect(() => buildManifest(assetVersions[0]!, target, rightsGrants)).toThrow(/quality control/)
    expect(buildManifest(assetVersions[1]!, target, rightsGrants)).toEqual({
      targetId: 'STREAM-EU', assetId: 'MASTER-v13', rightsId: 'RG-EU-4', deliveredAt: '2026-09-16',
      captionsVersion: 13, audioVersion: 13,
    })
  })
})
