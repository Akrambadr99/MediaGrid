import { requireThat } from '../workspace/values'
export const workflowKey = "editorial-approval"
export const workflowLabel = "Editorial approval qualification"
export const ruleKind = "qualification"
export interface EditorialApprovalRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: EditorialApprovalRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured >= record.limit, 'Standards review score fall below Minimum standards score.')
  requireThat(record.evidence.trim().length >= 8, 'Editorial approval qualification require traceable evidence.')
  requireThat(record.revision > 0, 'Editorial approval qualification require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
