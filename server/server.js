// Main Express application
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { initDb } = require('./db');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

if (!process.env.SESSION_SECRET) {
  console.warn('SESSION_SECRET is not set. Sessions will end whenever the server restarts.');
}

app.disable('x-powered-by');
if (isProduction) app.set('trust proxy', 1);

// ─── Middleware ─────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProduction,
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// ─── Static Files ───────────────────────────────────────────────────────────────
// Serve the public folder (our frontend)
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve original Notes folder (for existing zip/pdf downloads)
app.use('/Notes', express.static(path.join(__dirname, '..', 'Notes')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve images
app.use('/image', express.static(path.join(__dirname, '..', 'image')));

// ─── API Routes ─────────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);
app.use('/api/auth', authRoutes);

// ─── Download route for files ───────────────────────────────────────────────────
app.get('/download/:id', (req, res) => {
  const dbModule = app.get('db');
  const note = dbModule.prepare('SELECT * FROM notes WHERE id = ?').get(req.params.id);
  if (!note) return res.status(404).send('File not found.');

  if (note.drive_link) {
    return res.redirect(note.drive_link);
  }

  if (note.file_path) {
    const absPath = path.join(__dirname, '..', note.file_path);
    if (fs.existsSync(absPath)) {
      return res.download(absPath);
    }
  }

  res.status(404).send('File not found.');
});

app.get('/resource-download/:id', (req, res) => {
  const resource = app.get('db').prepare('SELECT * FROM general_resources WHERE id = ?').get(req.params.id);
  if (!resource) return res.status(404).send('Resource not found.');
  if (resource.drive_link) return res.redirect(resource.drive_link);
  const file = resource.file_path && path.join(__dirname, '..', resource.file_path);
  if (file && fs.existsSync(file)) return res.download(file);
  return res.status(404).send('File not found.');
});

// ─── Fallback: serve index.html for SPA-like routing ───────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── Start server ─────────────────────────────────────────────────────────────
async function startServer() {
  console.log('🔄 Initializing database...');
  const dbModule = await initDb();
  app.set('db', dbModule);

  const server = app.listen(PORT, () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   REC Bijnor Education Portal – Server Started   ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  🌐 Portal:  http://localhost:${PORT}               ║`);
    console.log(`║  🔧 Admin:   http://localhost:${PORT}/admin.html     ║`);
    console.log(`║  🗄️  API:     http://localhost:${PORT}/api/notes      ║`);
    console.log('║  👤 Login:   Use the configured administrator     ║');
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });

  server.on('error', err => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other server or start this portal with a different PORT.`);
    } else {
      console.error('Failed to start server:', err.message);
    }
    process.exitCode = 1;
  });
}

startServer().catch(err => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
