import { readProductionCollection } from './productionCollection'
import { SelectedRecordRoute } from './SelectedRecordRoute'
import { useRecordContext } from '../../workspace/RecordScope'
import { useState } from 'react'
import { assetVersions, deliveryFindings, rightsGrants, target } from './deliveryManifest'
import type { AssetVersion, DeliveryTarget } from './deliveryManifest'
import { cancelManifest, readManifestLedger, recordManifest, reprocessManifest, reviseRights, reviewStaleReasons, saveManifestLedger } from './manifestLedger'
function requireDefaultAsset(): AssetVersion {
  const asset = assetVersions.find(item => item.version === 12)
  if (!asset) throw new Error('No delivery master is available.')
  return asset
}
const defaultAsset = requireDefaultAsset()
function RecordContent() {
  const { storage, guard, recordId } = useRecordContext()

  const [ledger, setLedger] = useState(() => readManifestLedger(storage))
  const [selectedVersion, setSelectedVersion] = useState(() => ledger.manifest ? Number(ledger.manifest.assetId.slice(8)) : 12)
  const [delivery, setDelivery] = useState<DeliveryTarget>(() => {
    const record = readProductionCollection(storage).productions.find(item => item.id === recordId)
    return record?.targetId === 'STREAM-US' ? { ...target, id: 'STREAM-US', territory: 'US' } : target
  })
  const manifest = ledger.manifest
  const [notice, setNotice] = useState('')
  const asset = assetVersions.find(item => item.version === selectedVersion) ?? defaultAsset
  const findings = deliveryFindings(asset, delivery, rightsGrants)
  const rightsCleared = ledger.rightsValid && rightsGrants.some(grant => grant.territory === delivery.territory &&
    grant.platforms.includes(delivery.platform) && grant.from <= delivery.deliveryAt && delivery.deliveryAt < grant.until)
  function changeDelivery(next: DeliveryTarget) { setDelivery(next) }
  function createManifest() {
    try {
      setLedger(saveManifestLedger(storage, recordManifest(ledger, asset, delivery, rightsGrants)))
      setNotice('Delivery manifest locked to the selected evidence versions.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Manifest failed.') }
  }
  function cancel() {
    try { setLedger(saveManifestLedger(storage, cancelManifest(ledger))); setNotice('Delivery manifest cancelled.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Cancellation failed.') }
  }
  function changeRights() {
    try { setLedger(saveManifestLedger(storage, reviseRights(ledger, !ledger.rightsValid))); setNotice('Rights revision recorded; manifest and review state recalculated.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Rights revision failed.') }
  }
  function reprocess() {
    try { setLedger(saveManifestLedger(storage, reprocessManifest(ledger))); setNotice('Manifest reprocessed against current rights evidence.') }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Reprocessing failed.') }
  }
  return <div className="suite-page">
    <header className="suite-title"><div><small>DELIVERY / VERSIONED DEPENDENCIES</small>
      <h1>Version, rights and delivery dependency graph</h1>
      <p>Production {recordId} · Target {delivery.id} · {rightsCleared ? 'Rights cleared' : 'Rights blocked'} for the selected delivery window</p>
    </div></header>
    <section className="suite-card" aria-label="Delivery dependencies">
      <h2>Asset and target</h2>
      <p>Version v{asset.version} · QC {asset.qc}</p>
      <label>Master version <select value={selectedVersion} onChange={event => { setSelectedVersion(Number(event.target.value)) }}>
        {assetVersions.map(item => <option key={item.id} value={item.version}>{item.id} · QC {item.qc}</option>)}
      </select></label>
      <p>Captions v{asset.captionsVersion} · Audio v{asset.audioVersion} · QC {asset.qc}</p>
      <label>Territory <select value={delivery.territory} onChange={event => { changeDelivery({ ...delivery, territory: event.target.value }); }}>
        <option>EU</option><option>US</option><option>APAC</option>
      </select></label>
      <label>Delivery date <input type="date" value={delivery.deliveryAt} onChange={event => { changeDelivery({ ...delivery, deliveryAt: event.target.value }); }} /></label>
      <h3>Dependency findings</h3>
      {findings.length ? <ul>{findings.map(item => <li key={item}>{item}</li>)}</ul> : <p>Rights, QC, captions, and audio gates pass.</p>}
    </section>
    <section className="suite-card" aria-label="Manifest decision">
      <h2>Release manifest</h2>
      <button disabled={findings.length > 0 || Boolean(manifest)} onClick={guard(createManifest)}>Create manifest</button>
      {manifest && <button onClick={guard(cancel)}>Cancel manifest</button>}
      <button onClick={guard(changeRights)}>{ledger.rightsValid ? 'Invalidate rights grant' : 'Restore rights grant'}</button>
      {manifest && ledger.rightsValid && manifest.rightsRevision !== ledger.rightsRevision && <button onClick={guard(reprocess)}>Reprocess manifest</button>}
      <p>Rights revision {ledger.rightsRevision} · {ledger.rightsValid ? 'valid' : 'invalid'}</p>
      {reviewStaleReasons(ledger).map(item => <p role="alert" key={item}>{item}</p>)}
      <p>Manifest revision {ledger.revision} · Review {ledger.adoptedReviewVersion === null ? 'pending' : 'v' + String(ledger.adoptedReviewVersion) + ' adopted'}</p>
      {manifest && <dl><dt>Master</dt><dd>{manifest.assetId}</dd><dt>Rights evidence</dt><dd>{manifest.rightsId}</dd>
        <dt>Target</dt><dd>{manifest.targetId}</dd></dl>}
      <p role="status">{notice}</p>
    </section>
  </div>
}

export function DeliveryDependencyGraphPage() { return <SelectedRecordRoute><RecordContent /></SelectedRecordRoute> }
