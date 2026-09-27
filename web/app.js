const $ = (id) => document.getElementById(id);
const fileInput = $('file-input');
const videoUrl = $('video-url');
const dropzone = $('dropzone');
const preview = $('preview');
const previewVideo = $('preview-video');
const question = $('question');
const button = $('analyze-button');
let sourceMode = 'upload';
let previewObjectUrl = null;
let elapsedTimer = null;

function setMode(mode) {
  sourceMode = mode;
  const upload = mode === 'upload';
  $('upload-pane').hidden = !upload;
  $('url-pane').hidden = upload;
  $('upload-tab').classList.toggle('active', upload);
  $('url-tab').classList.toggle('active', !upload);
  $('upload-tab').setAttribute('aria-selected', String(upload));
  $('url-tab').setAttribute('aria-selected', String(!upload));
  updatePreview();
}

function updatePreview() {
  if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
  previewObjectUrl = null;
  preview.hidden = true;
  previewVideo.removeAttribute('src');
  const file = fileInput.files?.[0];
  if (sourceMode === 'upload' && file) {
    previewObjectUrl = URL.createObjectURL(file);
    previewVideo.src = previewObjectUrl;
    $('preview-name').textContent = file.name;
    $('preview-size').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB`;
    $('drop-title').textContent = file.name;
    $('drop-subtitle').textContent = '已选择 MP4 · 点击可更换';
    preview.hidden = false;
  } else {
    $('drop-title').textContent = '拖入视频，或点击选择';
    $('drop-subtitle').textContent = `仅 MP4 · 最大 ${$('upload-limit').textContent} MB`;
  }
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    const limit = $('upload-limit');
    if (limit) limit.textContent = data.max_upload_mb;
    const status = $('status');
    status.classList.toggle('online', data.online);
    status.classList.toggle('offline', !data.online);
    $('status-text').textContent = data.online ? `${data.model} 在线` : '模型服务离线';
  } catch {
    $('status').classList.remove('online');
    $('status').classList.add('offline');
    $('status-text').textContent = '连接失败';
  }
}

function showResult(kind, text) {
  $('empty-state').hidden = kind !== 'empty';
  $('loading-state').hidden = kind !== 'loading';
  $('answer').hidden = kind !== 'answer';
  $('error-state').hidden = kind !== 'error';
  if (kind === 'answer') $('answer').textContent = text;
  if (kind === 'error') $('error-state').textContent = text;
}

async function analyze() {
  const file = fileInput.files?.[0];
  const url = videoUrl.value.trim();
  if (sourceMode === 'upload' && !file) {
    showResult('error', '请先选择一个 MP4 视频。');
    return;
  }
  if (sourceMode === 'url' && !url) {
    showResult('error', '请先填写视频 URL。');
    return;
  }
  if (!question.value.trim()) {
    showResult('error', '请输入想问视频的问题。');
    return;
  }
  const body = new FormData();
  body.append('question', question.value.trim());
  if (sourceMode === 'upload') body.append('file', file);
  else body.append('video_url', url);

  button.disabled = true;
  $('button-label').textContent = '正在分析…';
  $('result-meta').textContent = '模型正在处理视频，请稍候。';
  $('elapsed').textContent = '0';
  showResult('loading');
  const started = Date.now();
  elapsedTimer = setInterval(() => { $('elapsed').textContent = String(Math.floor((Date.now() - started) / 1000)); }, 1000);
  try {
    const response = await fetch('/api/analyze', { method: 'POST', body });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || '分析失败，请稍后重试。');
    showResult('answer', data.answer);
    $('result-meta').textContent = `${data.model} · 用时 ${data.seconds} 秒`;
  } catch (error) {
    showResult('error', error.message || '分析失败，请稍后重试。');
    $('result-meta').textContent = '本次分析未完成';
  } finally {
    clearInterval(elapsedTimer);
    button.disabled = false;
    $('button-label').textContent = '开始分析视频';
    checkHealth();
  }
}

$('upload-tab').addEventListener('click', () => setMode('upload'));
$('url-tab').addEventListener('click', () => setMode('url'));
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', updatePreview);
for (const name of ['dragenter', 'dragover']) dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
for (const name of ['dragleave', 'drop']) dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', (event) => { if (event.dataTransfer.files.length) { fileInput.files = event.dataTransfer.files; updatePreview(); } });
document.querySelectorAll('[data-question]').forEach((item) => item.addEventListener('click', () => { question.value = item.dataset.question; question.focus(); }));
button.addEventListener('click', analyze);
checkHealth();
setInterval(checkHealth, 15000);
