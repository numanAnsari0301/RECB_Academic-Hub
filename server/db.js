const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const {
  Note,
  Announcement,
  AdminUser,
  GeneralResource
} = require('./models');

const projectRoot = path.join(__dirname, '..');
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
    scope: 'combined',
    description: isSyllabus ? 'Official year-wise syllabus.' : 'Bundled study material.'
  };
}

async function seedAdmin() {
  const count = await AdminUser.countDocuments();
  if (count) return;

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

  await AdminUser.create({
    username,
    password_hash: bcrypt.hashSync(password, 12)
  });
  console.log(`Default administrator created: ${username}`);
}

async function seedAnnouncements() {
  const count = await Announcement.countDocuments();
  if (count) return;

  await Announcement.insertMany([
    { text: 'International Summit on sustainable engineering and management.', icon: '🔔' },
    { text: 'Odd semester registration notice and guidelines are available.', icon: '📢' },
    { text: 'Admissions are open for Civil, Electrical, IT and Mechanical Engineering.', icon: '🎓' },
    { text: 'Use the Study Materials page to find notes, syllabus, CT papers and quantum.', icon: '📚' }
  ]);
}

async function importBundledMaterials() {
  const files = [
    ...collectFiles(path.join(projectRoot, 'Notes')),
    ...collectFiles(path.join(projectRoot, 'year'))
  ].filter(file => STUDY_EXTENSIONS.has(path.extname(file).toLowerCase()));

  let added = 0;
  for (const file of files) {
    const material = materialMetadata(file);
    const exists = await Note.findOne({ file_path: material.relativePath }).select('_id');
    if (exists) continue;
    await Note.create({
      title: material.title,
      subject: material.subject,
      year: material.year,
      branch: material.branch,
      type: material.type,
      scope: material.scope,
      file_path: material.relativePath,
      description: material.description
    });
    added += 1;
  }
  return added;
}

async function importDriveLinks() {
  const pages = collectFiles(path.join(projectRoot, 'year'))
    .filter(file => path.basename(file).toLowerCase() === 'down.html');

  let added = 0;
  for (const page of pages) {
    const pagePath = asProjectPath(page);
    const metadata = materialMetadata(page);
    const html = fs.readFileSync(page, 'utf8');
    const cards = /onclick="window\.location\.href='([^']+)'"[\s\S]*?<h4[^>]*>([^<]+)<\/h4>/gi;
    for (const match of html.matchAll(cards)) {
      const driveLink = match[1];
      const title = match[2].replace(/\s+/g, ' ').trim();
      if (!driveLink || !title) continue;

      const exists = await Note.findOne({
        drive_link: driveLink,
        year: metadata.year,
        branch: metadata.branch,
        title: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')
      }).select('_id');
      if (exists) continue;

      await Note.create({
        title,
        subject: title,
        year: metadata.year,
        branch: metadata.branch,
        type: 'Notes',
        scope: 'combined',
        drive_link: driveLink,
        description: `Imported from ${pagePath}.`
      });
      added += 1;
    }
  }
  return added;
}

async function initDb() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/recb_education';
  console.log('🔄 Connecting to MongoDB...');
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  } catch (err) {
    console.error('');
    console.error('❌ Could not connect to MongoDB at:', uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
    console.error('   Make sure MongoDB is running, or set MONGODB_URI in your .env file.');
    console.error('   To install MongoDB locally: https://www.mongodb.com/docs/manual/installation/');
    console.error('   Or use MongoDB Atlas (free): https://www.mongodb.com/atlas');
    console.error('');
    throw err;
  }
  console.log(`✅ MongoDB connected: ${uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);

  await seedAdmin();
  await seedAnnouncements();

  const files = await importBundledMaterials();
  const links = await importDriveLinks();
  if (files || links) {
    console.log(`Study materials synchronized: ${files} files, ${links} Drive links added.`);
  }

  return mongoose.connection;
}

module.exports = { initDb, mongoose };
