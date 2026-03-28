const { WebClient } = require('@slack/web-api');

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);
const DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL;

/**
 * Send a rich Slack message using Block Kit.
 */
async function sendMessage({ channel, text, blocks, thread_ts }) {
  return slack.chat.postMessage({
    channel: channel || DEFAULT_CHANNEL,
    text: text || '',
    blocks,
    thread_ts,
  });
}

/**
 * Build Block Kit blocks for a "draft created" notification.
 */
function buildDraftBlocks({ title, cpt, authorName, source, editUrl, previewUrl }) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `New Draft: ${title}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Type:* ${cpt}` },
        { type: 'mrkdwn', text: `*Author:* ${authorName || 'Unassigned'}` },
        ...(source ? [{ type: 'mrkdwn', text: `*Source:* ${source}` }] : []),
      ],
    },
  ];

  const buttons = [];
  if (previewUrl) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Preview' },
      url: previewUrl,
    });
  }
  if (editUrl) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: 'Edit in WP' },
      url: editUrl,
    });
  }
  if (buttons.length > 0) {
    blocks.push({ type: 'actions', elements: buttons });
  }

  return blocks;
}

/**
 * Build Block Kit blocks for an audit report.
 */
function buildAuditBlocks({ title, url, seoScore, aeoScore, seoFixes, aeoFixes }) {
  const blocks = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Audit: ${title}` },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*SEO Score:* ${seoScore}/10` },
        { type: 'mrkdwn', text: `*AEO Score:* ${aeoScore}/10` },
      ],
    },
  ];

  if (seoFixes?.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*SEO Fixes:*\n${seoFixes.map(f => `• ${f}`).join('\n')}`,
      },
    });
  }

  if (aeoFixes?.length) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*AEO Fixes:*\n${aeoFixes.map(f => `• ${f}`).join('\n')}`,
      },
    });
  }

  if (url) {
    blocks.push({
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'View Post' }, url },
      ],
    });
  }

  return blocks;
}

module.exports = {
  sendMessage,
  buildDraftBlocks,
  buildAuditBlocks,
};
