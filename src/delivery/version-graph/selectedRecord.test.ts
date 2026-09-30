import { describe, expect, it } from 'vitest'
import type { StoragePort } from '../../platform/storage-port'
import { saveCurrentCollection } from '../../workspace/recordStorage'
import { openSelectedRecord } from './selectedRecord'
import { readProductionCollection, saveProductionCollection } from './productionCollection'
import { readManifestLedger, saveManifestLedger, reviseRights } from './manifestLedger'

class MemoryStorage implements StoragePort {
  data = new Map<string, string>()
  fail = false
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, raw: string) { if (this.fail) throw new Error('Storage full'); this.data.set(key, raw) }
}
const edit: (state: ReturnType<typeof readManifestLedger>) => ReturnType<typeof readManifestLedger> = state => reviseRights(state, false)
const key = 'mediagrid:production:PROD-77:delivery:v1'
describe('selected production persistence', () => {
  it('preserves the primary migration source when a secondary record opens first', () => {
    const storage = new MemoryStorage()
    const before = readProductionCollection(storage)
    const peer = before.productions[1]
    if (!peer) throw new Error('Secondary fixture missing')
    const bound = openSelectedRecord(storage, peer.id)
    expect(readProductionCollection(bound)).toEqual(before)
    expect(storage.data.size).toBe(0)
  })
  it('rejects a manifest belonging to another production target', () => {
    const storage = new MemoryStorage(), before = readProductionCollection(storage)
    const us = before.productions.find(item => item.targetId === 'STREAM-US')
    if (!us?.ledger.manifest) throw new Error('US manifest fixture missing')
    expect(() => saveManifestLedger(openSelectedRecord(storage), us.ledger)).toThrow('target')
    expect(storage.data.size).toBe(0)
  })
  it('imports legacy history once and retains its original backup', () => {
    const storage = new MemoryStorage()
    const legacy = edit(readManifestLedger(storage))
    saveManifestLedger(storage, legacy)
    const backup = storage.getItem(key)
    const bound = openSelectedRecord(storage)
    expect(readManifestLedger(bound)).toEqual(legacy)
    saveManifestLedger(bound, legacy)
    expect(readProductionCollection(storage).productions[0]?.ledger).toEqual(legacy)
    expect(storage.getItem(key)).toBe(backup)
    saveManifestLedger(storage, readManifestLedger(new MemoryStorage()))
    expect(readManifestLedger(openSelectedRecord(storage))).toEqual(legacy)
  })
  it('persists a domain action and preserves every unrelated record', () => {
    const storage = new MemoryStorage(), before = readProductionCollection(storage)
    const bound = openSelectedRecord(storage), changed = edit(readManifestLedger(bound))
    saveManifestLedger(bound, changed)
    const after = readProductionCollection(storage)
    expect(after.productions[0]?.ledger).toEqual(changed)
    expect(after.productions.slice(1)).toEqual(before.productions.slice(1))
    expect(readManifestLedger(openSelectedRecord(storage))).toEqual(changed)
    expect(after.events.at(-1)).toMatchObject({ action: 'detail-updated', targetId: 'PROD-77' })
  })
  it('rejects stale edits without replacing the newer domain state', () => {
    const storage = new MemoryStorage()
    const first = openSelectedRecord(storage), stale = openSelectedRecord(storage)
    const changed = edit(readManifestLedger(first))
    saveManifestLedger(first, changed)
    expect(() => saveManifestLedger(stale, edit(readManifestLedger(stale)))).toThrow('changed in another view')
    expect(readManifestLedger(openSelectedRecord(storage))).toEqual(changed)
  })
  it('merges with an unrelated record archive without losing that edit', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const before = readProductionCollection(storage), peer = before.productions[1]
    if (!peer) throw new Error('Peer fixture missing')
    const newer = { ...before, productions: before.productions.map(item => item.id === peer.id ? { ...item, archived: true } : item) }
    saveProductionCollection(storage, newer)
    saveManifestLedger(bound, edit(readManifestLedger(bound)))
    expect(readProductionCollection(storage).productions[1]).toEqual(newer.productions[1])
  })
  it('rejects missing and archived targets without writing', () => {
    const storage = new MemoryStorage()
    expect(() => openSelectedRecord(storage, 'missing')).toThrow('not found')
    expect(storage.data.size).toBe(0)
    const before = readProductionCollection(storage)
    saveProductionCollection(storage, { ...before, productions: before.productions.map(item => ({ ...item, archived: true })) })
    const snapshot = [...storage.data]
    expect(() => openSelectedRecord(storage)).toThrow('archived')
    expect([...storage.data]).toEqual(snapshot)
  })
  it('rejects a record archived after the editor opened', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const before = readProductionCollection(storage)
    saveProductionCollection(storage, { ...before, productions: before.productions.map(item => ({ ...item, archived: true })) })
    expect(() => saveManifestLedger(bound, edit(readManifestLedger(bound)))).toThrow('changed in another view')
  })
  it('preserves retryability after a recoverable storage failure', () => {
    const storage = new MemoryStorage(), bound = openSelectedRecord(storage)
    const changed = edit(readManifestLedger(bound))
    storage.fail = true
    expect(() => saveManifestLedger(bound, changed)).toThrow('Browser storage rejected the save.')
    storage.fail = false
    saveManifestLedger(bound, changed)
    expect(readManifestLedger(openSelectedRecord(storage))).toEqual(changed)
  })
  it('protects a detail edit against a stale whole-workspace save', () => {
    const storage = new MemoryStorage(), stale = readProductionCollection(storage)
    const bound = openSelectedRecord(storage)
    saveManifestLedger(bound, edit(readManifestLedger(bound)))
    expect(() => saveCurrentCollection(storage, stale, stale, readProductionCollection, saveProductionCollection)).toThrow('Workspace changed')
    expect(readProductionCollection(storage).productions[0]?.ledger).not.toEqual(stale.productions[0]?.ledger)
  })
})
