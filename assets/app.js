import { fal } from 'https://esm.sh/@fal-ai/client@1.5.0';

fal.config({ proxyUrl: '/api/fal/proxy' });

const API_URL = '/api/generate';
const MAX_UPLOAD_MB = 3.5;
const MAX_AUDIO_SECONDS = 60;

const form = document.getElementById('uploadForm');
const submitBtn = document.getElementById('submitBtn');
const successMsg = document.getElementById('successMsg');
const errorMsg = document.getElementById('errorMsg');
const preview = document.getElementById('preview');

function hideMessages() {
  successMsg.classList.remove('show');
  errorMsg.classList.remove('show');
  preview.innerHTML = '';
}

function formatMb(bytes) {
  return (bytes / (1024 * 1024)).toFixed(1);
}

function setStatus(text) {
  submitBtn.textContent = text;
}

async function compressImage(file, maxWidth = 1280, quality = 0.82) {
  if (!file.type.startsWith('image/')) return file;
  if (file.size < 600 * 1024) return file;

  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });

  const scale = Math.min(1, maxWidth / img.width);
  const width = Math.round(img.width * scale);
  const height = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' });
}

function audioBufferToWav(buffer) {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const dataSize = channel.length * bytesPerSample;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i += 1) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < channel.length; i += 1) {
    const sample = Math.max(-1, Math.min(1, channel[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function compressAudio(file) {
  if (file.size <= MAX_UPLOAD_MB * 1024 * 1024) return file;

  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  let audioBuffer;

  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioCtx.close();
  }

  const maxSamples = Math.min(
    audioBuffer.length,
    Math.ceil(Math.min(audioBuffer.duration, MAX_AUDIO_SECONDS) * audioBuffer.sampleRate),
  );

  const offline = new OfflineAudioContext(1, maxSamples, 22050);
  const mono = offline.createBuffer(1, maxSamples, audioBuffer.sampleRate);
  const out = mono.getChannelData(0);

  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch += 1) {
    const input = audioBuffer.getChannelData(ch);
    for (let i = 0; i < maxSamples; i += 1) out[i] += input[i] / audioBuffer.numberOfChannels;
  }

  const source = offline.createBufferSource();
  source.buffer = mono;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const wavBlob = audioBufferToWav(rendered);

  return new File([wavBlob], 'audio-compressed.wav', { type: 'audio/wav' });
}

async function uploadToFal(file, label) {
  setStatus('Uploading ' + label + '...');
  return fal.storage.upload(file);
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideMessages();

  let portrait = document.getElementById('portrait').files[0];
  let audio = document.getElementById('audio').files[0];
  const prompt = document.getElementById('prompt').value || '.';

  if (!portrait || !audio) {
    errorMsg.textContent = 'Please select both portrait image and audio file.';
    errorMsg.classList.add('show');
    return;
  }

  submitBtn.disabled = true;
  setStatus('Preparing files...');

  try {
    portrait = await compressImage(portrait);
    audio = await compressAudio(audio);

    if (audio.size > MAX_UPLOAD_MB * 1024 * 1024) {
      throw new Error(
        'Audio is still too large (' + formatMb(audio.size) + ' MB). Use a shorter clip under ' + MAX_AUDIO_SECONDS + ' seconds.',
      );
    }

    const [imageUrl, audioUrl] = await Promise.all([
      uploadToFal(portrait, 'portrait'),
      uploadToFal(audio, 'audio'),
    ]);

    setStatus('Generating video... this may take a few minutes');

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_url: imageUrl, audio_url: audioUrl, prompt }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || !data.video_url) {
      let msg = data.error || data.message || 'Avatar generation failed';
      if (res.status === 413) {
        msg = 'Upload too large for server. Try a shorter audio clip.';
      } else if (String(msg).includes('FAL')) {
        msg = 'Add FAL_API_KEY (or FAL_KEY) in Vercel Environment Variables, then redeploy.';
      }
      throw new Error(msg);
    }

    successMsg.innerHTML =
      'Video generated successfully.<br><a href="' +
      data.video_url +
      '" target="_blank" rel="noopener">Download video</a>';
    successMsg.classList.add('show');
    preview.innerHTML = '<video controls src="' + data.video_url + '"></video>';
  } catch (err) {
    errorMsg.textContent = err.message || 'Something went wrong. Please try again.';
    errorMsg.classList.add('show');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Generate Avatar Video';
  }
});
