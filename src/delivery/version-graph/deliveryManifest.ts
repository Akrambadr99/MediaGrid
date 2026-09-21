export interface AssetVersion { id: string; version: number; qc: 'pass' | 'pending' | 'failed'; captionsVersion: number; audioVersion: number }
export interface RightsGrant { id: string; territory: string; from: string; until: string; platforms: readonly string[] }
export interface DeliveryTarget { id: string; territory: string; platform: string; deliveryAt: string; requiredCaptions: number; requiredAudio: number }
export const assetVersions: readonly AssetVersion[] = [
  { id: 'MASTER-v12', version: 12, qc: 'pending', captionsVersion: 11, audioVersion: 12 },
  { id: 'MASTER-v13', version: 13, qc: 'pass', captionsVersion: 13, audioVersion: 13 },
]
export const rightsGrants: readonly RightsGrant[] = [
  { id: 'RG-EU-4', territory: 'EU', from: '2026-09-01', until: '2026-10-01', platforms: ['STREAM'] },
  { id: 'RG-US-3', territory: 'US', from: '2026-09-10', until: '2026-11-01', platforms: ['STREAM'] },
]
export const target: DeliveryTarget = {
  id: 'STREAM-EU', territory: 'EU', platform: 'STREAM', deliveryAt: '2026-09-16',
  requiredCaptions: 12, requiredAudio: 12,
}
export function deliveryFindings(asset: AssetVersion, delivery: DeliveryTarget, rights: readonly RightsGrant[]): string[] {
  const findings: string[] = []
  const validGrant = rights.find(grant => grant.territory === delivery.territory &&
    grant.platforms.includes(delivery.platform) && grant.from <= delivery.deliveryAt && delivery.deliveryAt < grant.until)
  if (!validGrant) findings.push('No rights grant covers this territory, platform, and delivery date.')
  if (asset.qc !== 'pass') findings.push(`${asset.id} quality control is ${asset.qc}.`)
  if (asset.captionsVersion < delivery.requiredCaptions) findings.push('Captions are behind the target specification.')
  if (asset.audioVersion < delivery.requiredAudio) findings.push('Audio is behind the target specification.')
  return findings
}
export function buildManifest(asset: AssetVersion, delivery: DeliveryTarget, rights: readonly RightsGrant[]) {
  const findings = deliveryFindings(asset, delivery, rights)
  if (findings.length) throw new Error(findings.join(' '))
  const grant = rights.find(item => item.territory === delivery.territory &&
    item.platforms.includes(delivery.platform) && item.from <= delivery.deliveryAt && delivery.deliveryAt < item.until)
  return { targetId: delivery.id, assetId: asset.id, rightsId: grant?.id ?? '', deliveredAt: delivery.deliveryAt,
    captionsVersion: asset.captionsVersion, audioVersion: asset.audioVersion }
}
