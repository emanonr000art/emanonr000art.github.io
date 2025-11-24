const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'video_jobs.sqlite');
const PORT = process.env.PORT || 4000;

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

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
