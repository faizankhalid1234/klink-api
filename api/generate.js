export const config = {
  maxDuration: 300,
};

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  'https://muhammadumersheraz2000.socioglory.com/webhook/kling/avatar/generate';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const imageUrl = body.image_url || body.imageUrl;
    const audioUrl = body.audio_url || body.audioUrl;
    const prompt = String(body.prompt || '.').trim() || '.';

    if (!imageUrl || !audioUrl) {
      return res.status(400).json({
        success: false,
        error: 'image_url and audio_url are required.',
      });
    }

    const n8nRes = await fetch(N8N_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        audio_url: audioUrl,
        prompt,
      }),
    });

    const data = await n8nRes.json().catch(() => ({}));

    if (!n8nRes.ok) {
      return res.status(n8nRes.status).json({
        success: false,
        error: data.message || data.error || `n8n returned ${n8nRes.status}`,
        stage: data.stage,
        ...data,
      });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Generation request failed',
    });
  }
}
