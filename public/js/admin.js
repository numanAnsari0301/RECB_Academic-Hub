// public/js/admin.js – Admin panel logic
(function () {
  'use strict';
  const notesById = new Map();

  // ─── Auth check ───────────────────────────────────────────────────
  async function checkAuth() {
    const res  = await fetch('/api/auth/status');
    const json = await res.json();
    if (!json.isAdmin) {
      window.location.href = 'login.html';
    } else {
      document.getElementById('admin-username').textContent = json.username || 'Admin';
      const accountUsername = document.getElementById('account-username');
      if (accountUsername) accountUsername.value = json.username || '';
      loadDashboard();
      loadNotesTable();
      loadAnnouncements();
      loadGeneralResources();
      loadFeedback();
    }
  }

  // ─── Sidebar navigation ───────────────────────────────────────────
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
      link.classList.add('active');
      const target = link.dataset.section;
      if (target) {
        const el = document.getElementById(target);
        if (el) el.classList.add('active');
      }
    });
  });

  // ─── Logout ───────────────────────────────────────────────────────
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = 'login.html';
    });
  }

  // ─── Dashboard stats ──────────────────────────────────────────────
  async function loadDashboard() {
    try {
      const res  = await fetch('/api/stats');
      const json = await res.json();
      if (!json.success) return;
      const { totalNotes, byYear, byBranch } = json.data;
      setEl('stat-total', totalNotes);

      const yearMap = {};
      byYear.forEach(r => { yearMap[r.year] = r.count; });
      setEl('stat-yr1', yearMap[1] || 0);
      setEl('stat-yr2', yearMap[2] || 0);

      const branchMap = {};
      byBranch.forEach(r => { branchMap[r.branch] = r.count; });
      setEl('stat-it', branchMap['IT'] || 0);
      setEl('stat-ce', branchMap['CE'] || 0);
    } catch (_) {}
  }

  function setEl(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  }

  // ─── Notes Table ──────────────────────────────────────────────────
  async function loadNotesTable() {
    const tbody = document.getElementById('notes-tbody');
    if (!tbody) return;
    try {
      const res  = await fetch('/api/notes');
      const json = await res.json();
      if (!json.success) return;
      notesById.clear();
      json.data.forEach(note => notesById.set(note.id, note));
      tbody.innerHTML = json.data.map(note => `
        <tr>
          <td>${note.id}</td>
          <td>${esc(note.title)}</td>
          <td>${esc(note.subject)}</td>
          <td><span class="badge badge-notes">Yr ${note.year}</span></td>
          <td>${esc(note.branch)}</td>
          <td><span class="badge">${esc(note.type)}</span></td>
          <td>
            ${note.file_path ? `<a href="/download/${note.id}" class="btn btn-sm btn-outline" target="_blank">⬇ File</a>` : ''}
            ${note.drive_link ? `<a href="${esc(note.drive_link)}" class="btn btn-sm btn-outline" target="_blank">🔗 Drive</a>` : ''}
          </td>
          <td>
            <div class="table-actions">
              <button class="btn btn-sm btn-outline" onclick="openEditNote(${note.id})">Edit</button>
              <button class="btn btn-sm btn-danger" onclick="deleteNote(${note.id}, this)">🗑 Delete</button>
            </div>
          </td>
        </tr>
      `).join('');
    } catch (_) {}
  }

  window.deleteNote = async function (id, btn) {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const res  = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast('Note deleted.');
        loadNotesTable();
        loadDashboard();
      } else {
        showToast(json.error, 'error');
      }
    } catch (err) {
      showToast('Server error', 'error');
    } finally {
      btn.disabled = false;
    }
  };

  const editModal = document.getElementById('edit-note-modal');
  const editForm = document.getElementById('edit-note-form');
  function closeEditModal() {
    if (!editModal) return;
    editModal.classList.remove('open');
    editModal.setAttribute('aria-hidden', 'true');
  }

  window.openEditNote = function (id) {
    const note = notesById.get(id);
    if (!note || !editModal) return showToast('Resource could not be loaded.', 'error');
    document.getElementById('edit-note-id').value = note.id;
    document.getElementById('edit-title').value = note.title || '';
    document.getElementById('edit-subject').value = note.subject || '';
    document.getElementById('edit-type').value = note.type || 'Notes';
    document.getElementById('edit-year').value = note.year || 1;
    document.getElementById('edit-branch').value = note.branch || 'IT';
    document.getElementById('edit-drive-link').value = note.drive_link || '';
    document.getElementById('edit-description').value = note.description || '';
    editModal.classList.add('open');
    editModal.setAttribute('aria-hidden', 'false');
  };

  document.getElementById('close-edit-modal')?.addEventListener('click', closeEditModal);
  document.getElementById('cancel-edit-modal')?.addEventListener('click', closeEditModal);
  editModal?.addEventListener('click', event => {
    if (event.target === editModal) closeEditModal();
  });

  if (editForm) {
    editForm.addEventListener('submit', async event => {
      event.preventDefault();
      const id = document.getElementById('edit-note-id').value;
      const payload = {
        title: document.getElementById('edit-title').value.trim(),
        subject: document.getElementById('edit-subject').value.trim(),
        type: document.getElementById('edit-type').value,
        year: Number(document.getElementById('edit-year').value),
        branch: document.getElementById('edit-branch').value,
        drive_link: document.getElementById('edit-drive-link').value.trim() || null,
        description: document.getElementById('edit-description').value.trim() || null
      };
      try {
        const response = await fetch(`/api/notes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const json = await response.json();
        if (!json.success) return showToast(json.error || 'Could not save changes.', 'error');
        closeEditModal();
        showToast('Resource updated.');
        loadNotesTable();
        loadDashboard();
      } catch (_) {
        showToast('Server error while saving changes.', 'error');
      }
    });
  }

  // ─── Upload Form ──────────────────────────────────────────────────
  const uploadForm = document.getElementById('upload-form');
  if (uploadForm) {
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = uploadForm.querySelector('[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Uploading...';

      const formData = new FormData(uploadForm);
      try {
        const res  = await fetch('/api/notes/upload', { method: 'POST', body: formData });
        const json = await res.json();
        if (json.success) {
          showToast('✅ Note uploaded successfully!');
          uploadForm.reset();
          document.getElementById('file-name-display').textContent = '';
          loadNotesTable();
          loadDashboard();
        } else {
          showToast(json.error || 'Upload failed', 'error');
        }
      } catch (err) {
        showToast('Network error', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '⬆ Upload Note';
      }
    });
  }

  // Drop zone file name display
  const fileInput = document.getElementById('file-input');
  const fileNameDisplay = document.getElementById('file-name-display');
  const dropZone = document.getElementById('drop-zone');

  if (fileInput && fileNameDisplay) {
    fileInput.addEventListener('change', () => {
      fileNameDisplay.textContent = fileInput.files[0]?.name || '';
    });
  }

  if (dropZone) {
    dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
    dropZone.addEventListener('drop', e => {
      e.preventDefault();
      dropZone.classList.remove('dragging');
      if (e.dataTransfer.files.length && fileInput) {
        fileInput.files = e.dataTransfer.files;
        if (fileNameDisplay) fileNameDisplay.textContent = fileInput.files[0]?.name || '';
      }
    });
  }

  // ─── Announcements ────────────────────────────────────────────────
  async function loadAnnouncements() {
    const list = document.getElementById('ann-list');
    if (!list) return;
    try {
      const res  = await fetch('/api/announcements');
      const json = await res.json();
      list.innerHTML = json.data.map(a => `
        <div class="ann-item">
          <span class="ann-item-icon">${a.icon || '📢'}</span>
          <span class="ann-item-text">${esc(a.text)}</span>
          <button class="btn btn-sm btn-danger" onclick="deleteAnnouncement(${a.id}, this)">Remove</button>
        </div>
      `).join('') || '<p style="color:var(--text-muted)">No announcements.</p>';
    } catch (_) {}
  }

  window.deleteAnnouncement = async function (id, btn) {
    btn.disabled = true;
    try {
      const res  = await fetch(`/api/announcements/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) { showToast('Announcement removed.'); loadAnnouncements(); }
    } catch (_) {}
  };

  const annForm = document.getElementById('ann-form');
  if (annForm) {
    annForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = document.getElementById('ann-text').value.trim();
      const icon = document.getElementById('ann-icon').value.trim() || '📢';
      if (!text) return;
      try {
        const res  = await fetch('/api/announcements', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, icon })
        });
        const json = await res.json();
        if (json.success) {
          showToast('Announcement added!');
          annForm.reset();
          loadAnnouncements();
        } else {
          showToast(json.error, 'error');
        }
      } catch (_) { showToast('Error', 'error'); }
    });
  }

  // ─── Utils ───────────────────────────────────────────────────────
  const credentialsForm = document.getElementById('credentials-form');
  if (credentialsForm) {
    credentialsForm.addEventListener('submit', async event => {
      event.preventDefault();
      const newPassword = document.getElementById('new-password').value;
      if (newPassword !== document.getElementById('confirm-password').value) {
        return showToast('New passwords do not match.', 'error');
      }
      const button = credentialsForm.querySelector('[type="submit"]');
      button.disabled = true;
      try {
        const response = await fetch('/api/auth/credentials', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: document.getElementById('account-username').value.trim(),
            currentPassword: document.getElementById('current-password').value,
            newPassword
          })
        });
        const json = await response.json();
        if (!json.success) return showToast(json.error || 'Could not update credentials.', 'error');
        const username = document.getElementById('account-username').value.trim();
        document.getElementById('admin-username').textContent = username;
        credentialsForm.reset();
        document.getElementById('account-username').value = username;
        showToast('Credentials updated. Use the new details at your next login.');
      } catch (_) {
        showToast('Server error while updating credentials.', 'error');
      } finally {
        button.disabled = false;
      }
    });
  }

  async function loadGeneralResources() {
    const list = document.getElementById('general-resources-list');
    if (!list) return;
    try {
      const json = await (await fetch('/api/resources')).json();
      list.innerHTML = json.data.map(resource => `<div class="ann-item"><span class="ann-item-text"><strong>${esc(resource.title)}</strong> — ${esc(resource.category)}</span><button class="btn btn-sm btn-danger" onclick="deleteGeneralResource(${resource.id})">Remove</button></div>`).join('') || '<p style="color:var(--text-muted)">No general resources.</p>';
    } catch (_) { list.innerHTML = '<p style="color:var(--text-muted)">Could not load resources.</p>'; }
  }

  const generalResourceForm = document.getElementById('general-resource-form');
  if (generalResourceForm) {
    generalResourceForm.addEventListener('submit', async event => {
      event.preventDefault();
      const response = await fetch('/api/resources/upload', { method: 'POST', body: new FormData(generalResourceForm) });
      const json = await response.json();
      if (!json.success) return showToast(json.error || 'Could not add resource.', 'error');
      generalResourceForm.reset();
      document.getElementById('resource-category').value = 'General';
      showToast('General resource added.');
      loadGeneralResources();
    });
  }

  window.deleteGeneralResource = async id => {
    if (!confirm('Remove this general resource?')) return;
    const json = await (await fetch(`/api/resources/${id}`, { method: 'DELETE' })).json();
    if (json.success) { showToast('General resource removed.'); loadGeneralResources(); }
    else showToast(json.error || 'Could not remove resource.', 'error');
  };

  async function loadFeedback() {
    const list = document.getElementById('feedback-list');
    if (!list) return;
    try {
      const json = await (await fetch('/api/feedback')).json();
      list.innerHTML = json.data.map(item => `<div class="ann-item"><span class="ann-item-text"><strong>${esc(item.name)}</strong><br>${esc(item.message)}</span><button class="btn btn-sm btn-danger" onclick="deleteFeedback(${item.id})">Remove</button></div>`).join('') || '<p style="color:var(--text-muted)">No feedback yet.</p>';
    } catch (_) { list.innerHTML = '<p style="color:var(--text-muted)">Could not load feedback.</p>'; }
  }

  window.deleteFeedback = async id => {
    const json = await (await fetch(`/api/feedback/${id}`, { method: 'DELETE' })).json();
    if (json.success) { showToast('Feedback removed.'); loadFeedback(); }
    else showToast(json.error || 'Could not remove feedback.', 'error');
  };

  function esc(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Init ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', checkAuth);
})();
