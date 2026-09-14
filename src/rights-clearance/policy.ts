import { requireThat } from '../workspace/values'
export const workflowKey = "rights-clearance"
export const workflowLabel = "Media rights clearance"
export const ruleKind = "dependency"
export interface RightsClearanceRecord { measured: number; limit: number; evidence: string; revision: number }
export function validateAuthorization(record: RightsClearanceRecord) {
  requireThat(Number.isSafeInteger(record.measured) && Number.isSafeInteger(record.limit), 'Workflow measurements must be safe integers.')
  requireThat(record.measured >= 0 && record.limit >= 0, 'Workflow measurements cannot be negative.')
  requireThat(record.measured === record.limit, 'Asset rights revision does not match Approved rights revision.')
  requireThat(record.evidence.trim().length >= 8, 'Media rights clearance require traceable evidence.')
  requireThat(record.revision > 0, 'Media rights clearance require a current record revision.')
  return { authorized: true as const, fingerprint: [workflowKey, record.measured, record.limit, record.revision].join(':') }
}
export function canRoleAdvance(role: string, phase: string) {
  const matrix: Record<string, readonly string[]> = { draft: ['coordinator'], review: ['reviewer'], authorized: ['operator'], active: ['owner'], blocked: ['reviewer'] }
  return (matrix[phase] ?? []).includes(role)
}
