import { recordDetailPath, recordDecisionPath } from './recordLinks'
import { Link } from 'react-router-dom'
import { saveCurrentCollection } from '../../workspace/recordStorage'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { rightsReviewers } from './rightsWorkload'
import { archiveProduction, claimProductionRights, createProduction, productionRightsInbox,
  productionRows, productionSummary, readProductionCollection, reprocessProductions,
  saveProductionCollection, setGrantValidity } from './productionCollection'

export function ProductionCollectionPage() {
  const [collection, setCollection] = useState(() => readProductionCollection(window.localStorage))
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('active')
  const [reviewerId, setReviewerId] = useState('rights-maya')
  const [checked, setChecked] = useState<string[]>([])
  const [newId, setNewId] = useState('')
  const [notice, setNotice] = useState('')
  const selectedId = params.get('production') ?? 'PROD-78'
  const selected = collection.productions.find(item => item.id === selectedId)
  const rows = productionRows(collection, query, filter)
  const inbox = productionRightsInbox(collection)
  const summary = productionSummary(collection)
  function choose(id: string) { setParams(current => { const next = new URLSearchParams(current); next.set('production', id); return next }) }
  function persist(next: typeof collection, message: string) { try { setCollection(saveCurrentCollection(window.localStorage, collection, next, readProductionCollection, saveProductionCollection)); setNotice(message); return true } catch (error) { setNotice(error instanceof Error ? error.message : 'Save failed. Your input is preserved.'); return false } }
  function run(action: () => typeof collection, success: string) {
    try { return persist(action(), success) }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Production operation failed.'); return false }
  }
  return <main className="suite-page">
    <header className="suite-title"><div><small>DELIVERY / RIGHTS RESPONSIBILITY</small><h1>Production rights workspace</h1>
      <p>Persisted manifests, shared grants and territory-qualified review work.</p></div></header>
    <section className="metrics" aria-label="Rights summary">
      <article><small>Active productions</small><strong>{summary.active}</strong></article>
      <article><small>Published manifests</small><strong>{summary.published}</strong></article>
      <article><small>Unclaimed reviews</small><strong>{summary.unclaimed}</strong></article>
      <article><small>Stale reviews</small><strong>{summary.stale}</strong></article>
    </section>
    <section className="suite-card" aria-label="Rights queue"><h2>Rights review queue</h2>
      {inbox.length ? <ul>{inbox.map(item => <li key={item.productionId + item.requestId}>
        <button onClick={() => { choose(item.productionId) }}>{item.productionId}</button> · {item.targetId} ·
        {item.assigneeId ?? 'team queue'} · {item.status} · {item.actionable ? 'actionable' : 'blocked'}
      </li>)}</ul> : <p>No active rights requests.</p>}
      <label>Territory reviewer <select value={reviewerId} onChange={event => { setReviewerId(event.target.value) }}>
        {rightsReviewers.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
    </section>
    <section className="suite-card" aria-label="Production collection"><h2>Productions</h2>
      <div className="filters"><label>Search productions <input value={query} onChange={event => { setQuery(event.target.value) }} /></label>
        <label>Show <select value={filter} onChange={event => { setFilter(event.target.value) }}>
          <option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option>
        </select></label></div>
      {rows.length ? <ul>{rows.map(record => <li key={record.id}>
        <label><input type="checkbox" checked={checked.includes(record.id)} onChange={event => {
          setChecked(current => event.target.checked ? [...current, record.id] : current.filter(id => id !== record.id))
        }} /> Select {record.id}</label>
        <button aria-current={selectedId === record.id ? 'true' : undefined} onClick={() => { choose(record.id) }}>
          {record.id} · {record.targetId} · {record.ledger.manifest ? 'published' : 'draft'}
        </button><small> r{record.ledger.revision} · {record.grantId}{record.archived ? ' · archived' : ''}</small>
      </li>)}</ul> : <p>No productions match this view.</p>}
      <button disabled={!checked.length} onClick={() => {
        const result = reprocessProductions(collection, checked)
        persist(result.collection, `${String(result.updated.length)} reprocessed; ${String(result.skipped.length)} current; ${String(result.blocked.length)} blocked.`)
      }}>Reprocess selected manifests</button>
      <form onSubmit={event => { event.preventDefault(); if (run(() => createProduction(collection, newId, 'STREAM-EU', 'RG-EU-4'), 'Production created.')) setNewId('') }}>
        <label>New production ID <input value={newId} onChange={event => { setNewId(event.target.value) }} pattern="PROD-[0-9]+" required /></label>
        <button type="submit">Create EU production</button>
      </form>
    </section>
    <section className="suite-card" aria-label="Selected production"><h2>{selected?.id ?? 'Select a production'}</h2>
      {selected && <><p>Delivery {selected.targetId} · Grant {selected.grantId} · Manifest revision {selected.ledger.revision}</p>
        <p>Asset {selected.ledger.manifest?.assetId ?? 'not published'} · Rights {selected.ledger.rightsValid ? 'valid' : 'invalid'} ·
          Review {selected.ledger.rightsReviews?.find(item => item.status === 'open')?.assigneeId ?? 'unclaimed'}</p>
        <button onClick={() => { run(() => claimProductionRights(collection, selected.id, reviewerId, selected.ledger.revision),
          'Rights review claimed by named reviewer.') }}>Claim selected rights review</button>
        <button onClick={() => { run(() => archiveProduction(collection, selected.id), 'Production archived.') }}>Archive production</button>
        <button onClick={() => {
          const grant = collection.grants.find(item => item.id === selected.grantId)
          if (!grant) return
          try { const result = setGrantValidity(collection, grant.id, !grant.valid, 'rights controller', grant.revision)
            persist(result.collection, `${String(result.updated.length)} related productions updated; ${String(result.skipped.length)} unchanged.`)
          } catch (error) { setNotice(error instanceof Error ? error.message : 'Grant update failed.') }
        }}>Toggle linked rights grant</button>
        <p>Grant availability: {collection.grants.find(item => item.id === selected.grantId)?.valid ? 'valid' : 'invalid'}</p>
        <details><summary>Manifest history</summary><ol>{selected.ledger.history.map((item, index) =>
          <li key={index}>{item.action} · r{item.revision} · {item.assetId}</li>)}</ol></details>
      </>}
    </section>
    <section className="suite-card" aria-label="Rights audit"><h2>Collection audit</h2>
      <ol>{collection.events.toReversed().slice(0, 8).map(item => <li key={item.sequence}>
        {item.action} · {item.targetId} · related {item.relatedIds.join(', ') || 'none'} · {item.actor}
      </li>)}</ol></section>
    <nav aria-label="Selected record workflows">{selected && !selected.archived && <><Link to={recordDetailPath(selected)}>Open record details</Link>{' · '}<Link to={recordDecisionPath(selected)}>Open decision workflow</Link></>} <button onClick={() => { try { setCollection(readProductionCollection(window.localStorage)); setNotice('Workspace refreshed; selection preserved.') } catch (error) { setNotice(error instanceof Error ? error.message : 'Refresh failed.') } }}>Refresh workspace</button></nav>
    <p role="status">{notice}</p>
  </main>
}
