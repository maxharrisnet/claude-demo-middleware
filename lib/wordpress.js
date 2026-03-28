const WP_BASE = process.env.WP_BASE_URL;
const auth = Buffer.from(
  `${process.env.WP_USERNAME}:${process.env.WP_APP_PASSWORD}`
).toString('base64');

const headers = {
  'Authorization': `Basic ${auth}`,
  'Content-Type': 'application/json',
};

// CPT slugs supported by the WordPress site
const VALID_CPTS = [
  'blog', 'press-release', 'case-study', 'whitepaper',
  'news', 'video', 'podcast', 'report',
];

/**
 * Parse WP response — WordPress may return PHP warnings (HTML) before JSON.
 */
async function parseWPResponse(res) {
  const text = await res.text();
  const jsonStart = text.indexOf('{');
  const jsonArrayStart = text.indexOf('[');
  const start = jsonStart === -1 ? jsonArrayStart
    : jsonArrayStart === -1 ? jsonStart
    : Math.min(jsonStart, jsonArrayStart);
  if (start === -1) throw new Error(`WordPress returned non-JSON: ${text.slice(0, 200)}`);
  return JSON.parse(text.slice(start));
}

/**
 * Resolve an author name to a WordPress user ID.
 * Returns { id, name } or null if not found.
 */
async function resolveAuthor(authorName) {
  if (!authorName) return null;
  const res = await fetch(
    `${WP_BASE}/wp-json/wp/v2/users?search=${encodeURIComponent(authorName)}`,
    { headers }
  );
  const users = await parseWPResponse(res);
  if (!Array.isArray(users) || users.length === 0) return null;
  return { id: users[0].id, name: users[0].name };
}

/**
 * Create a draft post in WordPress.
 */
async function createDraft({ cpt = 'blog', title, content, excerpt, acf = {}, authorId, slug }) {
  const endpoint = `${WP_BASE}/wp-json/wp/v2/${cpt}`;
  const body = {
    title,
    content,
    status: 'draft',
    acf,
  };
  // excerpt → post_excerpt: used by Yoast SEO as the meta description (~155 chars).
  // Distinct from acf.resource_excerpt which is the card blurb on listing pages.
  if (excerpt) body.excerpt = excerpt;
  if (authorId) body.author = authorId;
  if (slug) body.slug = slug;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return parseWPResponse(res);
}

/**
 * Publish an existing draft.
 */
async function publishPost(postId, cpt = 'blog') {
  const endpoint = `${WP_BASE}/wp-json/wp/v2/${cpt}/${postId}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ status: 'publish' }),
  });
  return parseWPResponse(res);
}

/**
 * List posts by status and CPT.
 */
async function listPosts({ cpt = 'blog', status = 'draft', count = 10 }) {
  const endpoint = `${WP_BASE}/wp-json/wp/v2/${cpt}?status=${status}&per_page=${count}`;
  const res = await fetch(endpoint, { headers });
  return parseWPResponse(res);
}

/**
 * List posts across all CPTs (used for status endpoint with cpt=all).
 */
async function listPostsAllCpts({ status = 'draft', count = 10 }) {
  const results = await Promise.allSettled(
    VALID_CPTS.map(cpt => listPosts({ cpt, status, count }))
  );
  const posts = [];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'fulfilled' && Array.isArray(results[i].value)) {
      for (const post of results[i].value) {
        posts.push({ ...post, _cpt: VALID_CPTS[i] });
      }
    }
  }
  // Sort by modified date descending, take top `count`
  posts.sort((a, b) => new Date(b.modified) - new Date(a.modified));
  return posts.slice(0, count);
}

/**
 * Upload media to WordPress (multipart/form-data).
 */
async function uploadMedia(buffer, filename, mimeType) {
  const res = await fetch(`${WP_BASE}/wp-json/wp/v2/media`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': mimeType,
    },
    body: buffer,
  });
  return parseWPResponse(res);
}

/**
 * Get a single post by ID and CPT.
 */
async function getPost(postId, cpt = 'blog') {
  const res = await fetch(`${WP_BASE}/wp-json/wp/v2/${cpt}/${postId}`, { headers });
  return parseWPResponse(res);
}

module.exports = {
  VALID_CPTS,
  parseWPResponse,
  resolveAuthor,
  createDraft,
  publishPost,
  listPosts,
  listPostsAllCpts,
  uploadMedia,
  getPost,
};
