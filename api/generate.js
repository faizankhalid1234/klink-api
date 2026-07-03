import { fal } from '@fal-ai/client';
import formidable from 'formidable';
import { readFileSync, unlinkSync } from 'fs';

export const config = {
  api: { bodyParser: false },
  maxDuration: 300,
};

const N8N_WEBHOOK_URL =
  process.env.N8N_WEBHOOK_URL ||
  'https://muhammadumersheraz2000.socioglory.com/webhook/kling/avatar/generate';

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

  const falKey = process.env.FAL_API_KEY || process.env.FAL_KEY;
  if (!falKey) {
    return res.status(500).json({
      success: false,
      error: 'FAL_API_KEY is not set on Vercel. Add it in Project Settings → Environment Variables.',
    });
  }

  fal.config({ credentials: falKey });

  try {
    const form = formidable({
      multiples: false,
      maxFileSize: 50 * 1024 * 1024,
      maxTotalFileSize: 55 * 1024 * 1024,
    });

    const [fields, files] = await form.parse(req);
    const portrait = pickFile(files, 'portrait');
    const audio = pickFile(files, 'audio');

    if (!portrait || !audio) {
      return res.status(400).json({
        success: false,
        error: 'Both portrait (image) and audio files are required.',
      });
    }

    const prompt = String(pickField(fields, 'prompt') || '.').trim() || '.';

    const imageBuffer = readFileSync(portrait.filepath);
    const audioBuffer = readFileSync(audio.filepath);

    const imageFile = new File(
      [imageBuffer],
      portrait.originalFilename || 'portrait.jpg',
      { type: portrait.mimetype || 'image/jpeg' },
    );
    const audioFile = new File(
      [audioBuffer],
      audio.originalFilename || 'audio.mp3',
      { type: audio.mimetype || 'audio/mpeg' },
    );

    const [imageUrl, audioUrl] = await Promise.all([
      fal.storage.upload(imageFile),
      fal.storage.upload(audioFile),
    ]);

    try {
      unlinkSync(portrait.filepath);
      unlinkSync(audio.filepath);
    } catch {
      // ignore temp cleanup errors
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
    const message = err?.message || 'Upload or generation failed';
    const status = message.includes('maxFileSize') ? 413 : 500;
    return res.status(status).json({ success: false, error: message });
  }
}
