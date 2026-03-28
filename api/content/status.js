const wp = require('../../lib/wordpress');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const status = req.query.status || 'draft';
    const count = parseInt(req.query.count, 10) || 10;
    const cpt = req.query.cpt || 'all';

    let posts;
    if (cpt === 'all') {
      posts = await wp.listPostsAllCpts({ status, count });
    } else {
      posts = await wp.listPosts({ cpt, status, count });
    }

    const drafts = (Array.isArray(posts) ? posts : []).map((post) => ({
      id: post.id,
      title: post.title?.rendered || '',
      cpt: post._cpt || cpt,
      author: post._embedded?.author?.[0]?.name || '',
      modified: post.modified,
      edit_url: `${process.env.WP_BASE_URL}/wp-admin/post.php?post=${post.id}&action=edit`,
    }));

    res.json({ drafts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
