/**
 * Correo de bienvenida tras completar el onboarding (portal de aplicación).
 *
 * Se envía UNA sola vez, en la transición pago_completed=false -> true
 * (ver lib/onboarding-fulfill.js -> markOnboardingPaid). Adjunta los 4
 * recursos básicos alojados como estáticos en `portal/recursos/` y servidos
 * por el propio sitio, referenciados por URL (Resend los descarga).
 *
 * Base URL: PUBLIC_BASE_URL > URL > DEPLOY_PRIME_URL > DEPLOY_URL (Netlify
 * define `URL` con el dominio principal del sitio). Si no hay ninguna, se
 * envía el correo SIN adjuntos (best-effort) y se loguea.
 */
const { sendEmail } = require('./email');
const { publicBaseUrl } = require('./operational-config');

// Documentos: { slug alojado en /portal/recursos, nombre visible del adjunto }
const DOCS = [
  { file: 'adaptacion-cultural-holanda.pdf',      name: 'Adaptación cultural y vida diaria en Holanda.pdf' },
  { file: 'trabajar-y-estudiar-nl.pdf',           name: 'Cómo trabajar y estudiar en los Países Bajos.pdf' },
  { file: 'research-vs-applied-sciences.png',      name: 'Research Universities vs Universities of Applied Sciences.png' },
  { file: 'tranquilidad-para-los-padres.pdf',      name: 'Tranquilidad para los padres.pdf' },
];

function firstName(nombre) {
  const n = String(nombre || '').trim();
  return n ? n.split(/\s+/)[0] : '';
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const SUBJECT = '🎉 ¡Onboarding completado! Bienvenido a ROBIN';

function buildText(name) {
  const saludo = name ? `¡Enhorabuena, ${name}! 🎉` : '¡Enhorabuena! 🎉';
  return `${saludo}

Ya has completado tu onboarding.

Oficialmente, bienvenido a ROBIN. 🚀

A partir de aquí empieza una aventura que te llevará a estudiar, vivir y crecer en los Países Bajos. Habrá muchas cosas nuevas por descubrir, decisiones que tomar y, probablemente, alguna que otra duda por el camino.

Pero tranquilo: no vas a hacerlo solo. Estamos aquí para acompañarte.

Para empezar con buen pie, hemos preparado el contenido básico que te recomendamos conocer antes de continuar con las siguientes etapas de tu aventura:

🇳🇱 Adaptación cultural y vida diaria en Holanda
Una guía para entender mejor cómo es vivir en los Países Bajos, sus costumbres, el día a día y esos pequeños detalles que te ayudarán a adaptarte mucho más rápido.

💼 Cómo trabajar y estudiar en los Países Bajos
Todo lo esencial para entender cómo compaginar tus estudios con un trabajo y empezar a moverte con confianza en esta nueva etapa.

🎓 Research Universities vs. Universities of Applied Sciences
Una explicación sencilla para entender las diferencias entre los dos principales modelos universitarios de los Países Bajos y saber exactamente qué significa cada uno.

👨‍👩‍👧 Tranquilidad para los padres: todo lo que debéis saber
Información pensada especialmente para las familias, para que también sepan cómo será el proceso, qué pueden esperar y puedan vivir esta aventura con mayor tranquilidad.

Guarda este correo. Estos recursos serán tu punto de partida y podrás volver a ellos siempre que lo necesites.

Esto acaba de empezar.

Habrá universidades, alojamiento, documentación, nuevas ciudades, nuevas personas y muchas primeras veces. Nosotros estaremos a tu lado para ayudarte a convertir todo ese proceso en un camino mucho más sencillo.

Prepárate para lo que viene. 🇳🇱

Bienvenido a ROBIN. Bienvenido a tu próxima aventura. 🚀

El equipo de ROBIN`;
}

function buildHtml(name) {
  const saludo = name ? `¡Enhorabuena, ${esc(name)}! 🎉` : '¡Enhorabuena! 🎉';
  const item = (emoji, title, body) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #eee;">
      <div style="font-size:16px;font-weight:600;color:#0b2a4a;">${emoji} ${title}</div>
      <div style="font-size:14px;color:#444;line-height:1.6;margin-top:4px;">${body}</div>
    </td></tr>`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#f5f7fa;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f7fa;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06);">
        <tr><td style="background:#0b2a4a;padding:28px 32px;">
          <div style="color:#fff;font-size:22px;font-weight:700;">🎉 ¡Onboarding completado!</div>
          <div style="color:#cfe0f5;font-size:15px;margin-top:4px;">Bienvenido a ROBIN 🚀</div>
        </td></tr>
        <tr><td style="padding:28px 32px;">
          <p style="font-size:18px;font-weight:600;margin:0 0 16px;">${saludo}</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">Ya has completado tu onboarding.</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">Oficialmente, <strong>bienvenido a ROBIN</strong>. 🚀</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">A partir de aquí empieza una aventura que te llevará a estudiar, vivir y crecer en los Países Bajos. Habrá muchas cosas nuevas por descubrir, decisiones que tomar y, probablemente, alguna que otra duda por el camino.</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">Pero tranquilo: no vas a hacerlo solo. Estamos aquí para acompañarte.</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 8px;">Para empezar con buen pie, hemos preparado el contenido básico que te recomendamos conocer antes de continuar con las siguientes etapas de tu aventura:</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${item('🇳🇱', 'Adaptación cultural y vida diaria en Holanda', 'Una guía para entender mejor cómo es vivir en los Países Bajos, sus costumbres, el día a día y esos pequeños detalles que te ayudarán a adaptarte mucho más rápido.')}
            ${item('💼', 'Cómo trabajar y estudiar en los Países Bajos', 'Todo lo esencial para entender cómo compaginar tus estudios con un trabajo y empezar a moverte con confianza en esta nueva etapa.')}
            ${item('🎓', 'Research Universities vs. Universities of Applied Sciences', 'Una explicación sencilla para entender las diferencias entre los dos principales modelos universitarios de los Países Bajos y saber exactamente qué significa cada uno.')}
            ${item('👨‍👩‍👧', 'Tranquilidad para los padres: todo lo que debéis saber', 'Información pensada especialmente para las familias, para que también sepan cómo será el proceso, qué pueden esperar y puedan vivir esta aventura con mayor tranquilidad.')}
          </table>
          <p style="font-size:15px;line-height:1.7;margin:18px 0 14px;">📎 Los cuatro recursos van <strong>adjuntos a este correo</strong>. Guárdalo: serán tu punto de partida y podrás volver a ellos siempre que lo necesites.</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 14px;"><strong>Esto acaba de empezar.</strong></p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 14px;">Habrá universidades, alojamiento, documentación, nuevas ciudades, nuevas personas y muchas primeras veces. Nosotros estaremos a tu lado para ayudarte a convertir todo ese proceso en un camino mucho más sencillo.</p>
          <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">Prepárate para lo que viene. 🇳🇱</p>
          <p style="font-size:16px;font-weight:600;margin:0 0 4px;">Bienvenido a ROBIN. Bienvenido a tu próxima aventura. 🚀</p>
          <p style="font-size:15px;color:#0b2a4a;font-weight:600;margin:16px 0 0;">El equipo de ROBIN</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * Envía el correo de bienvenida al cliente. Best-effort: nunca lanza.
 * @returns {Promise<{sent:boolean, reason?:string, id?:string}>}
 */
async function sendWelcomeEmail(sb, userId) {
  try {
    const { data: u, error } = await sb
      .from('users')
      .select('id, email, nombre')
      .eq('id', userId)
      .single();
    if (error || !u) return { sent: false, reason: 'user_not_found' };
    if (!u.email) return { sent: false, reason: 'no_email' };

    const name = firstName(u.nombre);
    const base = publicBaseUrl();
    // Adjuntos por URL. Si no hay base URL, se envía sin adjuntos (se loguea).
    let attachments;
    if (base) {
      attachments = DOCS.map((d) => ({
        filename: d.name,
        path: `${base}/portal/recursos/${d.file}`,
      }));
    } else {
      console.error('[welcome] sin base URL: correo enviado SIN adjuntos');
    }

    const res = await sendEmail({
      to: u.email,
      subject: SUBJECT,
      html: buildHtml(name),
      text: buildText(name),
      attachments,
      tag: 'onboarding_welcome',
    });
    return { sent: !!res.sent, reason: res.reason, id: res.id };
  } catch (e) {
    console.error('[welcome] sendWelcomeEmail error:', e && e.message);
    return { sent: false, reason: (e && e.message) || 'error' };
  }
}

module.exports = { sendWelcomeEmail, SUBJECT, buildHtml, buildText, DOCS };
