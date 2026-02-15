const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { promisify } = require('util');
const { execFile } = require('child_process');
const sqlite3 = require('sqlite3').verbose();

const execFileAsync = promisify(execFile);

const APP_PORT = Number(process.env.PORT || 17776);
const ICS_PORT = Number(process.env.ICS_PORT || 17777);
const DATA_ROOT = path.join(__dirname, 'counseling-data');
const FILES_ROOT = path.join(DATA_ROOT, 'files');
const DB_PATH = path.join(DATA_ROOT, 'db.sqlite');

const STATUS = {
  CLIENT: new Set(['Potential', 'Active', 'Paused', 'Closed', 'Referred']),
  APPOINTMENT: new Set(['Scheduled', 'Completed', 'Canceled']),
  FILE_CATEGORY: new Set(['SessionNote', 'Supervision', 'Assessment']),
};

fs.mkdirSync(FILES_ROOT, { recursive: true });

const db = new sqlite3.Database(DB_PATH);

const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(err) {
      if (err) return reject(err);
      resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });

const all = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const now = () => Date.now();
const uuid = () => crypto.randomUUID();

const formatDateTimeForFile = (epochMs) => {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}-${pad(d.getMinutes())}`;
};

const formatDateTimeDisplay = (epochMs) => {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const formatIcsDate = (epochMs) => {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
};

const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '-').slice(0, 128) || 'untitled';

const ensureClientDirs = (clientId) => {
  const base = path.join(FILES_ROOT, 'clients', clientId);
  const dirs = {
    base,
    sessions: path.join(base, 'sessions'),
    supervision: path.join(base, 'supervision'),
    assessment: path.join(base, 'assessment'),
  };
  Object.values(dirs).forEach((d) => fs.mkdirSync(d, { recursive: true }));
  return dirs;
};

const getLanIp = () => {
  const interfaces = os.networkInterfaces();
  for (const rows of Object.values(interfaces)) {
    for (const row of rows || []) {
      if (row.family === 'IPv4' && !row.internal) return row.address;
    }
  }
  return null;
};

const parseRRule = (rrule) => {
  const map = {};
  String(rrule || '').split(';').forEach((piece) => {
    const [k, v] = piece.split('=');
    if (k && v) map[k.toUpperCase()] = v;
  });
  return map;
};

const weekdayMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const genWeeklyInstances = (series, weekStart, weekEnd) => {
  const rule = parseRRule(series.rrule);
  if (rule.FREQ !== 'WEEKLY') return [];
  const byday = (rule.BYDAY || weekdayMap[new Date(series.dtstart).getDay()]).split(',');
  const interval = Math.max(1, Number(rule.INTERVAL || 1));

  const until = Number(series.until_at || 0) || null;
  const count = Number(series.count || 0) || null;

  const dayMs = 24 * 3600 * 1000;
  const dt = new Date(series.dtstart);
  const startMinutes = dt.getHours() * 60 + dt.getMinutes();
  const generated = [];
  let produced = 0;

  const cursor = new Date(weekStart);
  cursor.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= weekEnd) {
    const wd = weekdayMap[cursor.getDay()];
    const weeksFromStart = Math.floor((cursor.getTime() - new Date(series.dtstart).setHours(0, 0, 0, 0)) / (7 * dayMs));
    if (weeksFromStart >= 0 && weeksFromStart % interval === 0 && byday.includes(wd)) {
      const instanceStart = new Date(cursor.getTime());
      instanceStart.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);
      const s = instanceStart.getTime();
      const e = s + (series.duration_min || 50) * 60 * 1000;
      if (s >= weekStart && s <= weekEnd && s >= series.dtstart) {
        if (until && s > until) {
          // noop
        } else if (count && produced >= count) {
          // noop
        } else {
          generated.push({ original_instance_at: s, start_at: s, end_at: e });
          produced += 1;
        }
      }
    }
    cursor.setTime(cursor.getTime() + dayMs);
  }
  return generated;
};

const buildSessionTemplate = (epochMs) => {
  const display = formatDateTimeDisplay(epochMs);
  return `# 咨询记录（${display}）\n\n## 目标\n\n## 过程\n\n## 干预\n\n## 作业\n\n## 风险\n\n## 反思\n`;
};

const createSessionNoteForAppointment = async (appointmentId) => {
  const appt = await get('SELECT * FROM appointments WHERE id = ?', [appointmentId]);
  if (!appt) throw new Error('Appointment not found');

  const exists = await get('SELECT id, path FROM files WHERE related_appointment_id = ?', [appointmentId]);
  if (exists) return exists;

  const filename = `${formatDateTimeForFile(appt.start_at)}.md`;
  const dirs = ensureClientDirs(appt.client_id);
  const absolutePath = path.join(dirs.sessions, filename);
  const relativePath = path.relative(FILES_ROOT, absolutePath).replaceAll('\\', '/');

  fs.writeFileSync(absolutePath, buildSessionTemplate(appt.start_at), 'utf8');

  const id = uuid();
  await run(
    `INSERT INTO files (id, client_id, category, title, ext, path, related_appointment_id, created_at, updated_at)
     VALUES (?, ?, 'SessionNote', ?, 'md', ?, ?, ?, ?)`,
    [id, appt.client_id, filename.replace(/\.md$/, ''), relativePath, appointmentId, now(), now()]
  );

  return { id, path: relativePath };
};

const getClientStats = async (clientId) => {
  const [completed, last, next] = await Promise.all([
    get("SELECT COUNT(*) AS count FROM appointments WHERE client_id = ? AND status = 'Completed'", [clientId]),
    get("SELECT MAX(start_at) AS at FROM appointments WHERE client_id = ? AND status = 'Completed'", [clientId]),
    get("SELECT MIN(start_at) AS at FROM appointments WHERE client_id = ? AND status = 'Scheduled' AND start_at > ?", [clientId, now()]),
  ]);

  const completedCount = Number(completed?.count || 0);
  return {
    completedCount,
    totalHours: completedCount,
    lastCompletedAt: last?.at || null,
    nextScheduledAt: next?.at || null,
  };
};

const initDb = async () => {
  await run(`CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      tags_json TEXT NOT NULL DEFAULT '[]',
      notes TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  await run('CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status)');
  await run('CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name)');

  await run(`CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      start_at INTEGER NOT NULL,
      end_at INTEGER NOT NULL,
      status TEXT NOT NULL,
      recurring_series_id TEXT,
      original_instance_at INTEGER,
      note TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`);
  await run('CREATE INDEX IF NOT EXISTS idx_appt_start_at ON appointments(start_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_appt_client_start ON appointments(client_id, start_at)');
  await run('CREATE INDEX IF NOT EXISTS idx_appt_status ON appointments(status)');

  await run(`CREATE TABLE IF NOT EXISTS recurring_series (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      rrule TEXT NOT NULL,
      dtstart INTEGER NOT NULL,
      duration_min INTEGER NOT NULL DEFAULT 50,
      until_at INTEGER,
      count INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`);

  await run(`CREATE TABLE IF NOT EXISTS recurring_exceptions (
      id TEXT PRIMARY KEY,
      recurring_series_id TEXT NOT NULL,
      original_instance_at INTEGER NOT NULL,
      new_start_at INTEGER,
      new_end_at INTEGER,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (recurring_series_id) REFERENCES recurring_series(id)
    )`);
  await run('CREATE INDEX IF NOT EXISTS idx_ex_series_original ON recurring_exceptions(recurring_series_id, original_instance_at)');

  await run(`CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      category TEXT NOT NULL,
      title TEXT NOT NULL,
      ext TEXT NOT NULL,
      path TEXT NOT NULL,
      related_appointment_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (client_id) REFERENCES clients(id)
    )`);
  await run('CREATE INDEX IF NOT EXISTS idx_files_client_category ON files(client_id, category)');
  await run('CREATE INDEX IF NOT EXISTS idx_files_related_appt ON files(related_appointment_id)');
};

const app = express();
app.use(express.json({ limit: '10mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/clients', async (req, res) => {
  try {
    const { name, status = 'Potential', tags = [], notes = null } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (!STATUS.CLIENT.has(status)) return res.status(400).json({ error: 'invalid status' });

    const id = uuid();
    const ts = now();
    await run(
      'INSERT INTO clients (id, name, status, tags_json, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, name, status, JSON.stringify(tags), notes, ts, ts]
    );
    ensureClientDirs(id);
    res.json({ id });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients', async (req, res) => {
  try {
    const { keyword = '', status, tag, sortBy = 'created_at' } = req.query;
    const params = [];
    let where = '1=1';
    if (keyword) {
      where += ' AND name LIKE ?';
      params.push(`%${keyword}%`);
    }
    if (status) {
      where += ' AND status = ?';
      params.push(status);
    }
    if (tag) {
      where += ' AND tags_json LIKE ?';
      params.push(`%${tag}%`);
    }

    const rows = await all(`SELECT * FROM clients WHERE ${where} ORDER BY ${sortBy === 'created' ? 'created_at DESC' : 'updated_at DESC'}`, params);
    const withStats = await Promise.all(rows.map(async (row) => ({ ...row, stats: await getClientStats(row.id), tags: JSON.parse(row.tags_json || '[]') })));

    if (sortBy === 'next') {
      withStats.sort((a, b) => (a.stats.nextScheduledAt || Number.MAX_SAFE_INTEGER) - (b.stats.nextScheduledAt || Number.MAX_SAFE_INTEGER));
    }
    if (sortBy === 'last') {
      withStats.sort((a, b) => (b.stats.lastCompletedAt || 0) - (a.stats.lastCompletedAt || 0));
    }

    res.json(withStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/clients/:id', async (req, res) => {
  try {
    const client = await get('SELECT * FROM clients WHERE id = ?', [req.params.id]);
    if (!client) return res.status(404).json({ error: 'not found' });
    const stats = await getClientStats(client.id);
    const files = await all('SELECT * FROM files WHERE client_id = ? ORDER BY created_at DESC', [client.id]);
    res.json({ ...client, tags: JSON.parse(client.tags_json || '[]'), stats, files });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/appointments', async (req, res) => {
  try {
    const { clientId, startAt, durationMin = 50, note = null, recurring } = req.body || {};
    if (!clientId || !startAt) return res.status(400).json({ error: 'clientId and startAt required' });
    const client = await get('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!client) return res.status(404).json({ error: 'client not found' });

    let recurringSeriesId = null;
    if (recurring) {
      recurringSeriesId = uuid();
      await run(
        `INSERT INTO recurring_series (id, client_id, rrule, dtstart, duration_min, until_at, count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [recurringSeriesId, clientId, recurring.rrule, Number(startAt), Number(durationMin), recurring.untilAt || null, recurring.count || null, now(), now()]
      );
    }

    const id = uuid();
    const endAt = Number(startAt) + Number(durationMin) * 60 * 1000;
    await run(
      `INSERT INTO appointments (id, client_id, start_at, end_at, status, recurring_series_id, note, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'Scheduled', ?, ?, ?, ?)`,
      [id, clientId, Number(startAt), endAt, recurringSeriesId, note, now(), now()]
    );
    res.json({ id, recurringSeriesId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.patch('/api/appointments/:id', async (req, res) => {
  try {
    const appt = await get('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
    if (!appt) return res.status(404).json({ error: 'not found' });

    const { startAt, endAt, status, scope = 'this' } = req.body || {};

    if (status && !STATUS.APPOINTMENT.has(status)) return res.status(400).json({ error: 'invalid status' });

    if (scope === 'series' && appt.recurring_series_id && (startAt || endAt)) {
      const delta = Number(startAt || appt.start_at) - appt.start_at;
      await run('UPDATE appointments SET start_at = start_at + ?, end_at = end_at + ?, updated_at = ? WHERE recurring_series_id = ?', [delta, delta, now(), appt.recurring_series_id]);
      await run('UPDATE recurring_series SET dtstart = dtstart + ?, updated_at = ? WHERE id = ?', [delta, now(), appt.recurring_series_id]);
    } else if ((startAt || endAt) && appt.recurring_series_id && scope === 'this') {
      const exId = uuid();
      await run(
        `INSERT INTO recurring_exceptions (id, recurring_series_id, original_instance_at, new_start_at, new_end_at, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'Moved', ?, ?)`,
        [exId, appt.recurring_series_id, appt.original_instance_at || appt.start_at, Number(startAt || appt.start_at), Number(endAt || appt.end_at), now(), now()]
      );
      await run('UPDATE appointments SET start_at = ?, end_at = ?, original_instance_at = ?, updated_at = ? WHERE id = ?', [Number(startAt || appt.start_at), Number(endAt || appt.end_at), appt.original_instance_at || appt.start_at, now(), appt.id]);
    } else {
      await run(
        'UPDATE appointments SET start_at = COALESCE(?, start_at), end_at = COALESCE(?, end_at), status = COALESCE(?, status), updated_at = ? WHERE id = ?',
        [startAt ?? null, endAt ?? null, status ?? null, now(), appt.id]
      );
    }

    if (status === 'Completed' && appt.status !== 'Completed') {
      await createSessionNoteForAppointment(appt.id);
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/schedule/week', async (req, res) => {
  try {
    const weekStart = Number(req.query.weekStart);
    const weekEnd = Number(req.query.weekEnd);
    if (!weekStart || !weekEnd) return res.status(400).json({ error: 'weekStart and weekEnd required' });

    const singles = await all(
      `SELECT a.*, c.name AS client_name
       FROM appointments a JOIN clients c ON c.id = a.client_id
       WHERE a.start_at BETWEEN ? AND ?`,
      [weekStart, weekEnd]
    );

    const seriesRows = await all(
      `SELECT * FROM recurring_series
       WHERE dtstart <= ? AND (until_at IS NULL OR until_at >= ?)`,
      [weekEnd, weekStart]
    );

    const eventList = [...singles.map((r) => ({
      id: r.id,
      source: 'single',
      clientId: r.client_id,
      clientName: r.client_name,
      startAt: r.start_at,
      endAt: r.end_at,
      status: r.status,
      recurringSeriesId: r.recurring_series_id,
      originalInstanceAt: r.original_instance_at,
    }))];

    for (const series of seriesRows) {
      const client = await get('SELECT name FROM clients WHERE id = ?', [series.client_id]);
      const generated = genWeeklyInstances(series, weekStart, weekEnd);
      const exceptions = await all('SELECT * FROM recurring_exceptions WHERE recurring_series_id = ?', [series.id]);
      const mapEx = new Map(exceptions.map((e) => [e.original_instance_at, e]));
      for (const item of generated) {
        const ex = mapEx.get(item.original_instance_at);
        if (ex?.status === 'Canceled') continue;
        eventList.push({
          id: `${series.id}:${item.original_instance_at}`,
          source: 'recurring',
          clientId: series.client_id,
          clientName: client?.name || '未知个案',
          startAt: ex?.new_start_at || item.start_at,
          endAt: ex?.new_end_at || item.end_at,
          status: 'Scheduled',
          recurringSeriesId: series.id,
          originalInstanceAt: item.original_instance_at,
        });
      }
    }

    res.json(eventList.sort((a, b) => a.startAt - b.startAt));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/files/markdown', async (req, res) => {
  try {
    const { clientId, category, title, content = '', relatedAppointmentId = null } = req.body || {};
    if (!clientId || !category || !title) return res.status(400).json({ error: 'missing fields' });
    if (!STATUS.FILE_CATEGORY.has(category)) return res.status(400).json({ error: 'invalid category' });
    if (!['SessionNote', 'Supervision'].includes(category)) return res.status(400).json({ error: 'category must be SessionNote/Supervision' });

    const dirs = ensureClientDirs(clientId);
    const folder = category === 'SessionNote' ? dirs.sessions : dirs.supervision;
    const filename = `${safeName(title)}.md`;
    const absolutePath = path.join(folder, filename);
    fs.writeFileSync(absolutePath, String(content), 'utf8');

    const relativePath = path.relative(FILES_ROOT, absolutePath).replaceAll('\\', '/');
    const id = uuid();
    await run(
      'INSERT INTO files (id, client_id, category, title, ext, path, related_appointment_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, clientId, category, safeName(title), 'md', relativePath, relatedAppointmentId, now(), now()]
    );

    res.json({ id, path: relativePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/ics', async (_req, res) => {
  try {
    const events = await all(
      `SELECT a.*, c.name AS client_name
       FROM appointments a JOIN clients c ON c.id = a.client_id
       WHERE a.status != 'Canceled'`
    );

    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Counseling CRM//CN', 'CALSCALE:GREGORIAN'];
    for (const e of events) {
      lines.push('BEGIN:VEVENT');
      lines.push(`UID:${e.id}@local`);
      lines.push(`DTSTAMP:${formatIcsDate(now())}`);
      lines.push(`DTSTART:${formatIcsDate(e.start_at)}`);
      lines.push(`DTEND:${formatIcsDate(e.end_at)}`);
      lines.push(`SUMMARY:${String(e.client_name).replace(/[,;\\]/g, '')}`);
      if (e.status === 'Canceled') lines.push('STATUS:CANCELLED');
      if (e.recurring_series_id) {
        const series = await get('SELECT rrule FROM recurring_series WHERE id = ?', [e.recurring_series_id]);
        if (series?.rrule) lines.push(`RRULE:${series.rrule}`);
      }
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');

    const text = `${lines.join('\r\n')}\r\n`;
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(text);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/calendar.ics', async (req, res) => {
  req.url = '/api/ics';
  app.handle(req, res);
});

app.post('/api/export', async (_req, res) => {
  try {
    const stamp = formatDateTimeForFile(now()).replace(' ', '_');
    const exportDir = path.join(DATA_ROOT, 'exports');
    fs.mkdirSync(exportDir, { recursive: true });
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'counseling-export-'));

    const dbOut = path.join(tempDir, 'db.sqlite');
    fs.copyFileSync(DB_PATH, dbOut);

    const filesOut = path.join(tempDir, 'files');
    fs.cpSync(FILES_ROOT, filesOut, { recursive: true });

    const manifest = {
      version: 1,
      exportedAt: now(),
      db: 'db.sqlite',
      filesRoot: 'files',
    };
    fs.writeFileSync(path.join(tempDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const zipPath = path.join(exportDir, `export-${stamp}.zip`);
    await execFileAsync('zip', ['-r', zipPath, '.'], { cwd: tempDir });

    fs.rmSync(tempDir, { recursive: true, force: true });
    res.json({ zipPath });
  } catch (error) {
    res.status(500).json({ error: `export failed: ${error.message}` });
  }
});

app.get('/api/settings/ics-urls', (_req, res) => {
  const lan = getLanIp();
  res.json({
    localhost: `http://127.0.0.1:${ICS_PORT}/calendar.ics`,
    lan: lan ? `http://${lan}:${ICS_PORT}/calendar.ics` : null,
  });
});

const start = async () => {
  await initDb();
  app.listen(APP_PORT, () => {
    console.log(`[counseling] app running http://127.0.0.1:${APP_PORT}`);
    console.log(`[counseling] ICS URL http://127.0.0.1:${APP_PORT}/calendar.ics`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
