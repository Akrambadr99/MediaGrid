import { expect, it } from 'vitest'
import { evaluateScenario } from '../review-comparison/scenario'
import { productionById, seedProductionCollection } from './productionCollection'
import { recordDecisionPath } from './recordLinks'

it('opens the selected published version or supported draft comparison base', () => {
  for (const record of seedProductionCollection().productions) {
    const url = new URL(recordDecisionPath(record), 'https://test.invalid')
    expect(url.searchParams.get('record')).toBe(record.id)
    expect(url.searchParams.get('version')).toBe(record.ledger.manifest ? '13' : '12')
    expect(() => evaluateScenario(Number(url.searchParams.get('version')))).not.toThrow()
  }
})

it('does not forward an unsupported persisted asset as an invalid numeric scenario', () => {
  const record = productionById(seedProductionCollection(), 'PROD-78')
  if (!record.ledger.manifest) throw new Error('The fixture must be published.')
  const unknown = { ...record, ledger: { ...record.ledger, manifest: { ...record.ledger.manifest, assetId: 'UNKNOWN' } } }
  const url = new URL(recordDecisionPath(unknown), 'https://test.invalid')
  expect(url.searchParams.get('version')).toBe('12')
  expect(() => evaluateScenario(Number(url.searchParams.get('version')))).not.toThrow()
})
