const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
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

  const taskId = req.query.taskId || req.query.task_id;
  if (!taskId) {
    return res.status(400).json({ code: 400, msg: 'taskId is required' });
  }

  try {
    const kieRes = await fetch(
      `https://api.kie.ai/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      {
        headers: {
          Authorization: `Bearer ${kieKey}`,
          Accept: 'application/json',
        },
      }
    );

    const data = await kieRes.json();
    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ code: 500, msg: error.message || 'Failed to check status' });
  }
}
