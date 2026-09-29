const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { FAQ_ITEMS } = require('../../lib/faq-knowledge');

const builtInFaqs = FAQ_ITEMS.map((faq, index) => ({
  ...faq,
  id: `builtin-${index + 1}`,
  published: true,
  builtin: true,
}));

function questionKey(value) {
  return String(value || '').trim().toLocaleLowerCase('es');
}

function withBuiltInFaqs(storedFaqs) {
  const storedQuestions = new Set(storedFaqs.map((faq) => questionKey(faq.question)));
  return [...builtInFaqs.filter((faq) => !storedQuestions.has(questionKey(faq.question))), ...storedFaqs]
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
}

async function adminFor(sb, uid) {
  const { data } = await sb.from('users').select('id,email,username,role').eq('id', uid).single();
  return !!data && isApplicationAdmin(data);
}

exports.handler = async (event) => {
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  try {
    const sb = getSupabase();
    const isAdmin = await adminFor(sb, session.uid);
    if (event.httpMethod === 'GET') {
      let query = sb.from('portal_faqs').select('id,question,answer,category,published,sort_order,created_at,updated_at')
        .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
      if (!isAdmin) query = query.eq('published', true);
      const { data, error } = await query;
      if (error) throw error;
      return json({ faqs: withBuiltInFaqs(data || []) });
    }
    if (event.httpMethod !== 'POST') return methodNotAllowed(['GET', 'POST']);
    if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });
    const body = parseJsonBody(event);
    if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
    const action = body.action;
    const payload = body.payload || {};
    if (String(payload.id || '').startsWith('builtin-')) return json({ error: 'builtin_read_only' }, { statusCode: 400 });
    if (action === 'delete') {
      if (!payload.id) return json({ error: 'missing_id' }, { statusCode: 400 });
      const { error } = await sb.from('portal_faqs').delete().eq('id', payload.id);
      if (error) throw error;
      return json({ ok: true });
    }
    if (!['create', 'update'].includes(action)) return json({ error: 'bad_action' }, { statusCode: 400 });
    const question = String(payload.question || '').trim();
    const answer = String(payload.answer || '').trim();
    if (!question || question.length > 300) return json({ error: 'invalid_question' }, { statusCode: 400 });
    if (!answer || answer.length > 5000) return json({ error: 'invalid_answer' }, { statusCode: 400 });
    const row = { question, answer, category: String(payload.category || 'General').trim().slice(0, 80) || 'General', published: payload.published !== false, sort_order: Number.isFinite(Number(payload.sort_order)) ? Number(payload.sort_order) : 0, updated_at: new Date().toISOString() };
    let result;
    if (action === 'create') result = await sb.from('portal_faqs').insert(row).select('*').single();
    else {
      if (!payload.id) return json({ error: 'missing_id' }, { statusCode: 400 });
      result = await sb.from('portal_faqs').update(row).eq('id', payload.id).select('*').single();
    }
    if (result.error) throw result.error;
    return json({ ok: true, item: result.data });
  } catch (error) {
    console.error('faqs error', error);
    return serverError(error);
  }
};
