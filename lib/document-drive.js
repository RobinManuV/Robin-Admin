const drive = require('./google-drive');
const storage = require('./storage');
const { errorCode } = require('./observability');

function driveFilename(document, fileFilename) {
  const documentName = document && document.name || fileFilename || 'documento';
  const safeName = String(documentName).replace(/[\\/]/g, '-').slice(0, 120);
  const extension = (String(fileFilename || '').match(/\.[a-z0-9]+$/i) || [''])[0];
  return safeName.endsWith(extension) || !extension ? safeName : safeName + extension;
}

async function syncDocumentToDrive(sb, document, fileContent, fileFilename, fileMime) {
  if (!drive.isConfigured()) return { skipped: true, reason: 'not_configured' };
  try {
    const { data: target } = await sb
      .from('users')
      .select('id, lead_id, nombre, apellidos, gdrive_folders')
      .eq('id', document.user_id)
      .single();
    if (!target) return { skipped: true, reason: 'user_not_found' };

    const folders = await drive.ensureClientFolders(sb, target);
    if (!folders) return { skipped: true, reason: 'no_folders' };
    const token = await drive.getAccessToken();
    let parentId = folders.documentos;

    if (document.career_template_id) {
      try {
        const { data: template } = await sb.from('career_templates')
          .select('id, name, university').eq('id', document.career_template_id).single();
        if (template) {
          const careerName = template.university ? `${template.university} - ${template.name}` : template.name;
          const { data: refreshed } = await sb.from('users')
            .select('id, lead_id, nombre, apellidos, gdrive_folders').eq('id', document.user_id).single();
          const ensured = await drive.ensureCareerFolder(sb, refreshed || target, document.career_template_id, careerName);
          if (ensured && ensured.folderId) parentId = ensured.folderId;
        }
      } catch (error) {
        console.warn('[document_drive_career_folder]', errorCode(error));
      }
    }

    const finalName = driveFilename(document, fileFilename);
    const content = Buffer.isBuffer(fileContent)
      ? { buffer: fileContent }
      : { dataUrl: fileContent };
    const uploaded = await drive.uploadFile({ name: finalName, mimeType: fileMime, ...content }, parentId, token);
    return { ok: true, id: uploaded.id, parent: parentId };
  } catch (error) {
    return { ok: false, error: errorCode(error, 'document_drive_failed') };
  }
}

async function syncStoredDocumentToDrive(sb, document, filePath, fileFilename, fileMime) {
  if (!drive.isConfigured()) return { skipped: true, reason: 'not_configured' };
  const buffer = await storage.downloadObject(sb, filePath);
  return syncDocumentToDrive(sb, document, buffer, fileFilename, fileMime);
}

module.exports = { driveFilename, syncDocumentToDrive, syncStoredDocumentToDrive };
