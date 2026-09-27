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
let historyCoverObserver = null;
let pendingSeekSeconds = null;
let lastSyncedTimestamp = null;
const timePattern = /\b(?:\d{1,2}:)?\d{1,2}:\d{2}\b/g;

function timestampSeconds(value) {
  const parts = value.split(':').map(Number);
  if (parts.length === 2 && parts[1] < 60) return parts[0] * 60 + parts[1];
  if (parts.length === 3 && parts[1] < 60 && parts[2] < 60) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

function seekPreview(seconds) {
  if (preview.hidden || !previewVideo.currentSrc && !previewVideo.src) return;
  pendingSeekSeconds = seconds;
  if (previewVideo.readyState < HTMLMediaElement.HAVE_METADATA) return;
  const duration = previewVideo.duration;
  const target = Number.isFinite(duration) ? Math.min(seconds, Math.max(0, duration - 0.05)) : seconds;
  try {
    previewVideo.currentTime = target;
    pendingSeekSeconds = null;
  } catch {
    // Some remote URLs cannot be previewed by the browser even when vLLM can read them.
  }
}

function syncStreamingTimestamp(answer) {
  const lines = answer.split(/\r?\n/);
  let latest = null;
  for (const line of lines) {
    const match = line.match(/^\s*(?:(?:[-*+]|\d+\.)\s+|>\s*)?(?:\*\*)?(\d{1,2}:\d{2}(?::\d{2})?)\b/);
    if (match && timestampSeconds(match[1]) !== null) latest = match[1];
  }
  if (latest && latest !== lastSyncedTimestamp) {
    lastSyncedTimestamp = latest;
    seekPreview(timestampSeconds(latest));
  }
}

function renderAnswer(text) {
  const answer = $('answer');
  answer.replaceChildren();
  let offset = 0;
  for (const match of text.matchAll(timePattern)) {
    const seconds = timestampSeconds(match[0]);
    if (seconds === null) continue;
    answer.append(document.createTextNode(text.slice(offset, match.index)));
    const jump = document.createElement('button');
    jump.type = 'button';
    jump.className = 'answer-timestamp';
    jump.textContent = match[0];
    jump.setAttribute('aria-label', `跳转视频到 ${match[0]}`);
    jump.addEventListener('click', () => seekPreview(seconds));
    answer.append(jump);
    offset = match.index + match[0].length;
  }
  answer.append(document.createTextNode(text.slice(offset)));
}

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
  pendingSeekSeconds = null;
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
  } else if (sourceMode === 'url' && /^https?:\/\//i.test(videoUrl.value.trim())) {
    const url = videoUrl.value.trim();
    previewVideo.src = url;
    $('preview-name').textContent = url;
    $('preview-size').textContent = '视频 URL';
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
  $('answer').hidden = kind !== 'answer' && kind !== 'typing';
  $('answer').classList.toggle('typing', kind === 'typing');
  $('error-state').hidden = kind !== 'error';
  if (kind === 'answer') renderAnswer(text);
  if (kind === 'typing') $('answer').textContent = text;
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
  if (sourceMode === 'url' && !activeHistoryId) updatePreview();
  lastSyncedTimestamp = null;
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
  let streamReader = null;
  try {
    const response = await fetch('/api/analyze/stream', { method: 'POST', body });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || '分析失败，请稍后重试。');
    }
    if (!response.body) throw new Error('浏览器不支持流式输出。');
    const reader = response.body.getReader();
    streamReader = reader;
    const decoder = new TextDecoder();
    let pending = '';
    let finished = false;
    let typing = false;
    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      pending += decoder.decode(value, {stream:true});
      let end;
      while ((end = pending.indexOf('\n')) !== -1) {
        const raw = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (!raw) continue;
        const event = JSON.parse(raw);
        if (event.type === 'delta') {
          if (!typing) {
            typing = true;
            showResult('typing', '');
            $('result-meta').textContent = '正在逐字生成回答…';
          }
          $('answer').textContent += event.text;
          syncStreamingTimestamp($('answer').textContent);
        } else if (event.type === 'error') {
          throw new Error(event.message || '分析失败，请稍后重试。');
        } else if (event.type === 'done') {
          finished = true;
          showResult('answer', event.answer);
          $('result-meta').textContent = `${event.model} · 用时 ${event.seconds} 秒`;
          if (event.history_id) {
            activeHistoryId = event.history_id;
            refreshHistory().catch(() => {});
          }
        }
      }
    }
    if (!finished) throw new Error('连接中断，请重试。');
  } catch (error) {
    showResult('error', error.message || '分析失败，请稍后重试。');
    $('result-meta').textContent = '本次分析未完成';
  } finally {
    if (streamReader) streamReader.cancel().catch(() => {});
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
  if (historyCoverObserver) historyCoverObserver.disconnect();
  historyCoverObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver((entries, observer) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.src = entry.target.dataset.src;
          observer.unobserve(entry.target);
        }
      }, {root: list, rootMargin: '100px'})
    : null;
  list.replaceChildren();
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'history-empty';
    empty.textContent = '这里还没有记录。完成一次分析后，它会出现在这里。';
    list.append(empty);
    return;
  }
  for (const [index, item] of items.entries()) {
    const row = document.createElement('article');
    row.className = 'history-item';
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'history-open';
    const cover = document.createElement('span');
    cover.className = 'history-cover';
    const coverFallback = document.createElement('span');
    coverFallback.className = 'history-cover-fallback';
    coverFallback.setAttribute('aria-hidden', 'true');
    coverFallback.textContent = '▶';
    const coverVideo = document.createElement('video');
    coverVideo.className = 'history-cover-video';
    coverVideo.muted = true;
    coverVideo.playsInline = true;
    coverVideo.preload = 'metadata';
    coverVideo.setAttribute('aria-hidden', 'true');
    coverVideo.dataset.src = item.video_src;
    coverVideo.addEventListener('loadedmetadata', () => {
      try {
        coverVideo.currentTime = Number.isFinite(coverVideo.duration)
          ? Math.min(1, Math.max(0, coverVideo.duration - 0.1)) : 1;
      } catch { /* Keep the first decodable frame. */ }
    });
    coverVideo.addEventListener('loadeddata', () => cover.classList.add('is-ready'));
    coverVideo.addEventListener('seeked', () => cover.classList.add('is-ready'));
    cover.append(coverVideo, coverFallback);
    const copy = document.createElement('span');
    copy.className = 'history-copy';
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
    copy.append(date, title, file, excerpt);
    open.append(cover, copy);
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
    if (historyCoverObserver) historyCoverObserver.observe(coverVideo);
    else if (index < 10) coverVideo.src = item.video_src;
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
    pendingSeekSeconds = null;
    lastSyncedTimestamp = null;
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
videoUrl.addEventListener('input', () => { activeHistoryId = null; preview.hidden = true; previewVideo.removeAttribute('src'); pendingSeekSeconds = null; });
videoUrl.addEventListener('change', () => { if (!activeHistoryId) updatePreview(); });
previewVideo.addEventListener('loadedmetadata', () => {
  if (pendingSeekSeconds !== null) seekPreview(pendingSeekSeconds);
});
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
