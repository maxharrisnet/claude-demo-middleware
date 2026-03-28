# CLAUDE.md — Acme Digital Slack Middleware

## Project Context

This is the Slack integration layer for **Acme Digital**, a fictional SaaS company used to
demo AI-powered marketing automation. This middleware connects WordPress, Google Drive, and
Claude AI to Slack — enabling conversational content operations.

**The key design decision:** We use **Claude for Slack** as the conversational AI interface.
This middleware provides the tools/APIs that Claude for Slack calls into. There are
**NO slash commands** — everything is conversational.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Slack Workspace                                     │
│                                                      │
│  User: "Hey Claude, publish the new blog post        │
│         from the Drive folder"                       │
│         ↓                                            │
│  Claude for Slack (Anthropic's native integration)   │
│         ↓ calls MCP tools / HTTP endpoints           │
│                                                      │
└────────────┬────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────┐
│  This Middleware (Express/Hono API)                   │
│                                                      │
│  Endpoints:                                          │
│  POST /api/content/draft    — Create WP draft        │
│  POST /api/content/publish  — Publish a draft        │
│  POST /api/content/audit    — Run SEO/AEO audit      │
│  GET  /api/content/status   — List recent drafts     │
│  POST /api/drive/process    — Process Drive folder   │
│  POST /api/slack/notify     — Send rich Slack msg    │
│                                                      │
│  Also receives webhook events from Drive watcher     │
│                                                      │
└────────────┬────────────────────────────────────────┘
             │
     ┌───────┼───────┐
     ▼       ▼       ▼
WordPress  Google   Claude
REST API   Drive    API
           API
```

## Claude for Slack Integration

Claude for Slack (Anthropic's native Slack app) handles the conversational AI layer.
Users @mention Claude in channels or DM it. Claude can be configured with:

1. **Custom instructions** — Tell Claude about Acme Digital's content types, WordPress
   structure, and available operations
2. **MCP servers** — Connect Claude to this middleware's API so it can take actions
3. **Tool definitions** — Define what operations Claude can perform

### What Claude for Slack Handles
- Natural language understanding ("publish the blog about AI trends")
- Conversational context ("use the same author as last time")
- Confirmation flows ("Here's what I'll create — look good?")
- Multi-step workflows ("create the draft, run an audit, then publish if score > 7")

### What This Middleware Handles
- WordPress REST API calls (CRUD on all CPTs)
- Google Drive file processing (extract content from Docs)
- Image uploading and classification
- Claude API calls for content analysis (CPT classification, field extraction)
- SEO/AEO audit execution
- Rich Slack message formatting (Block Kit)
- State management (processed docs, pending approvals)

---

## Conversational Workflows

### 1. Content Publishing (from Drive)

User in Slack:
> "Claude, there's a new blog post in the Drive folder — process it"

Flow:
1. Claude calls middleware `POST /api/drive/process`
2. Middleware scans Drive folder, extracts content from Google Doc
3. Middleware calls Claude API to classify CPT and extract fields
4. Middleware creates WP draft via REST API
5. Middleware returns draft details to Claude
6. Claude posts summary in Slack: title, CPT, author, preview link
7. User: "Looks good, publish it"
8. Claude calls middleware `POST /api/content/publish`
9. Middleware publishes, confirms in Slack

### 2. Content Publishing (from Brief)

User in Slack:
> "Claude, create a blog post about AI in supply chain management. Here's the brief: [paste]"

Flow:
1. Claude calls middleware `POST /api/content/draft` with the brief text
2. Middleware calls Claude API to classify CPT and extract structured fields
3. Middleware creates WP draft
4. Returns draft details to Claude for Slack confirmation
5. User approves or requests changes conversationally

### 3. Content Audit

User in Slack:
> "Claude, run an SEO audit on our latest 3 blog posts"

Flow:
1. Claude calls middleware `POST /api/content/audit` with params
2. Middleware fetches posts from WP REST API
3. Middleware runs SEO + AEO audit logic (ported from `seo-audit.mjs` and `aeo-audit.mjs`)
4. Returns scored results to Claude
5. Claude formats and posts audit report in thread

### 4. Status Check

User in Slack:
> "Claude, what drafts are pending review?"

Flow:
1. Claude calls middleware `GET /api/content/status`
2. Middleware queries WP REST API for recent drafts across all CPTs
3. Returns list to Claude
4. Claude formats and posts status update

---

## Middleware API Specification

### POST /api/content/draft

Create a WordPress draft from a content brief or structured data.

```json
// Request
{
  "brief": "Full text of content brief (optional — Claude API classifies it)",
  "cpt": "blog",           // optional — override CPT classification
  "title": "Post Title",   // optional — override title
  "content": "<p>HTML</p>", // optional — override body
  "acf": {},                // optional — override ACF fields
  "author_name": "Sarah Chen" // optional — resolved to WP user ID
}

// Response
{
  "success": true,
  "post": {
    "id": 123,
    "title": "Post Title",
    "cpt": "blog",
    "status": "draft",
    "author": { "id": 2, "name": "Sarah Chen" },
    "edit_url": "https://site.com/wp-admin/post.php?post=123&action=edit",
    "preview_url": "https://site.com/?p=123&preview=true",
    "acf_fields_set": ["resource_card_title", "resource_excerpt", "resource_card_image"]
  },
  "warnings": ["Author 'John Doe' not found in WordPress"]
}
```

### POST /api/content/publish

```json
// Request
{ "post_id": 123, "cpt": "blog" }

// Response
{
  "success": true,
  "url": "https://site.com/blogs/post-title/",
  "title": "Post Title"
}
```

### POST /api/content/audit

```json
// Request
{
  "type": "both",        // "seo", "aeo", or "both"
  "count": 3,            // number of posts to audit
  "status": "publish",   // "publish", "draft", or "all"
  "cpt": "blog"          // optional — defaults to blog
}

// Response
{
  "audits": [
    {
      "post_id": 123,
      "title": "Post Title",
      "url": "https://site.com/blogs/post-title/",
      "seo_score": 7,
      "aeo_score": 6,
      "seo_fixes": ["Add meta description", "Improve heading hierarchy", "Add internal links"],
      "aeo_fixes": ["Add FAQ section", "Include concrete statistics", "Define key terms"],
      "seo_report": "Full audit text...",
      "aeo_report": "Full audit text..."
    }
  ]
}
```

### GET /api/content/status

```json
// Query params: ?status=draft&count=10&cpt=all

// Response
{
  "drafts": [
    {
      "id": 123,
      "title": "Post Title",
      "cpt": "blog",
      "author": "Sarah Chen",
      "modified": "2026-03-25T10:30:00Z",
      "edit_url": "https://site.com/wp-admin/post.php?post=123&action=edit"
    }
  ]
}
```

### POST /api/drive/process

```json
// Request
{
  "folder_id": "google-drive-folder-id",  // optional — uses env default
  "doc_id": "specific-doc-id"             // optional — process one specific doc
}

// Response
{
  "processed": [
    {
      "doc_id": "abc123",
      "doc_title": "Blog Post.gdoc",
      "wp_post_id": 123,
      "wp_post_title": "AI in Supply Chain",
      "cpt": "blog",
      "status": "draft",
      "edit_url": "https://site.com/wp-admin/post.php?post=123&action=edit"
    }
  ],
  "skipped": [],
  "errors": []
}
```

### POST /api/slack/notify

Send a rich Slack message (used internally by other endpoints, or called directly).

```json
// Request
{
  "channel": "C0123456",       // optional — uses default channel
  "text": "Fallback text",
  "blocks": [],                // Slack Block Kit blocks
  "thread_ts": "1234567890.12" // optional — reply to thread
}
```

---

## Slack Message Formatting

Use Block Kit for rich messages. Key patterns:

### Draft Created Notification
```json
{
  "blocks": [
    { "type": "header", "text": { "type": "plain_text", "text": "New Draft: Post Title" } },
    { "type": "section", "fields": [
      { "type": "mrkdwn", "text": "*Type:* Blog" },
      { "type": "mrkdwn", "text": "*Author:* Sarah Chen" },
      { "type": "mrkdwn", "text": "*Source:* Google Drive" }
    ]},
    { "type": "actions", "elements": [
      { "type": "button", "text": { "type": "plain_text", "text": "Preview" }, "url": "..." },
      { "type": "button", "text": { "type": "plain_text", "text": "Edit in WP" }, "url": "..." }
    ]}
  ]
}
```

### Audit Report
Post as a threaded reply with scores, top fixes, and links to each post.

### Warning Messages
If author not found, image upload failed, etc. — include a warnings section with
actionable next steps.

---

## Drive Watcher Integration

The existing `watch-drive.mjs` script (from the original repo) can be refactored into
this middleware or kept as a separate process that calls the middleware's API.

**Recommended approach for V1.0:** Extract the core logic from `watch-drive.mjs` into
shared modules and import them into the middleware. The middleware then exposes the
`POST /api/drive/process` endpoint, and can also run background polling if needed.

### Key logic to port from watch-drive.mjs:
- Google Drive folder scanning (recursive, supports subfolders)
- Google Docs content extraction (tabs: "Final Blog Post" + "Website Metadata")
- Inline image extraction (recursive scan including table cells)
- Image classification by filename (Author Banner → card, Hero Banner → featured)
- Image upload to WordPress media library
- Claude API call for CPT classification and field extraction
- State tracking (.watch-state.json equivalent — use DB or Redis in production)
- Duplicate prevention (check slug before creating, early state locking)

### Google Doc conventions:
- Tab named "Final Blog Post" or first non-metadata tab → post body content
- Tab with "metadata" / "meta" in name → parsed for title, slug, resource_card_title, resource_excerpt
- Single-tab docs are supported (no tab names to match — entire doc is content)
- Slug in metadata may include path prefix (e.g., `blogs/my-slug`) — strip to just `my-slug`

---

## WordPress REST API Reference

### Endpoints
```
POST /wp-json/wp/v2/{cpt}           — Create post
POST /wp-json/wp/v2/{cpt}/{id}      — Update post (including publish)
GET  /wp-json/wp/v2/{cpt}           — List posts (?status=draft&per_page=10)
GET  /wp-json/wp/v2/{cpt}/{id}      — Get single post
POST /wp-json/wp/v2/media           — Upload image (multipart/form-data)
GET  /wp-json/wp/v2/users?search=   — Search users by name
```

### CPT slugs
blog, press-release, case-study, whitepaper, news, video, podcast, report

### Authentication
Basic Auth with Application Password:
```
Authorization: Basic base64(username:app_password)
```

### Known gotchas (learned from V0.5)
- WordPress may return PHP warnings (HTML) before JSON — parse as text, find first `{`
- Claude API responses may be wrapped in markdown code fences — strip before JSON.parse
- `max_tokens: 16384` needed for long posts (4096 truncates ~15k char posts)
- Image ACF fields store attachment IDs (integers), not URLs
- `excerpt` → Yoast SEO meta description; `resource_excerpt` → card text (DIFFERENT)
- `slug` should NOT include CPT prefix path
- `blog_lead` ACF field exists in some setups but is NOT used by templates — ignore it
- `resource_card_image` is required on blog CPT — must be a valid attachment ID

---

## Environment Variables

```
# Server
PORT=3000
NODE_ENV=production

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_DEFAULT_CHANNEL=C...

# WordPress
WP_BASE_URL=https://acme-demo.example.com
WP_USERNAME=admin
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx

# Google Drive
GOOGLE_SERVICE_ACCOUNT_JSON=./service-account.json
GOOGLE_DRIVE_FOLDER_ID=...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

---

## Tech Stack Recommendations

- **Runtime:** Node.js (to share code with existing scripts)
- **Framework:** Express or Hono (lightweight, good for API middleware)
- **Deployment:** Vercel Functions, Railway, Fly.io, or similar
- **State:** Redis or SQLite for processed doc tracking (not flat JSON files)

---

## Roadmap Context

| Phase | Focus                                                           |
| ----- | --------------------------------------------------------------- |
| V0.5  | DONE — Drive watcher + publish scripts (separate repo)          |
| V1.0  | THIS — Slack middleware + Claude for Slack + hosted demo site    |
| V1.5  | Google Drive as source of truth + Figma read integration        |
| V2.0  | Figma → Claude Code → WordPress page templates (design-to-code)|
| V2.5  | HubSpot (forms, email, landing pages, lead workflows)           |
| V3.0  | JIRA (sprint-based content workflows)                           |
| V3.5+ | Email marketing (Klaviyo), social media, analytics              |

### V1.5 — Figma Integration (Read)
- Read design assets and specs from Figma via API
- Sync brand assets (logos, colors, typography) to WordPress media library
- Google Drive remains source of truth for content; Figma for design
- Changes in Drive or Figma trigger updates to WordPress

### V2.0 — Figma → WordPress Page Templates (Write)
- Claude Code reads Figma designs and generates WordPress page templates
- Designs become functional WP templates with ACF fields
- Full design-to-code pipeline: Figma → Claude Code → PHP/HTML → WordPress theme
- This is the marquee demo feature — visual design becomes a working website

### V2.5 — HubSpot
- Gated content forms (whitepapers, webinars)
- Email campaign automation
- Landing page generation
- Lead workflow triggers from WordPress form submissions

### V3.0 — JIRA
- Sprint-based content calendars
- Content task tracking (brief → draft → review → publish)
- Status sync between JIRA and WordPress/Slack

### V3.5+ — Expand
- **Email marketing** (Klaviyo or similar) — automated campaign creation
- **Social media** — TBD platform (Buffer/Typefully API, or direct platform APIs,
  or possibly a Claude Code skill for posting)
- **Analytics** — GA4 reporting piped to Slack
