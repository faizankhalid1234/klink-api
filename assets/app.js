const API_URL = '/api/generate';
const MAX_TOTAL_MB = 4;
const MAX_AUDIO_SECONDS = 30;
const KEEP_ORIGINAL_AUDIO_MB = 2;

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

async function compressImage(file, maxWidth = 960, quality = 0.78) {
  if (!file.type.startsWith('image/')) return file;

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
  const dataSize = channel.length * 2;
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
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
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

async function getAudioDuration(file) {
  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
    return audioBuffer.duration;
  } finally {
    await audioCtx.close();
  }
}

async function prepareAudio(file) {
  const duration = await getAudioDuration(file);

  if (duration > MAX_AUDIO_SECONDS) {
    throw new Error(
      'Audio is ' +
        Math.round(duration) +
        ' seconds. Maximum allowed is ' +
        MAX_AUDIO_SECONDS +
        ' seconds.',
    );
  }

  const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a'];
  const isAllowed = allowedTypes.includes(file.type) || /\.(mp3|wav|m4a)$/i.test(file.name);

  if (!isAllowed) {
    throw new Error('Use MP3, WAV, or M4A audio only.');
  }

  if (file.size <= KEEP_ORIGINAL_AUDIO_MB * 1024 * 1024) {
    return file;
  }

  const arrayBuffer = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  let audioBuffer;

  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    await audioCtx.close();
  }

  const targetRate = 22050;
  const maxDuration = Math.min(audioBuffer.duration, MAX_AUDIO_SECONDS);
  const length = Math.ceil(maxDuration * targetRate);
  const offline = new OfflineAudioContext(1, length, targetRate);
  const source = offline.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(offline.destination);
  source.start(0);
  const rendered = await offline.startRendering();
  const wavBlob = audioBufferToWav(rendered);

  return new File([wavBlob], 'audio-compressed.wav', { type: 'audio/wav' });
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
    audio = await prepareAudio(audio);

    const totalBytes = portrait.size + audio.size;
    if (totalBytes > MAX_TOTAL_MB * 1024 * 1024) {
      throw new Error(
        'Files are too large (' + formatMb(totalBytes) + ' MB). Try a shorter clip or smaller image.',
      );
    }

    const formData = new FormData();
    formData.append('portrait', portrait);
    formData.append('audio', audio);
    formData.append('prompt', prompt);

    setStatus('Uploading and generating... this may take a few minutes');

    const res = await fetch(API_URL, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));

    if (!res.ok || !data.success || !data.video_url) {
      throw new Error(data.error || data.message || 'Avatar generation failed');
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
