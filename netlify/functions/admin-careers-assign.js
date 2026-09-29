/**
 * POST /api/admin/careers/assign     { user_id, career_template_id }   asigna carrera + crea docs requeridos
 * POST /api/admin/careers/unassign   { user_id, career_template_id }   quita asignación y limpia solicitudes sin usar
 */
const { getSupabase } = require('../../lib/supabase');
const storage = require('../../lib/storage');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { selectMissingRequiredDocs, planUnassignedCareerDocuments } = require('../../lib/career-documents');
const { documentRequirements } = require('../../lib/career-requirements');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });
  const user_id = body.user_id;
  const ctid = body.career_template_id;
  const action = body.action === 'unassign' ? 'unassign' : 'assign';
  if (!user_id || !ctid) return json({ error: 'missing_fields' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    if (action === 'unassign') {
      const { error: unassignError } = await sb.from('client_careers').delete().eq('user_id', user_id).eq('career_template_id', ctid);
      if (unassignError) throw unassignError;
      const { data: remainingAssignments, error: assignmentsError } = await sb
        .from('client_careers').select('career_template_id').eq('user_id', user_id);
      if (assignmentsError) throw assignmentsError;
      const remainingIds = (remainingAssignments || []).map((item) => item.career_template_id);
      let remainingTemplates = [];
      if (remainingIds.length) {
        const { data, error } = await sb.from('career_templates').select('id, required_docs').in('id', remainingIds);
        if (error) throw error;
        remainingTemplates = data || [];
      }
      const { data: documents, error: documentsError } = await sb
        .from('documents')
        .select('id, name, status, source, career_template_id, uploaded_at, file_path, template_path')
        .eq('user_id', user_id);
      if (documentsError) throw documentsError;
      const cleanup = planUnassignedCareerDocuments(documents || [], ctid, remainingTemplates);
      for (const item of cleanup.reassignments) {
        const { error } = await sb.from('documents').update({ career_template_id: item.careerTemplateId }).eq('id', item.id);
        if (error) throw error;
      }
      if (cleanup.deleteIds.length) {
        const { error } = await sb.from('documents').delete().in('id', cleanup.deleteIds);
        if (error) throw error;
        const removed = (documents || []).filter((item) => cleanup.deleteIds.includes(item.id));
        for (const document of removed) await storage.removeObject(sb, document.template_path);
      }
      return json({
        ok: true,
        documents_removed: cleanup.deleteIds.length,
        documents_reused: cleanup.reassignments.length,
        documents_preserved: cleanup.preservedIds.length,
      });
    }

    // asignar (idempotente)
    const { data: existing } = await sb.from('client_careers').select('id').eq('user_id', user_id).eq('career_template_id', ctid).maybeSingle();
    if (existing) return json({ ok: true, already_assigned: true });

    const { error: e1 } = await sb.from('client_careers').insert({
      user_id, career_template_id: ctid, assigned_by: adminEmail,
    });
    if (e1) throw e1;

    // crear documentos requeridos
    const { data: tpl } = await sb.from('career_templates').select('*').eq('id', ctid).single();
    if (tpl && Array.isArray(tpl.required_docs)) {
      // Un documento representa un requisito del alumno, aunque varias carreras lo
      // compartan. Se compara por nombre normalizado con todos sus documentos y
      // también se eliminan duplicados dentro de la propia plantilla.
      const { data: existingDocuments, error: existingDocumentsError } = await sb
        .from('documents')
        .select('id, name')
        .eq('user_id', user_id);
      if (existingDocumentsError) throw existingDocumentsError;
      const requiredDocuments = documentRequirements(tpl.required_docs);
      const missingDocs = selectMissingRequiredDocs(requiredDocuments, existingDocuments || []);
      const rows = [];
      for (const d of missingDocs) {
        let template_path = null;
        if (d.template_path) {
          const copied = await storage.copyObject(sb, d.template_path, {
            keyPrefix: `${user_id}/templates`,
            filename: d.template_filename || d.name,
          });
          template_path = copied.path;
        }
        rows.push({
          user_id, career_template_id: ctid,
          name: d.name, required: d.required !== false, status: 'required',
          template_path,
          template_filename: d.template_filename || null,
          template_mime: d.template_mime || null,
          source: 'career_template',
          uploaded_by: null,
        });
      }
      if (rows.length) {
        const { error: documentsError } = await sb.from('documents').insert(rows);
        if (documentsError) throw documentsError;
      }
      return json({ ok: true, documents_created: rows.length, documents_reused: requiredDocuments.length - rows.length });
    }
    return json({ ok: true });
  } catch (e) {
    console.error('admin-careers-assign error', e);
    return serverError(e);
  }
};
