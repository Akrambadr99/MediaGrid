import { requireThat } from '../workspace/values'
export const workflowKey = "render-farm"
export const workflowLabel = "Render capacity reserve"
export const ruleKind = "reserve"
export interface RenderFarmRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: RenderFarmRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured >= record.limit, 'Available render units fall below Minimum render units.')
  requireThat(record.evidence.trim().length >= 8, 'Render capacity reserve require traceable evidence.')
  requireThat(record.revision > 0, 'Render capacity reserve require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
