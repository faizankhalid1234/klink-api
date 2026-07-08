const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

const DEFAULT_PROMPT =
  'Create a realistic AI avatar video.\n\nInput:\n- One front-facing portrait image of a person.\n- One audio file containing speech.\n\nRequirements:\n- Keep the person\'s identity and facial features unchanged.\n- Synchronize lip movements accurately with the audio.\n- Preserve natural eye blinking and subtle facial expressions.\n- Do not alter clothing or background.\n- Export as an MP4 video in the highest available quality.';

const DEFAULT_CALLBACK =
  'https://muhammadumersheraz2000.socioglory.com/webhook/3bb9a185-a2c8-4c8a-a08f-db53bf5f8c5d';

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 405, msg: 'Method not allowed' });
  }

  const kieKey = process.env.KIE_API_KEY;
  if (!kieKey) {
    return res.status(500).json({ code: 500, msg: 'KIE_API_KEY not configured on server' });
  }

  const secret = process.env.KLINK_API_SECRET;
  if (secret && req.headers['x-api-key'] !== secret) {
    return res.status(401).json({ code: 401, msg: 'Invalid API key' });
  }

  const body = req.body || {};
  const image_url = body.image_url || body.imageUrl;
  const audio_url = body.audio_url || body.audioUrl;
  const prompt = body.prompt || DEFAULT_PROMPT;
  const resolution = body.resolution || '480p';
  const callBackUrl = body.callBackUrl || body.callback_url || DEFAULT_CALLBACK;

  if (!image_url || !audio_url) {
    return res.status(400).json({ code: 400, msg: 'image_url and audio_url are required' });
  }

  try {
    const kieRes = await fetch('https://api.kie.ai/api/v1/jobs/createTask', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${kieKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: 'infinitalk/from-audio',
        callBackUrl,
        input: { image_url, audio_url, prompt, resolution },
      }),
    });

    const data = await kieRes.json();
    return res.status(kieRes.ok ? 200 : kieRes.status).json(data);
  } catch (error) {
    return res.status(500).json({ code: 500, msg: error.message || 'Failed to create task' });
  }
}
