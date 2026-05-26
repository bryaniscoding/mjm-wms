// ============================================================
//  utils.js — Shared helpers
//  Loaded first. No dependencies on other modules.
// ============================================================

// ── ESCAPE HTML ───────────────────────────────────────────────
function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;');
}

// ── DATE FORMATTING ───────────────────────────────────────────
function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-MY', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

// ── UNIQUE ID ─────────────────────────────────────────────────
function genId() {
  return 'w_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

// ── TOAST NOTIFICATION ────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, isError = false) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

// ── SORT HELPERS ──────────────────────────────────────────────
function applySort(list, state, valFn) {
  if (state.dir === 0) return list;
  return [...list].sort((a, b) => {
    const va = String(valFn(a, state.col) || '');
    const vb = String(valFn(b, state.col) || '');
    const cmp = va.localeCompare(vb, undefined, { numeric: true });
    return state.dir === 1 ? cmp : -cmp;
  });
}

function handleSort(state, col, renderFn) {
  if (state.col === col) {
    state.dir = (state.dir % 2) + 1;
  } else {
    state.col = col;
    state.dir = 1;
  }
  renderFn();
}

function updateSortIcons(pageId, state) {
  document.querySelectorAll(`#${pageId} .sortable`).forEach(th => {
    th.classList.remove('asc', 'desc');
    if (th.dataset.col === state.col && state.dir > 0) {
      th.classList.add(state.dir === 1 ? 'asc' : 'desc');
    }
  });
}

// ── EXPIRY HELPERS ────────────────────────────────────────────
function expiryClass(dateStr, mode) {
  if (!dateStr) return 'exp-none';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  const days  = Math.floor((exp - today) / 86400000);
  if (mode === 'short') {
    if (days < 0)   return 'exp-danger';
    if (days <= 30) return 'exp-urgent';
    if (days <= 90) return 'exp-warn';
    return 'exp-safe';
  }
  if (mode === 'long') {
    if (days < 0)    return 'exp-danger';
    if (days <= 730) return 'exp-urgent';
    if (days <= 1095) return 'exp-warn';
    return 'exp-safe';
  }
  return 'exp-none';
}

function expiryLabel(dateStr) {
  if (!dateStr) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const exp   = new Date(dateStr); exp.setHours(0, 0, 0, 0);
  const days  = Math.floor((exp - today) / 86400000);
  const fmt   = exp.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  if (days < 0)   return `${fmt} (Expired)`;
  if (days === 0) return `${fmt} (Today)`;
  if (days === 1) return `${fmt} (Tomorrow)`;
  if (days < 30)  return `${fmt} (${days}d)`;
  if (days < 365) return `${fmt} (${Math.floor(days / 30)}mo)`;
  return `${fmt} (${(days / 365).toFixed(1)}yr)`;
}

function expiryCell(dateStr, mode) {
  if (!dateStr) return `<div class="expiry-cell exp-none"><span class="expiry-text">—</span></div>`;
  const cls = expiryClass(dateStr, mode);
  const lbl = expiryLabel(dateStr);
  return `<div class="expiry-cell ${cls}"><div class="expiry-dot"></div><span class="expiry-text">${esc(lbl)}</span></div>`;
}

// ── MODAL ERROR HELPERS ───────────────────────────────────────
function showModalError(msg) {
  const el = document.getElementById('modalError');
  if (el) {
    el.textContent = msg;
    el.style.display = 'block';
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}
function hideModalError() {
  const el = document.getElementById('modalError');
  if (el) el.style.display = 'none';
}

function showAppError(msg) {
  const el = document.getElementById('appModalError');
  if (el) { el.textContent = msg; el.style.display = 'block'; }
}

// ── INITIALS ──────────────────────────────────────────────────
function getInitials(name) {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

// ── MODAL STACK ───────────────────────────────────────────────
// Tracks chain of open modals so closing one restores the previous.
// Usage:
//   openModal('myModalId')   — parks current top, opens new one
//   closeModal('myModalId')  — closes this one, restores previous top
//   closeModalOutsideStack(e, 'myModalId') — for overlay click handlers

const _modalStack = [];

function openModal(id) {
  // Park current top modal if any
  const current = _modalStack[_modalStack.length - 1];
  if (current && current !== id) {
    const el = document.getElementById(current);
    if (el) el.classList.remove('open');
  }
  // Open new modal and push to stack
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
  // Only push if not already on top
  if (_modalStack[_modalStack.length - 1] !== id) _modalStack.push(id);
}

function closeModal(id) {
  // Close this modal
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
  // Remove from stack (wherever it is)
  const idx = _modalStack.lastIndexOf(id);
  if (idx !== -1) _modalStack.splice(idx, 1);
  // Restore previous modal if any
  const prev = _modalStack[_modalStack.length - 1];
  if (prev) {
    const prevEl = document.getElementById(prev);
    if (prevEl) prevEl.classList.add('open');
  }
}

function closeModalOutsideStack(e, id) {
  if (e.target === document.getElementById(id)) closeModal(id);
}

function clearModalStack() {
  // Close all open modals (e.g. on Escape key)
  [..._modalStack].reverse().forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
  });
  _modalStack.length = 0;
}