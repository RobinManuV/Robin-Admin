const { getSubscriptionsSupabase } = require('../../lib/subscriptions-supabase');
const { readSubscriptionsAdmin } = require('../../lib/subscriptions-admin-auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');

exports.handler = async (event) => {
  const session = await readSubscriptionsAdmin(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const isAdmin = true;
  try {
    const sb = getSubscriptionsSupabase();
    if (event.httpMethod === 'GET') {
      let query = sb.from('subscription_faqs').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      if (!isAdmin) query = query.eq('published', true);
      const { data, error } = await query;
      if (error) throw error;
      return json({ faqs: data || [] });
    }
    if (event.httpMethod !== 'POST') return methodNotAllowed(['GET', 'POST']);
    if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
    const body = parseJsonBody(event);
    if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
    const payload = body.payload || {};
    if (body.action === 'delete') {
      if (!payload.id) return json({ error: 'missing_id' }, { statusCode: 400 });
      const { error } = await sb.from('subscription_faqs').delete().eq('id', payload.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (!['create', 'update'].includes(body.action)) return json({ error: 'bad_action' }, { statusCode: 400 });
    const question = String(payload.question || '').trim(), answer = String(payload.answer || '').trim();
    if (!question || question.length > 300) return json({ error: 'invalid_question' }, { statusCode: 400 });
    if (!answer || answer.length > 5000) return json({ error: 'invalid_answer' }, { statusCode: 400 });
    const row = { question, answer, category: String(payload.category || 'General').trim().slice(0, 80) || 'General', published: payload.published !== false, sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0, updated_at: new Date().toISOString() };
    let result;
    if (body.action === 'create') result = await sb.from('subscription_faqs').insert(row).select('*').single();
    else {
      if (!payload.id) return json({ error: 'missing_id' }, { statusCode: 400 });
      result = await sb.from('subscription_faqs').update(row).eq('id', payload.id).select('*').single();
    }
    if (result.error) throw result.error;
    return json({ ok: true, item: result.data });
  } catch (error) {
    console.error('faqs error', error);
    return serverError(error);
  }
};
