import formidable from 'formidable';
import { readFileSync, unlinkSync } from 'fs';

export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  'https://muhammadumersheraz2000.socioglory.com/webhook/kling/avatar/generate';

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024;

function pickFile(files, name) {
  const entry = files[name];
  if (!entry) return null;
  return Array.isArray(entry) ? entry[0] : entry;
}

function pickField(fields, name) {
  const entry = fields[name];
  if (!entry) return '';
  return Array.isArray(entry) ? entry[0] : entry;
}

function toDataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  const chunks = [];
  await new Promise((resolve, reject) => {
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', resolve);
    req.on('error', reject);
  });

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

function cleanupTemp(...files) {
  for (const file of files) {
    if (!file?.filepath) continue;
    try {
      unlinkSync(file.filepath);
    } catch {
      // ignore
    }
  }
}

async function forwardToN8n(imageUrl, audioUrl, prompt, res) {
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
}

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

  const contentType = String(req.headers['content-type'] || '');

  try {
    if (contentType.includes('multipart/form-data')) {
      const form = formidable({
        multiples: false,
        maxFileSize: MAX_FILE_BYTES,
        maxTotalFileSize: MAX_TOTAL_BYTES,
      });

      const [fields, files] = await form.parse(req);
      const portrait = pickFile(files, 'portrait');
      const audio = pickFile(files, 'audio');
      const prompt = String(pickField(fields, 'prompt') || '.').trim() || '.';

      if (!portrait || !audio) {
        return res.status(400).json({
          success: false,
          error: 'Please upload both portrait (image) and audio files.',
        });
      }

      const imageBuffer = readFileSync(portrait.filepath);
      const audioBuffer = readFileSync(audio.filepath);
      const imageMime = portrait.mimetype || 'image/jpeg';
      const audioMime = audio.mimetype || 'audio/mpeg';

      cleanupTemp(portrait, audio);

      const totalBytes = imageBuffer.length + audioBuffer.length;
      if (totalBytes > MAX_TOTAL_BYTES) {
        return res.status(413).json({
          success: false,
          error:
            'Files are too large after compression (' +
            (totalBytes / (1024 * 1024)).toFixed(1) +
            ' MB). Use a shorter audio clip.',
        });
      }

      const imageUrl = toDataUrl(imageBuffer, imageMime);
      const audioUrl = toDataUrl(audioBuffer, audioMime);
      return forwardToN8n(imageUrl, audioUrl, prompt, res);
    }

    const body = await readJsonBody(req);
    const imageUrl = body.image_url || body.imageUrl;
    const audioUrl = body.audio_url || body.audioUrl;
    const prompt = String(body.prompt || '.').trim() || '.';

    if (!imageUrl || !audioUrl) {
      return res.status(400).json({
        success: false,
        error: 'Please upload portrait image and audio file, then try again.',
      });
    }

    return forwardToN8n(imageUrl, audioUrl, prompt, res);
  } catch (err) {
    const message = err?.message || 'Generation request failed';
    const status = message.includes('maxFileSize') || message.includes('maxTotalFileSize') ? 413 : 500;
    return res.status(status).json({ success: false, error: message });
  }
}
