/**
 * Lógica común para calcular las cuotas según tipo y num_carreras.
 * Devuelve [{ installment, amount }, ...] con nº variable de cuotas:
 *   - general : 566,67 € iniciales + 50/50 del restante · total 1700/2000/2100 según carreras
 *   - delft   : 3 cuotas · total 2999 (999 + 1000 + 1000)
 *   - llegada : 2 cuotas iguales · total 1700 (850 c/u)
 *   - mentoria: 1 cuota · total 450
 *   - 'otros' (internacional): 3 cuotas de 900 · total 2700
 */

const { applicationPlan: plan, applicationPlanForUser, splitEqual } = require('../shared/financial-config.cjs');

/**
 * Garantiza que las filas de payments existan para un user (las crea si no).
 * Actualiza los amounts si el tipo o el num_carreras cambian, salvo que el
 * asesor haya fijado un importe personalizado (payment_data.amount_custom) o
 * la cuota ya esté pagada.
 */
async function ensurePayments(sb, user) {
  // has_eu_id puede no venir en el objeto user (varios endpoints no lo
  // seleccionan). Solo lo necesitamos para 'otros'; lo cargamos si falta.
  let hasEuId = user.has_eu_id;
  if (String(user.origin || '').toLowerCase() === 'otros' && hasEuId === undefined) {
    try {
      const { data: euRow } = await sb.from('users').select('has_eu_id').eq('id', user.id).single();
      hasEuId = euRow ? euRow.has_eu_id : null;
    } catch (_) { hasEuId = null; }
  }
  const computed = applicationPlanForUser({ ...user, has_eu_id: hasEuId });
  const { data: existing, error } = await sb
    .from('payments')
    .select('*')
    .eq('user_id', user.id)
    .order('installment', { ascending: true });
  if (error) throw error;

  const byInst = new Map((existing || []).map((p) => [p.installment, p]));
  const out = [];

  for (const c of computed) {
    const existing_row = byInst.get(c.installment);
    if (!existing_row) {
      // Crear nueva
      let status = 'locked', unlocked_at = null, paid_at = null, payment_data = null;
      if (c.installment === 1 && user.pago_completed) {
        status = 'paid';
        unlocked_at = user.pago_completed_at || new Date().toISOString();
        paid_at = user.pago_completed_at || new Date().toISOString();
        payment_data = user.pago_data || null;
      }
      const { data: ins, error: e2 } = await sb
        .from('payments')
        .insert({
          user_id: user.id,
          installment: c.installment,
          amount: c.amount,
          currency: 'EUR',
          status, unlocked_at, paid_at, payment_data,
        })
        .select()
        .single();
      if (e2) throw e2;
      out.push(ins);
    } else {
      // Importe personalizado por el asesor: no se recalcula nunca.
      const isCustom = !!(existing_row.payment_data && existing_row.payment_data.amount_custom);
      // Si el amount ha cambiado, la cuota no está pagada y no es personalizado, lo actualizamos
      if (!isCustom && Number(existing_row.amount) !== c.amount && existing_row.status !== 'paid') {
        const { data: upd, error: e3 } = await sb
          .from('payments')
          .update({ amount: c.amount })
          .eq('id', existing_row.id)
          .select()
          .single();
        if (e3) throw e3;
        out.push(upd);
      } else {
        out.push(existing_row);
      }
    }
  }
  // Sincronizar el primer pago con users.pago_completed si onboarding está completo y la fila aún figura como 'unlocked' o 'locked'
  if (user.pago_completed) {
    const first = out.find((p) => p.installment === 1);
    if (first && first.status !== 'paid') {
      const nowIso = new Date().toISOString();
      const { data: upd, error: e4 } = await sb
        .from('payments')
        .update({
          status: 'paid',
          paid_at: user.pago_completed_at || nowIso,
          unlocked_at: first.unlocked_at || user.pago_completed_at || nowIso,
          payment_data: first.payment_data || user.pago_data || null,
        })
        .eq('id', first.id)
        .select()
        .single();
      if (!e4 && upd) {
        const idx = out.findIndex((p) => p.id === first.id);
        out[idx] = upd;
      }
    }
  }
  // Pagos extra (installment > 3): se devuelven tal cual; ensurePayments no los gestiona.
  const extras = (existing || []).filter((p) => p.installment > 3);
  return [...out, ...extras].sort((a, b) => a.installment - b.installment);
}

/**
 * Genera un número de factura simple por cuota.
 */
function invoiceNumber(user, payment) {
  const yr = new Date(payment.paid_at || payment.created_at || new Date()).getFullYear();
  const lid = (user.lead_id || user.id || '').toString().replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase();
  return `PR-${yr}-${lid}-${String(payment.installment).padStart(2, '0')}`;
}

module.exports = { plan, splitEqual, ensurePayments, invoiceNumber };
