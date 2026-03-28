const wp = require('../../lib/wordpress');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { post_id, cpt = 'blog' } = req.body;

    if (!post_id) {
      return res.status(400).json({ error: 'post_id is required' });
    }

    const post = await wp.publishPost(post_id, cpt);

    res.json({
      success: true,
      url: post.link,
      title: post.title?.rendered || '',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
