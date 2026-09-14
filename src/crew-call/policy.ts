import { requireThat } from '../workspace/values'
export const workflowKey = "crew-call"
export const workflowLabel = "Crew call window"
export const ruleKind = "window"
export interface CrewCallRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: CrewCallRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured <= record.limit, 'Crew arrival minute falls outside Latest crew arrival minute.')
  requireThat(record.evidence.trim().length >= 8, 'Crew call window require traceable evidence.')
  requireThat(record.revision > 0, 'Crew call window require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
