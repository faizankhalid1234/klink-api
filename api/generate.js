import formidable from 'formidable';
import { readFileSync, unlinkSync } from 'fs';
import { hostMediaFile } from './lib/media-upload.js';

export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  'https://muhammadumersheraz2000.socioglory.com/webhook/kling/avatar/generate';

const MAX_FILE_BYTES = 4.5 * 1024 * 1024;
const MAX_TOTAL_BYTES = 4.5 * 1024 * 1024;

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

function assertHostedUrl(url, label) {
  const value = String(url || '').trim();
  if (!value.startsWith('https://')) {
    throw new Error(`${label} must be a public https URL`);
  }
  if (value.startsWith('data:')) {
    throw new Error(`${label} must not be embedded base64 data`);
  }
  return value;
}

async function forwardToN8n(imageUrl, audioUrl, prompt, res) {
  const payload = {
    image_url: assertHostedUrl(imageUrl, 'image_url'),
    audio_url: assertHostedUrl(audioUrl, 'audio_url'),
    prompt: String(prompt || '.').trim() || '.',
  };

  const body = JSON.stringify(payload);
  if (body.length > 12000) {
    return res.status(500).json({
      success: false,
      error: 'Internal payload too large. Files must be hosted as short https URLs.',
    });
  }

  const n8nRes = await fetch(N8N_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  const data = await n8nRes.json().catch(() => ({}));

  if (!n8nRes.ok) {
    let error = data.message || data.error || `n8n returned ${n8nRes.status}`;
    if (n8nRes.status === 413) {
      error =
        'n8n server blocked the request (413). Ask server admin to set nginx client_max_body_size 50M and redeploy n8n.';
    }
    return res.status(n8nRes.status).json({
      success: false,
      error,
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
  if (!contentType.includes('multipart/form-data')) {
    return res.status(400).json({
      success: false,
      error: 'Send portrait and audio as multipart/form-data.',
    });
  }

  try {
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
    const imageName = portrait.originalFilename || 'portrait.jpg';
    const audioName = audio.originalFilename || 'audio.mp3';

    cleanupTemp(portrait, audio);

    const totalBytes = imageBuffer.length + audioBuffer.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      return res.status(413).json({
        success: false,
        error:
          'Upload too large (' +
          (totalBytes / (1024 * 1024)).toFixed(1) +
          ' MB). Use a shorter audio clip (max 30 seconds).',
      });
    }

    const imageUrl = await hostMediaFile(imageBuffer, imageName, imageMime);
    const audioUrl = await hostMediaFile(audioBuffer, audioName, audioMime);

    return forwardToN8n(imageUrl, audioUrl, prompt, res);
  } catch (err) {
    const message = err?.message || 'Generation request failed';
    const status = message.includes('maxFileSize') || message.includes('maxTotalFileSize') ? 413 : 500;
    return res.status(status).json({ success: false, error: message });
  }
}
