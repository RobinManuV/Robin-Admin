const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { extractDniFields } = require('../../lib/ocr');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const {
  cancelDniUpload,
  createDniUploadTicket,
  loadDniImages,
} = require('../../lib/dni-upload');

function inputError(error) {
  return error && error.statusCode === 400;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  try {
    const sb = getSupabase();
    const { data: user, error: userError } = await sb
      .from('users')
      .select('id')
      .eq('id', session.uid)
      .maybeSingle();
    if (userError) throw userError;
    if (!user) return json({ error: 'unauthorized' }, { statusCode: 401 });
    const action = String(body.action || 'extract');

    if (action === 'upload_ticket') {
      const upload = await createDniUploadTicket(sb, session.uid, body);
      return json({
        upload: {
          path: upload.path,
          signed_url: upload.signedUrl,
          expires_in: upload.expiresIn,
        },
      });
    }

    if (action === 'cancel') {
      await cancelDniUpload(sb, session.uid, body);
      return json({ ok: true });
    }

    if (action !== 'extract') return json({ error: 'invalid_action' }, { statusCode: 400 });

    const images = await loadDniImages(sb, session.uid, body);
    const fields = await extractDniFields({
      anverso: { base64: images.anverso.base64, mimetype: images.anverso.mimetype },
      reverso: images.reverso
        ? { base64: images.reverso.base64, mimetype: images.reverso.mimetype }
        : null,
      docType: images.docType,
    });

    const { error: updateError } = await sb
      .from('users')
      .update({
        dni_anverso_path: images.anverso.path,
        dni_reverso_path: images.reverso ? images.reverso.path : null,
      })
      .eq('id', session.uid);
    if (updateError) throw updateError;

    return json({ ok: true, fields });
  } catch (error) {
    if (inputError(error)) {
      return json({ error: error.code || error.message || 'invalid_upload' }, { statusCode: 400 });
    }
    return serverError(error, 'onboarding.dni_extract');
  }
};

module.exports.inputError = inputError;
