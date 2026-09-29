/**
 * POST /api/documents/upload
 * Confirma un binario previamente subido con /api/documents/upload-ticket.
 * Body: { id, file_path, file_filename, file_mime, file_size }
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { isApplicationAdmin, ownsRecord } = require('../../lib/authorization');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { sendEmail } = require('../../lib/email');
const storage = require('../../lib/storage');
const { syncStoredDocumentToDrive } = require('../../lib/document-drive');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const { id, file_path, file_filename, file_mime, file_size } = body;
  if (!id || !file_path) return json({ error: 'missing_fields' }, { statusCode: 400 });
  const descriptor = storage.uploadDescriptor({
    filename: file_filename,
    contentType: file_mime,
    size: file_size,
  });
  if (!descriptor.ok) return json({ error: descriptor.error }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: caller } = await sb.from('users')
      .select('id, email, username, role').eq('id', session.uid).single();
    if (!caller) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const isAdmin = isApplicationAdmin(caller);

    const { data: doc, error: documentError } = await sb.from('documents').select('*').eq('id', id).single();
    if (documentError || !doc) return json({ error: 'not_found' }, { statusCode: 404 });
    if (!isAdmin && !ownsRecord(caller, doc)) return json({ error: 'forbidden' }, { statusCode: 403 });
    if (doc.file_path === file_path && doc.status === 'pending_review') {
      return json({ ok: true, document_id: doc.id, already_confirmed: true });
    }

    const keyPrefix = `${doc.user_id}/${doc.id}`;
    try {
      await storage.verifyUploadedObject(sb, file_path, {
        keyPrefix,
        contentType: descriptor.contentType,
        size: descriptor.size,
      });
    } catch (verificationError) {
      if (file_path !== doc.file_path && storage.pathInsidePrefix(file_path, keyPrefix)) {
        await storage.removeObject(sb, file_path);
      }
      return json({ error: verificationError.message || 'invalid_upload' }, { statusCode: 400 });
    }

    const nowIso = new Date().toISOString();
    const { error: updateError } = await sb.from('documents').update({
      file_path,
      file_filename: descriptor.filename,
      file_mime: descriptor.contentType,
      status: 'pending_review',
      uploaded_at: nowIso,
      uploaded_by: isAdmin ? 'admin' : 'client',
      rejection_reason: null,
    }).eq('id', doc.id);
    if (updateError) {
      await storage.removeObject(sb, file_path);
      throw updateError;
    }
    if (doc.file_path && doc.file_path !== file_path) {
      await storage.removeObject(sb, doc.file_path);
    }

    let driveResult;
    try {
      driveResult = await syncStoredDocumentToDrive(
        sb,
        { ...doc, file_path },
        file_path,
        descriptor.filename,
        descriptor.contentType
      );
    } catch (driveError) {
      driveResult = { ok: false, error: driveError && driveError.message };
    }

    let emailResult = null;
    if (!isAdmin) {
      const { data: student } = await sb.from('users')
        .select('nombre, apellidos, email, assigned_to').eq('id', doc.user_id).single();
      if (student && student.assigned_to) {
        const fullName = `${student.nombre || ''} ${student.apellidos || ''}`.trim()
          || student.email || 'Un alumno';
        const docName = doc.name || descriptor.filename || 'documento';
        const text = `${fullName} ha subido ${docName}.\n\nPuedes revisarlo de forma segura en el panel de Project Robin.`;
        emailResult = await sendEmail({
          to: student.assigned_to,
          subject: `${fullName} ha subido un documento`,
          text,
          html: text.replace(/\n/g, '<br>'),
          tag: 'doc_uploaded',
        });
      }
    }

    return json({ ok: true, document_id: doc.id, email: emailResult, gdrive: driveResult });
  } catch (error) {
    return serverError(error, 'documents.upload_confirm');
  }
};
