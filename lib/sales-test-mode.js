const { isMissingPerformanceSchema } = require('./crm-identity');

async function activeSalesTestRun(crm) {
  const { data, error } = await crm.from('sales_test_runs')
    .select('test_run,status,launched_at')
    .in('status', ['active', 'stopping'])
    .order('launched_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (isMissingPerformanceSchema(error)) return null;
    throw error;
  }
  return data || null;
}

function isLeadInTestRun(lead, runId) {
  return Boolean(runId && lead?.is_test === true && lead?.source_payload?.test_run === runId);
}

async function testLeadIds(crm, runId) {
  if (!runId) return [];
  const { data, error } = await crm.from('crm_leads').select('id')
    .eq('is_test', true)
    .contains('source_payload', { test_run: runId });
  if (error) throw error;
  return (data || []).map((row) => String(row.id));
}

module.exports = { activeSalesTestRun, isLeadInTestRun, testLeadIds };
