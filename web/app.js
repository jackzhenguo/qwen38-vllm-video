const $ = (id) => document.getElementById(id);
const fileInput = $('file-input');
const videoUrl = $('video-url');
const dropzone = $('dropzone');
const preview = $('preview');
const previewVideo = $('preview-video');
const question = $('question');
const button = $('analyze-button');
const answerLanguage = $('answer-language');
const translations = {
  zh: {
    pageTitle: 'Qwen Video Desk · 本地视频分析', homeAria: 'Qwen Video Desk 首页', historyButton: '历史记录',
    workflowAria: '工作方式', heroTitle: '本地视频分析工具', heroCopy: '上传视频，问你真正关心的问题。画面、动作和时间线，交给本地运行的 Qwen3.8-27B。',
    flowChoose: '选择视频', flowAsk: '提出问题', flowAnswer: '获得答案', benefitsAria: '产品优势',
    benefitOffline: '离线可用', benefitOfflineCopy: '模型装好后，本地 MP4 断网也能分析',
    benefitFree: '开源免费', benefitFreeCopy: 'MIT 开源代码，无需付费 API',
    benefitPrivate: '本机处理', benefitPrivateCopy: '视频交给本机模型，不上传到云端推理',
    benefitHistory: '结果可回看', benefitHistoryCopy: '流式回答、时间点定位和本地历史',
    benefitsNote: '视频 URL 需要联网；离线使用请上传本地 MP4。', workspaceAria: '视频分析工作区',
    inputTitle: '从这里开始', inputCopy: '选择 MP4 文件，或粘贴可直接访问的视频链接。', sourceAria: '视频来源',
    uploadTab: '上传文件', urlTab: '视频 URL', dropAria: '选择或拖入 MP4 视频', dropTitle: '拖入视频，或点击浏览',
    dropHint: 'MP4 文件 · 最大 {max} MB', selectedFile: '已选择 MP4 · 点击可更换', savedFile: '已保存到本地历史 · 可继续提问',
    videoLink: '视频链接', urlHelp: '链接需要指向可直接下载的视频文件。', questionLabel: '你想知道什么？',
    questionPlaceholder: '按时间顺序列出主要事件，每行使用“- 00:00 - 00:10: 事件描述”格式。',
    defaultQuestion: '请按时间顺序列出视频中的主要事件。每行严格使用“- 00:00 - 00:10: 事件描述”格式；时间点只写画面能支持的大致范围。', suggestionsAria: '快捷问题',
    summaryLabel: '三句话概括', timelineLabel: '整理时间线', peopleLabel: '人物与动作',
    summaryQuestion: '请用三句话概括这段视频。', timelineQuestion: '请按时间顺序列出视频中的主要事件。每行严格使用“- 00:00 - 00:10: 事件描述”格式；时间点只写画面能支持的大致范围。', peopleQuestion: '视频中有哪些人物？他们分别做了什么？',
    answerLanguageLabel: '回答语言', saveHistory: '保存本次分析与视频到本机历史', analyzeButton: '开始分析视频', analyzingButton: '正在分析…',
    inputNote: '视频由本机 vLLM 处理。关闭保存时，上传文件会在分析结束后删除。',
    resultTitle: '答案在这里', resultIntro: '选择视频并提问，结果会显示在这里。',
    emptyTitle: '从一个问题开始。', emptyCopy: '概括内容、寻找关键动作，或梳理视频的时间线。',
    loadingTitle: '正在看视频', loadingPrefix: '模型正在解码画面并整理回答，已等待 ', secondsSuffix: ' 秒',
    processing: '模型正在处理视频，请稍候。', streaming: '正在逐字生成回答…',
    resultDone: '{model} · 用时 {seconds} 秒', resultHistory: '{model} · 历史记录 · 用时 {seconds} 秒', resultFailed: '本次分析未完成',
    historyTitle: '分析历史', historyIntro: '记录保存在这台电脑上。打开记录可查看回答，或继续提问。',
    historyFooter: '上传的视频保存在 WSL 本地目录，占用磁盘空间。', closeHistoryAria: '关闭历史记录',
    historyEmpty: '这里还没有记录。完成一次分析后，它会出现在这里。', historyLoadError: '历史记录加载失败。',
    historyOpenError: '这条记录已无法打开。', delete: '删除', deleteAria: '删除记录：{question}',
    deleteConfirm: '删除这条历史记录？如果没有其他记录使用同一份上传视频，视频文件也会删除。', deleteFailed: '删除失败，请稍后重试。',
    localVideo: '本地视频', videoUrl: '视频链接', localHistory: '本地历史', jumpTo: '跳转视频到 {time}',
    checkingModel: '正在检查模型', modelOnline: '{model} 在线', modelOffline: '模型服务离线', connectionFailed: '连接失败',
    chooseVideo: '请先选择一个 MP4 视频。', enterUrl: '请先填写视频 URL。', enterQuestion: '请输入想问视频的问题。',
    analysisFailed: '分析失败，请稍后重试。', noStream: '浏览器不支持流式输出。', interrupted: '连接中断，请重试。',
    modelConnectionFailed: '连接模型服务失败，请确认 vLLM 已启动。', modelCannotProcess: '模型无法处理这段视频。请先试较短的 MP4，或换一个可直接访问的 URL。',
    genericFailure: '分析过程中发生错误，请稍后重试。', emptyAnswer: '模型没有返回正文，请换一种问法重试。',
    questionTooLong: '问题请控制在 4000 字以内。', invalidInput: '请选择一个 MP4 文件、视频 URL 或历史视频。',
    invalidUrl: '视频 URL 必须以 https:// 或 http:// 开头。', missingVideo: '本地视频文件已不存在。', missingHistory: '历史记录不存在。'
  },
  en: {
    pageTitle: 'Qwen Video Desk · Local Video Analysis', homeAria: 'Qwen Video Desk home', historyButton: 'History',
    workflowAria: 'How it works', heroTitle: 'Local video analysis tool', heroCopy: 'Upload a video and ask what matters to you. Let the locally running Qwen3.8-27B explain scenes, actions, and the timeline.',
    flowChoose: 'Choose video', flowAsk: 'Ask a question', flowAnswer: 'Get an answer', benefitsAria: 'Why use it',
    benefitOffline: 'Works offline', benefitOfflineCopy: 'Analyze local MP4 files offline after model setup',
    benefitFree: 'Free and open source', benefitFreeCopy: 'MIT-licensed code, no paid API required',
    benefitPrivate: 'Runs locally', benefitPrivateCopy: 'Your video is analyzed by a model on this computer',
    benefitHistory: 'Easy to revisit', benefitHistoryCopy: 'Streaming answers, timestamp jumps, and local history',
    benefitsNote: 'Video URLs require internet access. Upload a local MP4 to work offline.', workspaceAria: 'Video analysis workspace',
    inputTitle: 'Start here', inputCopy: 'Choose an MP4 file or paste a direct video URL.', sourceAria: 'Video source',
    uploadTab: 'Upload file', urlTab: 'Video URL', dropAria: 'Choose or drop an MP4 video', dropTitle: 'Drop a video or click to browse',
    dropHint: 'MP4 file · up to {max} MB', selectedFile: 'MP4 selected · click to replace', savedFile: 'Saved in local history · ask another question',
    videoLink: 'Video link', urlHelp: 'The URL must point directly to a downloadable video file.', questionLabel: 'What would you like to know?',
    questionPlaceholder: 'List key events as “- 00:00 - 00:10: event description”, one event per line.',
    defaultQuestion: 'List the main events in chronological order. Use exactly “- 00:00 - 00:10: event description” on each line; include only approximate time ranges supported by the video.', suggestionsAria: 'Suggested questions',
    summaryLabel: 'Three-sentence summary', timelineLabel: 'Build a timeline', peopleLabel: 'People and actions',
    summaryQuestion: 'Summarize this video in three sentences.', timelineQuestion: 'List the main events in chronological order. Use exactly “- 00:00 - 00:10: event description” on each line; include only approximate time ranges supported by the video.', peopleQuestion: 'Who appears in the video, and what does each person do?',
    answerLanguageLabel: 'Answer language', saveHistory: 'Save this analysis and video to local history', analyzeButton: 'Analyze video', analyzingButton: 'Analyzing…',
    inputNote: 'Your local vLLM processes the video. If saving is off, uploaded files are removed after analysis.',
    resultTitle: 'Your answer', resultIntro: 'Choose a video and ask a question to see the result here.',
    emptyTitle: 'Start with a question.', emptyCopy: 'Summarize the video, find key actions, or build a timeline.',
    loadingTitle: 'Watching the video', loadingPrefix: 'The model is decoding frames and preparing an answer · ', secondsSuffix: ' s elapsed',
    processing: 'The model is processing the video. Please wait.', streaming: 'Generating the answer…',
    resultDone: '{model} · {seconds} s', resultHistory: '{model} · History · {seconds} s', resultFailed: 'This analysis did not finish',
    historyTitle: 'Analysis history', historyIntro: 'Records stay on this computer. Open one to review the answer or ask again.',
    historyFooter: 'Uploaded videos are stored locally in WSL and use disk space.', closeHistoryAria: 'Close history',
    historyEmpty: 'No saved analyses yet. Your next completed analysis can appear here.', historyLoadError: 'Could not load history.',
    historyOpenError: 'This record is no longer available.', delete: 'Delete', deleteAria: 'Delete record: {question}',
    deleteConfirm: 'Delete this record? Its uploaded video will also be removed if no other record uses it.', deleteFailed: 'Could not delete this record. Please try again.',
    localVideo: 'Local video', videoUrl: 'Video link', localHistory: 'Local history', jumpTo: 'Jump video to {time}',
    checkingModel: 'Checking model', modelOnline: '{model} online', modelOffline: 'Model service offline', connectionFailed: 'Connection failed',
    chooseVideo: 'Choose an MP4 video first.', enterUrl: 'Enter a video URL first.', enterQuestion: 'Enter a question about the video.',
    analysisFailed: 'Analysis failed. Please try again.', noStream: 'This browser does not support streaming responses.', interrupted: 'Connection interrupted. Please try again.',
    modelConnectionFailed: 'Could not connect to the model service. Make sure vLLM is running.', modelCannotProcess: 'The model could not process this video. Try a shorter MP4 or a direct video URL.',
    genericFailure: 'An error occurred during analysis. Please try again.', emptyAnswer: 'The model returned no answer. Try asking a different question.',
    questionTooLong: 'Keep the question under 4,000 characters.', invalidInput: 'Choose one MP4 file, video URL, or saved video.',
    invalidUrl: 'The video URL must start with https:// or http://.', missingVideo: 'The local video file is missing.', missingHistory: 'This history record does not exist.'
  }
};
let language = localStorage.getItem('qwen-video-language') === 'en' ? 'en' : 'zh';
let answerLanguageManuallySet = false;
let maxUploadMb = 500;
let healthState = null;
let metaState = {key: 'resultIntro', data: {}};
let currentError = null;
const t = (key, data = {}) => (translations[language][key] || key).replace(/\{(\w+)\}/g, (_, name) => data[name] ?? '');

function setMeta(key, data = {}) {
  metaState = {key, data};
  $('result-meta').textContent = t(key, data);
}

function localizeError(message) {
  const known = {};
  for (const dictionary of Object.values(translations)) {
    for (const key of ['chooseVideo', 'enterUrl', 'enterQuestion', 'analysisFailed', 'noStream', 'interrupted', 'modelConnectionFailed', 'modelCannotProcess', 'genericFailure', 'emptyAnswer', 'questionTooLong', 'invalidInput', 'invalidUrl', 'missingVideo', 'missingHistory']) known[dictionary[key]] = key;
  }
  known['目前只支持 MP4 文件。'] = 'chooseVideo';
  known['视频文件为空。'] = 'chooseVideo';
  if (known[message]) return t(known[message]);
  const limit = message.match(/^文件不能超过 (\d+) MB。$/);
  if (limit) return language === 'en' ? `The file cannot exceed ${limit[1]} MB.` : message;
  const status = message.match(/^模型服务返回错误（HTTP (\d+)）。$/);
  if (status) return language === 'en' ? `Model service error (HTTP ${status[1]}).` : message;
  return message;
}

function renderHealth() {
  const status = $('status');
  status.classList.toggle('online', healthState?.online === true);
  status.classList.toggle('offline', Boolean(healthState?.online === false || healthState?.error));
  $('status-text').textContent = healthState?.error ? t('connectionFailed')
    : healthState ? (healthState.online ? t('modelOnline', {model: healthState.model}) : t('modelOffline'))
      : t('checkingModel');
}

function applyLanguage() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.title = t('pageTitle');
  document.querySelectorAll('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach((element) => { element.setAttribute('aria-label', t(element.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  const switchButton = $('language-switch');
  switchButton.textContent = language === 'zh' ? 'EN' : '中文';
  switchButton.setAttribute('aria-label', language === 'zh' ? 'Switch to English' : '切换到中文');
  if (question.value === translations.zh.defaultQuestion || question.value === translations.en.defaultQuestion) question.value = t('defaultQuestion');
  if (!answerLanguageManuallySet && !button.disabled) answerLanguage.value = language;
  if (sourceMode === 'upload' && !activeHistoryId) {
    if (fileInput.files?.[0]) $('drop-subtitle').textContent = t('selectedFile');
    else { $('drop-title').textContent = t('dropTitle'); $('drop-subtitle').textContent = t('dropHint', {max: maxUploadMb}); }
  } else if (activeHistoryId && sourceMode === 'upload') $('drop-subtitle').textContent = t('savedFile');
  if (!preview.hidden && (sourceMode === 'url' || activeHistoryId)) $('preview-size').textContent = t(activeHistoryId && sourceMode === 'upload' ? 'localHistory' : 'videoUrl');
  $('button-label').textContent = t(button.disabled ? 'analyzingButton' : 'analyzeButton');
  $('result-meta').textContent = t(metaState.key, metaState.data);
  if (currentError !== null) $('error-state').textContent = localizeError(currentError);
  document.querySelectorAll('.answer-timestamp').forEach((element) => element.setAttribute('aria-label', t('jumpTo', {time: element.textContent})));
  renderHealth();
  if (!$('history-drawer').hidden) refreshHistory().catch(() => { $('history-list').textContent = t('historyLoadError'); });
}
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
    jump.setAttribute('aria-label', t('jumpTo', {time: match[0]}));
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
    $('drop-subtitle').textContent = t('selectedFile');
    preview.hidden = false;
  } else if (sourceMode === 'url' && /^https?:\/\//i.test(videoUrl.value.trim())) {
    const url = videoUrl.value.trim();
    previewVideo.src = url;
    $('preview-name').textContent = url;
    $('preview-size').textContent = t('videoUrl');
    preview.hidden = false;
  } else {
    $('drop-title').textContent = t('dropTitle');
    $('drop-subtitle').textContent = t('dropHint', {max: maxUploadMb});
  }
}

async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    maxUploadMb = data.max_upload_mb;
    healthState = data;
    if (sourceMode === 'upload' && !fileInput.files?.[0] && !activeHistoryId) $('drop-subtitle').textContent = t('dropHint', {max: maxUploadMb});
  } catch {
    healthState = {error: true};
  }
  renderHealth();
}

function showResult(kind, text) {
  $('empty-state').hidden = kind !== 'empty';
  $('loading-state').hidden = kind !== 'loading';
  $('answer').hidden = kind !== 'answer' && kind !== 'typing';
  $('answer').classList.toggle('typing', kind === 'typing');
  $('error-state').hidden = kind !== 'error';
  if (kind === 'answer') renderAnswer(text);
  if (kind === 'typing') $('answer').textContent = text;
  if (kind === 'error') {
    currentError = text;
    $('error-state').textContent = localizeError(text);
  } else currentError = null;
}

async function analyze() {
  const file = fileInput.files?.[0];
  const url = videoUrl.value.trim();
  if (sourceMode === 'upload' && !file && !activeHistoryId) {
    showResult('error', t('chooseVideo'));
    return;
  }
  if (sourceMode === 'url' && !url && !activeHistoryId) {
    showResult('error', t('enterUrl'));
    return;
  }
  if (!question.value.trim()) {
    showResult('error', t('enterQuestion'));
    return;
  }
  if (sourceMode === 'url' && !activeHistoryId) updatePreview();
  lastSyncedTimestamp = null;
  const body = new FormData();
  body.append('question', question.value.trim());
  body.append('answer_language', answerLanguage.value);
  body.append('save_history', String($('save-history').checked));
  if (activeHistoryId) body.append('history_id', activeHistoryId);
  else if (sourceMode === 'upload') body.append('file', file);
  else body.append('video_url', url);

  button.disabled = true;
  answerLanguage.disabled = true;
  $('button-label').textContent = t('analyzingButton');
  setMeta('processing');
  $('elapsed').textContent = '0';
  showResult('loading');
  const started = Date.now();
  elapsedTimer = setInterval(() => { $('elapsed').textContent = String(Math.floor((Date.now() - started) / 1000)); }, 1000);
  let streamReader = null;
  try {
    const response = await fetch('/api/analyze/stream', { method: 'POST', body });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || t('analysisFailed'));
    }
    if (!response.body) throw new Error(t('noStream'));
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
            setMeta('streaming');
          }
          $('answer').textContent += event.text;
          syncStreamingTimestamp($('answer').textContent);
        } else if (event.type === 'error') {
          throw new Error(event.message || t('analysisFailed'));
        } else if (event.type === 'done') {
          finished = true;
          showResult('answer', event.answer);
          setMeta('resultDone', {model: event.model, seconds: event.seconds});
          if (event.history_id) {
            activeHistoryId = event.history_id;
            refreshHistory().catch(() => {});
          }
        }
      }
    }
    if (!finished) throw new Error(t('interrupted'));
  } catch (error) {
    showResult('error', error.message || t('analysisFailed'));
    setMeta('resultFailed');
  } finally {
    if (streamReader) streamReader.cancel().catch(() => {});
    clearInterval(elapsedTimer);
    button.disabled = false;
    answerLanguage.disabled = false;
    if (!answerLanguageManuallySet) answerLanguage.value = language;
    $('button-label').textContent = t('analyzeButton');
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
  if (!response.ok) throw new Error(t('historyLoadError'));
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
    empty.textContent = t('historyEmpty');
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
    date.textContent = new Intl.DateTimeFormat(language === 'en' ? 'en-US' : 'zh-CN', {dateStyle:'medium', timeStyle:'short'}).format(new Date(item.created_at));
    const title = document.createElement('strong');
    title.textContent = item.question;
    const file = document.createElement('span');
    file.className = 'history-file';
    file.textContent = `${t(item.source_type === 'upload' ? 'localVideo' : 'videoUrl')} · ${item.filename}`;
    const excerpt = document.createElement('p');
    excerpt.textContent = item.answer.slice(0, 110);
    copy.append(date, title, file, excerpt);
    open.append(cover, copy);
    open.addEventListener('click', () => openHistoryItem(item.id));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'history-delete';
    remove.textContent = t('delete');
    remove.setAttribute('aria-label', t('deleteAria', {question: item.question}));
    remove.addEventListener('click', async () => {
      if (!confirm(t('deleteConfirm'))) return;
      const result = await fetch(`/api/history/${item.id}`, {method:'DELETE'});
      if (!result.ok) { alert(t('deleteFailed')); return; }
      if (activeHistoryId === item.id) {
        activeHistoryId = null;
        updatePreview();
        showResult('empty');
        setMeta('resultIntro');
      }
      refreshHistory().catch(() => { $('history-list').textContent = t('historyLoadError'); });
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
    if (!response.ok) throw new Error(t('historyOpenError'));
    const item = await response.json();
    setMode(item.source_type === 'upload' ? 'upload' : 'url');
    fileInput.value = '';
    videoUrl.value = item.video_url || '';
    activeHistoryId = item.id;
    question.value = item.question;
    if (item.source_type === 'upload') {
      $('drop-title').textContent = item.filename;
      $('drop-subtitle').textContent = t('savedFile');
    }
    previewVideo.src = item.video_src;
    pendingSeekSeconds = null;
    lastSyncedTimestamp = null;
    $('preview-name').textContent = item.filename;
    $('preview-size').textContent = t(item.source_type === 'upload' ? 'localHistory' : 'videoUrl');
    preview.hidden = false;
    showResult('answer', item.answer);
    setMeta('resultHistory', {model: item.model, seconds: item.seconds});
    closeHistory();
    document.querySelector('.result-panel').scrollIntoView({behavior:'smooth', block:'start'});
  } catch (error) {
    $('history-list').textContent = error.message;
  }
}

$('upload-tab').addEventListener('click', () => setMode('upload'));
$('url-tab').addEventListener('click', () => setMode('url'));
answerLanguage.addEventListener('change', () => { answerLanguageManuallySet = true; });
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
document.querySelectorAll('[data-question-key]').forEach((item) => item.addEventListener('click', () => { question.value = t(`${item.dataset.questionKey}Question`); question.focus(); }));
button.addEventListener('click', analyze);
$('language-switch').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh';
  localStorage.setItem('qwen-video-language', language);
  applyLanguage();
});
$('history-button').addEventListener('click', () => {
  $('history-drawer').hidden = false;
  $('history-scrim').hidden = false;
  document.body.classList.add('drawer-open');
  refreshHistory().catch(() => { $('history-list').textContent = t('historyLoadError'); });
});
$('history-close').addEventListener('click', closeHistory);
$('history-scrim').addEventListener('click', closeHistory);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !$('history-drawer').hidden) closeHistory(); });
applyLanguage();
checkHealth();
refreshHistory().catch(() => {});
setInterval(checkHealth, 15000);
