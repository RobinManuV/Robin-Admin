const crypto = require('crypto');
const { normalizeDocumentName } = require('./career-documents');

function normalizeDeadline(value) {
  const deadline = String(value || '').trim();
  if (!deadline) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return null;
  const date = new Date(`${deadline}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== deadline ? null : deadline;
}

function requirementId(value) {
  const existing = String(value || '').trim();
  if (/^[a-zA-Z0-9_-]{1,100}$/.test(existing)) return existing;
  return `req_${crypto.randomUUID()}`;
}

function normalizeCareerRequirement(raw = {}) {
  const type = raw.type === 'event' ? 'event' : 'document';
  const base = {
    id: requirementId(raw.id),
    type,
    name: String(raw.name || '').trim(),
    deadline: normalizeDeadline(raw.deadline),
  };
  if (type === 'event') return { ...base, required: false };
  return {
    ...base,
    required: raw.required !== false,
    template_path: raw.template_path || null,
    template_filename: raw.template_filename || null,
    template_mime: raw.template_mime || null,
  };
}

function documentRequirements(requirements) {
  return (requirements || []).filter((item) => (item.type || 'document') === 'document');
}

function findCareerDocument(documents, careerTemplateId, requirement, previousRequirement) {
  const names = new Set([
    normalizeDocumentName(requirement && requirement.name),
    normalizeDocumentName(previousRequirement && previousRequirement.name),
  ].filter(Boolean));
  return (documents || []).find((document) =>
    document.career_template_id === careerTemplateId
    && names.has(normalizeDocumentName(document.name))
  ) || null;
}

module.exports = {
  documentRequirements,
  findCareerDocument,
  normalizeCareerRequirement,
  normalizeDeadline,
};
