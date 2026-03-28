const slack = require('../../lib/slack');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { channel, text, blocks, thread_ts } = req.body;

    if (!text && !blocks) {
      return res.status(400).json({ error: 'text or blocks is required' });
    }

    const result = await slack.sendMessage({ channel, text, blocks, thread_ts });

    res.json({
      success: true,
      ts: result.ts,
      channel: result.channel,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
