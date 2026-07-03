export function getFalKey() {
  const raw = process.env.FAL_API_KEY || process.env.FAL_KEY || '';
  return raw.replace(/^Key\s+/i, '').trim();
}

async function uploadToFal(buffer, filename, mime) {
  const falKey = getFalKey();
  if (!falKey) {
    throw new Error('FAL_KEY_MISSING');
  }

  const initRes = await fetch(
    'https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3',
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        content_type: mime,
        file_name: filename,
      }),
    },
  );

  const initBody = await initRes.json().catch(() => ({}));
  if (!initRes.ok) {
    throw new Error(initBody.message || initBody.detail || initRes.statusText || `fal initiate ${initRes.status}`);
  }

  const uploadUrl = initBody.upload_url;
  const fileUrl = initBody.file_url;
  if (!uploadUrl || !fileUrl) {
    throw new Error('fal initiate returned no upload URL');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    body: buffer,
    headers: { 'Content-Type': mime },
  });

  if (!putRes.ok) {
    throw new Error(`fal file upload failed (${putRes.status})`);
  }

  return fileUrl;
}

async function uploadToCatbox(buffer, filename, mime) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('time', '24h');
  form.append('fileToUpload', new Blob([buffer], { type: mime }), filename);

  const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
    method: 'POST',
    body: form,
  });

  const text = (await res.text()).trim();
  if (!res.ok || !text.startsWith('http')) {
    throw new Error('Temporary file host upload failed');
  }

  return text;
}

export async function hostMediaFile(buffer, filename, mime) {
  const safeName = filename || `upload.${mime.split('/')[1] || 'bin'}`;

  // Catbox first (reliable when fal balance is low)
  try {
    return await uploadToCatbox(buffer, safeName, mime);
  } catch (catboxErr) {
    console.error('catbox upload failed:', catboxErr.message);
  }

  if (getFalKey()) {
    return uploadToFal(buffer, safeName, mime);
  }

  throw new Error('Failed to host media file online');
}
