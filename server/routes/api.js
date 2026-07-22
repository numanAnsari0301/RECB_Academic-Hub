// server/routes/api.js – REST API for notes and announcements
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const {
  Note,
  Announcement,
  GeneralResource,
  Feedback,
  toApiDoc
} = require('../models');

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
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.pdf', '.zip', '.rar', '.docx', '.pptx', '.png', '.jpg', '.jpeg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('File type not allowed. Use PDF, ZIP, DOCX, PPTX.'));
  }
});

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Unauthorized. Admin login required.' });
}

const validBranches = new Set(['IT', 'CE', 'EE', 'ME']);
const validTypes = new Set(['Notes', 'Syllabus', 'CT_Paper', 'Quantum', 'PYQ']);
const validScopes = new Set(['unit', 'combined']);

function parseScope(input) {
  const scope = typeof input.scope === 'string' ? input.scope.trim().toLowerCase() : 'combined';
  return validScopes.has(scope) ? scope : 'combined';
}

function parseUnit(input, scope) {
  if (scope !== 'unit') return { unit: null, unit_title: null };
  const unit = input.unit === undefined || input.unit === '' ? undefined : Number(input.unit);
  const unit_title = typeof input.unit_title === 'string' ? input.unit_title.trim() : input.unit_title;
  return { unit, unit_title: unit_title || null };
}

function validateNoteMetadata(input, allowPartial = false) {
  const title = typeof input.title === 'string' ? input.title.trim() : input.title;
  const subject = typeof input.subject === 'string' ? input.subject.trim() : input.subject;
  const year = input.year === undefined || input.year === '' ? undefined : Number(input.year);
  const branch = typeof input.branch === 'string' ? input.branch.trim().toUpperCase() : input.branch;
  const type = typeof input.type === 'string' ? input.type.trim() : input.type;
  const scope = parseScope(input);
  const { unit, unit_title } = parseUnit(input, scope);

  if (!allowPartial && (!title || !subject || !year || !branch || !type)) {
    return { error: 'Title, subject, year, branch and type are required.' };
  }
  if (title !== undefined && !title) return { error: 'Title cannot be empty.' };
  if (subject !== undefined && !subject) return { error: 'Subject cannot be empty.' };
  if (year !== undefined && (!Number.isInteger(year) || year < 1 || year > 4)) return { error: 'Year must be between 1 and 4.' };
  if (branch !== undefined && !validBranches.has(branch)) return { error: 'Branch must be IT, CE, EE or ME.' };
  if (type !== undefined && !validTypes.has(type)) return { error: 'Invalid material type.' };
  if (scope === 'unit' && unit !== undefined && unit !== null && (!Number.isInteger(unit) || unit < 1 || unit > 20)) {
    return { error: 'Unit number must be between 1 and 20.' };
  }
  if (scope === 'unit' && !allowPartial && (unit === undefined || unit === null)) {
    return { error: 'Unit number is required for unit-wise uploads.' };
  }

  return { data: { title, subject, year, branch, type, scope, unit, unit_title } };
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

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

function buildNotesQuery(query) {
  const { year, branch, type, subject, scope, unit, q } = query;
  const filter = {};

  if (year) filter.year = Number(year);
  if (branch) filter.branch = branch;
  if (type) filter.type = type;
  if (subject) filter.subject = new RegExp(subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  if (scope && validScopes.has(scope)) filter.scope = scope;
  if (unit) filter.unit = Number(unit);
  if (q) {
    const regex = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ title: regex }, { subject: regex }, { description: regex }, { unit_title: regex }];
  }

  return filter;
}

async function createNoteRecord(fields) {
  const note = await Note.create(fields);
  return toApiDoc(note);
}

// ─── NOTES Routes ───────────────────────────────────────────────────────────────

router.get('/notes', async (req, res) => {
  try {
    const notes = await Note.find(buildNotesQuery(req.query))
      .sort({ year: 1, branch: 1, subject: 1, scope: 1, unit: 1, uploaded_at: -1 });
    const data = notes.map(toApiDoc);
    res.json({ success: true, count: data.length, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notes/:id', async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid note id.' });
  }
  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });
    res.json({ success: true, data: toApiDoc(note) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes/upload', requireAdmin, upload.single('file'), async (req, res) => {
  const { drive_link, description } = req.body;
  const validation = validateNoteMetadata(req.body);

  if (validation.error) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: validation.error });
  }

  const { title, subject, year, branch, type, scope, unit, unit_title } = validation.data;
  const file_path = req.file ? 'server/uploads/' + req.file.filename : null;
  const externalUrl = validateExternalUrl(drive_link);

  if (drive_link && !externalUrl) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: 'External link must be a valid http or https URL.' });
  }
  if (!file_path && !externalUrl) {
    removeUploadedFile(req.file);
    return res.status(400).json({ error: 'Provide either a file upload or a Google Drive link.' });
  }

  try {
    const note = await createNoteRecord({
      title,
      subject,
      year: Number(year),
      branch,
      type,
      scope,
      unit: scope === 'unit' ? Number(unit) : null,
      unit_title: scope === 'unit' ? unit_title : null,
      file_path,
      drive_link: externalUrl,
      description: description?.trim() || null
    });
    res.status(201).json({ success: true, message: 'Note uploaded successfully.', data: note });
  } catch (err) {
    removeUploadedFile(req.file);
    res.status(500).json({ error: err.message });
  }
});

router.post('/notes/upload-units', requireAdmin, upload.array('files', 20), async (req, res) => {
  const { drive_links, description } = req.body;
  const validation = validateNoteMetadata(req.body);

  if (validation.error) {
    req.files?.forEach(removeUploadedFile);
    return res.status(400).json({ error: validation.error });
  }

  const { subject, year, branch, type } = validation.data;
  const units = [];
  const unitCount = Number(req.body.unit_count || 0);

  for (let i = 1; i <= unitCount; i++) {
    const unitNum = Number(req.body[`unit_${i}`]);
    const unitTitle = typeof req.body[`unit_title_${i}`] === 'string' ? req.body[`unit_title_${i}`].trim() : '';
    const driveLink = typeof req.body[`drive_link_${i}`] === 'string' ? req.body[`drive_link_${i}`].trim() : '';
    if (!Number.isInteger(unitNum) || unitNum < 1 || unitNum > 20) continue;
    units.push({ unit: unitNum, unit_title: unitTitle || null, drive_link: driveLink || null });
  }

  if (!units.length) {
    req.files?.forEach(removeUploadedFile);
    return res.status(400).json({ error: 'Add at least one unit with a unit number.' });
  }

  const files = req.files || [];
  const created = [];

  try {
    for (let i = 0; i < units.length; i++) {
      const unitInfo = units[i];
      const file = files[i];
      const file_path = file ? 'server/uploads/' + file.filename : null;
      const externalUrl = validateExternalUrl(unitInfo.drive_link);

      if (unitInfo.drive_link && !externalUrl) {
        throw new Error(`Unit ${unitInfo.unit}: external link must be a valid http or https URL.`);
      }
      if (!file_path && !externalUrl) {
        throw new Error(`Unit ${unitInfo.unit}: provide a file or external link.`);
      }

      const title = unitInfo.unit_title
        ? `${subject} – Unit ${unitInfo.unit}: ${unitInfo.unit_title}`
        : `${subject} – Unit ${unitInfo.unit}`;

      const note = await createNoteRecord({
        title,
        subject,
        year: Number(year),
        branch,
        type,
        scope: 'unit',
        unit: unitInfo.unit,
        unit_title: unitInfo.unit_title,
        file_path,
        drive_link: externalUrl,
        description: description?.trim() || null
      });
      created.push(note);
    }

    res.status(201).json({
      success: true,
      message: `${created.length} unit note(s) uploaded successfully.`,
      count: created.length,
      data: created
    });
  } catch (err) {
    req.files?.forEach(removeUploadedFile);
    res.status(400).json({ error: err.message });
  }
});

router.put('/notes/:id', requireAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid note id.' });
  }

  const { drive_link, description } = req.body;
  const note = await Note.findById(req.params.id);
  if (!note) return res.status(404).json({ error: 'Note not found.' });

  const validation = validateNoteMetadata(req.body, true);
  if (validation.error) return res.status(400).json({ error: validation.error });

  const { title, subject, year, branch, type, scope, unit, unit_title } = validation.data;
  const externalUrl = drive_link === undefined ? undefined : validateExternalUrl(drive_link);
  if (drive_link !== undefined && drive_link && !externalUrl) {
    return res.status(400).json({ error: 'External link must be a valid http or https URL.' });
  }

  try {
    if (title !== undefined) note.title = title;
    if (subject !== undefined) note.subject = subject;
    if (year !== undefined) note.year = Number(year);
    if (branch !== undefined) note.branch = branch;
    if (type !== undefined) note.type = type;
    if (scope !== undefined) note.scope = scope;
    if (scope === 'unit') {
      if (unit !== undefined && unit !== null) note.unit = Number(unit);
      if (unit_title !== undefined) note.unit_title = unit_title;
    } else if (scope === 'combined') {
      note.unit = null;
      note.unit_title = null;
    }
    if (drive_link !== undefined) note.drive_link = externalUrl;
    if (description !== undefined) note.description = description;

    await note.save();
    res.json({ success: true, data: toApiDoc(note) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/notes/:id', requireAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid note id.' });
  }

  try {
    const note = await Note.findById(req.params.id);
    if (!note) return res.status(404).json({ error: 'Note not found.' });

    if (note.file_path && note.file_path.startsWith('server/uploads/')) {
      const absPath = path.join(__dirname, '..', '..', note.file_path);
      if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
    }

    await Note.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Note deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── General resources ──────────────────────────────────────────────────────────
router.get('/resources', async (req, res) => {
  try {
    const rows = await GeneralResource.find().sort({ uploaded_at: -1 });
    res.json({ success: true, data: rows.map(toApiDoc) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/resources/upload', requireAdmin, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover_image', maxCount: 1 }]), async (req, res) => {
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

  try {
    const resource = await GeneralResource.create({
      title,
      category: category || 'General',
      description,
      file_path: filePath,
      drive_link: externalUrl,
      cover_path: coverPath
    });
    res.status(201).json({ success: true, data: toApiDoc(resource) });
  } catch (err) {
    removeUploadedFile(file);
    removeUploadedFile(coverImage);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/resources/:id', requireAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid resource id.' });
  }

  try {
    const resource = await GeneralResource.findById(req.params.id);
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    if (resource.file_path?.startsWith('server/uploads/')) {
      const file = path.join(__dirname, '..', '..', resource.file_path);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    if (resource.cover_path?.startsWith('server/uploads/')) {
      const cover = path.join(__dirname, '..', '..', resource.cover_path);
      if (fs.existsSync(cover)) fs.unlinkSync(cover);
    }

    await GeneralResource.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Resource deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Feedback ───────────────────────────────────────────────────────────────────
router.post('/feedback', async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const message = typeof req.body.message === 'string' ? req.body.message.trim() : '';
  if (!name || !message) return res.status(400).json({ error: 'Name and feedback are required.' });
  if (name.length > 80 || message.length > 1000) return res.status(400).json({ error: 'Feedback is too long.' });

  try {
    const item = await Feedback.create({ name, message });
    res.status(201).json({ success: true, data: { id: String(item._id) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/feedback', requireAdmin, async (req, res) => {
  try {
    const rows = await Feedback.find().sort({ created_at: -1 });
    res.json({ success: true, data: rows.map(toApiDoc) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/feedback/:id', requireAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid feedback id.' });
  }
  try {
    await Feedback.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Feedback deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── ANNOUNCEMENTS ──────────────────────────────────────────────────────────────
router.get('/announcements', async (req, res) => {
  try {
    const rows = await Announcement.find({ active: true }).sort({ created_at: -1 });
    res.json({ success: true, data: rows.map(toApiDoc) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/announcements', requireAdmin, async (req, res) => {
  const { text, icon } = req.body;
  if (!text) return res.status(400).json({ error: 'Announcement text is required.' });

  try {
    const ann = await Announcement.create({ text, icon: icon || '📢' });
    res.status(201).json({ success: true, data: toApiDoc(ann) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/announcements/:id', requireAdmin, async (req, res) => {
  if (!isValidObjectId(req.params.id)) {
    return res.status(400).json({ error: 'Invalid announcement id.' });
  }
  try {
    await Announcement.updateOne({ _id: req.params.id }, { active: false });
    res.json({ success: true, message: 'Announcement removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── STATS ──────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [totalNotes, byYear, byBranch, byType, byScope] = await Promise.all([
      Note.countDocuments(),
      Note.aggregate([{ $group: { _id: '$year', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Note.aggregate([{ $group: { _id: '$branch', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Note.aggregate([{ $group: { _id: '$type', count: { $sum: 1 } } }, { $sort: { _id: 1 } }]),
      Note.aggregate([{ $group: { _id: '$scope', count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
    ]);

    res.json({
      success: true,
      data: {
        totalNotes,
        byYear: byYear.map(r => ({ year: r._id, count: r.count })),
        byBranch: byBranch.map(r => ({ branch: r._id, count: r.count })),
        byType: byType.map(r => ({ type: r._id, count: r.count })),
        byScope: byScope.map(r => ({ scope: r._id || 'combined', count: r.count }))
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.message });
  if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
  next();
});

module.exports = router;
