const wp = require('../../lib/wordpress');
const claude = require('../../lib/claude');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { brief, cpt, title, content, excerpt, acf, author_name, slug } = req.body;
    const warnings = [];

    // If a brief is provided, use Claude to classify and extract fields
    let fields = {};
    if (brief) {
      fields = await claude.classifyAndExtract(brief);
    }

    // Explicit params override Claude-extracted fields
    const finalCpt = cpt || fields.cpt || 'blog';
    const finalTitle = title || fields.title;
    const finalContent = content || fields.content;
    // excerpt → WP post_excerpt (Yoast SEO meta description, ~155 chars)
    const finalExcerpt = excerpt || fields.excerpt;
    const finalSlug = slug || fields.slug;
    const finalAcf = { ...fields.acf, ...acf };

    if (!finalTitle) {
      return res.status(400).json({ error: 'Title is required (provide title or brief)' });
    }

    // Resolve author
    let authorId = null;
    let authorResolved = null;
    if (author_name) {
      authorResolved = await wp.resolveAuthor(author_name);
      if (authorResolved) {
        authorId = authorResolved.id;
      } else {
        warnings.push(`Author '${author_name}' not found in WordPress`);
      }
    }

    const post = await wp.createDraft({
      cpt: finalCpt,
      title: finalTitle,
      content: finalContent,
      excerpt: finalExcerpt,
      acf: finalAcf,
      authorId,
      slug: finalSlug,
    });

    const WP_BASE = process.env.WP_BASE_URL;

    res.status(201).json({
      success: true,
      post: {
        id: post.id,
        title: post.title?.rendered || finalTitle,
        cpt: finalCpt,
        status: 'draft',
        author: authorResolved || { id: post.author, name: author_name || 'Unknown' },
        edit_url: `${WP_BASE}/wp-admin/post.php?post=${post.id}&action=edit`,
        preview_url: `${WP_BASE}/?p=${post.id}&preview=true`,
        acf_fields_set: Object.keys(finalAcf),
      },
      warnings,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
