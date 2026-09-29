/**
 * POST /api/notifications/ack
 * Body: { notification_id, action: 'seen' | 'accept' }
 *   - 'seen'   -> notificación informativa vista (no vuelve a salir)
 *   - 'accept' -> cambio de términos aceptado: registra fecha/hora + envía email de confirmación
 */
const { getSupabase } = require('../../lib/supabase');
const { readSessionFromEvent } = require('../../lib/auth');
const { json, methodNotAllowed, parseJsonBody, serverError, verifyOrigin } = require('../../lib/http');
const { sendEmail } = require('../../lib/email');
const { teamEmail } = require('../../lib/operational-config');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return methodNotAllowed(['POST']);
  const session = readSessionFromEvent(event);
  if (!session) return json({ error: 'unauthorized' }, { statusCode: 401 });
  if (!verifyOrigin(event)) return json({ error: 'bad_origin' }, { statusCode: 403 });

  try {
    const sb = getSupabase();
    const body = parseJsonBody(event) || {};
    const notificationId = body.notification_id;
    const action = body.action === 'accept' ? 'accept' : 'seen';
    if (!notificationId) return json({ error: 'missing_notification_id' }, { statusCode: 400 });

    // Verificar que el destinatario existe y pertenece al usuario
    const { data: rec, error: e0 } = await sb
      .from('notification_recipients')
      .select('id, status, user_id')
      .eq('notification_id', notificationId)
      .eq('user_id', session.uid)
      .single();
    if (e0 || !rec) return json({ error: 'not_found' }, { statusCode: 404 });

    const now = new Date().toISOString();
    const update = action === 'accept'
      ? { status: 'accepted', accepted_at: now, seen_at: rec.seen_at || now }
      : { status: 'seen', seen_at: now };

    const { error: e1 } = await sb
      .from('notification_recipients')
      .update(update)
      .eq('id', rec.id);
    if (e1) return json({ error: 'update_failed', detail: e1.message }, { statusCode: 500 });

    // Email de confirmación sólo para aceptación de cambio de términos
    if (action === 'accept') {
      try {
        const { data: notif } = await sb
          .from('notifications')
          .select('title, content, type')
          .eq('id', notificationId)
          .single();
        const { data: u } = await sb
          .from('users')
          .select('email, nombre, apellidos, lead_id')
          .eq('id', session.uid)
          .single();
        const nombre = [u?.nombre, u?.apellidos].filter(Boolean).join(' ') || (u?.email || 'Cliente');
        const fecha = new Date().toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
        const subject = 'Confirmación de aceptación de cambio de términos · Project Robin';
        const html = `
          <div style="font-family:Arial,sans-serif;color:#1B2F6E;max-width:600px;margin:0 auto">
            <h2 style="color:#1B2F6E">Cambio de términos aceptado</h2>
            <p>Hola ${nombre},</p>
            <p>Confirmamos que has <strong>aceptado</strong> el siguiente cambio en los términos y condiciones de tu contrato con Project Robin. Esta aceptación se aplica sobre el contrato que firmaste originalmente.</p>
            <div style="background:#FAF8F0;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin:16px 0">
              <h3 style="margin:0 0 8px;color:#1B2F6E">${(notif && notif.title) || 'Cambio de términos'}</h3>
              <div style="white-space:pre-wrap;color:#334155">${((notif && notif.content) || '').replace(/</g, '&lt;')}</div>
            </div>
            <p style="color:#64748b;font-size:13px">Aceptado el ${fecha}.${u?.lead_id ? ' · Ref: ' + u.lead_id : ''}</p>
            <p style="color:#64748b;font-size:13px">Si no reconoces esta acción, responde a este correo lo antes posible.</p>
            <p style="margin-top:24px">Un saludo,<br/>Equipo Project Robin</p>
          </div>`;
        const text = `Cambio de términos aceptado\n\n${(notif && notif.title) || ''}\n\n${(notif && notif.content) || ''}\n\nAceptado el ${fecha}.`;
        if (u && u.email) {
          await sendEmail({ to: u.email, subject, html, text, bcc: teamEmail(), tag: 'notif-terms' });
        } else {
          await sendEmail({ to: teamEmail(), subject, html, text, tag: 'notif-terms' });
        }
      } catch (mailErr) {
        console.error('notifications-ack email error', mailErr);
        // No abortamos la aceptación por un fallo de correo
      }
    }

    return json({ ok: true, status: update.status });
  } catch (e) {
    console.error('notifications-ack error', e);
    return serverError(e);
  }
};
