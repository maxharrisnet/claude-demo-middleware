const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic();

const VALID_CPTS = [
  'blog', 'press-release', 'case-study', 'whitepaper',
  'news', 'video', 'podcast', 'report',
];

// ACF field schema per CPT — mirrors abilities.php CPT_ACF_FIELDS.
// Only fields listed here should be populated; others are ignored by the WP plugin.
const CPT_ACF_FIELDS = {
  'blog': [
    'resource_card_title',    // short title shown on listing cards
    'resource_card_image',    // attachment ID (integer)
    'resource_excerpt',       // card text — NOT the Yoast meta description
    'resource_cta_text',
    'resource_external_url',
    'resource_coming_soon',
  ],
  'press-release': [
    'press_release_publication',
    'press_release_logo',     // attachment ID
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
  'case-study': [
    'case_study_type',
    'case_study_company_name',
    'case_study_company_type',
    'case_study_industry',
    'case_study_icon',
    'case_study_employees',
    'case_study_revenue',
    'case_study_business_statement',
    'case_study_business_problem',
    'case_study_featured_image',
    'case_study_body_copy',
    'case_study_business_need',
    'case_study_short_solution',
    'case_study_short_result',
    'case_study_challenges',
    'case_study_solution',
    'case_study_results',
    'case_study_top_quote',
    'case_study_quote',
    'resource_card_title',
    'resource_excerpt',
  ],
  'whitepaper': [
    'whitepaper_hubspot_form',
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
  'news': [
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
  'video': [
    'video_type',
    'video_tags',
    'video_url',
    'resource_card_title',
    'resource_excerpt',
  ],
  'podcast': [
    'podcast_type',
    'podcast_tags',
    'podcast_video',
    'resource_card_title',
    'resource_excerpt',
  ],
  'report': [
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
};

/**
 * Use Claude to classify a content brief into a CPT and extract structured fields.
 * Returns { cpt, title, slug, excerpt, content, acf }.
 */
async function classifyAndExtract(briefText) {
  const schemaDoc = Object.entries(CPT_ACF_FIELDS)
    .map(([cpt, fields]) => `  "${cpt}": [${fields.map(f => `"${f}"`).join(', ')}]`)
    .join('\n');

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 16384,
    messages: [
      {
        role: 'user',
        content: `You are a content management assistant for ACME Real Estate. Given the following content brief, classify it into one of these WordPress custom post types: ${VALID_CPTS.join(', ')}.

Then extract structured fields for WordPress.

## ACF field schema (only populate fields listed for the chosen CPT)
${schemaDoc}

Return ONLY valid JSON (no markdown fences) with this shape:
{
  "cpt": "blog",
  "title": "Post Title",
  "slug": "post-title",
  "excerpt": "~155 char Yoast SEO meta description (goes into post_excerpt, used by Yoast SEO plugin)",
  "content": "<p>HTML content for WordPress — only for blog and press-release CPTs</p>",
  "acf": {
    "resource_card_title": "Short title for listing cards",
    "resource_excerpt": "1–2 sentence card blurb shown on resource listings (different from the Yoast excerpt above)"
  }
}

Rules:
- slug must NOT include CPT prefix path (e.g., "my-post" not "blogs/my-post")
- content is HTML for the WP editor; leave empty string for non-editor CPTs (everything except blog and press-release)
- excerpt (top-level) is the Yoast SEO meta description (~155 chars), NOT the card text
- resource_excerpt (inside acf) is the card blurb — these are different fields
- Only include ACF fields that belong to the chosen CPT per the schema above
- If the brief clearly matches a CPT, use it. Default to "blog" if unclear.
- For case-study, extract as many structured fields as the brief supports

Content brief:
${briefText}`,
      },
    ],
  });

  const text = message.content[0].text;
  // Claude may wrap response in markdown code fences — strip them
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Run an SEO audit on post content using Claude.
 * Returns { score, fixes, report }.
 */
async function auditSEO(postTitle, postContent, postUrl) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are an SEO expert. Audit the following blog post and return ONLY valid JSON:
{
  "score": 7,
  "fixes": ["Fix 1", "Fix 2", "Fix 3"],
  "report": "Detailed audit report text..."
}

Score from 1-10. List the top 3-5 actionable fixes. Provide a detailed report.

Title: ${postTitle}
URL: ${postUrl}
Content:
${postContent}`,
      },
    ],
  });

  const text = message.content[0].text;
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned);
}

/**
 * Run an AEO (Answer Engine Optimization) audit on post content using Claude.
 * Returns { score, fixes, report }.
 */
async function auditAEO(postTitle, postContent, postUrl) {
  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: `You are an AEO (Answer Engine Optimization) expert. Audit the following blog post for how well it would perform as a source for AI-generated answers (Google AI Overviews, ChatGPT, Perplexity, etc.).

Return ONLY valid JSON:
{
  "score": 6,
  "fixes": ["Fix 1", "Fix 2", "Fix 3"],
  "report": "Detailed AEO audit report text..."
}

Score from 1-10. Focus on: FAQ sections, concrete statistics, clear definitions, structured data, direct answers to common questions.

Title: ${postTitle}
URL: ${postUrl}
Content:
${postContent}`,
      },
    ],
  });

  const text = message.content[0].text;
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned);
}

module.exports = {
  classifyAndExtract,
  auditSEO,
  auditAEO,
};
