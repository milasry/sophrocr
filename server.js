require('dotenv').config();
const fs      = require('fs');
const path    = require('path');
const express = require('express');
const multer  = require('multer');
const { Pool } = require('pg');
const { generateCR } = require('./generate_cr');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '5mb' }));

// ── AUTH ──────────────────────────────────────────────────────────────────────
// activePassword can be updated at runtime via /api/change-password (stored in DB)
let activePassword    = process.env.ACCESS_PASSWORD || '';
const COOKIE_SECRET   = process.env.COOKIE_SECRET || 'change-this-secret-in-env';
const AUTH_COOKIE     = 'sophrocr_session';
const { createHmac } = require('crypto');

function authToken(pwd) {
  return createHmac('sha256', COOKIE_SECRET)
    .update(pwd !== undefined ? pwd : activePassword)
    .digest('hex');
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(c => {
    const idx = c.indexOf('=');
    if (idx < 0) return;
    const k = c.slice(0, idx).trim();
    if (k) out[k] = decodeURIComponent(c.slice(idx + 1).trim());
  });
  return out;
}

function requireAuth(req, res, next) {
  if (!activePassword) return next();
  if (req.path === '/login' || req.path === '/logout') return next();
  if (parseCookies(req)[AUTH_COOKIE] === authToken()) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Non autorisé.' });
  res.redirect('/login');
}

const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
<title>SophroCR — Connexion</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Calibri,"Segoe UI",Arial,sans-serif;background:#F0EBF5;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.card{background:white;border-radius:12px;padding:40px 36px;width:100%;max-width:360px;box-shadow:0 4px 28px rgba(91,58,110,0.13)}
.logo{text-align:center;margin-bottom:28px}
.logo-mark{width:54px;height:54px;background:#2E7D8A;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-family:Georgia,serif;font-size:18px;font-weight:bold;color:white;margin-bottom:10px}
h1{font-family:Georgia,serif;font-size:20px;color:#2E7D8A;margin-bottom:4px}
.sub{font-size:13px;color:#666;margin-bottom:28px}
label{display:block;font-size:11.5px;color:#666;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
input{width:100%;padding:11px 14px;border:1.5px solid #E0E0E0;border-radius:7px;font-family:inherit;font-size:15px;color:#1A1A1A;-webkit-appearance:none;transition:border-color .15s}
input:focus{outline:none;border-color:#2E7D8A;box-shadow:0 0 0 3px rgba(46,125,138,.12)}
button{width:100%;margin-top:18px;padding:12px;background:#2E7D8A;color:white;border:none;border-radius:7px;font-family:inherit;font-size:15px;font-weight:600;cursor:pointer}
button:hover{background:#235f69}
.err{color:#B00020;font-size:13px;margin-top:12px;text-align:center}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-mark">SC</div>
    <h1>SophroCR</h1>
    <p class="sub">Sophrologie caycédienne · Vanessa Slous</p>
  </div>
  <form method="POST" action="/login">
    <label for="usr">Identifiant</label>
    <input type="text" id="usr" name="username" autocomplete="username" placeholder="vanessa" style="margin-bottom:14px">
    <label for="pwd">Mot de passe</label>
    <input type="password" id="pwd" name="password" autocomplete="current-password" placeholder="••••••••">
    <button type="submit">Accéder</button>
    __ERROR__
  </form>
</div>
</body>
</html>`;

app.get('/login', (req, res) => {
  if (activePassword && parseCookies(req)[AUTH_COOKIE] === authToken()) return res.redirect('/');
  res.send(LOGIN_PAGE.replace('__ERROR__', ''));
});

// Rate limiting: max 10 tentatives par IP sur une fenêtre glissante de 15 min
const loginAttempts = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const WINDOW = 15 * 60 * 1000; // 15 min
  const MAX    = 10;
  const entry  = loginAttempts.get(ip) || { count: 0, start: now };
  if (now - entry.start > WINDOW) { entry.count = 0; entry.start = now; }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count <= MAX;
}

app.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  if (!checkRateLimit(ip)) {
    return res.status(429).send(LOGIN_PAGE.replace('__ERROR__',
      '<p class="err">Trop de tentatives. Réessayez dans 15 minutes.</p>'));
  }
  if (!activePassword || req.body.password === activePassword) {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    const secure  = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie',
      `${AUTH_COOKIE}=${authToken()}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires}${secure ? '; Secure' : ''}`
    );
    return res.redirect('/');
  }
  res.status(401).send(LOGIN_PAGE.replace('__ERROR__', '<p class="err">Mot de passe incorrect.</p>'));
});

app.get('/logout', (req, res) => {
  res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`);
  res.redirect('/login');
});

app.use(requireAuth);
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

// ── UPLOADS DIR ───────────────────────────────────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR);

// ── DATABASE ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Enable SSL for hosted DBs (Neon, Railway Postgres, Render Postgres)
  // Disabled automatically for localhost connections
  ssl: process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('localhost')
    ? { rejectUnauthorized: false }
    : undefined
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);
  // Load stored password (takes precedence over env var once set via the UI)
  const cfg = await pool.query(`SELECT value FROM config WHERE key = 'password'`);
  if (cfg.rows.length > 0) activePassword = cfg.rows[0].value;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS comptes_rendus (
      id          TEXT PRIMARY KEY,
      client      TEXT NOT NULL,
      client_key  TEXT NOT NULL,
      date_seance TEXT,
      seance      TEXT,
      motif       TEXT,
      techniques  TEXT,
      phase       TEXT,
      cr          TEXT,
      saved_at    TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_cr_client ON comptes_rendus (client_key, saved_at DESC)
  `);
}

// ── MULTER ────────────────────────────────────────────────────────────────────
const upload = multer({
  dest: UPLOADS_DIR,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    ['.m4a', '.mp3', '.wav', '.mp4'].includes(ext)
      ? cb(null, true)
      : cb(new Error('Format non reconnu. Formats acceptés : m4a, mp3, wav, mp4.'));
  }
});

// ── PROMPT PATHS ──────────────────────────────────────────────────────────────
const PROMPT_DEFAULT = path.join(__dirname, 'prompts', 'system_prompt.txt');
const PROMPT_CUSTOM  = path.join(__dirname, 'prompts', 'system_prompt_custom.txt');
const REFERENCE_PATH = path.join(__dirname, 'prompts', 'reference_caycedienne.txt');

function getSystemPrompt() {
  const file = fs.existsSync(PROMPT_CUSTOM) ? PROMPT_CUSTOM : PROMPT_DEFAULT;
  return fs.readFileSync(file, 'utf-8');
}
function getReferenceDoc() {
  return fs.readFileSync(REFERENCE_PATH, 'utf-8');
}

// ── CLIENT KEY ────────────────────────────────────────────────────────────────
// URL/DB-safe version of the client name (same logic as the old folder name)
function clientKey(client) {
  return (client || 'inconnu').replace(/[/\\:*?"<>|]/g, '').trim() || 'inconnu';
}

// ── HISTORY HELPERS ───────────────────────────────────────────────────────────
async function saveCRToHistory(data) {
  const id  = Date.now().toString();
  const key = clientKey(data.client);
  await pool.query(
    `INSERT INTO comptes_rendus (id, client, client_key, date_seance, seance, motif, techniques, phase, cr)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [id, data.client, key, data.date, data.seance, data.motif, data.techniques, data.phase || '', data.cr]
  );
  return id;
}

async function fetchCR(clientKeyParam, id) {
  const { rows } = await pool.query(
    `SELECT * FROM comptes_rendus WHERE id = $1 AND client_key = $2`,
    [id, clientKeyParam]
  );
  return rows[0] || null;
}

// ── POST /api/transcribe ──────────────────────────────────────────────────────
app.post('/api/transcribe', (req, res) => {
  upload.single('audio')(req, res, async (err) => {
    const filePath = req.file?.path;
    try {
      if (err) {
        const msg = err.code === 'LIMIT_FILE_SIZE'
          ? 'Ce fichier est trop volumineux. Taille maximum : 500 Mo.'
          : (err.message || 'Erreur lors du téléversement.');
        return res.status(400).json({ error: msg });
      }
      if (!req.file) return res.status(400).json({ error: 'Aucun fichier reçu.' });

      const aaiKey = process.env.ASSEMBLYAI_API_KEY;
      if (!aaiKey) return res.status(500).json({ error: 'Clé API AssemblyAI manquante côté serveur.' });

      const fileBuffer = fs.readFileSync(filePath);
      const uploadRes  = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { authorization: aaiKey, 'content-type': 'application/octet-stream' },
        body: fileBuffer
      });
      if (!uploadRes.ok) throw new Error('Le téléversement vers AssemblyAI a échoué.');
      const { upload_url } = await uploadRes.json();

      const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
        method: 'POST',
        headers: { authorization: aaiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ audio_url: upload_url, speaker_labels: true, speakers_expected: 2, language_code: 'fr' })
      });
      if (!transcriptRes.ok) {
        const errBody = await transcriptRes.json().catch(() => ({}));
        throw new Error(`La soumission de la transcription a échoué (${transcriptRes.status}) : ${errBody.error || JSON.stringify(errBody)}`);
      }
      const { id } = await transcriptRes.json();

      res.json({ transcript_id: id });
    } catch (err) {
      console.error('Erreur /api/transcribe:', err);
      res.status(500).json({ error: err.message || 'La transcription a échoué. Vérifiez la qualité audio.' });
    } finally {
      if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  });
});

// ── GET /api/transcribe/:id ───────────────────────────────────────────────────
app.get('/api/transcribe/:id', async (req, res) => {
  try {
    const aaiKey    = process.env.ASSEMBLYAI_API_KEY;
    const statusRes = await fetch(`https://api.assemblyai.com/v2/transcript/${req.params.id}`, {
      headers: { authorization: aaiKey }
    });
    if (!statusRes.ok) throw new Error('Impossible de récupérer le statut.');
    const data = await statusRes.json();

    if (data.status === 'completed') {
      const SPEAKER = { A: 'Sophrologue', B: 'Client' };
      const transcript = (data.utterances?.length)
        ? data.utterances.map(u => `${SPEAKER[u.speaker] || `Locuteur ${u.speaker}`} : ${u.text}`).join('\n')
        : (data.text || '');
      return res.json({ status: 'completed', transcript });
    }
    if (data.status === 'error') return res.json({ status: 'error', error: data.error });
    res.json({ status: data.status });
  } catch (err) {
    res.status(500).json({ error: 'Impossible de vérifier le statut.' });
  }
});

// ── POST /api/generate ────────────────────────────────────────────────────────
app.post('/api/generate', async (req, res) => {
  try {
    const { client, date, seance, motif, techniques, phase, notes, transcription } = req.body;

    if (!transcription?.trim()) return res.status(400).json({ error: "La transcription est vide." });
    if (!client || !date || !seance || !motif || !techniques) return res.status(400).json({ error: "Merci de remplir tous les champs obligatoires." });

    const userMessage = [
      `Génère le compte-rendu.`,
      `Client : ${client}`, `Date : ${date}`, `Séance n° : ${seance}`,
      `Motif : ${motif}`, `Technique(s) : ${techniques}`,
      phase ? `Phase : ${phase}` : null,
      notes ? `Notes personnelles : ${notes}` : null,
      ``, `TRANSCRIPTION (avec locuteurs identifiés si disponibles) :`, transcription
    ].filter(Boolean).join('\n');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Clé API Anthropic manquante." });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 2000,
        system: `${getSystemPrompt()}\n\n=== DOCUMENT DE RÉFÉRENCE CAYCÉDIENNE ===\n${getReferenceDoc()}`,
        messages: [{ role: 'user', content: userMessage }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Erreur API Anthropic:', response.status, errText);
      return res.status(502).json({ error: "La génération a échoué. Veuillez réessayer." });
    }

    const data   = await response.json();
    const crText = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    res.json({ cr: crText });

  } catch (err) {
    console.error('Erreur /api/generate:', err);
    res.status(500).json({ error: "Une erreur inattendue est survenue." });
  }
});

// ── POST /api/download ────────────────────────────────────────────────────────
app.post('/api/download', async (req, res) => {
  try {
    const { client, date, seance, motif, techniques, phase, cr } = req.body;
    if (!cr?.trim()) return res.status(400).json({ error: "Aucun texte à mettre en forme." });

    const buffer     = await generateCR({ client, date, seance, motif, techniques, phase, cr });
    const safeClient = (client || 'client').replace(/[^a-zA-Z0-9À-ÿ]/g, '_');
    const filename   = `CR_${safeClient}_S${seance || ''}.docx`;

    // Save to DB (non-blocking — failure doesn't break the download)
    saveCRToHistory({ client, date, seance, motif, techniques, phase, cr })
      .catch(e => console.error('Erreur sauvegarde historique:', e));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (err) {
    console.error('Erreur /api/download:', err);
    res.status(500).json({ error: "La mise en forme Word a échoué." });
  }
});

// ── GET /api/history ──────────────────────────────────────────────────────────
app.get('/api/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, client, client_key, date_seance, seance, motif, techniques, saved_at
       FROM comptes_rendus
       ORDER BY saved_at DESC`
    );

    // Group rows by client_key — natural order gives most-recently-active clients first
    const clientMap = new Map();
    for (const row of rows) {
      if (!clientMap.has(row.client_key)) {
        clientMap.set(row.client_key, { folder: row.client_key, name: row.client, count: 0, seances: [] });
      }
      const c = clientMap.get(row.client_key);
      c.count++;
      c.seances.push({
        id: row.id, folder: row.client_key, client: row.client,
        date: row.date_seance, seance: row.seance, motif: row.motif,
        techniques: row.techniques, savedAt: row.saved_at
      });
    }

    res.json({ clients: [...clientMap.values()] });
  } catch (err) {
    console.error('Erreur /api/history:', err);
    res.status(500).json({ error: "Impossible de charger l'historique." });
  }
});

// ── GET /api/clients ──────────────────────────────────────────────────────────
// Returns each known client with their most recent séance info (for autocomplete)
app.get('/api/clients', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT client, client_key, seance, motif
      FROM (
        SELECT DISTINCT ON (client_key) client, client_key, seance, motif
        FROM comptes_rendus
        ORDER BY client_key, saved_at DESC
      ) sub
      ORDER BY client ASC
    `);
    res.json({ clients: rows.map(r => ({ name: r.client, key: r.client_key, seance: r.seance, motif: r.motif })) });
  } catch (err) {
    console.error('Erreur /api/clients:', err);
    res.status(500).json({ error: 'Impossible de charger les clients.' });
  }
});

// ── GET /api/history/:client/:id ──────────────────────────────────────────────
app.get('/api/history/:client/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const row = await fetchCR(req.params.client, req.params.id);
    if (!row) return res.status(404).json({ error: 'CR introuvable.' });
    res.json({
      id: row.id, client: row.client, date: row.date_seance, seance: row.seance,
      motif: row.motif, techniques: row.techniques, phase: row.phase,
      cr: row.cr, savedAt: row.saved_at
    });
  } catch (err) {
    res.status(500).json({ error: 'Impossible de charger ce CR.' });
  }
});

// ── GET /api/history/:client/:id/download ─────────────────────────────────────
app.get('/api/history/:client/:id/download', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const row = await fetchCR(req.params.client, req.params.id);
    if (!row) return res.status(404).json({ error: 'CR introuvable.' });

    const data       = { client: row.client, date: row.date_seance, seance: row.seance, motif: row.motif, techniques: row.techniques, phase: row.phase, cr: row.cr };
    const buffer     = await generateCR(data);
    const safeClient = (row.client || 'client').replace(/[^a-zA-Z0-9À-ÿ]/g, '_');
    const filename   = `CR_${safeClient}_S${row.seance || ''}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Erreur /api/history download:', err);
    res.status(500).json({ error: 'La génération du fichier Word a échoué.' });
  }
});

// ── DELETE /api/history/:client/:id ──────────────────────────────────────────
app.delete('/api/history/:client/:id', async (req, res) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID invalide.' });
    const { rowCount } = await pool.query(
      `DELETE FROM comptes_rendus WHERE id = $1 AND client_key = $2`,
      [req.params.id, req.params.client]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'CR introuvable.' });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Impossible de supprimer ce CR.' });
  }
});

// ── GET /api/prompt ───────────────────────────────────────────────────────────
app.get('/api/prompt', (req, res) => {
  try { res.json({ prompt: getSystemPrompt() }); }
  catch (err) { res.status(500).json({ error: "Impossible de lire le prompt." }); }
});

// ── POST /api/prompt ──────────────────────────────────────────────────────────
app.post('/api/prompt', (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt?.trim()) return res.status(400).json({ error: "Le prompt ne peut pas être vide." });
    fs.writeFileSync(PROMPT_CUSTOM, prompt, 'utf-8');
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: "Impossible de sauvegarder le prompt." }); }
});

// ── POST /api/prompt/reset ────────────────────────────────────────────────────
app.post('/api/prompt/reset', (req, res) => {
  try {
    if (fs.existsSync(PROMPT_CUSTOM)) fs.unlinkSync(PROMPT_CUSTOM);
    res.json({ prompt: fs.readFileSync(PROMPT_DEFAULT, 'utf-8') });
  } catch (err) { res.status(500).json({ error: "Impossible de réinitialiser le prompt." }); }
});

// ── CHANGE PASSWORD ───────────────────────────────────────────────────────────
app.post('/api/change-password', express.json(), async (req, res) => {
  const { current, next: newPwd } = req.body;
  if (!newPwd || newPwd.trim().length < 8) {
    return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères.' });
  }
  if (activePassword && current !== activePassword) {
    return res.status(401).json({ error: 'Mot de passe actuel incorrect.' });
  }
  try {
    await pool.query(
      `INSERT INTO config (key, value) VALUES ('password', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [newPwd.trim()]
    );
    activePassword = newPwd.trim();
    // Issue a new cookie so the current session stays valid with the new password
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    const secure  = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie',
      `${AUTH_COOKIE}=${authToken()}; Path=/; HttpOnly; SameSite=Strict; Expires=${expires}${secure ? '; Secure' : ''}`
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la sauvegarde du mot de passe.' });
  }
});

// ── START ─────────────────────────────────────────────────────────────────────
initDB()
  .then(() => {
    app.listen(PORT, () => console.log(`✓ Serveur lancé : http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('Erreur connexion base de données :', err.message);
    console.error('→ Vérifiez que DATABASE_URL est défini dans votre .env');
    process.exit(1);
  });
