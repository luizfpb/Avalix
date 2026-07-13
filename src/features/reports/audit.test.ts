import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: { rpc: mocks.rpc },
}))

import { logDataAction } from './audit'

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ error: null })
})

describe('auditoria de dados', () => {
  it('omite identificadores nulos ou indefinidos da chamada RPC', async () => {
    await logDataAction({
      orgId: 'org-1',
      action: 'EXPORT_CSV',
      tableName: 'subjects',
      rowId: null,
    })

    expect(mocks.rpc).toHaveBeenNthCalledWith(1, 'log_data_action', {
      p_org: 'org-1',
      p_action: 'EXPORT_CSV',
      p_table_name: 'subjects',
    })

    await logDataAction({
      orgId: 'org-1',
      action: 'PDF_REPORT',
      tableName: 'assessments',
      rowId: 'assessment-1',
      subjectId: null,
    })

    expect(mocks.rpc).toHaveBeenNthCalledWith(2, 'log_data_action', {
      p_org: 'org-1',
      p_action: 'PDF_REPORT',
      p_table_name: 'assessments',
      p_row_id: 'assessment-1',
    })
  })

  it('inclui os identificadores quando presentes', async () => {
    await logDataAction({
      orgId: 'org-1',
      action: 'SUBJECT_EXPORT',
      tableName: 'subjects',
      rowId: 'subject-1',
      subjectId: 'subject-1',
    })

    expect(mocks.rpc).toHaveBeenCalledWith('log_data_action', {
      p_org: 'org-1',
      p_action: 'SUBJECT_EXPORT',
      p_table_name: 'subjects',
      p_row_id: 'subject-1',
      p_subject_id: 'subject-1',
    })
  })
})
