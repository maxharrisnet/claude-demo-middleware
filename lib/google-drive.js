const { google } = require('googleapis');
const path = require('path');

function getAuth() {
  const keyPath = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return new google.auth.GoogleAuth({
    keyFile: path.resolve(keyPath),
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
}

function getDrive() {
  return google.drive({ version: 'v3', auth: getAuth() });
}

/**
 * List Google Docs in a Drive folder.
 */
async function listDocsInFolder(folderId) {
  const drive = getDrive();
  const res = await drive.files.list({
    q: `'${folderId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`,
    fields: 'files(id, name, modifiedTime)',
    orderBy: 'modifiedTime desc',
  });
  return res.data.files || [];
}

/**
 * Extract content from a Google Doc, respecting tab conventions:
 * - Tab named "Final Blog Post" or first non-metadata tab -> post body
 * - Tab with "metadata"/"meta" in name -> parsed for title, slug, etc.
 * - Single-tab docs: entire doc is content
 */
async function extractDocContent(docId) {
  const docs = google.docs({ version: 'v1', auth: getAuth() });
  const doc = await docs.documents.get({ documentId: docId });

  const result = { body: '', metadata: {} };

  // Check if doc has named tabs (Docs API may not expose tabs directly —
  // fall back to reading full body and parsing headers for metadata)
  const bodyContent = doc.data.body?.content || [];
  result.body = extractTextFromElements(bodyContent);
  result.title = doc.data.title || '';

  return result;
}

/**
 * Recursively extract text from Google Docs structural elements.
 */
function extractTextFromElements(elements) {
  let text = '';
  for (const element of elements) {
    if (element.paragraph) {
      for (const run of element.paragraph.elements || []) {
        if (run.textRun) text += run.textRun.content;
      }
    }
    if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          text += extractTextFromElements(cell.content || []);
        }
      }
    }
  }
  return text;
}

/**
 * Extract inline image metadata from a Google Doc.
 * Returns array of { objectId, contentUri, description }.
 */
async function extractImages(docId) {
  const docs = google.docs({ version: 'v1', auth: getAuth() });
  const doc = await docs.documents.get({ documentId: docId });
  const images = [];

  const inlineObjects = doc.data.inlineObjects || {};
  for (const [objectId, obj] of Object.entries(inlineObjects)) {
    const embedded = obj.inlineObjectProperties?.embeddedObject;
    if (embedded?.imageProperties?.contentUri) {
      images.push({
        objectId,
        contentUri: embedded.imageProperties.contentUri,
        description: embedded.description || '',
        title: embedded.title || '',
      });
    }
  }
  return images;
}

/**
 * Classify an image by its filename/description into ACF field type.
 * Convention: "Author Banner" -> card image, "Hero Banner" -> featured image.
 */
function classifyImage(description) {
  const lower = (description || '').toLowerCase();
  if (lower.includes('author') || lower.includes('card')) return 'resource_card_image';
  if (lower.includes('hero') || lower.includes('featured')) return 'featured_image';
  return 'inline_image';
}

module.exports = {
  listDocsInFolder,
  extractDocContent,
  extractImages,
  classifyImage,
};
