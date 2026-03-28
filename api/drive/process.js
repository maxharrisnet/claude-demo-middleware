const drive = require('../../lib/google-drive');
const claude = require('../../lib/claude');
const wp = require('../../lib/wordpress');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const folderId = req.body.folder_id || process.env.GOOGLE_DRIVE_FOLDER_ID;
    const specificDocId = req.body.doc_id;

    if (!folderId && !specificDocId) {
      return res.status(400).json({ error: 'folder_id or doc_id is required (or set GOOGLE_DRIVE_FOLDER_ID)' });
    }

    const processed = [];
    const skipped = [];
    const errors = [];

    // Get list of docs to process
    let docs;
    if (specificDocId) {
      docs = [{ id: specificDocId, name: 'Specified Document' }];
    } else {
      docs = await drive.listDocsInFolder(folderId);
    }

    for (const doc of docs) {
      try {
        // Extract content from Google Doc
        const extracted = await drive.extractDocContent(doc.id);

        if (!extracted.body || extracted.body.trim().length < 50) {
          skipped.push({ doc_id: doc.id, doc_title: doc.name, reason: 'Content too short' });
          continue;
        }

        // Use Claude to classify and extract structured fields
        const fields = await claude.classifyAndExtract(extracted.body);

        // Extract and upload images
        const images = await drive.extractImages(doc.id);
        const acf = { ...fields.acf };

        for (const image of images) {
          try {
            const imageType = drive.classifyImage(image.description || image.title);
            // Download the image
            const imgRes = await fetch(image.contentUri);
            const buffer = Buffer.from(await imgRes.arrayBuffer());
            const filename = `${fields.slug || 'image'}-${imageType}.jpg`;
            const uploaded = await wp.uploadMedia(buffer, filename, 'image/jpeg');
            if (uploaded?.id) {
              acf[imageType] = uploaded.id;
            }
          } catch (imgErr) {
            errors.push({ doc_id: doc.id, image: image.objectId, error: imgErr.message });
          }
        }

        // Strip path prefix from slug if present
        const slug = (fields.slug || '').replace(/^.*\//, '');

        // Create WordPress draft
        const post = await wp.createDraft({
          cpt: fields.cpt || 'blog',
          title: fields.title || extracted.title,
          content: fields.content,
          acf,
          slug,
        });

        const WP_BASE = process.env.WP_BASE_URL;
        processed.push({
          doc_id: doc.id,
          doc_title: doc.name,
          wp_post_id: post.id,
          wp_post_title: post.title?.rendered || fields.title,
          cpt: fields.cpt || 'blog',
          status: 'draft',
          edit_url: `${WP_BASE}/wp-admin/post.php?post=${post.id}&action=edit`,
        });
      } catch (docErr) {
        errors.push({ doc_id: doc.id, doc_title: doc.name, error: docErr.message });
      }
    }

    res.json({ processed, skipped, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
