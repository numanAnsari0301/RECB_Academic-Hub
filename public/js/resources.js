(function () {
  'use strict';
  const grid = document.getElementById('resources-grid');
  const esc = value => String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  async function loadResources() {
    try {
      const response = await fetch('/api/resources');
      const json = await response.json();
      if (!json.success) throw new Error(json.error);
      grid.innerHTML = json.data.length ? json.data.map(resource => `
        <article class="note-card glass-card">
          ${resource.cover_path ? `<img class="resource-cover" src="${esc(resource.cover_path.replace('server/uploads/', '/uploads/'))}" alt="Cover for ${esc(resource.title)}">` : ''}
          <div class="note-card-header"><div class="note-icon">📁</div><div class="note-meta"><span class="note-subject">${esc(resource.category)}</span><h3 class="note-title">${esc(resource.title)}</h3></div></div>
          ${resource.description ? `<p class="note-description">${esc(resource.description)}</p>` : ''}
          <div class="note-card-footer"><a class="btn btn-primary btn-sm" href="/resource-download/${resource.id}" target="_blank" rel="noopener">Open resource</a></div>
        </article>`).join('') : '<div class="empty-state" style="grid-column:1/-1"><h3>No general resources yet</h3><p>Check back soon, or request one below.</p></div>';
    } catch (_) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>Could not load resources</h3><p>Please try again later.</p></div>';
    }
  }

  document.getElementById('feedback-form').addEventListener('submit', async event => {
    event.preventDefault();
    const status = document.getElementById('feedback-status');
    const button = event.target.querySelector('[type="submit"]');
    button.disabled = true;
    status.textContent = 'Sending your request...';
    try {
      const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.getElementById('feedback-name').value.trim(), message: document.getElementById('feedback-message').value.trim() }) });
      const json = await response.json();
      if (response.ok && json.success) {
        event.target.reset();
        status.textContent = 'Thank you. Your request has been sent to the administrator.';
      } else {
        status.textContent = json.error || 'Could not send feedback. Please try again.';
      }
    } catch (_) {
      status.textContent = 'Could not connect to the server. Restart the portal and try again.';
    } finally {
      button.disabled = false;
    }
  });

  document.addEventListener('DOMContentLoaded', loadResources);
})();
