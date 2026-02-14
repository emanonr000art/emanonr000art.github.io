const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const { chromium } = require('playwright');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'video_jobs.sqlite');
const PROMPTS_PATH = path.join(__dirname, 'prompts.json');
const PORT = process.env.PORT || 4000;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const OPENAI_API_BASE = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);
const promptPack = fs.existsSync(PROMPTS_PATH)
  ? JSON.parse(fs.readFileSync(PROMPTS_PATH, 'utf8'))
  : null;

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS video_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      provider TEXT,
      provider_job_id TEXT,
      status TEXT,
      input_script TEXT,
      style_params TEXT,
      output_video_url TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

const runQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function runCallback(err) {
      if (err) {
        reject(err);
      } else {
        resolve(this);
      }
    });
  });

const getQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });

const allQuery = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });

class VideoProvider {
  async createJob() {
    throw new Error('createJob not implemented');
  }

  async getJobStatus() {
    throw new Error('getJobStatus not implemented');
  }
}

class MockVideoProvider extends VideoProvider {
  constructor() {
    super();
    this.jobs = new Map();
  }

  async createJob(params) {
    const jobId = crypto.randomUUID();
    const now = Date.now();
    this.jobs.set(jobId, {
      createdAt: now,
      params,
    });
    return { jobId };
  }

  async getJobStatus(jobId) {
    const record = this.jobs.get(jobId);

    if (!record) {
      return { status: 'failed', errorMessage: 'Unknown job in provider' };
    }

    const elapsed = (Date.now() - record.createdAt) / 1000;

    if (elapsed < 4) {
      return { status: 'running' };
    }

    if (elapsed < 12) {
      return { status: 'running' };
    }

    return {
      status: 'succeeded',
      videoUrl: `https://videos.example.com/${jobId}.mp4`,
    };
  }
}

const provider = new MockVideoProvider();
const app = express();

app.use(express.json());
app.use(express.static(__dirname));

const renderTemplate = (template, variables) =>
  template.replace(/{{\\s*(\\w+)\\s*}}/g, (_, key) => String(variables[key] ?? ''));

const resolveAiConfig = (settings = {}) => ({
  apiKey: settings?.ai?.api_key || settings?.api_key || OPENAI_API_KEY,
  apiBase: settings?.ai?.api_base || OPENAI_API_BASE,
  model: settings?.ai?.model || OPENAI_MODEL,
});

const callOpenAI = async (messages, aiConfig = {}) => {
  const apiKey = aiConfig.apiKey || OPENAI_API_KEY;
  const apiBase = aiConfig.apiBase || OPENAI_API_BASE;
  const model = aiConfig.model || OPENAI_MODEL;

  if (!apiKey) return null;

  const response = await fetch(`${apiBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI request failed: ${errorText}`);
  }

  const payload = await response.json();
  return payload.choices?.[0]?.message?.content?.trim() || '';
};

const sanitizeText = (value) => (typeof value === 'string' ? value.replace(/[\\r\\t]+/g, ' ').trim() : '');
const uniqueList = (items = []) => Array.from(new Set(items.filter(Boolean)));

const mockGenerateDraft = (raw, settings = {}) => {
  const title = raw.title || '我把爆款方法拆成了 10 分钟小任务，真的坚持下来了';
  const baseContent = raw.content || raw.text || '';
  const corePoints = [
    '拆解方法为小步骤',
    '先给出结果和感受',
    '场景化描述',
    '加入反常识观点',
    '引导收藏与评论',
    '加入复盘细节',
    '强调持续执行',
    '自然植入 Elisi',
  ];
  const paragraphs = [
    `最近我也被“效率焦虑”折磨得不行，直到把方法拆成每天 10 分钟的小任务，才终于看到变化。`,
    `我会先在早上 7:30 做一个 10 分钟的“最小动作”，比如把当天要做的 3 件事写出来，然后只选 1 件先完成。`,
    `反常识的一点是：不是先追求完美，而是先把节奏拉起来，哪怕只做 10 分钟，身体会记住这个节奏。`,
    `我现在用 Elisi 这种一体化规划工具，把任务、习惯、目标放在同一页，每天只看一个清单，不容易跑偏。`,
    `如果你也卡在“计划很多但执行不了”，先试一周最小动作，再来评论区告诉我你的卡点。`,
  ];
  const content = baseContent ? `${baseContent}\\n\\n${paragraphs.join('\\n\\n')}` : paragraphs.join('\\n\\n');
  const imageCount = Number(settings.image_count) || 6;
  const imagePrompts = Array.from({ length: imageCount }).map((_, index) => `排版文字图 ${index + 1}：强调关键步骤与结果对比，中文黑体清晰可读。`);

  return {
    title,
    content,
    image_prompts: imagePrompts,
    meta: {
      logic_template: { summary: '爆款骨架复刻 + 个人体验 + 方法拆解 + 行动引导' },
      core_points: corePoints,
      elisi_injection_points: ['方法拆解后工具承接', '复盘与提醒'],
    },
  };
};

const scoreDraftHeuristic = (draft) => {
  const content = `${draft.title}\\n${draft.content}`;
  const hasNumbers = /\\d/.test(content);
  const hasCTA = /(收藏|评论|关注|私信)/.test(content);
  const hasEmotion = /(崩溃|松一口气|终于|焦虑)/.test(content);
  const lengthFactor = Math.min(1, content.length / 400);
  const base = 70 + Math.round(lengthFactor * 10);
  const bump = (flag) => (flag ? 6 : 0);
  const dimensions = {
    attention: { score: base + bump(hasNumbers), why: '标题与开头具备一定吸引力', fix: ['加入更强的结果前置', '强化对比感'] },
    relevance: { score: base, why: '目标人群与痛点匹配', fix: ['补充更具体的场景', '明确适用人群'] },
    empathy: { score: base + bump(hasEmotion), why: '第一人称叙述具备共鸣', fix: ['补充情绪细节', '加入真实小动作'] },
    value: { score: base, why: '包含可执行步骤', fix: ['加一个更清晰的 SOP', '增加注意事项'] },
    trust: { score: base - 8, why: '可信细节不足', fix: ['增加周期/频率', '补充前后对比'] },
    reasoning: { score: base, why: '有一定解释闭环', fix: ['加入反常识观点', '解释为什么有效'] },
    action: { score: base + bump(hasCTA), why: '行动引导存在', fix: ['增加收藏引导', '加入评论提问'] },
  };
  const total = Math.round(
    (dimensions.attention.score * 0.15)
      + (dimensions.relevance.score * 0.15)
      + (dimensions.empathy.score * 0.15)
      + (dimensions.value.score * 0.15)
      + (dimensions.trust.score * 0.1)
      + (dimensions.reasoning.score * 0.15)
      + (dimensions.action.score * 0.15)
  );
  const sorted = Object.entries(dimensions)
    .sort(([, a], [, b]) => a.score - b.score)
    .slice(0, 2)
    .map(([key]) => key);
  return { total, dimensions, lowest_dimensions: sorted };
};

const rewriteDraftHeuristic = (draft, focus = []) => {
  const additions = [];
  if (focus.includes('trust')) {
    additions.push('我给自己设了 14 天的追踪周期，每晚睡前在 Elisi 做一次复盘，能清楚看到哪些动作更有效。');
  }
  if (focus.includes('attention')) {
    additions.push('最让我意外的是，只调整 10 分钟的起步动作，就能把一整天的效率拉回正轨。');
  }
  if (focus.includes('action')) {
    additions.push('如果你也想要我用的模板，评论区打“模板”，我整理给你。');
  }
  const content = `${draft.content}\\n\\n${additions.join('\\n\\n')}`.trim();
  return { ...draft, content };
};

const normalizeScoreResponse = (score) => ({
  ok: true,
  score: {
    total: score.total,
    dimensions: score.dimensions,
    lowest_dimensions: score.lowest_dimensions,
  },
});

const normalizeDraftResponse = (draft) => ({
  ok: true,
  draft,
});

app.post('/api/videos', async (req, res) => {
  const {
    script,
    duration,
    aspect_ratio: aspectRatio,
    style,
    voice_lang: voiceLang,
    voice_type: voiceType,
    template_id: templateId,
    user_id: userId,
  } = req.body || {};

  if (!script || typeof script !== 'string') {
    return res.status(400).json({ error: 'script is required' });
  }

  const styleParams = {
    duration: duration || '',
    aspect_ratio: aspectRatio || '',
    style: style || '',
    voice_lang: voiceLang || '',
    voice_type: voiceType || '',
    template_id: templateId || '',
  };

  try {
    const insertResult = await runQuery(
      `INSERT INTO video_jobs (user_id, provider, status, input_script, style_params) VALUES (?, ?, ?, ?, ?)`,
      [userId || null, 'mock', 'pending', script, JSON.stringify(styleParams)]
    );

    const jobId = insertResult.lastID;

    try {
      const providerResult = await provider.createJob({
        script,
        duration,
        aspectRatio,
        style,
        voiceLang,
        voiceType,
        templateId,
      });

      await runQuery(
        `UPDATE video_jobs SET provider_job_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [providerResult.jobId, 'running', jobId]
      );

      return res.json({ job_id: jobId, status: 'running' });
    } catch (providerError) {
      await runQuery(
        `UPDATE video_jobs SET status = ?, error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ['failed', providerError.message, jobId]
      );
      return res.status(502).json({ job_id: jobId, status: 'failed', error: providerError.message });
    }
  } catch (err) {
    return res.status(500).json({ error: 'failed to create job', detail: err.message });
  }
});

app.get('/api/videos/:jobId', async (req, res) => {
  const { jobId } = req.params;

  try {
    const job = await getQuery(`SELECT * FROM video_jobs WHERE id = ?`, [jobId]);

    if (!job) {
      return res.status(404).json({ error: 'job not found' });
    }

    return res.json({
      job_id: job.id,
      status: job.status,
      provider: job.provider,
      provider_job_id: job.provider_job_id,
      video_url: job.output_video_url || undefined,
      error: job.error_message || undefined,
      style_params: job.style_params ? JSON.parse(job.style_params) : undefined,
      input_script: job.input_script,
    });
  } catch (err) {
    return res.status(500).json({ error: 'failed to fetch job', detail: err.message });
  }
});

app.post('/api/parse', async (req, res) => {
  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ ok: false, error: 'INVALID_URL', message: 'url is required', fallback: { allow_manual_input: true } });
  }
  return res.status(502).json({
    ok: false,
    error: 'PARSE_FAILED',
    message: '当前解析服务未接入或被反爬拦截，请使用手动输入。',
    fallback: { allow_manual_input: true },
  });
});

app.post('/api/manual_raw', async (req, res) => {
  const { title, content, text, images = [] } = req.body || {};
  const mergedContent = content || text;
  if (!mergedContent || typeof mergedContent !== 'string') {
    return res.status(400).json({ ok: false, error: 'CONTENT_REQUIRED', message: 'content is required' });
  }
  return res.json({
    ok: true,
    raw: {
      source_url: null,
      title: sanitizeText(title),
      text: sanitizeText(mergedContent),
      paragraphs: sanitizeText(mergedContent).split(/\n+/).filter(Boolean),
      tags: [],
      images,
      video: null,
    },
  });
});

const buildDraftWithOpenAI = async (raw, settings = {}, aiConfig = {}) => {
  const system = promptPack.system_base;
  const logicPrompt = renderTemplate(promptPack.extract_logic.prompt, {
    title: raw.title || '',
    content: raw.text || raw.content || '',
    tags: (raw.tags || []).join(' '),
  });
  const logicText = await callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: logicPrompt },
  ], aiConfig);
  const generatePrompt = renderTemplate(promptPack.generate_draft.prompt, {
    logic_template: logicText,
    core_points: JSON.stringify(raw.core_points || []),
  });
  const draftText = await callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: generatePrompt },
  ], aiConfig);
  const [draftTitle, ...rest] = draftText.split(/\n+/).filter(Boolean);
  const content = rest.join('\n\n');
  const imagePrompt = renderTemplate(promptPack.image_prompt_gen.prompt, {
    image_count: settings.image_count || 6,
    title: draftTitle,
    content,
  });
  const imagePromptText = await callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: imagePrompt },
  ], aiConfig);
  let imagePrompts = [];
  try {
    imagePrompts = JSON.parse(imagePromptText);
  } catch {
    imagePrompts = [imagePromptText];
  }
  return normalizeDraftResponse({
    title: draftTitle || raw.title || '未命名标题',
    content: content || draftText,
    image_prompts: imagePrompts,
    meta: {
      logic_template: logicText,
      core_points: raw.core_points || [],
      elisi_injection_points: ['工具植入', '复盘提醒'],
    },
  });
};

const scoreDraftWithOpenAI = async (draft, aiConfig = {}) => {
  const system = promptPack.system_base;
  const scorePrompt = renderTemplate(promptPack.score_rubric.prompt, {
    title: draft.title || '',
    content: draft.content || '',
  });
  const scoreText = await callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: scorePrompt },
  ], aiConfig);
  return { ok: true, score: JSON.parse(scoreText) };
};

const rewriteDraftWithOpenAI = async (raw, draft, score, settings, aiConfig = {}) => {
  const system = promptPack.system_base;
  const rewritePrompt = renderTemplate(promptPack.rewrite_focus.prompt, {
    target_total: settings.target_total || 85,
    focus_dimensions: (settings.focus_dimensions || []).join(', '),
    title: draft.title || '',
    content: draft.content || '',
    score_report: JSON.stringify(score),
    core_points: JSON.stringify(raw?.core_points || []),
  });
  const rewriteText = await callOpenAI([
    { role: 'system', content: system },
    { role: 'user', content: rewritePrompt },
  ], aiConfig);
  const [newTitle, ...rest] = rewriteText.split(/\n+/).filter(Boolean);
  return {
    ok: true,
    draft: {
      title: newTitle || draft.title,
      content: rest.join('\n\n') || draft.content,
      image_prompts: draft.image_prompts || [],
      meta: draft.meta || {},
    },
    change_log: {
      focus_dimensions: settings.focus_dimensions || [],
      changes: ['已根据低分维度增强内容'],
    },
  };
};

const generateDraft = async (raw, settings) => {
  const aiConfig = resolveAiConfig(settings);
  if (promptPack && aiConfig.apiKey) {
    return buildDraftWithOpenAI(raw, settings, aiConfig);
  }
  return normalizeDraftResponse(mockGenerateDraft(raw, settings));
};

const scoreDraft = async (draft, settings = {}) => {
  const aiConfig = resolveAiConfig(settings);
  if (promptPack && aiConfig.apiKey) {
    return scoreDraftWithOpenAI(draft, aiConfig);
  }
  return normalizeScoreResponse(scoreDraftHeuristic(draft));
};

const rewriteDraft = async (raw, draft, score, settings) => {
  const aiConfig = resolveAiConfig(settings);
  if (promptPack && aiConfig.apiKey) {
    return rewriteDraftWithOpenAI(raw, draft, score, settings, aiConfig);
  }
  return {
    ok: true,
    draft: rewriteDraftHeuristic(draft, settings.focus_dimensions || []),
    change_log: {
      focus_dimensions: settings.focus_dimensions || [],
      changes: ['添加可信细节与行动引导'],
    },
  };
};

app.post('/api/generate', async (req, res) => {
  const { raw, settings = {} } = req.body || {};
  if (!raw) {
    return res.status(400).json({ ok: false, error: 'RAW_REQUIRED', message: 'raw is required' });
  }

  try {
    return res.json(await generateDraft(raw, settings));
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'GENERATE_FAILED', message: err.message });
  }
});

app.post('/api/score', async (req, res) => {
  const { draft, settings = {} } = req.body || {};
  if (!draft) {
    return res.status(400).json({ ok: false, error: 'DRAFT_REQUIRED', message: 'draft is required' });
  }

  try {
    return res.json(await scoreDraft(draft, settings));
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'SCORE_FAILED', message: err.message });
  }
});

app.post('/api/rewrite', async (req, res) => {
  const { raw, draft, score, settings = {} } = req.body || {};
  if (!draft || !score) {
    return res.status(400).json({ ok: false, error: 'INPUT_REQUIRED', message: 'draft and score are required' });
  }

  try {
    return res.json(await rewriteDraft(raw, draft, score, settings));
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'REWRITE_FAILED', message: err.message });
  }
});

const resolveFinalUrl = async (url) => {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': 'Mozilla/5.0 (ElisiBot)' },
  });
  return response.url || url;
};

const fetchHtmlViaJina = async (url) => {
  const normalized = url.replace(/^https?:\\/\\//, '');
  const jinaUrl = `https://r.jina.ai/http://${normalized}`;
  const response = await fetch(jinaUrl);
  if (!response.ok) {
    throw new Error(`Jina AI 代理失败 ${response.status}`);
  }
  return response.text();
};

const extractImageUrls = (html) => {
  const imageRegex = new RegExp("https?://[^\\s\"'<>]+\\.(?:png|jpe?g|webp)", 'gi');
  const matches = html.match(imageRegex) || [];
  const prioritized = matches.filter((url) => url.includes('xhscdn.com'));
  const sorted = prioritized.length ? prioritized : matches;
  return uniqueList(sorted);
};

const handleXhsRequest = async (req, res) => {
  const url = (req.body && req.body.url) || req.query?.url;
  if (!url) {
    return res.status(400).json({ ok: false, error: 'URL_REQUIRED', message: 'url is required' });
  }

  try {
    const finalUrl = await resolveFinalUrl(url);
    let html = await fetchHtmlViaJina(finalUrl);
    let images = extractImageUrls(html);

    if (!images.length) {
      const response = await fetch(finalUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (ElisiBot)' },
      });
      if (response.ok) {
        html = await response.text();
        images = extractImageUrls(html);
      }
    }

    const filtered = images.slice(0, 12);
    if (!filtered.length) {
      return res.status(502).json({ ok: false, error: 'NO_IMAGES', message: '未识别到图片，请使用手动补充。' });
    }

    return res.json({ ok: true, images: filtered });
  } catch (err) {
    return res.status(502).json({ ok: false, error: 'FETCH_FAILED', message: err.message });
  }
};

app.get('/api/xhs', handleXhsRequest);
app.post('/api/xhs', handleXhsRequest);

app.post('/api/ocr', async (req, res) => {
  const { images = [], settings = {} } = req.body || {};
  if (!images.length) {
    return res.status(400).json({ ok: false, error: 'IMAGES_REQUIRED', message: 'images are required' });
  }

  const aiConfig = resolveAiConfig(settings);
  if (!aiConfig.apiKey) {
    return res.json({
      ok: true,
      texts: images.map(() => '（AI OCR 未配置，请手动填写识别文本）'),
      notice: '未检测到 AI Key，已生成占位 OCR 文本。',
    });
  }

  try {
    const texts = [];
    for (const imageUrl of images) {
      const prompt = [
        {
          role: 'system',
          content: '你是 OCR 识别助手。请从图片中提取所有可见中文/英文文本，保持原始换行。',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: '请输出图片中的文字内容。' },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ];
      const text = await callOpenAI(prompt, aiConfig);
      texts.push(text || '');
    }
    return res.json({ ok: true, texts, notice: 'OCR 完成' });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'OCR_FAILED', message: err.message });
  }
});

app.post('/api/run', async (req, res) => {
  const { url, raw, settings = {}, loop = {} } = req.body || {};
  const threshold = loop.threshold || 85;
  const maxRounds = loop.max_rounds || 3;

  let resolvedRaw = raw;

  if (!resolvedRaw && url) {
    return res.status(502).json({
      ok: false,
      error: 'PARSE_FAILED',
      message: '当前解析服务未接入，请使用手动输入。',
      fallback: { allow_manual_input: true },
    });
  }

  if (!resolvedRaw) {
    return res.status(400).json({ ok: false, error: 'RAW_REQUIRED', message: 'raw or url is required' });
  }

  try {
    const rounds = [];
    let draftPayload = await generateDraft(resolvedRaw, settings);
    if (!draftPayload.ok) {
      return res.status(500).json(draftPayload);
    }

    let draft = draftPayload.draft;

    for (let round = 1; round <= maxRounds; round += 1) {
      const scorePayload = await scoreDraft(draft, settings);
      if (!scorePayload.ok) {
        return res.status(500).json(scorePayload);
      }

      rounds.push({ round, total: scorePayload.score.total, draft, score: scorePayload.score });

      if (scorePayload.score.total >= threshold) {
        return res.json({ ok: true, final: draft, rounds });
      }

      const focusDimensions = scorePayload.score.lowest_dimensions?.slice(0, 2) || ['attention'];
      const rewritePayload = await rewriteDraft(resolvedRaw, draft, scorePayload.score, {
        focus_dimensions: focusDimensions,
        target_total: threshold,
        max_changes: 'bounded',
      });

      if (!rewritePayload.ok) {
        return res.status(500).json(rewritePayload);
      }

      draft = rewritePayload.draft;
    }

    return res.json({ ok: true, final: draft, rounds });
  } catch (err) {
    return res.status(500).json({ ok: false, error: 'RUN_FAILED', message: err.message });
  }
});
const mapProviderStatusToDb = (status) => {
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed') return 'failed';
  return 'running';
};

const pollJobs = async () => {
  try {
    const jobs = await allQuery(
      `SELECT * FROM video_jobs WHERE status IN ('pending', 'running') AND provider_job_id IS NOT NULL`
    );

    for (const job of jobs) {
      try {
        const providerStatus = await provider.getJobStatus(job.provider_job_id);
        const nextStatus = mapProviderStatusToDb(providerStatus.status);

        const updates = [
          nextStatus,
          providerStatus.videoUrl || null,
          providerStatus.errorMessage || null,
          job.id,
        ];

        await runQuery(
          `UPDATE video_jobs SET status = ?, output_video_url = COALESCE(?, output_video_url), error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          updates
        );
      } catch (pollError) {
        await runQuery(
          `UPDATE video_jobs SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [pollError.message, job.id]
        );
      }
    }
  } catch (err) {
    console.error('Poller error', err.message);
  }
};

setInterval(pollJobs, 10 * 1000);

app.listen(PORT, () => {
  console.log(`ReelShort server listening on http://localhost:${PORT}`);
});
