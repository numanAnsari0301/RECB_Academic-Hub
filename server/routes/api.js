// server/routes/api.js – REST API for notes and announcements
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ─── Multer Upload Config ───────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e6);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.zip', '.rar', '.docx', '.pptx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed. Use PDF, ZIP, DOCX, PPTX.'));
  }
});

// ─── Auth Middleware ────────────────────────────────────────────────────────────
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
}

const validBranches = new Set(['IT', 'CE', 'EE', 'ME']);
const validTypes = new Set(['Notes', 'Syllabus', 'CT_Paper', 'Quantum', 'PYQ']);

function validateNoteMetadata(input, allowPartial = false) {
  const title = typeof input.title === 'string' ? input.title.trim() : input.title;
  const subject = typeof input.subject === 'string' ? input.subject.trim() : input.subject;
  const year = input.year === undefined || input.year === '' ? undefined : Number(input.year);
  const branch = typeof input.branch === 'string' ? input.branch.trim().toUpperCase() : input.branch;
  const type = typeof input.type === 'string' ? input.type.trim() : input.type;

  if (!allowPartial && (!title || !subject || !year || !branch || !type)) {
    return { error: 'Title, subject, year, branch and type are required.' };
  }
  if (title !== undefined && !title) return { error: 'Title cannot be empty.' };
  if (subject !== undefined && !subject) return { error: 'Subject cannot be empty.' };
  if (year !== undefined && (!Number.isInteger(year) || year < 1 || year > 4)) return { error: 'Year must be between 1 and 4.' };
  if (branch !== undefined && !validBranches.has(branch)) return { error: 'Branch must be IT, CE, EE or ME.' };
  if (type !== undefined && !validTypes.has(type)) return { error: 'Invalid material type.' };
  return { data: { title, subject, year, branch, type } };
}

function validateExternalUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch (_) {
    return null;
  }
}

function removeUploadedFile(file) {
  if (file?.path && fs.existsSync(file.path)) fs.unlinkSync(file.path);
}

// ─── NOTES Routes ───────────────────────────────────────────────────────────────

// GET /api/notes – list with optional filters
router.get('/notes', (req, res) => {
  const { year, branch, type, subject, q } = req.query;
  const dbModule = req.app.get('db');
  let sql = 'SELECT * FROM notes WHERE 1=1';
  const params = [];

  if (year)    { sql += ' AND year = ?';                          params.push(Number(year)); }
  if (branch)  { sql += ' AND branch = ?';                        params.push(branch); }
  if (type)    { sql += ' AND type = ?';                          params.push(type); }
  if (subject) { sql += ' AND subject LIKE ?';                    params.push(`%${subject}%`); }
  if (q)       { sql += ' AND (title LIKE ? OR subject LIKE ?)';  params.push(`%${q}%`, `%${q}%`); }

  sql += ' ORDER BY year ASC, branch ASC, type ASC, id ASC';
  try {
    const notes = dbModule.prepare(sql).all(...params);
    res.json({ success: true, count: notes.length, data: notes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/notes/:id
router.get('/notes/:id', (req, res) => {
  const dbModule = req.app.get('db');
  const note = dbModule.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found.' });
  res.json({ success: true, data: note });
});

// POST /api/notes/upload – Upload new note (admin only)
router.post('/notes/upload', requireAdmin, upload.single('file'), (req, res) => {
  const { drive_link, description } = req.body;
  const validation = validateNoteMetadata(req.body);
  const dbModule = req.app.get('db');

  if (validation.error) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: validation.error });
  }
  const { title, subject, year, branch, type } = validation.data;

  const file_path = req.file ? 'server/uploads/' + req.file.filename : null;

  const externalUrl = validateExternalUrl(drive_link);
  if (drive_link && !externalUrl) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: 'External link must be a valid http or https URL.' });
  }
  if (!file_path && !externalUrl) {
    return res.status(400).json({ error: 'Provide either a file upload or a Google Drive link.' });
  }

  try {
    const result = dbModule.prepare(
      'INSERT INTO notes (title, subject, year, branch, type, file_path, drive_link, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(title, subject, Number(year), branch, type, file_path, externalUrl, description || null);

    const note = dbModule.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, message: 'Note uploaded successfully.', data: note });
  } catch (err) {
    removeUploadedFile(req.file);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/notes/:id – Update note metadata (admin only)
router.put('/notes/:id', requireAdmin, (req, res) => {
  const { drive_link, description } = req.body;
  const dbModule = req.app.get('db');
  const note = dbModule.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found.' });
  const validation = validateNoteMetadata(req.body, true);
  if (validation.error) return res.status(400).json({ error: validation.error });
  const { title, subject, year, branch, type } = validation.data;
  const externalUrl = drive_link === undefined ? undefined : validateExternalUrl(drive_link);
  if (drive_link !== undefined && drive_link && !externalUrl) {
    return res.status(400).json({ error: 'External link must be a valid http or https URL.' });
  }

  try {
    dbModule.prepare(
      'UPDATE notes SET title=?, subject=?, year=?, branch=?, type=?, drive_link=?, description=? WHERE id=?'
    ).run(
      title || note.title,
      subject || note.subject,
      year ? Number(year) : note.year,
      branch || note.branch,
      type || note.type,
      drive_link !== undefined ? externalUrl : note.drive_link,
      description !== undefined ? description : note.description,
      req.params.id
    );
    const updated = dbModule.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/notes/:id – Admin only
router.delete('/notes/:id', requireAdmin, (req, res) => {
  const dbModule = req.app.get('db');
  const note = dbModule.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found.' });

  // Remove physical uploaded file if it exists in our uploads folder
  if (note.file_path && note.file_path.startsWith('server/uploads/')) {
    const absPath = path.join(__dirname, '..', '..', note.file_path);
    if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
  }

  dbModule.prepare('DELETE FROM notes WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Note deleted.' });
});

// ─── General resources (not tied to a branch or year) ─────────────────────────
router.get('/resources', (req, res) => {
  const rows = req.app.get('db').prepare('SELECT * FROM general_resources ORDER BY id DESC').all();
  res.json({ success: true, data: rows });
});

router.post('/resources/upload', requireAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover_image', maxCount: 1 }]), (req, res) => {
  const title = typeof req.body.title === 'string' ? req.body.title.trim() : '';
  const category = typeof req.body.category === 'string' ? req.body.category.trim() : 'General';
  const description = typeof req.body.description === 'string' ? req.body.description.trim() : null;
  const externalUrl = validateExternalUrl(req.body.drive_link);
  const file = req.files?.file?.[0];
  const coverImage = req.files?.cover_image?.[0];
  const filePath = file ? `server/uploads/${file.filename}` : null;
  const coverPath = coverImage ? `server/uploads/${coverImage.filename}` : null;

  if (coverImage && !['.png', '.jpg', '.jpeg'].includes(path.extname(coverImage.originalname).toLowerCase())) {
    removeUploadedFile(file);
    removeUploadedFile(coverImage);
    return res.status(400).json({ error: 'Cover image must be a PNG or JPG file.' });
  }

  if (!title) {
    removeUploadedFile(file);
    removeUploadedFile(coverImage);
    return res.status(400).json({ error: 'Resource title is required.' });
  }
  if (req.body.drive_link && !externalUrl) {
    removeUploadedFile(file);
    removeUploadedFile(coverImage);
    return res.status(400).json({ error: 'External link must be a valid http or https URL.' });
  }
  if (!filePath && !externalUrl) {
    removeUploadedFile(coverImage);
    return res.status(400).json({ error: 'Provide a file or an external link.' });
  }

  const db = req.app.get('db');
  const result = db.prepare('INSERT INTO general_resources (title, category, description, file_path, drive_link, cover_path) VALUES (?, ?, ?, ?, ?, ?)')
    .run(title, category || 'General', description, filePath, externalUrl, coverPath);
  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM general_resources WHERE id = ?').get(result.lastInsertRowid) });
});

router.delete('/resources/:id', requireAdmin, (req, res) => {
  const db = req.app.get('db');
  const resource = db.prepare('SELECT * FROM general_resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).json({ error: 'Resource not found.' });
  if (resource.file_path?.startsWith('server/uploads/')) {
    const file = path.join(__dirname, '..', '..', resource.file_path);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  if (resource.cover_path?.startsWith('server/uploads/')) {
    const cover = path.join(__dirname, '..', '..', resource.cover_path);
    if (fs.existsSync(cover)) fs.unlinkSync(cover);
  }
  db.prepare('DELETE FROM general_resources WHERE id = ?').run(resource.id);
  res.json({ success: true, message: 'Resource deleted.' });
});

// ─── Feedback / resource requests ────────────────────────────────────────────
router.post('/feedback', (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!name || !message) return res.status(400).json({ error: 'Name and feedback are required.' });
  if (name.length > 80 || message.length > 1000) return res.status(400).json({ error: 'Feedback is too long.' });
  const result = req.app.get('db').prepare('INSERT INTO feedback (name, message) VALUES (?, ?)').run(name, message);
  res.status(201).json({ success: true, data: { id: result.lastInsertRowid } });
});

router.get('/feedback', requireAdmin, (req, res) => {
  const rows = req.app.get('db').prepare('SELECT * FROM feedback ORDER BY id DESC').all();
  res.json({ success: true, data: rows });
});

router.delete('/feedback/:id', requireAdmin, (req, res) => {
  req.app.get('db').prepare('DELETE FROM feedback WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Feedback deleted.' });
});

// ─── ANNOUNCEMENTS Routes ───────────────────────────────────────────────────────

// GET /api/announcements
router.get('/announcements', (req, res) => {
  const dbModule = req.app.get('db');
  const rows = dbModule.prepare('SELECT * FROM announcements WHERE active = 1 ORDER BY id DESC').all();
  res.json({ success: true, data: rows });
});

// POST /api/announcements – admin only
router.post('/announcements', requireAdmin, (req, res) => {
  const { text, icon } = req.body;
  const dbModule = req.app.get('db');
  if (!text) return res.status(400).json({ error: 'Announcement text is required.' });
  const result = dbModule.prepare('INSERT INTO announcements (text, icon) VALUES (?, ?)').run(text, icon || '📢');
  const ann = dbModule.prepare('SELECT * FROM announcements WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, data: ann });
});

// DELETE /api/announcements/:id – admin only
router.delete('/announcements/:id', requireAdmin, (req, res) => {
  const dbModule = req.app.get('db');
  dbModule.prepare('UPDATE announcements SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Announcement removed.' });
});

// ─── STATS Route ────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const dbModule = req.app.get('db');
  const totalNotes = dbModule.prepare('SELECT COUNT(*) as c FROM notes').get().c;
  const byYear    = dbModule.prepare('SELECT year, COUNT(*) as count FROM notes GROUP BY year').all();
  const byBranch  = dbModule.prepare('SELECT branch, COUNT(*) as count FROM notes GROUP BY branch').all();
  const byType    = dbModule.prepare('SELECT type, COUNT(*) as count FROM notes GROUP BY type').all();
  res.json({ success: true, data: { totalNotes, byYear, byBranch, byType } });
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
  next();
});

module.exports = router;
