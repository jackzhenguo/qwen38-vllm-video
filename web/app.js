const $ = (id) => document.getElementById(id);
const fileInput = $('file-input');
const videoUrl = $('video-url');
const dropzone = $('dropzone');
const preview = $('preview');
const previewVideo = $('preview-video');
const question = $('question');
const button = $('analyze-button');
let sourceMode = 'upload';
let activeHistoryId = null;
let previewObjectUrl = null;
let elapsedTimer = null;

function setMode(mode) {
  activeHistoryId = null;
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
    $('drop-title').textContent = '拖入视频，或点击浏览';
    $('drop-subtitle').textContent = `MP4 文件 · 最大 ${$('upload-limit').textContent} MB`;
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
  if (sourceMode === 'upload' && !file && !activeHistoryId) {
    showResult('error', '请先选择一个 MP4 视频。');
    return;
  }
  if (sourceMode === 'url' && !url && !activeHistoryId) {
    showResult('error', '请先填写视频 URL。');
    return;
  }
  if (!question.value.trim()) {
    showResult('error', '请输入想问视频的问题。');
    return;
  }
  const body = new FormData();
  body.append('question', question.value.trim());
  body.append('save_history', String($('save-history').checked));
  if (activeHistoryId) body.append('history_id', activeHistoryId);
  else if (sourceMode === 'upload') body.append('file', file);
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
    if (data.history_id) {
      activeHistoryId = data.history_id;
      refreshHistory().catch(() => {});
    }
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

function closeHistory() {
  $('history-drawer').hidden = true;
  $('history-scrim').hidden = true;
  document.body.classList.remove('drawer-open');
  $('history-button').focus();
}

async function refreshHistory() {
  const response = await fetch('/api/history');
  if (!response.ok) throw new Error('历史记录加载失败。');
  const {items} = await response.json();
  const count = $('history-count');
  count.textContent = String(items.length);
  count.hidden = items.length === 0;
  const list = $('history-list');
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = '这里还没有记录。完成一次分析后，它会出现在这里。';
    list.append(empty);
    return;
  }
  for (const item of items) {
    const row = document.createElement('article');
    row.className = 'history-item';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'history-open';
    const date = document.createElement('span');
    date.className = 'history-date';
    date.textContent = new Intl.DateTimeFormat('zh-CN', {dateStyle:'medium', timeStyle:'short'}).format(new Date(item.created_at));
    const title = document.createElement('strong');
    title.textContent = item.question;
    const file = document.createElement('span');
    file.className = 'history-file';
    file.textContent = `${item.source_type === 'upload' ? '本地视频' : '视频链接'} · ${item.filename}`;
    const excerpt = document.createElement('p');
    excerpt.textContent = item.answer.slice(0, 110);
    open.append(date, title, file, excerpt);
    open.addEventListener('click', () => openHistoryItem(item.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-delete';
    remove.textContent = '删除';
    remove.setAttribute('aria-label', `删除记录：${item.question}`);
    remove.addEventListener('click', async () => {
      if (!confirm('删除这条历史记录？如果没有其他记录使用同一份上传视频，视频文件也会删除。')) return;
      const result = await fetch(`/api/history/${item.id}`, {method:'DELETE'});
      if (!result.ok) { alert('删除失败，请稍后重试。'); return; }
      if (activeHistoryId === item.id) {
        activeHistoryId = null;
        updatePreview();
        showResult('empty');
        $('result-meta').textContent = '选择视频并提问，结果会显示在这里。';
      }
      refreshHistory().catch((error) => { $('history-list').textContent = error.message; });
    });
    row.append(open, remove);
    list.append(row);
  }
}

async function openHistoryItem(id) {
  try {
    const response = await fetch(`/api/history/${id}`);
    if (!response.ok) throw new Error('这条记录已无法打开。');
    const item = await response.json();
    setMode(item.source_type === 'upload' ? 'upload' : 'url');
    fileInput.value = '';
    videoUrl.value = item.video_url || '';
    activeHistoryId = item.id;
    question.value = item.question;
    if (item.source_type === 'upload') {
      $('drop-title').textContent = item.filename;
      $('drop-subtitle').textContent = '已保存到本地历史 · 可继续提问';
    }
    previewVideo.src = item.video_src;
    $('preview-name').textContent = item.filename;
    $('preview-size').textContent = item.source_type === 'upload' ? '本地历史' : '视频 URL';
    preview.hidden = false;
    showResult('answer', item.answer);
    $('result-meta').textContent = `${item.model} · 历史记录 · 用时 ${item.seconds} 秒`;
    closeHistory();
    document.querySelector('.result-panel').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (error) {
    $('history-list').textContent = error.message;
  }
}

$('upload-tab').addEventListener('click', () => setMode('upload'));
$('url-tab').addEventListener('click', () => setMode('url'));
dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInput.click(); } });
fileInput.addEventListener('change', () => { activeHistoryId = null; updatePreview(); });
videoUrl.addEventListener('input', () => { activeHistoryId = null; preview.hidden = true; previewVideo.removeAttribute('src'); });
for (const name of ['dragenter', 'dragover']) dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
for (const name of ['dragleave', 'drop']) dropzone.addEventListener(name, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); });
dropzone.addEventListener('drop', (event) => { if (event.dataTransfer.files.length) { fileInput.files = event.dataTransfer.files; activeHistoryId = null; updatePreview(); } });
document.querySelectorAll('[data-question]').forEach((item) => item.addEventListener('click', () => { question.value = item.dataset.question; question.focus(); }));
button.addEventListener('click', analyze);
$('history-button').addEventListener('click', () => {
  $('history-drawer').hidden = false;
  $('history-scrim').hidden = false;
  document.body.classList.add('drawer-open');
  refreshHistory().catch((error) => { $('history-list').textContent = error.message; });
});
$('history-close').addEventListener('click', closeHistory);
$('history-scrim').addEventListener('click', closeHistory);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('history-drawer').hidden) closeHistory(); });
checkHealth();
refreshHistory().catch(() => {});
setInterval(checkHealth, 15000);
