const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

function pickUrl(resp) {
  if (!resp) return '';
  if (typeof resp === 'string') return resp;
  return (
    resp.data?.url ||
    resp.data?.fileUrl ||
    resp.data?.downloadUrl ||
    resp.url ||
    resp.fileUrl ||
    resp.downloadUrl ||
    ''
  );
}

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
  const fileBase64 = body.file_base64 || body.fileBase64;
  const filename = body.filename || body.fileName || 'upload.bin';
  const mimeType = body.mimeType || body.mime_type || 'application/octet-stream';
  const uploadPath = body.uploadPath || body.upload_path || 'images/user-uploads';

  if (!fileBase64) {
    return res.status(400).json({ code: 400, msg: 'file_base64 is required' });
  }

  try {
    const buffer = Buffer.from(fileBase64, 'base64');
    const form = new FormData();
    form.append('file', new Blob([buffer], { type: mimeType }), filename);
    form.append('uploadPath', uploadPath);
    form.append('fileName', filename);

    const kieRes = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${kieKey}` },
      body: form,
    });

    const data = await kieRes.json();
    const url = pickUrl(data);
    if (!kieRes.ok || !url) {
      return res.status(kieRes.ok ? 502 : kieRes.status).json({
        code: data?.code || kieRes.status,
        msg: data?.msg || data?.message || 'Upload failed',
        data,
      });
    }

    return res.status(200).json({ code: 200, msg: 'success', data: { url, ...data?.data } });
  } catch (error) {
    return res.status(500).json({ code: 500, msg: error.message || 'Upload failed' });
  }
}
