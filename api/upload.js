import { fal } from '@fal-ai/client';
import formidable from 'formidable';
import { readFileSync, unlinkSync } from 'fs';

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

function pickFile(files) {
  const names = ['file', 'portrait', 'audio'];
  for (const name of names) {
    const entry = files[name];
    if (entry) return Array.isArray(entry) ? entry[0] : entry;
  }
  const firstKey = Object.keys(files)[0];
  if (!firstKey) return null;
  const entry = files[firstKey];
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
      maxFileSize: 4 * 1024 * 1024,
      maxTotalFileSize: 4 * 1024 * 1024,
    });

    const [, files] = await form.parse(req);
    const uploaded = pickFile(files);

    if (!uploaded) {
      return res.status(400).json({ success: false, error: 'No file received. Send field name: file' });
    }

    const buffer = readFileSync(uploaded.filepath);
    const blob = new File(
      [buffer],
      uploaded.originalFilename || 'upload.bin',
      { type: uploaded.mimetype || 'application/octet-stream' },
    );

    const url = await fal.storage.upload(blob);

    try {
      unlinkSync(uploaded.filepath);
    } catch {
      // ignore temp cleanup errors
    }

    if (!url || typeof url !== 'string') {
      return res.status(500).json({ success: false, error: 'fal storage returned no URL' });
    }

    return res.status(200).json({ success: true, url });
  } catch (err) {
    const message = err?.message || 'Upload failed';
    const status = message.includes('maxFileSize') ? 413 : 500;
    return res.status(status).json({ success: false, error: message });
  }
}
