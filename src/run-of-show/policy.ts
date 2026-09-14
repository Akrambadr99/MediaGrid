import { requireThat } from '../workspace/values'
export const workflowKey = "run-of-show"
export const workflowLabel = "Run-of-show sequence"
export const ruleKind = "sequence"
export interface RunOfShowRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: RunOfShowRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured >= record.limit, 'Completed rundown item have not reached Required rundown item.')
  requireThat(record.evidence.trim().length >= 8, 'Run-of-show sequence require traceable evidence.')
  requireThat(record.revision > 0, 'Run-of-show sequence require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
