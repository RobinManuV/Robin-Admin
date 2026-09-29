const { getSupabase } = require('../../lib/supabase');
const { getSubscriptionsSupabase } = require('../../lib/subscriptions-supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, serverError } = require('../../lib/http');

const money = (row) => Number(row.amount ?? row.total ?? row.price ?? row.value ?? row.importe ?? row.monto ?? row.total_amount ?? row.subscription_price ?? 0) || 0;

function aggregate(rows) {
  return rows.reduce((result, row) => {
    const status = String(row.status || '').toLowerCase();
    if (status === 'paid') result.paid += money(row);
    if (status === 'unlocked') result.pending += money(row);
    return result;
  }, { paid: 0, pending: 0 });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return methodNotAllowed(['GET']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const main = getSupabase();
    const { data: admin } = await main.from('users').select('id,email,username,role').eq('id', session.uid).single();
    if (!admin || !isApplicationAdmin(admin)) return json({ error: 'forbidden' }, { statusCode: 403 });
    const [{ data: payments, error: paymentsError }, subscriptionResult] = await Promise.all([
      main.from('payments').select('amount,status'),
      Promise.resolve().then(async () => {
        try { return await getSubscriptionsSupabase().from('subscription_invoices').select('*'); }
        catch (error) { return { data: null, error }; }
      }),
    ]);
    if (paymentsError) throw paymentsError;
    const subscriptionsError = subscriptionResult.error
      ? (/invalid api key/i.test(String(subscriptionResult.error.message || subscriptionResult.error)) ? 'invalid_robin_plan_key' : String(subscriptionResult.error.message || subscriptionResult.error))
      : null;
    return json({
      application: aggregate(payments || []),
      subscriptions: subscriptionResult.error ? null : aggregate(subscriptionResult.data || []),
      subscriptionsError,
    });
  } catch (error) { return serverError(error, 'admin.payment_analytics'); }
};
