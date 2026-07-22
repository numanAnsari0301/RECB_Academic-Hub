// public/js/notes.js – Dynamic notes loading and filtering
(function () {
  'use strict';

  let allNotes = [];
  const initialParams = new URLSearchParams(window.location.search);
  let activeYear   = ['1', '2', '3', '4'].includes(initialParams.get('year')) ? initialParams.get('year') : '';
  let activeBranch = ['IT', 'CE', 'EE', 'ME'].includes(initialParams.get('branch')) ? initialParams.get('branch') : '';
  let activeType   = ['Notes', 'Syllabus', 'CT_Paper', 'Quantum', 'PYQ'].includes(initialParams.get('type')) ? initialParams.get('type') : '';
  let activeScope  = ['combined', 'unit'].includes(initialParams.get('scope')) ? initialParams.get('scope') : '';
  let activeUnit   = initialParams.get('unit') || '';
  let searchQuery  = '';

  const notesGrid    = document.getElementById('notes-grid');
  const yearTabs     = document.querySelectorAll('.year-tab');
  const branchCards  = document.querySelectorAll('.branch-card');
  const typeFilter   = document.getElementById('type-filter');
  const scopeFilter  = document.getElementById('scope-filter');
  const unitFilter   = document.getElementById('unit-filter');
  const searchInput  = document.getElementById('search-input');
  const resultCount  = document.getElementById('result-count');
  const loadingEl    = document.getElementById('notes-loading');
  const totalEl      = document.getElementById('total-notes');

  const typeIcon = {
    'Notes':    '📖',
    'Syllabus': '📋',
    'CT_Paper': '📝',
    'Quantum':  '⚡',
    'PYQ':      '📄'
  };

  const typeBadge = {
    'Notes':    'badge-notes',
    'Syllabus': 'badge-syllabus',
    'CT_Paper': 'badge-ct',
    'Quantum':  'badge-quantum',
    'PYQ':      'badge-ct'
  };

  async function fetchNotes() {
    if (loadingEl) loadingEl.style.display = 'block';
    if (notesGrid) notesGrid.innerHTML = '';
    try {
      const res  = await fetch('/api/notes');
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      allNotes = json.data;
      if (totalEl) totalEl.textContent = allNotes.length;
    } catch (err) {
      if (notesGrid) notesGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">⚠️</div>
          <h3>Could not load notes</h3>
          <p>${err.message}</p>
        </div>`;
    } finally {
      if (loadingEl) loadingEl.style.display = 'none';
      renderNotes();
    }
  }

  function updateUnitFilterState() {
    if (!unitFilter) return;
    const showUnits = activeScope === 'unit';
    unitFilter.disabled = !showUnits;
    if (!showUnits) {
      activeUnit = '';
      unitFilter.value = '';
    }
  }

  function renderNotes() {
    if (!notesGrid) return;

    let filtered = allNotes;

    if (activeYear)   filtered = filtered.filter(n => String(n.year) === activeYear);
    if (activeBranch) filtered = filtered.filter(n => n.branch === activeBranch);
    if (activeType)   filtered = filtered.filter(n => n.type === activeType);
    if (activeScope)  filtered = filtered.filter(n => (n.scope || 'combined') === activeScope);
    if (activeUnit)   filtered = filtered.filter(n => String(n.unit) === activeUnit);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.subject.toLowerCase().includes(q) ||
        (n.description || '').toLowerCase().includes(q) ||
        (n.unit_title || '').toLowerCase().includes(q)
      );
    }

    if (resultCount) resultCount.textContent = `${filtered.length} resource${filtered.length !== 1 ? 's' : ''}`;

    if (!filtered.length) {
      notesGrid.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🔍</div>
          <h3>No notes found</h3>
          <p>Try changing the filters or search query.</p>
        </div>`;
      return;
    }

    const sorted = [...filtered].sort((a, b) => {
      if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
      const scopeA = a.scope || 'combined';
      const scopeB = b.scope || 'combined';
      if (scopeA !== scopeB) return scopeA === 'combined' ? -1 : 1;
      return (a.unit || 0) - (b.unit || 0);
    });

    notesGrid.innerHTML = sorted.map(note => buildNoteCard(note)).join('');

    requestAnimationFrame(() => {
      notesGrid.querySelectorAll('.note-card').forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(16px)';
        setTimeout(() => {
          card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
          card.style.opacity = '1';
          card.style.transform = '';
        }, i * 40);
      });
    });
  }

  function buildNoteCard(note) {
    const icon   = typeIcon[note.type]  || '📄';
    const badge  = typeBadge[note.type] || 'badge-notes';
    const hasFile = note.file_path || note.drive_link;
    const downloadUrl = hasFile ? `/download/${note.id}` : '#';
    const viewUrl = safeExternalUrl(note.drive_link) || (note.file_path ? `/download/${note.id}` : '#');
    const scope = note.scope || 'combined';
    const scopeLabel = scope === 'unit'
      ? `Unit ${note.unit}${note.unit_title ? `: ${note.unit_title}` : ''}`
      : 'Combined Notes';

    return `
      <div class="note-card glass-card">
        <div class="note-card-header">
          <div class="note-icon">${icon}</div>
          <div class="note-meta">
            <span class="note-subject">${escHtml(note.subject)}</span>
            <h3 class="note-title">${escHtml(note.title)}</h3>
          </div>
          <span class="badge ${badge}">${escHtml(note.type)}</span>
        </div>
        ${note.description ? `<p class="note-description">${escHtml(note.description)}</p>` : ''}
        <div class="note-tags">
          <span class="tag tag-year">Year ${note.year}</span>
          <span class="tag tag-branch">${escHtml(note.branch)}</span>
          <span class="tag ${scope === 'unit' ? 'tag-unit' : 'tag-combined'}">${escHtml(scopeLabel)}</span>
        </div>
        <div class="note-card-footer">
          ${hasFile
            ? `<a href="${downloadUrl}" class="btn btn-primary btn-sm" target="_blank" rel="noopener">
                 ⬇ Download
               </a>
               <a href="${viewUrl}" class="btn btn-outline btn-sm" target="_blank" rel="noopener">
                 👁 View
               </a>`
            : `<span class="btn btn-outline btn-sm" style="opacity:0.4;cursor:not-allowed;flex:1">
                 🔜 Coming Soon
               </span>`
          }
        </div>
      </div>`;
  }

  function escHtml(str) {
    if (!str) return '';
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function safeExternalUrl(value) {
    try {
      const url = new URL(value);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch (_) {
      return null;
    }
  }

  window.clearNotesFilters = function () {
    activeYear = '';
    activeBranch = '';
    activeType = '';
    activeScope = '';
    activeUnit = '';
    searchQuery = '';
    yearTabs.forEach(tab => tab.classList.toggle('active', !tab.dataset.year));
    branchCards.forEach(card => card.classList.remove('active'));
    if (typeFilter) typeFilter.value = '';
    if (scopeFilter) scopeFilter.value = '';
    if (unitFilter) {
      unitFilter.value = '';
      unitFilter.disabled = true;
    }
    if (searchInput) searchInput.value = '';
    renderNotes();
  };

  yearTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      yearTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeYear = tab.dataset.year || '';
      renderNotes();
    });
  });

  branchCards.forEach(card => {
    card.addEventListener('click', () => {
      if (card.classList.contains('active')) {
        card.classList.remove('active');
        activeBranch = '';
      } else {
        branchCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        activeBranch = card.dataset.branch || '';
      }
      renderNotes();
    });
  });

  if (typeFilter) {
    typeFilter.addEventListener('change', () => {
      activeType = typeFilter.value;
      renderNotes();
    });
  }

  if (scopeFilter) {
    scopeFilter.addEventListener('change', () => {
      activeScope = scopeFilter.value;
      updateUnitFilterState();
      renderNotes();
    });
  }

  if (unitFilter) {
    unitFilter.addEventListener('change', () => {
      activeUnit = unitFilter.value;
      renderNotes();
    });
  }

  let searchTimer;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = searchInput.value.trim();
        renderNotes();
      }, 300);
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (['1', '2', '3', '4'].includes(activeYear)) {
      yearTabs.forEach(tab => tab.classList.toggle('active', tab.dataset.year === activeYear));
    }
    if (activeBranch) {
      branchCards.forEach(card => card.classList.toggle('active', card.dataset.branch === activeBranch));
    }
    if (typeFilter) typeFilter.value = activeType;
    if (scopeFilter) scopeFilter.value = activeScope;
    updateUnitFilterState();
    if (unitFilter && activeUnit) unitFilter.value = activeUnit;
    fetchNotes();
  });
})();
