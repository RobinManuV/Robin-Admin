function fallbackPhone(user) {
  return user.telefono_alumno || (user.questionnaire && user.questionnaire.telefono_alumno) || null;
}

function missingPhoneColumn(error) {
  if (!error) return false;
  return error.code === 'PGRST204' || error.code === '42703'
    || String(error.message || '').includes('telefono_alumno');
}

async function attachStudentPhones(sb, users) {
  const list = (users || []).map((user) => ({ ...user, telefono_alumno: fallbackPhone(user) }));
  const ids = list.map((user) => user.id).filter(Boolean);
  if (!ids.length) return list;
  const { data, error } = await sb.from('users').select('id, telefono_alumno').in('id', ids);
  if (error) {
    if (missingPhoneColumn(error)) return list;
    throw error;
  }
  const byId = new Map((data || []).map((row) => [row.id, row.telefono_alumno]));
  return list.map((user) => ({ ...user, telefono_alumno: byId.get(user.id) || fallbackPhone(user) }));
}

module.exports = { attachStudentPhones, fallbackPhone, missingPhoneColumn };
