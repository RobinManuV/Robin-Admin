/**
 * POST /api/admin/careers
 * Body: { name, university, city, required_docs: [{name, required, template_path?, template_filename?, template_mime?, template_size?}] }
 */
const { getSupabase } = require('../../lib/supabase');
const storage = require('../../lib/storage');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, normalizeEmail } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { normalizeDocumentName } = require('../../lib/career-documents');
const { documentRequirements, findCareerDocument, normalizeCareerRequirement } = require('../../lib/career-requirements');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const templateId = body.id ? String(body.id) : null;
  const name = String(body.name || '').trim();
  const university = String(body.university || '').trim();
  const city = body.city ? String(body.city).trim() : null;
  if (!name || !university) return json({ error: 'missing_fields' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: admin } = await sb.from('users').select('id, email, username, role').eq('id', session.uid).single();
    if (!admin) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const adminEmail = normalizeEmail(admin);
    const isAdmin = isApplicationAdmin(admin);
    if (!isAdmin) return json({ error: 'forbidden' }, { statusCode: 403 });

    let previousTemplate = null;
    if (templateId) {
      const { data, error } = await sb.from('career_templates').select('*').eq('id', templateId).single();
      if (error || !data) return json({ error: 'career_not_found' }, { statusCode: 404 });
      previousTemplate = data;
    }

    const required_docs = [];
    const uploadedTemplatePaths = [];
    for (const [i, raw] of (Array.isArray(body.required_docs) ? body.required_docs : []).entries()) {
      const doc = normalizeCareerRequirement(raw);
      if (!doc.name || !doc.deadline) {
        for (const path of uploadedTemplatePaths) await storage.removeObject(sb, path);
        return json({ error: 'invalid_requirement', index: i }, { statusCode: 400 });
      }
      if (doc.template_path) {
        const keyPrefix = `career-templates/${admin.id}`;
        const isNewUpload = !!raw.template_size;
        const isExistingTemplate = !!previousTemplate && (previousTemplate.required_docs || [])
          .some((item) => item.template_path === doc.template_path);
        if ((isNewUpload && !storage.pathInsidePrefix(doc.template_path, keyPrefix)) || (!isNewUpload && !isExistingTemplate)) {
          for (const path of uploadedTemplatePaths) await storage.removeObject(sb, path);
          return json({ error: 'invalid_storage_path' }, { statusCode: 400 });
        }
        if (raw.template_size) {
          uploadedTemplatePaths.push(doc.template_path);
          const descriptor = storage.uploadDescriptor({
            filename: doc.template_filename,
            contentType: doc.template_mime,
            size: raw.template_size,
          });
          if (!descriptor.ok) {
            for (const path of uploadedTemplatePaths) await storage.removeObject(sb, path);
            return json({ error: descriptor.error }, { statusCode: 400 });
          }
          try {
            await storage.verifyUploadedObject(sb, doc.template_path, {
              keyPrefix,
              contentType: descriptor.contentType,
              size: descriptor.size,
            });
          } catch (verificationError) {
            for (const path of uploadedTemplatePaths) await storage.removeObject(sb, path);
            return json({ error: verificationError.message || 'invalid_upload' }, { statusCode: 400 });
          }
        }
      }
      required_docs.push(doc);
    }

    const query = templateId
      ? sb.from('career_templates').update({ name, university, city, required_docs }).eq('id', templateId)
      : sb.from('career_templates').insert({ name, university, city, required_docs, created_by: adminEmail });
    const { data, error } = await query.select().single();
    if (error) {
      for (const path of uploadedTemplatePaths) await storage.removeObject(sb, path);
      throw error;
    }

    let documentsCreated = 0;
    let documentsUpdated = 0;
    let documentsRemoved = 0;
    if (templateId && previousTemplate) {
      const { data: assignments, error: assignmentsError } = await sb
        .from('client_careers').select('user_id').eq('career_template_id', templateId);
      if (assignmentsError) throw assignmentsError;
      const userIds = (assignments || []).map((item) => item.user_id);
      let documents = [];
      if (userIds.length) {
        const { data: rows, error: documentsError } = await sb.from('documents').select('*').in('user_id', userIds);
        if (documentsError) throw documentsError;
        documents = rows || [];
      }
      const previousById = new Map((previousTemplate.required_docs || []).map((item) => [item.id, item]));
      const nextDocuments = documentRequirements(required_docs);
      for (const userId of userIds) {
        const userDocuments = documents.filter((item) => item.user_id === userId);
        const retainedIds = new Set();
        for (const requirement of nextDocuments) {
          const previous = previousById.get(requirement.id);
          const existing = findCareerDocument(userDocuments, templateId, requirement, previous);
          if (existing) {
            retainedIds.add(existing.id);
            const patch = { name: requirement.name, required: requirement.required !== false };
            if (requirement.template_path && requirement.template_path !== previous?.template_path) {
              const copied = await storage.copyObject(sb, requirement.template_path, {
                keyPrefix: `${userId}/templates`, filename: requirement.template_filename || requirement.name,
              });
              patch.template_path = copied.path;
              patch.template_filename = requirement.template_filename || null;
              patch.template_mime = requirement.template_mime || null;
            }
            const { error: updateError } = await sb.from('documents').update(patch).eq('id', existing.id);
            if (updateError) throw updateError;
            documentsUpdated += 1;
            continue;
          }
          const shared = userDocuments.find((item) => normalizeDocumentName(item.name) === normalizeDocumentName(requirement.name));
          if (shared) continue;
          let template_path = null;
          if (requirement.template_path) {
            const copied = await storage.copyObject(sb, requirement.template_path, {
              keyPrefix: `${userId}/templates`, filename: requirement.template_filename || requirement.name,
            });
            template_path = copied.path;
          }
          const { error: insertError } = await sb.from('documents').insert({
            user_id: userId, career_template_id: templateId, name: requirement.name,
            required: requirement.required !== false, status: 'required', source: 'career_template',
            template_path, template_filename: requirement.template_filename || null,
            template_mime: requirement.template_mime || null, uploaded_by: null,
          });
          if (insertError) throw insertError;
          documentsCreated += 1;
        }
        for (const existing of userDocuments.filter((item) => item.career_template_id === templateId)) {
          if (retainedIds.has(existing.id)) continue;
          const untouched = existing.source === 'career_template' && existing.status === 'required'
            && !existing.uploaded_at && !existing.file_path;
          if (!untouched) continue;
          const stillRequired = nextDocuments.some((requirement) =>
            normalizeDocumentName(requirement.name) === normalizeDocumentName(existing.name));
          if (stillRequired) continue;
          const { error: deleteError } = await sb.from('documents').delete().eq('id', existing.id);
          if (deleteError) throw deleteError;
          documentsRemoved += 1;
          await storage.removeObject(sb, existing.template_path);
        }
      }
    }
    return json({ ok: true, template: data, documents_created: documentsCreated, documents_updated: documentsUpdated, documents_removed: documentsRemoved });
  } catch (e) {
    console.error('admin-careers-create error', e);
    return serverError(e);
  }
};
