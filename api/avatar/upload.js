const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
};

function pickUrl(resp) {
  if (!resp) return '';
  if (typeof resp === 'string' && resp.startsWith('http')) return resp.trim();
  if (typeof resp === 'object') {
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
  return '';
}

async function uploadToCatbox(buffer, filename, mimeType) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '24h');
  form.append('fileToUpload', new Blob([buffer], { type: mimeType }), filename);

  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: form,
  });
  const url = String(await res.text()).trim();
  if (!url.startsWith('http')) throw new Error('Catbox upload failed');
  return url;
}

async function uploadToKie(kieKey, buffer, filename, mimeType, uploadPath) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: mimeType }), filename);
  form.append('uploadPath', uploadPath);
  form.append('fileName', filename);

  const kieRes = await fetch('https://kieai.redpandaai.co/api/file-stream-upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${kieKey}` },
    body: form,
  });

  const data = await kieRes.json().catch(() => ({}));
  const url = pickUrl(data);
  if (!kieRes.ok || !url) {
    throw new Error(data?.msg || data?.message || `Kie upload failed (${kieRes.status})`);
  }
  return url;
}

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 405, msg: 'Method not allowed' });
  }

  const kieKey = process.env.KIE_API_KEY;
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
    let url = '';
    let provider = 'kie';

    if (kieKey) {
      try {
        url = await uploadToKie(kieKey, buffer, filename, mimeType, uploadPath);
      } catch (kieErr) {
        url = await uploadToCatbox(buffer, filename, mimeType);
        provider = 'catbox';
      }
    } else {
      url = await uploadToCatbox(buffer, filename, mimeType);
      provider = 'catbox';
    }

    return res.status(200).json({
      code: 200,
      msg: 'success',
      data: { url, provider },
    });
  } catch (error) {
    return res.status(500).json({ code: 500, msg: error.message || 'Upload failed' });
  }
}
