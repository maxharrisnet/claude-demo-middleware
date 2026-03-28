<?php
/**
 * WP 7.0 Abilities API registration for Claude WP Agent.
 *
 * Each ability becomes an MCP tool that Claude Code (or any MCP client)
 * can call. Abilities are grouped under the 'acme-agent' category.
 *
 * HTTP endpoint (requires wordpress/mcp-adapter):
 *   /wp-json/acme-agent/mcp
 *
 * STDIO (WP-CLI, for local use with Claude Code):
 *   wp mcp-adapter serve --server=acme-content-agent --user=admin
 *
 * @package Claude_WP_Agent
 */

namespace ClaudeWPAgent;

defined('ABSPATH') || exit;

// ── Content model ─────────────────────────────────────────────────────────────
// Mirrors acme-re-core. Keep in sync if field groups change.

const CPT_ACF_FIELDS = [
  'blog' => [
    'resource_card_title',
    'resource_card_image',
    'resource_excerpt',
    'resource_cta_text',
    'resource_external_url',
    'resource_coming_soon',
  ],
  'press-release' => [
    'press_release_publication',
    'press_release_logo',
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
  'case-study' => [
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
  'whitepaper' => [
    'whitepaper_hubspot_form',
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
  'news' => [
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
  'video' => [
    'video_type',
    'video_tags',
    'video_url',
    'resource_card_title',
    'resource_excerpt',
  ],
  'podcast' => [
    'podcast_type',
    'podcast_tags',
    'podcast_video',
    'resource_card_title',
    'resource_excerpt',
  ],
  'report' => [
    'resource_card_title',
    'resource_excerpt',
    'resource_external_url',
  ],
];

// CPTs that use the post body editor (others are ACF-only)
const CPTS_WITH_EDITOR = ['blog', 'press-release'];

// ── Category ──────────────────────────────────────────────────────────────────

add_action('wp_abilities_api_categories_init', function (): void {
  wp_register_ability_category('acme-agent', [
    'label'       => __('ACME Content Agent', 'claude-wp-agent'),
    'description' => __('AI content creation and publishing tools for ACME Real Estate.', 'claude-wp-agent'),
  ]);
});

// ── Abilities ─────────────────────────────────────────────────────────────────

add_action('wp_abilities_api_init', function (): void {
  $cpt_slugs = array_keys(CPT_ACF_FIELDS);

  // ── get-schema ─────────────────────────────────────────────────────────────
  // Returns the full content model so Claude knows what CPTs and ACF fields
  // exist before constructing a create-draft call.
  wp_register_ability('acme-agent/get-schema', [
    'label'       => __('Get Content Schema', 'claude-wp-agent'),
    'description' => __('Returns all content types and their ACF fields. Call this first to understand the content model before creating posts.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => ['type' => 'object', 'properties' => (object) []],
    'output_schema' => ['type' => 'object'],
    'permission_callback' => fn() => current_user_can('edit_posts'),
    'execute_callback' => function (array $input): array {
      $schema = [];
      foreach (CPT_ACF_FIELDS as $cpt => $fields) {
        $obj = get_post_type_object($cpt);
        $schema[$cpt] = [
          'label'      => $obj ? $obj->labels->singular_name : $cpt,
          'acf_fields' => $fields,
          'has_editor' => in_array($cpt, CPTS_WITH_EDITOR, true),
          'rest_base'  => $obj ? ($obj->rest_base ?: $cpt) : $cpt,
        ];
      }
      return $schema;
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);

  // ── list-posts ─────────────────────────────────────────────────────────────
  wp_register_ability('acme-agent/list-posts', [
    'label'       => __('List Posts', 'claude-wp-agent'),
    'description' => __('List posts for a content type. Returns IDs, titles, statuses, slugs, and edit URLs.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => [
      'type'       => 'object',
      'required'   => ['cpt'],
      'properties' => [
        'cpt'      => ['type' => 'string', 'enum' => $cpt_slugs, 'description' => 'CPT slug'],
        'status'   => ['type' => 'string', 'default' => 'any', 'description' => 'publish | draft | any'],
        'per_page' => ['type' => 'integer', 'default' => 10, 'minimum' => 1, 'maximum' => 50],
      ],
    ],
    'output_schema' => ['type' => 'array'],
    'permission_callback' => fn() => current_user_can('edit_posts'),
    'execute_callback' => function (array $input): array {
      $posts = get_posts([
        'post_type'   => $input['cpt'],
        'post_status' => $input['status'] ?? 'any',
        'numberposts' => $input['per_page'] ?? 10,
        'orderby'     => 'date',
        'order'       => 'DESC',
      ]);

      return array_map(fn($p) => [
        'id'       => $p->ID,
        'title'    => $p->post_title,
        'status'   => $p->post_status,
        'slug'     => $p->post_name,
        'date'     => $p->post_date,
        'edit_url' => admin_url("post.php?post={$p->ID}&action=edit"),
      ], $posts);
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);

  // ── get-post ───────────────────────────────────────────────────────────────
  wp_register_ability('acme-agent/get-post', [
    'label'       => __('Get Post', 'claude-wp-agent'),
    'description' => __('Retrieve a post by ID including all ACF custom field values.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => [
      'type'       => 'object',
      'required'   => ['post_id'],
      'properties' => [
        'post_id' => ['type' => 'integer'],
      ],
    ],
    'output_schema' => ['type' => 'object'],
    'permission_callback' => fn() => current_user_can('edit_posts'),
    'execute_callback' => function (array $input): array|\WP_Error {
      $post = get_post($input['post_id']);
      if (! $post) {
        return new \WP_Error('not_found', "Post {$input['post_id']} not found.");
      }

      $acf = function_exists('get_fields') ? (get_fields($post->ID) ?: []) : [];

      return [
        'id'       => $post->ID,
        'cpt'      => $post->post_type,
        'title'    => $post->post_title,
        'content'  => $post->post_content,
        'excerpt'  => $post->post_excerpt,
        'status'   => $post->post_status,
        'slug'     => $post->post_name,
        'date'     => $post->post_date,
        'author'   => get_the_author_meta('display_name', $post->post_author),
        'acf'      => $acf,
        'edit_url' => admin_url("post.php?post={$post->ID}&action=edit"),
      ];
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);

  // ── create-draft ───────────────────────────────────────────────────────────
  wp_register_ability('acme-agent/create-draft', [
    'label'       => __('Create Draft', 'claude-wp-agent'),
    'description' => __('Create a new draft post with content and ACF fields. Returns the post ID and admin edit URL. Call get-schema first to discover available acf fields per CPT.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => [
      'type'       => 'object',
      'required'   => ['cpt', 'title'],
      'properties' => [
        'cpt'         => ['type' => 'string', 'enum' => $cpt_slugs],
        'title'       => ['type' => 'string'],
        'content'     => ['type' => 'string', 'description' => 'HTML body (for blog and press-release only)'],
        'excerpt'     => ['type' => 'string', 'description' => 'SEO meta description ~155 chars (used by Yoast)'],
        'slug'        => ['type' => 'string', 'description' => 'URL slug — path prefix is stripped automatically'],
        'author_name' => ['type' => 'string', 'description' => 'Author display name to look up in WP users'],
        'acf'         => ['type' => 'object', 'description' => 'ACF field values keyed by field name'],
      ],
    ],
    'output_schema' => ['type' => 'object'],
    'permission_callback' => fn() => current_user_can('publish_posts'),
    'execute_callback' => function (array $input): array|\WP_Error {
      $post_data = [
        'post_type'    => $input['cpt'],
        'post_title'   => sanitize_text_field($input['title']),
        'post_content' => wp_kses_post($input['content'] ?? ''),
        'post_excerpt' => sanitize_text_field($input['excerpt'] ?? ''),
        'post_status'  => 'draft',
      ];

      if (! empty($input['slug'])) {
        $post_data['post_name'] = sanitize_title(basename($input['slug']));
      }

      // Resolve author by display name
      if (! empty($input['author_name'])) {
        $users = get_users(['search' => $input['author_name'], 'number' => 5]);
        if ($users) {
          $lower = strtolower($input['author_name']);
          $match = null;
          foreach ($users as $u) {
            if (strtolower($u->display_name) === $lower) {
              $match = $u;
              break;
            }
          }
          $post_data['post_author'] = ($match ?? $users[0])->ID;
        }
      }

      $post_id = wp_insert_post($post_data, true);
      if (is_wp_error($post_id)) {
        return $post_id;
      }

      // Set ACF fields — only allowed fields for this CPT are written
      if (! empty($input['acf']) && function_exists('update_field')) {
        $allowed = CPT_ACF_FIELDS[$input['cpt']] ?? [];
        foreach ($input['acf'] as $field => $value) {
          if (in_array($field, $allowed, true)) {
            update_field($field, $value, $post_id);
          }
        }
      }

      return [
        'post_id'  => $post_id,
        'edit_url' => admin_url("post.php?post={$post_id}&action=edit"),
        'preview'  => get_permalink($post_id),
      ];
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);

  // ── update-post ────────────────────────────────────────────────────────────
  wp_register_ability('acme-agent/update-post', [
    'label'       => __('Update Post', 'claude-wp-agent'),
    'description' => __('Update an existing post. Provide only the fields to change. Omitted fields are left untouched.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => [
      'type'       => 'object',
      'required'   => ['post_id'],
      'properties' => [
        'post_id' => ['type' => 'integer'],
        'title'   => ['type' => 'string'],
        'content' => ['type' => 'string'],
        'excerpt' => ['type' => 'string'],
        'slug'    => ['type' => 'string'],
        'status'  => ['type' => 'string', 'enum' => ['draft', 'publish', 'pending', 'private']],
        'acf'     => ['type' => 'object'],
      ],
    ],
    'output_schema' => ['type' => 'object'],
    'permission_callback' => fn() => current_user_can('publish_posts'),
    'execute_callback' => function (array $input): array|\WP_Error {
      $post = get_post($input['post_id']);
      if (! $post) {
        return new \WP_Error('not_found', "Post {$input['post_id']} not found.");
      }

      $update = ['ID' => $input['post_id']];
      if (isset($input['title']))   $update['post_title']   = sanitize_text_field($input['title']);
      if (isset($input['content'])) $update['post_content'] = wp_kses_post($input['content']);
      if (isset($input['excerpt'])) $update['post_excerpt'] = sanitize_text_field($input['excerpt']);
      if (isset($input['slug']))    $update['post_name']    = sanitize_title(basename($input['slug']));
      if (isset($input['status']))  $update['post_status']  = $input['status'];

      $result = wp_update_post($update, true);
      if (is_wp_error($result)) {
        return $result;
      }

      if (! empty($input['acf']) && function_exists('update_field')) {
        $allowed = CPT_ACF_FIELDS[$post->post_type] ?? [];
        foreach ($input['acf'] as $field => $value) {
          if (in_array($field, $allowed, true)) {
            update_field($field, $value, $input['post_id']);
          }
        }
      }

      return [
        'post_id'  => $input['post_id'],
        'status'   => get_post_status($input['post_id']),
        'edit_url' => admin_url("post.php?post={$input['post_id']}&action=edit"),
      ];
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);

  // ── publish-post ───────────────────────────────────────────────────────────
  wp_register_ability('acme-agent/publish-post', [
    'label'       => __('Publish Post', 'claude-wp-agent'),
    'description' => __('Publish a draft post and return its public URL.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => [
      'type'       => 'object',
      'required'   => ['post_id'],
      'properties' => [
        'post_id' => ['type' => 'integer'],
      ],
    ],
    'output_schema' => ['type' => 'object'],
    'permission_callback' => fn() => current_user_can('publish_posts'),
    'execute_callback' => function (array $input): array|\WP_Error {
      $result = wp_update_post(['ID' => $input['post_id'], 'post_status' => 'publish'], true);
      if (is_wp_error($result)) {
        return $result;
      }

      return [
        'post_id' => $input['post_id'],
        'url'     => get_permalink($input['post_id']),
      ];
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);

  // ── search-users ───────────────────────────────────────────────────────────
  wp_register_ability('acme-agent/search-users', [
    'label'       => __('Search Users', 'claude-wp-agent'),
    'description' => __('Find WordPress users by display name for author assignment when creating drafts.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => [
      'type'       => 'object',
      'required'   => ['name'],
      'properties' => [
        'name' => ['type' => 'string', 'description' => 'Full or partial display name'],
      ],
    ],
    'output_schema' => ['type' => 'array'],
    'permission_callback' => fn() => current_user_can('edit_posts'),
    'execute_callback' => function (array $input): array {
      $users = get_users([
        'search'  => '*' . sanitize_text_field($input['name']) . '*',
        'number'  => 10,
      ]);

      return array_map(fn($u) => [
        'id'           => $u->ID,
        'display_name' => $u->display_name,
        'email'        => $u->user_email,
      ], $users);
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);

  // ── get-post-audit-data ────────────────────────────────────────────────────
  // Returns structured data for Claude to analyze (word count, headings,
  // links, ACF fields, Yoast metadata). Claude performs the SEO/AEO analysis
  // itself — no external API call needed from PHP.
  wp_register_ability('acme-agent/get-post-audit-data', [
    'label'       => __('Get Post Audit Data', 'claude-wp-agent'),
    'description' => __('Returns structured content data for SEO and AEO/GEO analysis — word count, headings, links, ACF fields, and Yoast metadata. Pass the result to Claude for analysis.', 'claude-wp-agent'),
    'category'    => 'acme-agent',
    'input_schema' => [
      'type'       => 'object',
      'properties' => [
        'cpt'    => ['type' => 'string', 'default' => 'blog', 'enum' => $cpt_slugs],
        'count'  => ['type' => 'integer', 'default' => 5, 'minimum' => 1, 'maximum' => 20],
        'status' => ['type' => 'string', 'default' => 'publish', 'enum' => ['publish', 'draft', 'any']],
      ],
    ],
    'output_schema' => ['type' => 'array'],
    'permission_callback' => fn() => current_user_can('edit_posts'),
    'execute_callback' => function (array $input): array {
      $posts = get_posts([
        'post_type'   => $input['cpt'] ?? 'blog',
        'post_status' => $input['status'] ?? 'publish',
        'numberposts' => $input['count'] ?? 5,
        'orderby'     => 'date',
        'order'       => 'DESC',
      ]);

      return array_map(function ($post) {
        $content = $post->post_content;
        $plain   = wp_strip_all_tags($content);

        preg_match_all('/<h([2-6])[^>]*>(.*?)<\/h\1>/is', $content, $hm);
        $headings = array_map(fn($lvl, $txt) => [
          'level' => (int) $lvl,
          'text'  => wp_strip_all_tags($txt),
        ], $hm[1], $hm[2]);

        preg_match_all('/<a[^>]+href=["\']([^"\']+)["\'][^>]*>(.*?)<\/a>/is', $content, $lm);
        $links = array_map(fn($url, $txt) => [
          'url'  => $url,
          'text' => wp_strip_all_tags($txt),
        ], $lm[1], $lm[2]);

        $acf = function_exists('get_fields') ? (get_fields($post->ID) ?: []) : [];

        return [
          'id'           => $post->ID,
          'title'        => $post->post_title,
          'slug'         => $post->post_name,
          'status'       => $post->post_status,
          'word_count'   => str_word_count($plain),
          'headings'     => $headings,
          'link_count'   => count($links),
          'links'        => array_slice($links, 0, 20),
          'opening'      => mb_substr($plain, 0, 500),
          'seo'          => [
            'yoast_title' => get_post_meta($post->ID, '_yoast_wpseo_title', true) ?: null,
            'meta_desc'   => get_post_meta($post->ID, '_yoast_wpseo_metadesc', true) ?: null,
          ],
          'acf'          => $acf,
          'featured_img' => (bool) get_post_thumbnail_id($post->ID),
          'edit_url'     => admin_url("post.php?post={$post->ID}&action=edit"),
        ];
      }, $posts);
    },
    'meta' => ['mcp' => ['public' => true]],
  ]);
});

// ── MCP Adapter server ────────────────────────────────────────────────────────
// Registers a named MCP server at /wp-json/acme-agent/mcp.
// Requires: composer require wordpress/mcp-adapter in the WP root.
// For local use with Claude Code via STDIO (no Composer needed):
//   wp mcp-adapter serve --server=mcp-adapter-default-server --user=admin

add_action('mcp_adapter_init', function ($adapter): void {
  if (! method_exists($adapter, 'create_server')) {
    return;
  }

  $ability_ids = [
    'acme-agent/get-schema',
    'acme-agent/list-posts',
    'acme-agent/get-post',
    'acme-agent/create-draft',
    'acme-agent/update-post',
    'acme-agent/publish-post',
    'acme-agent/search-users',
    'acme-agent/get-post-audit-data',
  ];

  $adapter->create_server(
    'acme-content-agent',                                                         // server ID
    'acme-agent',                                                                 // REST namespace → /wp-json/acme-agent/mcp
    'mcp',                                                                        // REST route
    'ACME Content Agent',                                                         // name
    'AI content creation and audit tools for ACME Real Estate.',                  // description
    '1.0.0',                                                                      // version
    [\WP\MCP\Transport\HttpTransport::class],                                     // transports
    \WP\MCP\Infrastructure\ErrorHandling\ErrorLogMcpErrorHandler::class,          // error handler
    \WP\MCP\Infrastructure\Observability\NullMcpObservabilityHandler::class,      // observability
    $ability_ids,                                                                 // tools
    [],                                                                           // resources
    []                                                                            // prompts
  );
});
