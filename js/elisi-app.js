const byId = (id) => document.getElementById(id);

const state = {
  final: null,
  rounds: [],
  score: null,
};

const runButton = byId('runButton');
const statusText = byId('statusText');
const manualToggle = byId('manualToggle');
const urlInput = byId('urlInput');
const manualTitle = byId('manualTitle');
const manualContent = byId('manualContent');

const renderRounds = () => {
  const container = byId('roundsContainer');
  container.innerHTML = '';
  if (!state.rounds.length) {
    container.innerHTML = '<article class="card"><p class="muted">暂无轮次</p></article>';
    return;
  }

  state.rounds.forEach((round) => {
    const card = document.createElement('article');
    card.className = 'card';
    const lowest = round.score?.lowest_dimensions?.join(', ') || '—';
    card.innerHTML = `
      <p class="badge">Round ${round.round}</p>
      <h3>总分：${round.total}</h3>
      <p class="muted">最低维度：${lowest}</p>
    `;
    container.appendChild(card);
  });
};

const renderOutput = () => {
  byId('resultTitle').textContent = state.final?.title || '—';
  byId('resultContent').textContent = state.final?.content || '—';
  byId('scoreReport').textContent = state.score ? JSON.stringify(state.score, null, 2) : '—';

  const promptList = byId('promptList');
  promptList.innerHTML = '';
  const prompts = state.final?.image_prompts || [];
  if (!prompts.length) {
    promptList.innerHTML = '<p class="muted">暂无图片 Prompt</p>';
    return;
  }
  prompts.forEach((prompt, index) => {
    const item = document.createElement('div');
    item.className = 'prompt-item';
    item.innerHTML = `
      <div>
        <p class="badge">Prompt ${index + 1}</p>
        <pre class="code-block">${typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2)}</pre>
      </div>
      <button class="btn ghost" data-copy="prompt-${index}">复制</button>
    `;
    promptList.appendChild(item);
  });
};

const setStatus = (message) => {
  statusText.textContent = message;
};

const gatherSettings = () => ({
  language: 'zh',
  diff_level: byId('diffLevel').value,
  elisi_strength: byId('elisiStrength').value,
  image_count: Number(byId('imageCount').value),
  xhs_no_markdown: true,
});

const gatherLoop = () => ({
  threshold: Number(byId('scoreThreshold').value) || 85,
  max_rounds: Number(byId('maxRounds').value) || 3,
});

const buildPayload = () => {
  const manualMode = manualToggle.checked;
  const url = urlInput.value.trim();
  const raw = manualMode
    ? {
        title: manualTitle.value.trim(),
        text: manualContent.value.trim(),
      }
    : null;

  return {
    url: manualMode ? null : url,
    raw: manualMode ? raw : null,
    settings: gatherSettings(),
    loop: gatherLoop(),
  };
};

const runPipeline = async () => {
  setStatus('正在生成...');
  runButton.disabled = true;

  try {
    const payload = buildPayload();
    if (!payload.url && !payload.raw?.text) {
      setStatus('请填写链接或手动内容');
      return;
    }

    const response = await fetch('/api/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`接口错误 ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) {
      setStatus(data.message || data.error || '生成失败');
      return;
    }

    state.final = data.final;
    state.rounds = data.rounds || [];
    state.score = state.rounds[state.rounds.length - 1]?.score || null;
    renderRounds();
    renderOutput();
    setStatus('生成完成');
  } catch (error) {
    setStatus(error.message || '无法连接接口，请确认已运行 node server.js');
  } finally {
    runButton.disabled = false;
  }
};

const copyText = async (text) => {
  if (!text) return;
  await navigator.clipboard.writeText(text);
};

manualToggle.addEventListener('change', () => {
  const isManual = manualToggle.checked;
  urlInput.disabled = isManual;
  manualTitle.disabled = !isManual;
  manualContent.disabled = !isManual;
});

runButton.addEventListener('click', runPipeline);

document.addEventListener('click', (event) => {
  const target = event.target.closest('[data-copy]');
  if (!target) return;
  const type = target.dataset.copy;
  if (type === 'title') return copyText(state.final?.title);
  if (type === 'content') return copyText(state.final?.content);
  if (type === 'prompts') return copyText(JSON.stringify(state.final?.image_prompts || [], null, 2));
  if (type.startsWith('prompt-')) {
    const index = Number(type.replace('prompt-', ''));
    const prompt = state.final?.image_prompts?.[index];
    const text = typeof prompt === 'string' ? prompt : JSON.stringify(prompt, null, 2);
    return copyText(text);
  }
});

manualToggle.dispatchEvent(new Event('change'));
renderRounds();
renderOutput();
