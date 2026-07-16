const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const databaseDir = path.join(projectRoot, 'database');
const DB_PATH = path.join(databaseDir, 'recb.db');
const STUDY_EXTENSIONS = new Set(['.pdf', '.zip', '.rar', '.docx', '.pptx']);

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(entryPath) : [entryPath];
  });
}

function asProjectPath(filePath) {
  return path.relative(projectRoot, filePath).split(path.sep).join('/');
}

function titleFromFilename(filename) {
  return path.basename(filename, path.extname(filename))
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function materialMetadata(filePath) {
  const relativePath = asProjectPath(filePath);
  const segments = relativePath.split('/');
  const yearIndex = segments.indexOf('year');
  const isYearMaterial = yearIndex !== -1;
  const yearMatch = isYearMaterial && segments[yearIndex + 1].match(/^[1-4]/);
  const branch = isYearMaterial ? segments[yearIndex + 2] : 'IT';
  const isSyllabus = segments.some(part => part.toLowerCase() === 'syllabus');

  return {
    relativePath,
    title: titleFromFilename(filePath),
    subject: isSyllabus ? 'Syllabus' : titleFromFilename(filePath),
    year: yearMatch ? Number(yearMatch[0]) : 1,
    branch: ['IT', 'CE', 'EE', 'ME'].includes(branch) ? branch : 'IT',
    type: isSyllabus ? 'Syllabus' : 'Notes',
    description: isSyllabus ? 'Official year-wise syllabus.' : 'Bundled study material.'
  };
}

function ensureDescriptionColumn(db) {
  const columns = db.prepare('PRAGMA table_info(notes)').all().map(column => column.name);
  if (!columns.includes('description')) db.exec('ALTER TABLE notes ADD COLUMN description TEXT');
}

function ensureGeneralResourceColumns(db) {
  const columns = db.prepare('PRAGMA table_info(general_resources)').all().map(column => column.name);
  if (!columns.includes('cover_path')) db.exec('ALTER TABLE general_resources ADD COLUMN cover_path TEXT');
}

function seedAdmin(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM admin_users').get().count) return;

  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error('Set ADMIN_USERNAME and ADMIN_PASSWORD before first start. See README.md.');
  }
  if (!/^[A-Za-z0-9_.-]{3,50}$/.test(username)) {
    throw new Error('ADMIN_USERNAME must be 3-50 characters using letters, numbers, dot, underscore, or hyphen.');
  }
  if (password.length < 10) {
    throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  }

  db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)')
    .run(username, bcrypt.hashSync(password, 12));
  console.log(`Default administrator created: ${username}`);
}

function seedAnnouncements(db) {
  if (db.prepare('SELECT COUNT(*) AS count FROM announcements').get().count) return;

  const addAnnouncement = db.prepare('INSERT INTO announcements (text, icon) VALUES (?, ?)');
  [
    ['International Summit on sustainable engineering and management.', '🔔'],
    ['Odd semester registration notice and guidelines are available.', '📢'],
    ['Admissions are open for Civil, Electrical, IT and Mechanical Engineering.', '🎓'],
    ['Use the Study Materials page to find notes, syllabus, CT papers and quantum.', '📚']
  ].forEach(([text, icon]) => addAnnouncement.run(text, icon));
}

function importBundledMaterials(db) {
  const files = [
    ...collectFiles(path.join(projectRoot, 'Notes')),
    ...collectFiles(path.join(projectRoot, 'year'))
  ].filter(file => STUDY_EXTENSIONS.has(path.extname(file).toLowerCase()));

  const exists = db.prepare('SELECT id FROM notes WHERE file_path = ?');
  const insert = db.prepare(`
    INSERT INTO notes (title, subject, year, branch, type, file_path, description)
    VALUES (@title, @subject, @year, @branch, @type, @relativePath, @description)
  `);
  let added = 0;
  for (const file of files) {
    const material = materialMetadata(file);
    if (exists.get(material.relativePath)) continue;
    insert.run(material);
    added += 1;
  }
  return added;
}

function importDriveLinks(db) {
  const pages = collectFiles(path.join(projectRoot, 'year'))
    .filter(file => path.basename(file).toLowerCase() === 'down.html');
  const exists = db.prepare(`
    SELECT id FROM notes
    WHERE drive_link = ? AND year = ? AND branch = ?
      AND lower(trim(replace(title, ' Notes', ''))) = lower(trim(?))
  `);
  const insert = db.prepare(`
    INSERT INTO notes (title, subject, year, branch, type, drive_link, description)
    VALUES (?, ?, ?, ?, 'Notes', ?, ?)
  `);
  let added = 0;

  for (const page of pages) {
    const pagePath = asProjectPath(page);
    const metadata = materialMetadata(page);
    const html = fs.readFileSync(page, 'utf8');
    const cards = /onclick="window\.location\.href='([^']+)'"[\s\S]*?<h4[^>]*>([^<]+)<\/h4>/gi;
    for (const match of html.matchAll(cards)) {
      const driveLink = match[1];
      const title = match[2].replace(/\s+/g, ' ').trim();
      if (!driveLink || !title || exists.get(driveLink, metadata.year, metadata.branch, title)) continue;
      insert.run(title, title, metadata.year, metadata.branch, driveLink, `Imported from ${pagePath}.`);
      added += 1;
    }
  }
  return added;
}

function removeLegacyDriveDuplicates(db) {
  const canonicalTitle = title => String(title)
    .toLowerCase()
    .replace(/\bnotes\b/g, '')
    .replace(/mechenics/g, 'mechanics')
    .replace(/electrical engineering/g, 'electrical')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const imported = db.prepare(`
    SELECT * FROM notes WHERE description LIKE 'Imported from year/%'
  `).all();
  const related = db.prepare(`
    SELECT id, title FROM notes
    WHERE id <> ? AND drive_link = ? AND year = ? AND branch = ?
  `);
  const remove = db.prepare('DELETE FROM notes WHERE id = ?');
  let removed = 0;
  for (const note of imported) {
    const duplicate = related.all(note.id, note.drive_link, note.year, note.branch)
      .some(existing => canonicalTitle(existing.title) === canonicalTitle(note.title));
    if (duplicate) {
      remove.run(note.id);
      removed += 1;
    }
  }
  return removed;
}

function initDb() {
  fs.mkdirSync(databaseDir, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      subject TEXT NOT NULL,
      year INTEGER NOT NULL CHECK (year BETWEEN 1 AND 4),
      branch TEXT NOT NULL,
      type TEXT NOT NULL,
      file_path TEXT,
      drive_link TEXT,
      description TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      icon TEXT DEFAULT '📢',
      active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS general_resources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      description TEXT,
      file_path TEXT,
      drive_link TEXT,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);
  ensureDescriptionColumn(db);
  ensureGeneralResourceColumns(db);

  const seed = db.transaction(() => {
    seedAdmin(db);
    seedAnnouncements(db);
    const removedDuplicates = removeLegacyDriveDuplicates(db);
    return {
      files: importBundledMaterials(db),
      links: importDriveLinks(db),
      removedDuplicates
    };
  });
  const result = seed();
  if (result.files || result.links) {
    console.log(`Study materials synchronized: ${result.files} files, ${result.links} Drive links added.`);
  }
  if (result.removedDuplicates) console.log(`Removed ${result.removedDuplicates} duplicate Drive-link records.`);
  console.log(`Database ready: ${DB_PATH}`);
  return db;
}

module.exports = { initDb };
