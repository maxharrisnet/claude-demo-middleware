const wp = require('../../lib/wordpress');
const claude = require('../../lib/claude');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { type = 'both', count = 3, status = 'publish', cpt = 'blog' } = req.body;

    const posts = await wp.listPosts({ cpt, status, count });

    if (!Array.isArray(posts) || posts.length === 0) {
      return res.json({ audits: [] });
    }

    const audits = await Promise.all(
      posts.map(async (post) => {
        const title = post.title?.rendered || '';
        const content = post.content?.rendered || '';
        const url = post.link || '';

        const result = {
          post_id: post.id,
          title,
          url,
        };

        if (type === 'seo' || type === 'both') {
          const seo = await claude.auditSEO(title, content, url);
          result.seo_score = seo.score;
          result.seo_fixes = seo.fixes;
          result.seo_report = seo.report;
        }

        if (type === 'aeo' || type === 'both') {
          const aeo = await claude.auditAEO(title, content, url);
          result.aeo_score = aeo.score;
          result.aeo_fixes = aeo.fixes;
          result.aeo_report = aeo.report;
        }

        return result;
      })
    );

    res.json({ audits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
