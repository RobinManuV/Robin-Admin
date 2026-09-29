function normalizeDocumentName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('es');
}

function selectMissingRequiredDocs(requiredDocs, existingDocuments) {
  const knownNames = new Set(
    (existingDocuments || [])
      .map((document) => normalizeDocumentName(document && document.name))
      .filter(Boolean)
  );

  const missing = [];
  for (const document of requiredDocs || []) {
    const normalizedName = normalizeDocumentName(document && document.name);
    if (!normalizedName || knownNames.has(normalizedName)) continue;
    knownNames.add(normalizedName);
    missing.push(document);
  }
  return missing;
}

function planUnassignedCareerDocuments(documents, removedCareerId, remainingTemplates) {
  const requiredByName = new Map();
  for (const template of remainingTemplates || []) {
    for (const document of template.required_docs || []) {
      if (document && document.type === 'event') continue;
      const name = normalizeDocumentName(document && document.name);
      if (name && !requiredByName.has(name)) requiredByName.set(name, template.id);
    }
  }

  const retainedNames = new Set(
    (documents || [])
      .filter((document) => document.career_template_id !== removedCareerId)
      .map((document) => normalizeDocumentName(document.name))
      .filter(Boolean)
  );
  const deleteIds = [];
  const reassignments = [];
  const preservedIds = [];

  for (const document of documents || []) {
    if (document.career_template_id !== removedCareerId) continue;
    const isUntouchedRequest = document.source === 'career_template'
      && document.status === 'required'
      && !document.uploaded_at
      && !document.file_path;
    if (!isUntouchedRequest) {
      preservedIds.push(document.id);
      continue;
    }
    const name = normalizeDocumentName(document.name);
    const replacementCareerId = requiredByName.get(name);
    if (replacementCareerId && !retainedNames.has(name)) {
      reassignments.push({ id: document.id, careerTemplateId: replacementCareerId });
      retainedNames.add(name);
    } else {
      deleteIds.push(document.id);
    }
  }

  return { deleteIds, reassignments, preservedIds };
}

module.exports = { normalizeDocumentName, selectMissingRequiredDocs, planUnassignedCareerDocuments };
