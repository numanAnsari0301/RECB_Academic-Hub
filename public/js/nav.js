// public/js/nav.js – Shared navigation component
(function () {
  'use strict';

  // ─── Active link highlighting ─────────────────────────────────────
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentPath || (currentPath === '' && href === 'index.html')) {
      link.classList.add('active');
    }
  });

  // ─── Mobile hamburger toggle ──────────────────────────────────────
  const toggle = document.getElementById('nav-toggle');
  const navLinks = document.getElementById('nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
      const spans = toggle.querySelectorAll('span');
      if (navLinks.classList.contains('open')) {
        spans[0].style.transform = 'rotate(45deg) translateY(7px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translateY(-7px)';
      } else {
        spans.forEach(s => s.style.transform = s.style.opacity = '');
      }
    });
  }

  // ─── Sticky nav scroll effect ─────────────────────────────────────
  const nav = document.querySelector('.site-nav');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        nav.style.boxShadow = '0 4px 24px rgba(0,0,0,0.5)';
      } else {
        nav.style.boxShadow = '';
      }
    }, { passive: true });
  }

  // ─── Toast notification utility (global) ─────────────────────────
  window.showToast = function (message, type = 'success') {
    const old = document.querySelector('.toast');
    if (old) old.remove();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  };

  // ─── Load announcements into marquee ─────────────────────────────
  async function loadAnnouncements() {
    const track = document.getElementById('marquee-track');
    if (!track) return;

    try {
      const res = await fetch('/api/announcements');
      const json = await res.json();
      if (!json.success || !json.data.length) return;

      // Duplicate for seamless loop
      const items = [...json.data, ...json.data];
      track.innerHTML = items.map(a =>
        `<span class="marquee-item">${escapeHtml(a.icon || '📢')} ${escapeHtml(a.text)}</span>
         <span class="marquee-sep">◆</span>`
      ).join('');
    } catch (_) {
      // silently fail – keep default marquee text
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', loadAnnouncements);
})();
