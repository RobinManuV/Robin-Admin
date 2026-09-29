const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { missingPhoneColumn } = require('../../lib/student-phone');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });

  const body = parseJsonBody(event);
  if (!body) return json({ error: 'invalid_json' }, { statusCode: 400 });

  const { nombre, apellidos, direccion, fecha_nacimiento, dni_numero, telefono_alumno } = body;
  if (!nombre || !apellidos || !direccion || !fecha_nacimiento || !dni_numero || !telefono_alumno) {
    return json({ error: 'missing_fields' }, { statusCode: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha_nacimiento)) {
    return json({ error: 'invalid_birthdate' }, { statusCode: 400 });
  }
  const phone = String(telefono_alumno).trim();
  if (!/^[+()\d\s.-]{7,30}$/.test(phone) || (phone.match(/\d/g) || []).length < 7) {
    return json({ error: 'invalid_student_phone' }, { statusCode: 400 });
  }

  try {
    const sb = getSupabase();
    const userPatch = {
      nombre, apellidos, direccion, fecha_nacimiento,
      dni_numero: String(dni_numero).toUpperCase(),
      telefono_alumno: phone,
      dni_completed: true,
    };
    let { error } = await sb.from('users').update(userPatch).eq('id', session.uid);
    if (error && missingPhoneColumn(error)) {
      const { data: current, error: currentError } = await sb.from('users').select('questionnaire').eq('id', session.uid).single();
      if (currentError) throw currentError;
      const { telefono_alumno: _phone, ...compatiblePatch } = userPatch;
      compatiblePatch.questionnaire = { ...(current?.questionnaire || {}), telefono_alumno: phone };
      ({ error } = await sb.from('users').update(compatiblePatch).eq('id', session.uid));
    }
    if (error) throw error;

    // Renombrar la carpeta de Drive al nombre del DNI (best-effort, no bloquea).
    try {
      const drive = require('../../lib/google-drive');
      const { data: u2 } = await sb.from('users')
        .select('id, lead_id, nombre, apellidos, gdrive_folders')
        .eq('id', session.uid).single();
      if (u2) await drive.renameClientFolder(sb, u2);
    } catch (e) { console.error('dni-save drive rename warn:', e && e.message); }

    return json({ ok: true, next_step: 'profile' });
  } catch (e) {
    console.error('dni save error', e);
    return serverError(e);
  }
};
