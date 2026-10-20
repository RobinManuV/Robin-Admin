// Server-side extra payments helpers used by request handlers; provider calls and domain rules stay behind this boundary.
const IELTS_EXEMPTION_NOTE = 'Operación exenta de IVA conforme al artículo 20.Uno.9.º de la Ley 37/1992.';

const EXTRA_PAYMENT_PRESETS = Object.freeze({
  custom: 'custom',
  ielts_evaluation: 'ielts_evaluation',
  ielts_class: 'ielts_class',
});

const IELTS_HOURS = Object.freeze([4, 6, 8, 12]);
const IELTS_RATES = Object.freeze({ individual: 33, group: 16.5 });

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function inputError(code) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = 400;
  return error;
}

function studentName(user) {
  const contractStudent = user && user.contract_data && user.contract_data.alumno;
  const firstName = (user && user.nombre) || (contractStudent && contractStudent.nombre);
  const lastName = (user && user.apellidos) || (contractStudent && contractStudent.apellidos);
  return [firstName, lastName].filter(Boolean).join(' ').trim() || 'Alumno';
}

function vatMetadata(treatment) {
  if (treatment === 'exempt') {
    return {
      vat_treatment: 'exempt',
      vat_rate: 0,
      exemption_note: IELTS_EXEMPTION_NOTE,
    };
  }
  if (treatment !== 'standard_21') throw inputError('invalid_vat_treatment');
  return { vat_treatment: 'standard_21', vat_rate: 21 };
}

/**
 * Valida y normaliza un pago extra creado desde el portal de administración.
 * El importe siempre es el total final que pagará la familia.
 */
function prepareExtraPayment(user, input = {}) {
  const preset = String(input.preset || EXTRA_PAYMENT_PRESETS.custom).trim().toLowerCase();
  const alumno = studentName(user);

  if (preset === EXTRA_PAYMENT_PRESETS.ielts_evaluation) {
    const units = Number(input.units);
    if (!Number.isInteger(units) || units < 1 || units > 100) throw inputError('invalid_units');
    return {
      concept: `Evaluación inicial de inglés/IELTS – ${alumno}`,
      amount: roundMoney(33 * units),
      paymentData: {
        extra_payment: true,
        preset,
        units,
        unit_price: 33,
        ...vatMetadata('exempt'),
      },
    };
  }

  if (preset === EXTRA_PAYMENT_PRESETS.ielts_class) {
    const classMode = String(input.class_mode || '').trim().toLowerCase();
    const hours = Number(input.hours);
    if (!Object.hasOwn(IELTS_RATES, classMode)) throw inputError('invalid_class_mode');
    if (!IELTS_HOURS.includes(hours)) throw inputError('invalid_hours');
    const rate = IELTS_RATES[classMode];
    const modeLabel = classMode === 'individual' ? 'Individual' : 'Grupo';
    return {
      concept: `Clase de preparación de inglés/IELTS – ${modeLabel} – ${hours} horas – ${alumno}`,
      amount: roundMoney(rate * hours),
      paymentData: {
        extra_payment: true,
        preset,
        class_mode: classMode,
        hours,
        unit_price: rate,
        ...vatMetadata('exempt'),
      },
    };
  }

  if (preset !== EXTRA_PAYMENT_PRESETS.custom) throw inputError('invalid_preset');
  const concept = String(input.concept || '').trim();
  const amount = Number(input.amount);
  if (!concept || concept.length > 240) throw inputError('invalid_concept');
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw inputError('invalid_amount');
  const treatment = String(input.vat_treatment || 'standard_21').trim().toLowerCase();
  return {
    concept,
    amount: roundMoney(amount),
    paymentData: {
      extra_payment: true,
      preset,
      ...vatMetadata(treatment),
    },
  };
}

module.exports = {
  EXTRA_PAYMENT_PRESETS,
  IELTS_EXEMPTION_NOTE,
  IELTS_HOURS,
  IELTS_RATES,
  prepareExtraPayment,
  studentName,
};
