const byId = (id) => document.getElementById(id);

const state = {
  images: [],
  ocrTexts: [],
  markdown: '',
  cards: [],
};

const urlInput = byId('urlInput');
const fetchButton = byId('fetchButton');
const manualImages = byId('manualImages');
const imageUpload = byId('imageUpload');
const imagesContainer = byId('imagesContainer');
const ocrButton = byId('ocrButton');
const ocrStatus = byId('ocrStatus');
const ocrResults = byId('ocrResults');
const statusText = byId('statusText');
const rewriteButton = byId('rewriteButton');
const markdownOutput = byId('markdownOutput');
const buildCardsButton = byId('buildCardsButton');
const cardsContainer = byId('cardsContainer');
const downloadAllButton = byId('downloadAllButton');

const diffLevel = byId('diffLevel');
const elisiStrength = byId('elisiStrength');
const imageCount = byId('imageCount');
const apiKeyInput = byId('apiKeyInput');
const apiBaseInput = byId('apiBaseInput');
const apiModelInput = byId('apiModelInput');

const uniqueList = (list) => Array.from(new Set(list.filter(Boolean)));

const setStatus = (message) => {
  if (statusText) statusText.textContent = message;
};

const renderImages = () => {
  imagesContainer.innerHTML = '';
  if (!state.images.length) {
    imagesContainer.innerHTML = '<p class="muted">暂无图片</p>';
    return;
  }

  state.images.forEach((url, index) => {
    const item = document.createElement('div');
    item.className = 'image-item';
    item.innerHTML = `
      <div class="image-thumb">
        <img src="${url}" alt="image-${index + 1}" />
      </div>
      <p class="muted">${url.startsWith('data:') ? '上传截图' : url}</p>
    `;
    imagesContainer.appendChild(item);
  });
};

const renderOcrResults = () => {
  ocrResults.innerHTML = '';
  if (!state.ocrTexts.length) {
    ocrResults.innerHTML = '<p class="muted">暂无 OCR 结果</p>';
    return;
  }

  state.ocrTexts.forEach((text, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'ocr-item';
    wrapper.innerHTML = `
      <label class="label">图片 ${index + 1}</label>
      <textarea class="textarea" data-ocr-index="${index}" rows="4">${text}</textarea>
    `;
    ocrResults.appendChild(wrapper);
  });
};

const renderCards = () => {
  cardsContainer.innerHTML = '';
  if (!state.cards.length) {
    cardsContainer.innerHTML = '<article class="card"><p class="muted">暂无卡片</p></article>';
    return;
  }

  state.cards.forEach((card, index) => {
    const item = document.createElement('article');
    item.className = 'card card-editor';
    item.innerHTML = `
      <p class="badge">Card ${index + 1}</p>
      <textarea class="textarea" data-card-index="${index}" rows="6">${card}</textarea>
      <div class="card-actions">
        <button class="btn ghost" data-download-card="${index}">下载该卡片</button>
      </div>
    `;
    cardsContainer.appendChild(item);
  });
};

const gatherSettings = () => ({
  diff_level: diffLevel?.value || 'medium',
  elisi_strength: elisiStrength?.value || 'soft',
  image_count: Number(imageCount?.value || 6),
  ai: {
    api_key: apiKeyInput?.value.trim(),
    api_base: apiBaseInput?.value.trim(),
    model: apiModelInput?.value.trim(),
  },
});

const collectManualImages = () => {
  const manualList = manualImages.value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  state.images = uniqueList([...state.images, ...manualList]);
};

const handleFetchImages = async () => {
  const url = urlInput.value.trim();
  collectManualImages();

  if (!url) {
    renderImages();
    return;
  }

  fetchButton.disabled = true;
  setStatus('正在抓取图片...');

  try {
    const response = await fetch('/api/xhs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || '抓取失败');
    }
    state.images = uniqueList([...state.images, ...data.images]);
    setStatus('抓取完成');
  } catch (error) {
    setStatus(error.message || '无法抓取链接，已保留手动图片');
  } finally {
    fetchButton.disabled = false;
    renderImages();
  }
};

const handleUpload = () => {
  const files = Array.from(imageUpload.files || []);
  if (!files.length) return;

  files.forEach((file) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      state.images = uniqueList([...state.images, event.target.result]);
      renderImages();
    };
    reader.readAsDataURL(file);
  });
};

const runOcr = async () => {
  collectManualImages();
  if (!state.images.length) {
    ocrStatus.textContent = '请先添加图片';
    renderImages();
    return;
  }

  ocrButton.disabled = true;
  ocrStatus.textContent = 'OCR 处理中...';

  try {
    const response = await fetch('/api/ocr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images: state.images, settings: gatherSettings() }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || 'OCR 失败');
    }
    state.ocrTexts = data.texts || [];
    ocrStatus.textContent = data.notice || 'OCR 完成';
  } catch (error) {
    ocrStatus.textContent = error.message || 'OCR 无法完成';
  } finally {
    ocrButton.disabled = false;
    renderOcrResults();
  }
};

const buildMarkdown = (draft) => {
  const title = draft?.title || '未命名标题';
  const content = draft?.content || '';
  const prompts = draft?.image_prompts || [];
  const promptBlock = prompts.length
    ? `\n\n## 图片卡片提示\n${prompts.map((prompt, index) => `- ${index + 1}. ${prompt}`).join('\n')}`
    : '';

  return `# ${title}\n\n${content}${promptBlock}`.trim();
};

const runRewrite = async () => {
  const combinedOcr = Array.from(document.querySelectorAll('[data-ocr-index]'))
    .map((node) => node.value.trim())
    .filter(Boolean)
    .join('\n\n');

  if (!combinedOcr) {
    setStatus('请先完成 OCR 或手动补充文本');
    return;
  }

  rewriteButton.disabled = true;
  setStatus('正在生成 Markdown...');

  try {
    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw: { text: combinedOcr },
        settings: gatherSettings(),
        loop: { threshold: 85, max_rounds: 2 },
      }),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      throw new Error(data.message || '生成失败');
    }
    state.markdown = buildMarkdown(data.final);
    markdownOutput.value = state.markdown;
    setStatus('生成完成');
  } catch (error) {
    setStatus(error.message || '无法调用 AI');
  } finally {
    rewriteButton.disabled = false;
  }
};

const splitMarkdownToCards = (markdown) => {
  return markdown
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
};

const buildCards = () => {
  const markdown = markdownOutput.value.trim();
  if (!markdown) {
    setStatus('请先生成 Markdown');
    return;
  }
  state.cards = splitMarkdownToCards(markdown);
  renderCards();
};

const downloadText = (filename, content) => {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

fetchButton?.addEventListener('click', handleFetchImages);
imageUpload?.addEventListener('change', handleUpload);
ocrButton?.addEventListener('click', runOcr);
rewriteButton?.addEventListener('click', runRewrite);
buildCardsButton?.addEventListener('click', buildCards);
downloadAllButton?.addEventListener('click', () => {
  const content = state.cards.join('\n\n');
  if (!content) {
    setStatus('暂无可下载卡片');
    return;
  }
  downloadText('elisi-cards.md', content);
});

document.addEventListener('input', (event) => {
  const ocrNode = event.target.closest('[data-ocr-index]');
  if (ocrNode) {
    const index = Number(ocrNode.dataset.ocrIndex);
    state.ocrTexts[index] = ocrNode.value;
  }

  const cardNode = event.target.closest('[data-card-index]');
  if (cardNode) {
    const index = Number(cardNode.dataset.cardIndex);
    state.cards[index] = cardNode.value;
  }
});

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-download-card]');
  if (!target) return;
  const index = Number(target.dataset.downloadCard);
  const content = state.cards[index];
  if (!content) return;
  downloadText(`elisi-card-${index + 1}.md`, content);
});

renderImages();
renderOcrResults();
renderCards();
