// ============================================================
//  workers.js — Worker profiles: table, form, CRUD
//  Depends on: utils.js, data.js, navigation.js, legal.js, claims.js
// ============================================================

// ── MODULE STATE ──────────────────────────────────────────────
let editingId  = null;
let deletingId = null;
let workerSort = { col: 'name', dir: 1 };

// ── FILTER BAR POPULATION ─────────────────────────────────────
function populateWorkerFilters() {
  // AP Company filter
  const cos     = [...new Set(workers.map(w => w.legal?.quota?.company).filter(Boolean))].sort();
  const compSel = document.getElementById('companyFilter');
  if (compSel) {
    const cur = compSel.value;
    compSel.innerHTML = `<option value="">All AP Companies</option>` +
      cos.map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }
  // Location filter
  populateSelectFromLocations('locationFilter', 'All Locations');
}

function populateSelectFromLocations(selId, placeholder) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur    = sel.value;
  const sorted = [...workLocations].sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = `<option value="">${esc(placeholder)}</option>` +
    sorted.map(l => `<option value="${esc(l.name)}" ${l.name === cur ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
}

// ── SORTING ───────────────────────────────────────────────────
function sortWorkers(col) { handleSort(workerSort, col, renderWorkerTable); }
function filterWorkers()  { renderWorkerTable(); }
function clearWorkerFilters() {
  ['workerSearch', 'categoryFilter', 'statusFilter', 'locationFilter', 'companyFilter']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderWorkerTable();
}

// ── RENDER WORKER TABLE ───────────────────────────────────────
function statusClass(sta) {
  if (sta === 'On Leave')      return 'on-leave';
  if (sta === 'Departing Soon') return 'Departing-Soon';
  return sta; // Active, Inactive, Absconded all safe
}

function renderWorkerTable() {
  const query = (document.getElementById('workerSearch')?.value  || '').toLowerCase().trim();
  const catF  = document.getElementById('categoryFilter')?.value || '';
  const staF  = document.getElementById('statusFilter')?.value   || '';
  const locF  = document.getElementById('locationFilter')?.value || '';
  const compF = document.getElementById('companyFilter')?.value  || '';

  let list = workers.filter(w => {
    const g   = w.general || {};
    const cat = deriveCategory(w);
    const sta = deriveStatus(w);
    const co  = w.legal?.quota?.company || '';
    const loc = g.location || '';
    if (catF  && cat !== catF)  return false;
    if (staF  && sta !== staF)  return false;
    if (locF  && loc !== locF)  return false;
    if (compF && co  !== compF) return false;
    if (query) {
      const hay = [g.name, g.workerId, g.nationality, g.passport, loc, cat, sta, co].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  list = applySort(list, workerSort, (w, col) => {
    const g = w.general || {};
    switch (col) {
      case 'name':     return (g.name || '').toLowerCase();
      case 'category': return deriveCategory(w);
      case 'status':   return deriveStatus(w);
      case 'location': return (g.location || '').toLowerCase();
      case 'passport': return w.legal?.passport?.expiry || 'z';
      case 'company':  return (w.legal?.quota?.company || '').toLowerCase();
      case 'license':  return w.legal?.license?.expiry  || 'z';
      case 'permit':   return w.legal?.permit?.expiry   || 'z';
      default: return '';
    }
  });
  updateSortIcons('page-worker-list', workerSort);

  const tbody = document.getElementById('worker-table-body');
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <div class="empty-icon">👷</div>
      <p>${workers.length === 0 ? 'No workers registered yet.' : 'No workers match your search.'}</p>
      ${workers.length === 0 ? `<button class="btn-primary" onclick="openAddWorkerModal()">Add First Worker</button>` : ''}
    </div></td></tr>`;
    document.getElementById('table-count').textContent = '';
    return;
  }

  // Location options for inline select
  const locOptions = `<option value="">—</option>` +
    [...workLocations].sort((a, b) => a.name.localeCompare(b.name))
      .map(l => `<option value="${esc(l.name)}">${esc(l.name)}</option>`).join('');

  tbody.innerHTML = list.map(w => {
    const g          = w.general || {};
    const cat        = deriveCategory(w);
    const sta        = deriveStatus(w);
    const co         = w.legal?.quota?.company || '—';
    const hasLicense = !!w.legal?.license?.expiry;
    const hasPermit  = !!w.legal?.permit?.expiry;
    const avatar     = g.photo
      ? `<img class="worker-avatar" src="${esc(g.photo)}" alt=""/>`
      : `<div class="worker-avatar-initials">${getInitials(g.name)}</div>`;

    // Status tooltip
    let tooltipLines = [];
    if (sta === 'Active') {
      if (g.joining)     tooltipLines.push(`Joined: ${formatDate(g.joining)}`);
      if (g.recruitment) tooltipLines.push(`Recruited: ${formatDate(g.recruitment)}`);
      if (g.termination) tooltipLines.push(`Terminated: ${formatDate(g.termination)}`);
    } else if (sta === 'Inactive' && g.departure) {
      tooltipLines.push(`Departed: ${formatDate(g.departure)}`);
    }
    const statusCell = `<div class="status-badge-wrap">
      <span class="status-badge ${statusClass(sta)}">${esc(sta)}</span>
      ${tooltipLines.length ? `<div class="status-tooltip">${tooltipLines.join('<br/>')}</div>` : ''}
    </div>`;

    return `<tr>
      <td><div class="worker-cell">${avatar}<div>
        <div class="worker-name">${esc(g.name || '—')}</div>
        <div class="worker-id">${esc(g.workerId || '—')}</div>
      </div></div></td>
      <td><span class="cat-badge ${cat}">${esc(cat)}</span></td>
      <td>${statusCell}</td>
      <td data-wid="${w.id}"><select class="location-select-inline" onchange="updateWorkerLocation('${w.id}',this.value)">${locOptions}</select></td>
      <td><div style="display:flex;align-items:center;gap:7px;">
        ${expiryCell(w.legal?.passport?.expiry, 'long')}
        <button class="btn-renew" onclick="openAppModal('${w.id}','Passport','Renew',false)">Renew</button>
      </div></td>
      <td>${esc(co)}</td>
      <td><div style="display:flex;align-items:center;gap:7px;">
        ${expiryCell(w.legal?.license?.expiry, 'short')}
        ${hasLicense
          ? `<button class="btn-renew"   onclick="openAppModal('${w.id}','Labour License','Renew',false)">Renew</button>`
          : `<button class="btn-addnew"  onclick="openAppModal('${w.id}','Labour License','New Application',false)">+ Add New</button>`}
      </div></td>
      <td><div style="display:flex;align-items:center;gap:7px;">
        ${expiryCell(w.legal?.permit?.expiry, 'short')}
        ${hasPermit
          ? `<button class="btn-renew"   onclick="openAppModal('${w.id}','Work Permit','Renew',false)">Renew</button>`
          : `<button class="btn-addnew"  onclick="openAppModal('${w.id}','Work Permit','New Application',false)">+ Add New</button>`}
      </div></td>
      <td><div class="action-group">
        <button class="action-btn viewer-ok" title="View Profile"   onclick="viewWorker('${w.id}')">👁️</button>
        <button class="action-btn viewer-ok" title="Documents"      onclick="openAttachmentsModal('${w.id}')">📎</button>
        <button class="action-btn viewer-ok" title="Download Photo" onclick="downloadPhoto('${w.id}')">⬇️</button>
        <button class="action-btn"           title="Edit"            onclick="editWorker('${w.id}')">✏️</button>
        <button class="action-btn"           title="Terminate"       onclick="openTerminationModal('${w.id}')" style="color:var(--accent-clay);">🚪</button>
        <button class="action-btn danger"    title="Delete"          onclick="openDeleteModal('${w.id}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');

  // Set location select value
  list.forEach(w => {
    const td  = tbody.querySelector(`td[data-wid="${w.id}"]`);
    const sel = td?.querySelector('select');
    if (sel && w.general?.location) sel.value = w.general.location;
  });

  const total = workers.length;
  const shown = list.length;
  document.getElementById('table-count').textContent =
    (query || catF || staF || locF || compF)
      ? `Showing ${shown} of ${total} worker${total !== 1 ? 's' : ''}`
      : ` ${total} worker${total !== 1 ? 's' : ''} total`;
}

// Inline location update from table dropdown
function updateWorkerLocation(wId, newLoc) {
  const w = workers.find(x => x.id === wId);
  if (!w) return;
  if (!w.general) w.general = {};
  w.general.location = newLoc;
  saveWorkerLocationToDB(wId, newLoc);
  showToast('Work location updated.');
}

// ── ADD / EDIT MODAL ──────────────────────────────────────────
function openAddWorkerModal() {
  editingId = null; currentAppWorkerId = null;
  // Show direct entry note for new workers
  const note = document.getElementById('legal-direct-entry-note');
  if (note) note.style.display = 'block';
  clearAttachmentPreviews();
  // Reset passport num auto-fill tracking
  const pn = document.getElementById('f_passport_num');
  if (pn) { pn.value = ''; pn.dataset.autoFilled = 'false'; }
  document.getElementById('modalTitle').textContent       = 'Add New Worker';
  document.getElementById('saveWorkerBtn').textContent    = 'Save Worker';
  clearForm(); switchTab(0);
  openModal('workerModal');
}

function editWorker(id)           { editWorkerAtTab(id, 0); }
function editWorkerAtTab(id, tab) {
  const w = workers.find(x => x.id === id);
  if (!w) return;
  editingId = id; currentAppWorkerId = id;
  document.getElementById('modalTitle').textContent    = 'Edit Worker';
  document.getElementById('saveWorkerBtn').textContent = 'Update Worker';
  clearForm(); populateForm(w); switchTab(tab);
  openModal('workerModal');
}

function closeWorkerModal() {
  closeModal('workerModal');
  editingId = null; currentAppWorkerId = null;
}

// Park = hide without clearing, so state is preserved when returning from app modal
function parkWorkerModal() {
  // Just hide, keep on stack so closeModal restores it
  const el = document.getElementById('workerModal');
  if (el) el.classList.remove('open');
}
function restoreWorkerModal() {
  openModal('workerModal');
}
function closeModalOutside(e) { closeModalOutsideStack(e, 'workerModal'); }

// ── FORM CLEAR / POPULATE ─────────────────────────────────────
const FIELD_IDS = [
  'f_name','f_gender','f_workerid','f_nationality','f_passport','f_recruitment','f_joining',
  'f_termination','f_departure','f_remarks',
  'f_passport_num','f_passport_expiry',
  'f_quota_kdn','f_quota_slot',
  'f_license_reg','f_license_expiry','f_socso_reg',
  'f_permit_reg','f_permit_expiry',
  'f_claim1_date','f_claim2_date','f_claim3_date','f_category_override',
];

function setField(id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; }

function clearForm() {
  FIELD_IDS.forEach(id => setField(id, ''));

  // Reset photo
  const img = document.getElementById('photoPreview');
  img.style.display = 'none'; img.src = '';
  document.getElementById('photoInitials').style.display = 'flex';
  document.getElementById('photoInitials').textContent   = '?';
  const fe = document.getElementById('f_photo'); if (fe) fe.value = '';

  // Reset selects
  const qcSel = document.getElementById('f_quota_company'); if (qcSel) qcSel.value = '';
  populateLocationDropdown();

  // Reset category override
  document.getElementById('categoryOverridePanel').style.display = 'none';
  document.getElementById('overrideNote').textContent = '';

  // Reset legal action rows and indicators
  ['passport-actions', 'license-actions', 'permit-actions'].forEach(id => {
    const el = document.getElementById(id); if (el) el.innerHTML = '';
  });
  const ind = document.getElementById('legal-app-indicators');
  if (ind) { ind.style.display = 'none'; ind.innerHTML = ''; }

  // Reset claims
  [1, 2, 3].forEach(n => {
    const r = document.getElementById(`claim${n}-remove`);
    if (r) r.style.display = 'none';
    const s = document.getElementById(`claim${n}-status`);
    if (s && s.textContent === 'Claimed') {
      s.textContent = 'Eligible'; s.className = 'claim-status-badge';
    }
    const card = document.getElementById(`claim${n}-card`);
    if (card) { card.classList.remove('claimed'); }
  });

  updateCategoryDisplay();
  evaluateClaims();
  hideModalError();
  const absCb = document.getElementById('f_absconded'); if (absCb) absCb.checked = false;
  updateAbscondedNote(null);
}

function populateForm(w) {
  const g = w.general || {};
  const l = w.legal   || {};
  const c = w.claims  || {};

  setField('f_name',        g.name);
  setField('f_gender',      g.gender || '');
  setField('f_workerid',    g.workerId);
  setField('f_nationality', g.nationality);
  setField('f_passport',    g.passport);
  setField('f_recruitment', g.recruitment);
  setField('f_joining',     g.joining);
  setField('f_termination', g.termination);
  setField('f_departure',   g.departure);
  setField('f_remarks',     g.remarks);

  // Location dropdown
  populateLocationDropdown();
  const locSel = document.getElementById('f_location');
  if (locSel && g.location) locSel.value = g.location;

  // Photo
  if (g.photo) {
    const img = document.getElementById('photoPreview');
    img.src = g.photo; img.style.display = 'block';
    document.getElementById('photoInitials').style.display = 'none';
  } else {
    syncNameInitials();
  }

  // Legal
  setField('f_passport_num',    l.passport?.number || g.passport);
  loadAttachmentPreviews(w);
  setField('f_passport_expiry', l.passport?.expiry);
  populateQuotaCompanyDropdown();
  const qcSel = document.getElementById('f_quota_company');
  if (qcSel && l.quota?.company) qcSel.value = l.quota.company;
  setField('f_quota_kdn',    l.quota?.kdn);
  setField('f_quota_slot',   l.quota?.slot);
  setField('f_license_reg',  l.license?.reg);
  setField('f_license_expiry', l.license?.expiry);
  setField('f_socso_reg',    l.socso?.reg);
  setField('f_permit_reg',   l.permit?.reg);
  setField('f_permit_expiry', l.permit?.expiry);

  // Claims
  setField('f_claim1_date', c.claim1);
  setField('f_claim2_date', c.claim2);
  setField('f_claim3_date', c.claim3);
  [1, 2, 3].forEach(n => {
    const r  = document.getElementById(`claim${n}-remove`);
    if (r) r.style.display = c[`claim${n}`] ? 'flex' : 'none';
    const se = document.getElementById(`claim${n}-status`);
    if (c[`claim${n}`] && se) { se.textContent = 'Claimed'; se.className = 'claim-status-badge claimed'; }
    const card = document.getElementById(`claim${n}-card`);
    if (c[`claim${n}`] && card) { card.classList.remove('eligible','ineligible'); card.classList.add('claimed'); }
  });

  // Category override
  if (w.categoryOverride) {
    setField('f_category_override', w.categoryOverride);
    document.getElementById('categoryOverridePanel').style.display = 'block';
    if (w.categoryOverrideMeta) {
      document.getElementById('overrideNote').textContent =
        `Manually edited by ${w.categoryOverrideMeta.user} on ${w.categoryOverrideMeta.datetime}`;
    }
  }

  updateCategoryDisplay();
  evaluateClaims();
  // absconded checkbox — persist from worker.general.abscondedDate
  const absCb = document.getElementById('f_absconded');
  if (absCb) {
    const absDate = w.general?.abscondedDate || '';
    absCb.checked = !!absDate;
    updateAbscondedNote(absDate || null);
  }
}

// ── PHOTO HANDLERS ────────────────────────────────────────────
function previewPhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) { showModalError('Photo must be under 2 MB.'); return; }
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.getElementById('photoPreview');
    img.src = e.target.result; img.style.display = 'block';
    document.getElementById('photoInitials').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function removePhoto() {
  const img = document.getElementById('photoPreview');
  img.style.display = 'none'; img.src = '';
  document.getElementById('photoInitials').style.display = 'flex';
  syncNameInitials();
  const fe = document.getElementById('f_photo'); if (fe) fe.value = '';
}

function syncNameInitials() {
  const name = document.getElementById('f_name')?.value || '';
  const el   = document.getElementById('photoInitials');
  const img  = document.getElementById('photoPreview');
  if (img.style.display === 'none' || !img.src || img.src === window.location.href) {
    el.textContent   = getInitials(name) || '?';
    el.style.display = 'flex';
  }
}

function syncPassport() {
  const val = document.getElementById('f_passport')?.value || '';
  const el  = document.getElementById('f_passport_num');
  // Only auto-sync if the passport_num field is empty or was previously auto-filled
  // Don't overwrite a value the user manually typed in the legal tab
  if (el && (!el.value || el.dataset.autoFilled === 'true')) {
    el.value = val;
    el.dataset.autoFilled = 'true';
  }
}

// ── CATEGORY DISPLAY ──────────────────────────────────────────
function onRecruitmentChange() {
  updateCategoryDisplay();
  evaluateClaims();
  refreshLegalStatuses();
}
function onJoiningChange() {
  updateCategoryDisplay();
  evaluateClaims();
  refreshLegalStatuses();
}
function onAbscondedChange() {
  const cb = document.getElementById('f_absconded');
  if (!cb) return;
  if (cb.checked) {
    // Show confirmation before marking as absconded
    const workerName = document.getElementById('f_name')?.value?.trim() || 'this worker';
    const confirmed  = confirm(
      `⚠️ Mark as Absconded\n\nYou are about to mark "${workerName}" as absconded.\n\nThis will:\n• Set their departure date to today\n• Change their status to Absconded\n\nAre you sure?`
    );
    if (!confirmed) {
      cb.checked = false;
      return;
    }
    const today = new Date().toISOString().slice(0,10);
    const depEl = document.getElementById('f_departure');
    if (depEl && !depEl.value) depEl.value = today;
    updateAbscondedNote(today);
  } else {
    updateAbscondedNote(null);
  }
}

function updateAbscondedNote(date) {
  let noteEl = document.getElementById('f_absconded_note');
  if (!noteEl) return;
  if (date) {
    noteEl.textContent = 'Marked as absconded on ' + new Date(date).toLocaleDateString('en-MY',{day:'2-digit',month:'2-digit',year:'numeric'});
    noteEl.style.display = 'block';
  } else {
    noteEl.style.display = 'none';
  }
}

function toggleCategoryOverride() {
  const p = document.getElementById('categoryOverridePanel');
  p.style.display = p.style.display === 'none' ? 'block' : 'none';
}

function updateCategoryDisplay() {
  const temp = {
    general: {
      joining:     document.getElementById('f_joining')?.value,
      termination: document.getElementById('f_termination')?.value,
    },
    legal: { permit: { reg: document.getElementById('f_permit_reg')?.value } },
    categoryOverride: document.getElementById('f_category_override')?.value || null,
  };
  const cat  = deriveCategory(temp);
  const badge = document.getElementById('categoryBadge');
  const hint  = document.getElementById('categoryHint');
  if (!badge || !hint) return;
  badge.textContent = cat === '—' ? '—' : cat;
  badge.className   = `category-badge ${cat !== '—' ? cat : ''}`;
  hint.textContent  =
    cat === 'TKI'        ? 'Work permit detected — classified as TKI.' :
    cat === 'Contractor' ? 'Classified as Contractor.' :
    'Fill in recruitment date to determine category.';
  refreshLegalStatuses();
}

// ── DROPDOWNS ─────────────────────────────────────────────────
function populateLocationDropdown() {
  const sel = document.getElementById('f_location'); if (!sel) return;
  const cur = sel.value;
  const sorted = [...workLocations].sort((a, b) => a.name.localeCompare(b.name));
  sel.innerHTML = `<option value="">Select location…</option>` +
    sorted.map(l => `<option value="${esc(l.name)}" ${l.name === cur ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
}

function populateQuotaCompanyDropdown() {
  const sel = document.getElementById('f_quota_company'); if (!sel) return;
  const available = apQuotas.filter(aq => {
    const s = deriveApQuotaStatus(aq);
    return s !== 'Expired' && !!aq.approvalDate && getAssignedWorkers(aq).length < aq.slots;
  });
  const cur = sel.value;
  sel.innerHTML = `<option value="">Select company…</option>` +
    available.map(aq => {
      const free = aq.slots - getAssignedWorkers(aq).length;
      return `<option value="${esc(aq.company)}" data-kdn="${esc(aq.kdn)}">${esc(aq.company)} (${free} slot${free !== 1 ? 's' : ''} free)</option>`;
    }).join('');
  if (cur) sel.value = cur;
}

function onQuotaCompanyChange() {
  const sel      = document.getElementById('f_quota_company');
  const selected = sel.options[sel.selectedIndex];
  const kdn      = selected?.dataset?.kdn || '';
  const company  = sel.value;
  document.getElementById('f_quota_kdn').value = kdn;
  if (company && kdn) {
    const aq = apQuotas.find(q => q.company === company && q.kdn === kdn);
    if (aq) {
      const used = getAssignedWorkers(aq)
        .map(w => parseInt((w.legal?.quota?.slot || '').replace(/\D/g, '')))
        .filter(n => !isNaN(n));
      let next = 1;
      for (let i = 1; i <= aq.slots; i++) { if (!used.includes(i)) { next = i; break; } }
      document.getElementById('f_quota_slot').value = `Slot ${next}`;
    }
  } else {
    document.getElementById('f_quota_slot').value = '';
  }
  refreshLegalStatuses();
}

// ── TABS ──────────────────────────────────────────────────────
let currentTab = 0;
function switchTab(idx) {
  currentTab = idx;
  document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
  document.querySelectorAll('.modal-tab').forEach((b,  i) => b.classList.toggle('active', i === idx));
  document.getElementById('btn-prev').style.display = idx > 0 ? 'inline-flex' : 'none';
  document.getElementById('btn-next').style.display = idx < 2 ? 'inline-flex' : 'none';
  hideModalError();
  if (idx === 1) { populateQuotaCompanyDropdown(); refreshLegalStatuses(); }
}
function nextTab() { if (currentTab === 0 && !validateGeneralTab()) return; if (currentTab < 2) switchTab(currentTab + 1); }
function prevTab() { if (currentTab > 0) switchTab(currentTab - 1); }

// ── VALIDATION ────────────────────────────────────────────────
function validateGeneralTab() {
  const name        = document.getElementById('f_name')?.value.trim();
  const nationality = document.getElementById('f_nationality')?.value.trim();
  const passport    = document.getElementById('f_passport')?.value.trim();
  const joining     = document.getElementById('f_joining')?.value;
  if (!name)        { showModalError('Full Name is required.');   return false; }
  if (!nationality) { showModalError('Nationality is required.'); return false; }
  if (!joining)     { showModalError('Joining Date is required (the date the worker physically joined work).'); return false; }
  if (passport) {
    const dup = workers.find(w => w.general?.passport === passport && w.id !== editingId);
    if (dup) { showModalError('Passport/IC "' + passport + '" already registered under ' + dup.general?.name + '.'); return false; }
  }
  return true;
}

// ── SAVE WORKER ───────────────────────────────────────────────
async function saveWorker() {
  if (!validateGeneralTab()) { switchTab(0); return; }

  // Capture existing worker for merging attachment history
  const existingWorker = editingId ? workers.find(x => x.id === editingId) : null;

  const img   = document.getElementById('photoPreview');
  const photo = (img.style.display !== 'none' && img.src && img.src !== window.location.href) ? img.src : '';
  const override = document.getElementById('f_category_override')?.value || null;
  const existing = editingId ? workers.find(w => w.id === editingId) : null;

  let overrideMeta = null;
  if (override) {
    const now = new Date();
    overrideMeta = { user: 'Admin', datetime: now.toLocaleString('en-MY') };
    if (existing?.categoryOverride === override && existing?.categoryOverrideMeta) {
      overrideMeta = existing.categoryOverrideMeta;
    }
  }

  const locSel  = document.getElementById('f_location');
  const quotaCo = document.getElementById('f_quota_company')?.value || '';
  // If absconded checkbox is checked, ensure departure date and abscondedDate set
  const absCb   = document.getElementById('f_absconded');
  const isAbsc  = absCb?.checked || false;
  const today   = new Date().toISOString().slice(0,10);
  if (isAbsc) {
    const depEl = document.getElementById('f_departure');
    if (depEl && !depEl.value) depEl.value = today;
  }
  // abscondedDate: set if newly absconded, clear if unticked
  const existingAbscDate = (editingId ? workers.find(w=>w.id===editingId)?.general?.abscondedDate : null) || null;
  const abscondedDate = isAbsc ? (existingAbscDate || today) : null;

  const wd = {
    id: editingId || genId(),
    general: {
      name:        document.getElementById('f_name')?.value.trim(),
      gender:      document.getElementById('f_gender')?.value || '',
      workerId:    (() => {
        const manual = document.getElementById('f_workerid')?.value.trim();
        if (editingId) return manual || (workers.find(w=>w.id===editingId)?.general?.workerId || '');
        return manual || '__PENDING__';
      })(),
      nationality: document.getElementById('f_nationality')?.value.trim(),
      passport:    document.getElementById('f_passport')?.value.trim(),
      recruitment: document.getElementById('f_recruitment')?.value,  // contract / letter date
      joining:     document.getElementById('f_joining')?.value,       // actual physical joining (mandatory)
      location:    locSel?.value || '',
      termination: document.getElementById('f_termination')?.value,
      departure:   document.getElementById('f_departure')?.value,
      remarks:     document.getElementById('f_remarks')?.value,
      abscondedDate: abscondedDate || null,
      photo,
    },
    legal: (() => {
      // Build attachment histories — prepend new upload to existing history
      const prevLegal = existingWorker?.legal || {};

      function buildAttachmentHistory(type) {
        const existing = prevLegal[type]?.attachments || [];
        const newFile  = _attachments[type];
        const reg      = document.getElementById(`f_${type === 'passport' ? 'passport_num' : type + '_reg'}`)?.value.trim() || '';
        const expiry   = document.getElementById(`f_${type}_expiry`)?.value || '';
        if (!newFile) return existing; // no new upload — keep history as is
        // Prepend new entry to history
        return [{ id: genId(), date: new Date().toISOString(), data: newFile.data, name: newFile.name, mime: newFile.mime, reg, expiry }, ...existing];
      }

      const passportNum    = document.getElementById('f_passport_num')?.value.trim()  || '';
      const passportExpiry = document.getElementById('f_passport_expiry')?.value      || '';
      const licenseReg     = document.getElementById('f_license_reg')?.value.trim()   || '';
      const licenseExpiry  = document.getElementById('f_license_expiry')?.value       || '';
      const permitReg      = document.getElementById('f_permit_reg')?.value.trim()    || '';
      const permitExpiry   = document.getElementById('f_permit_expiry')?.value        || '';

      return {
        passport: { number: passportNum, expiry: passportExpiry, attachments: buildAttachmentHistory('passport') },
        quota:    { company: quotaCo, kdn: document.getElementById('f_quota_kdn')?.value.trim(), slot: document.getElementById('f_quota_slot')?.value.trim() },
        license:  { reg: licenseReg, expiry: licenseExpiry, attachments: buildAttachmentHistory('license') },
        socso:    { reg: document.getElementById('f_socso_reg')?.value.trim() },
        permit:   { reg: permitReg, expiry: permitExpiry, attachments: buildAttachmentHistory('permit') },
      };
    })(),
    claims: {
      claim1: document.getElementById('f_claim1_date')?.value,
      claim2: document.getElementById('f_claim2_date')?.value,
      claim3: document.getElementById('f_claim3_date')?.value,
    },
    categoryOverride:     override || null,
    categoryOverrideMeta: overrideMeta,
  };

  // Auto-assign worker ID if new and none provided
  if (!editingId && wd.general.workerId === '__PENDING__') {
    const locSel3 = document.getElementById('f_location');
    const locId   = workLocations.find(l => l.name === locSel3?.value)?.id || '';
    wd.general.workerId = await generateWorkerId(locId);
    // Update the field so user sees it
    const widEl = document.getElementById('f_workerid');
    if (widEl) widEl.value = wd.general.workerId;
  }

  showLoadingOverlay(true);
  saveWorkerToDB(wd).then(() => {
    showLoadingOverlay(false);
    closeWorkerModal();
    renderWorkerTable();
    renderDocTable();
    updateDashboardStats();
    showToast(editingId ? 'Worker updated successfully.' : 'Worker added successfully.');
  }).catch(e => {
    showLoadingOverlay(false);
    showToast('Save failed. Please try again.', true);
    console.error(e);
  });
}

// ── VIEW WORKER ───────────────────────────────────────────────
function openAppModalFromView(wId, docType, appType) {
  parkViewModal();
  // Set returnToView flag so cancel/save restores view modal
  _returnToView = true;
  _returnToViewId = wId;
  openAppModal(wId, docType, appType, false);
}
let _returnToView   = false;
let _returnToViewId = null;

function viewWorkerAndExport(id, format) {
  exportWorkerProfile(id, format);
}
let _currentViewId = null;
function viewWorker(id) {
  _currentViewId = id;
  const w = workers.find(x => x.id === id); if (!w) return;
  const g = w.general || {};
  const l = w.legal   || {};
  const c = w.claims  || {};
  const cat = deriveCategory(w);
  const sta = deriveStatus(w);
  const qs  = deriveQuotaStatus(w);
  const ls  = deriveLicenseStatus(w);
  const ps  = derivePermitStatus(w);
  const avatar = g.photo
    ? `<img class="profile-view-avatar" src="${esc(g.photo)}" alt=""/>`
    : `<div class="profile-view-avatar-initials">${getInitials(g.name)}</div>`;
  const claimView = (label, dateVal, fallback) =>
    pf(label, dateVal ? `Claimed — ${formatDate(dateVal)}` : fallback || 'Not Claimed');

  document.getElementById('viewModalBody').innerHTML = `
    <div class="profile-view-header">${avatar}<div>
      <div class="profile-view-name">${esc(g.name)}</div>
      <div class="profile-view-id">${esc(g.workerId || '—')}</div>
      <span class="status-badge ${statusClass(sta)}" style="margin-right:6px;">${esc(sta)}</span>
      <span class="cat-badge ${cat}">${esc(cat)}</span>
      ${w.categoryOverride ? `<div style="font-size:11px;color:var(--text3);margin-top:5px;font-style:italic;">Category manually overridden — ${esc(w.categoryOverrideMeta?.user || '')} on ${esc(w.categoryOverrideMeta?.datetime || '')}</div>` : ''}
    </div></div>
    <div class="profile-fields">
      <div class="profile-section-sep">General Information</div>
      ${pf('Gender', g.gender || '—')}              ${pf('Nationality', g.nationality)}
      ${pf('IC / Passport', g.passport)}
      ${pf('Joining Date', formatDate(g.joining))}  ${pf('Recruitment Date', formatDate(g.recruitment))}
      ${pf('Work Location', g.location)}            ${pf('Termination', formatDate(g.termination))}
      ${pf('Departure', formatDate(g.departure))}   ${pf('Worker ID', g.workerId)}
      ${g.abscondedDate ? pf('Absconded On', new Date(g.abscondedDate).toLocaleDateString('en-MY',{day:'2-digit',month:'2-digit',year:'numeric'})) : ''}
      ${g.remarks ? pf('Remarks', g.remarks, true) : ''}
      <div class="profile-section-sep">Passport</div>
      ${pf('Passport No.', l.passport?.number)}   ${pf('Expiry', formatDate(l.passport?.expiry))}
      <div class="profile-section-sep">Labour Quota &nbsp;<span style="font-size:11px;font-weight:400;text-transform:none;letter-spacing:0;">Status: <strong>${esc(qs)}</strong></span></div>
      ${pf('Company', l.quota?.company)}           ${pf('KDN Ref.', l.quota?.kdn)}
      ${pf('Slot', l.quota?.slot)}
      <div class="profile-section-sep">Labour License &nbsp;<span style="font-size:11px;font-weight:400;text-transform:none;letter-spacing:0;">Status: <strong>${esc(ls)}</strong></span></div>
      ${pf('Reg. No.', l.license?.reg)}           ${pf('Expiry', formatDate(l.license?.expiry))}
      <div class="profile-section-sep">SOCSO</div>
      ${pf('Reg. No.', l.socso?.reg)}
      <div class="profile-section-sep">Work Permit &nbsp;<span style="font-size:11px;font-weight:400;text-transform:none;letter-spacing:0;">Status: <strong>${esc(ps)}</strong></span></div>
      ${pf('Reg. No.', l.permit?.reg)}            ${pf('Expiry', formatDate(l.permit?.expiry))}
      <div class="profile-section-sep">Claims</div>
      ${claimView('1st Claim — RM 560', c.claim1, 'Eligible')}
      ${claimView('2nd Claim — RM 240', c.claim2, null)}
      ${claimView('3rd Claim — RM 700', c.claim3, null)}
    </div>`;
  openModal('viewModal');
}

function pf(label, value, full = false) {
  return `<div ${full ? 'style="grid-column:1/-1"' : ''}>
    <div class="profile-field-label">${esc(label)}</div>
    <div class="profile-field-value">${esc(value) || '—'}</div>
  </div>`;
}

function closeViewModal()    { closeModal('viewModal'); }
function closeViewOutside(e) { closeModalOutsideStack(e, 'viewModal'); }

// Park view modal when opening app modal from within it — restore on cancel
let _viewModalParked = false;
function parkViewModal() {
  const el = document.getElementById('viewModal');
  if (el) el.classList.remove('open');
  _viewModalParked = true;
}
function restoreViewModal() {
  if (_viewModalParked) {
    openModal('viewModal');
    _viewModalParked = false;
  }
}

// ── DOWNLOAD PHOTO ────────────────────────────────────────────
function downloadPhoto(id) {
  const w = workers.find(x => x.id === id);
  if (!w?.general?.photo) { showToast('No profile photo on file.', true); return; }
  const a = document.createElement('a');
  a.href     = w.general.photo;
  a.download = `${w.general.workerId || w.id}_${(w.general.name || 'worker').replace(/\s+/g, '_')}.jpg`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToast('Photo download started.');
}

// ── DELETE WORKER ─────────────────────────────────────────────
function openDeleteModal(id) {
  const w = workers.find(x => x.id === id); if (!w) return;
  deletingId = id;
  document.getElementById('deleteWorkerName').textContent = w.general?.name || 'this worker';
  openModal('deleteModal');
}
function closeDeleteModal()    { closeModal('deleteModal'); deletingId = null; }
function closeDeleteOutside(e) { closeModalOutsideStack(e, 'deleteModal'); }
function confirmDelete() {
  if (!deletingId) return;
  deleteWorkerFromDB(deletingId).then(() => {
    closeDeleteModal(); renderWorkerTable(); renderDocTable(); updateDashboardStats();
    showToast('Worker deleted.');
  });
}

// ── EXPORT MENU TOGGLE ────────────────────────────────────────
function toggleExportMenu(key) {
  const menuId = 'export-menu-' + key;
  const menu   = document.getElementById(menuId);
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  // Close all export menus
  document.querySelectorAll('.export-dropdown').forEach(m => m.style.display='none');
  if (!isOpen) {
    menu.style.display = 'block';
    // Close on outside click
    setTimeout(() => document.addEventListener('click', function _close(e) {
      if (!menu.contains(e.target)) { menu.style.display='none'; document.removeEventListener('click',_close); }
    }), 0);
  }
}

// ══════════════════════════════════════════════════════════════
//  WORKER TERMINATION
// ══════════════════════════════════════════════════════════════

let _terminatingWorkerId = null;

function openTerminationModal(workerId) {
  const w = workers.find(x => x.id === workerId);
  if (!w) return;
  _terminatingWorkerId = workerId;
  const g = w.general || {};
  const l = w.legal   || {};

  document.getElementById('term_name').value     = g.name        || '';
  document.getElementById('term_location').value = g.location    || '';
  document.getElementById('term_company').value  = l.quota?.company || '—';
  document.getElementById('term_category').value = deriveCategory(w);
  document.getElementById('term_departure_date').value = g.departure || '';
  document.getElementById('term_notif_date').value     = ''; // user fills this in
  document.getElementById('term_reason').value         = g.abscondedDate ? 'absconded' : '';
  document.getElementById('term_absconded_warning').style.display = g.abscondedDate ? 'block' : 'none';
  document.getElementById('terminationError').style.display = 'none';
  openModal('terminationModal');
}

function onTermReasonChange() {
  const reason = document.getElementById('term_reason').value;
  const warn   = document.getElementById('term_absconded_warning');
  warn.style.display = reason === 'absconded' ? 'block' : 'none';
  // If absconded, auto-set departure to today if not already set
  if (reason === 'absconded') {
    const depEl = document.getElementById('term_departure_date');
    if (!depEl.value) depEl.value = new Date().toISOString().slice(0,10);
  }
}

async function saveTermination() {
  const notifDate  = document.getElementById('term_notif_date')?.value;
  const depDate    = document.getElementById('term_departure_date')?.value;
  const reason     = document.getElementById('term_reason')?.value;
  const errEl      = document.getElementById('terminationError');
  errEl.style.display = 'none';

  if (!notifDate) { errEl.textContent = 'Please enter the termination notification date.'; errEl.style.display='block'; return; }
  if (!depDate)   { errEl.textContent = 'Please enter the planned departure date.'; errEl.style.display='block'; return; }
  if (!reason)    { errEl.textContent = 'Please select a reason.'; errEl.style.display='block'; return; }

  if (reason === 'absconded') {
    const confirmed = confirm(
      `⚠️ Mark as Absconded\n\nThis will permanently mark this worker as absconded and set their departure date.\n\nAre you sure?`
    );
    if (!confirmed) return;
  }

  const w = workers.find(x => x.id === _terminatingWorkerId);
  if (!w) return;
  if (!w.general) w.general = {};

  w.general.termination = notifDate;
  w.general.departure   = depDate;

  if (reason === 'absconded') {
    w.general.abscondedDate = depDate;
  }
  // Store notification date in a dedicated field for termination list
  w.general.terminationNotifDate = notifDate;

  await saveWorkerToDB(w);
  closeTerminationModal();
  renderWorkerTable();
  renderTerminationTable();
  showToast(`Termination recorded for ${w.general.name || 'worker'}.`);
}

// ── TERMINATION ACTIONS ──────────────────────────────────────
async function approveTermination(workerId) {
  const w = workers.find(x => x.id === workerId); if (!w) return;
  const name = w.general?.name || 'this worker';
  if (!confirm(`Approve termination for ${name}?\n\nThis will set their departure date to today and mark them as Departed.`)) return;
  if (!w.general) w.general = {};
  w.general.departure = new Date().toISOString().slice(0,10);
  await saveWorkerToDB(w);
  renderTerminationTable();
  renderWorkerTable();
  showToast(`${name} marked as Departed.`);
}

async function rejectTermination(workerId) {
  const w = workers.find(x => x.id === workerId); if (!w) return;
  const name = w.general?.name || 'this worker';
  if (!confirm(`Reject termination for ${name}?\n\nThis will clear their departure date, notification date, and absconded status, returning them to Active.`)) return;
  if (!w.general) w.general = {};
  w.general.departure           = '';
  w.general.termination         = '';
  w.general.terminationNotifDate= '';
  w.general.abscondedDate       = '';
  await saveWorkerToDB(w);
  renderTerminationTable();
  renderWorkerTable();
  showToast(`Termination cancelled for ${name}.`);
}

async function deleteTerminationRecord(workerId) {
  const w = workers.find(x => x.id === workerId); if (!w) return;
  const name = w.general?.name || 'this worker';
  if (!confirm(`Delete the termination record for ${name}?\n\nThis removes the departure and notification dates but keeps the worker profile.`)) return;
  if (!w.general) w.general = {};
  w.general.departure           = '';
  w.general.termination         = '';
  w.general.terminationNotifDate= '';
  w.general.abscondedDate       = '';
  await saveWorkerToDB(w);
  renderTerminationTable();
  renderWorkerTable();
  showToast(`Termination record deleted for ${name}.`);
}

function closeTerminationModal()     { closeModal('terminationModal'); _terminatingWorkerId = null; }
function closeTerminationModalOutside(e) { closeModalOutsideStack(e, 'terminationModal'); }

// ── TERMINATION LIST TABLE ────────────────────────────────────
function renderTerminationTable() {
  const tbody   = document.getElementById('termination-table-body');
  const countEl = document.getElementById('termination-count');
  if (!tbody) return;

  const query   = (document.getElementById('termSearch')?.value || '').toLowerCase().trim();
  const statusF = document.getElementById('termStatusFilter')?.value || '';

  // Only workers with a departure date or absconded
  let list = workers.filter(w => {
    const g = w.general || {};
    return g.departure || g.abscondedDate;
  });

  // Filter
  if (statusF) list = list.filter(w => deriveTerminationStatus(w) === statusF);
  if (query)   list = list.filter(w => {
    const g = w.general || {};
    return [g.name, g.workerId, g.location, w.legal?.quota?.company].join(' ').toLowerCase().includes(query);
  });

  // Sort: Leaving Soon → Absconded → Departed, then by departure date
  const statusOrder = { 'Leaving Soon': 0, 'Absconded': 1, 'Departed': 2 };
  list.sort((a, b) => {
    const sa = statusOrder[deriveTerminationStatus(a)] ?? 9;
    const sb = statusOrder[deriveTerminationStatus(b)] ?? 9;
    if (sa !== sb) return sa - sb;
    return (a.general?.departure || '').localeCompare(b.general?.departure || '');
  });

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><div class="empty-icon">🚪</div><p>No terminated workers found.</p></div></td></tr>`;
    if (countEl) countEl.textContent = '';
    return;
  }

  const statusCss = {
    'Leaving Soon': 'background:rgba(139,105,20,.12);color:var(--accent-primary);',
    'Departed':     'background:rgba(168,152,128,.12);color:var(--text-secondary);',
    'Absconded':    'background:rgba(160,82,45,.12);color:var(--accent-clay);',
  };

  tbody.innerHTML = list.map(w => {
    const g   = w.general || {};
    const l   = w.legal   || {};
    const sta = deriveTerminationStatus(w) || '—';
    const css = statusCss[sta] || '';

    // Avatar
    const initials = (g.name || '?').trim().split(/\s+/).map(x=>x[0]).join('').toUpperCase().slice(0,2);
    const avatarHtml = g.photo
      ? `<img src="${g.photo}" class="worker-avatar" alt=""/>`
      : `<div class="worker-avatar-initials">${esc(initials)}</div>`;

    return `<tr>
      <td><span class="legal-status-badge" style="${css}padding:3px 12px;border-radius:20px;font-size:11px;font-weight:700;font-family:var(--font-ui);">${esc(sta)}</span></td>
      <td><div class="worker-cell">
        ${avatarHtml}
        <div>
          <div class="worker-name">${esc(g.name || '—')}</div>
          <div class="worker-id">${esc(g.workerId || '—')}</div>
        </div>
      </div></td>
      <td>${esc(g.location || '—')}</td>
      <td>${esc(l.quota?.company || '—')}</td>
      <td style="font-family:var(--font-mono);font-size:12.5px;">${formatDate(g.terminationNotifDate || g.termination) || '—'}</td>
      <td style="font-family:var(--font-mono);font-size:12.5px;">${formatDate(g.departure) || '—'}</td>
      <td><div class="action-group">
        <button class="action-btn viewer-ok" title="View" onclick="viewWorker('${w.id}')">👁️</button>
        ${sta !== 'Departed' ? `
        <button class="action-btn" title="Approve — mark as departed now" onclick="approveTermination('${w.id}')" style="color:var(--accent-sage);">✅</button>
        <button class="action-btn" title="Reject — cancel termination" onclick="rejectTermination('${w.id}')" style="color:var(--accent-clay);">↩️</button>
        <button class="action-btn danger" title="Delete termination record" onclick="deleteTerminationRecord('${w.id}')">🗑️</button>
        ` : ''}
      </div></td>
    </tr>`;
  }).join('');

  if (countEl) countEl.textContent = `${list.length} worker${list.length!==1?'s':''}`;
}

// ══════════════════════════════════════════════════════════════
//  DOCUMENT ATTACHMENTS — with full history
// ══════════════════════════════════════════════════════════════

let _attachments = { passport: null, license: null, permit: null };
let _currentWorkerForAttachments = null;

function previewAttachment(type, input) {
  const file = input.files[0]; if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast('File too large — max 5MB per document.', true); input.value = ''; return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    _attachments[type] = { data: e.target.result, name: file.name, mime: file.type };
    const nameEl = document.getElementById(`f_${type}_attachment_name`);
    const linkEl = document.getElementById(`f_${type}_attachment_link`);
    if (nameEl) nameEl.textContent = file.name;
    if (linkEl) { linkEl.href = e.target.result; linkEl.style.display = 'inline'; }
    updateAttachmentHistoryPreview(type);
  };
  reader.readAsDataURL(file);
}

function loadAttachmentPreviews(w) {
  _currentWorkerForAttachments = w;
  _attachments = { passport: null, license: null, permit: null };
  ['passport','license','permit'].forEach(type => {
    const history = w.legal?.[type]?.attachments || [];
    const latest  = history[0];
    const nameEl  = document.getElementById(`f_${type}_attachment_name`);
    const linkEl  = document.getElementById(`f_${type}_attachment_link`);
    const inputEl = document.getElementById(`f_${type}_attachment`);
    if (inputEl) inputEl.value = ''; // clear file input
    if (latest) {
      if (nameEl) nameEl.textContent = `📄 ${latest.name || 'Existing document'} (${new Date(latest.date).toLocaleDateString('en-MY')})`;
      if (linkEl) {
        linkEl.href = '#';
        linkEl.onclick = (e) => { e.preventDefault(); viewAttachment(latest.data, latest.name, latest.mime); };
        linkEl.style.display = 'inline';
      }
    } else {
      if (nameEl) nameEl.textContent = '';
      if (linkEl) linkEl.style.display = 'none';
    }
    updateAttachmentHistoryPreview(type, history);
  });
}

function clearAttachmentPreviews() {
  _currentWorkerForAttachments = null;
  _attachments = { passport: null, license: null, permit: null };
  ['passport','license','permit'].forEach(type => {
    const nameEl  = document.getElementById(`f_${type}_attachment_name`);
    const linkEl  = document.getElementById(`f_${type}_attachment_link`);
    const inputEl = document.getElementById(`f_${type}_attachment`);
    if (inputEl) inputEl.value = '';
    if (nameEl)  nameEl.textContent = '';
    if (linkEl)  linkEl.style.display = 'none';
    updateAttachmentHistoryPreview(type, []);
  });
}

function updateAttachmentHistoryPreview(type, history) {
  const el = document.getElementById(`f_${type}_attachment_history`);
  if (!el) return;
  // Combine saved history with pending new upload
  const list = history || (_currentWorkerForAttachments?.legal?.[type]?.attachments || []);
  const pending = _attachments[type];
  const display = pending
    ? [{ ...pending, date: new Date().toISOString(), id: '__pending__', reg: '', expiry: '', isNew: true }, ...list]
    : list;
  if (!display.length) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.innerHTML = `
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text-tertiary);margin-bottom:8px;">📁 Document History</div>
    ${display.map((a,i) => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--r-sm);margin-bottom:6px;">
        <span style="font-size:16px;">${a.mime === 'application/pdf' ? '📄' : '🖼️'}</span>
        <div style="flex:1;min-width:0;">
          <div style="font-size:12.5px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(a.name||'Document')} ${a.isNew ? '<span style="background:rgba(92,122,92,.15);color:var(--accent-sage);font-size:10px;padding:1px 7px;border-radius:20px;margin-left:4px;">New</span>' : ''}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${a.date ? new Date(a.date).toLocaleDateString('en-MY') : ''} ${a.reg ? '· Reg: '+esc(a.reg) : ''} ${a.expiry ? '· Exp: '+formatDate(a.expiry) : ''}</div>
        </div>
        <a href="${a.data}" download="${esc(a.name||'document')}" title="Download" style="color:var(--accent-primary);font-size:14px;text-decoration:none;">⬇️</a>
        <button onclick="viewAttachment('${a.data}','${esc(a.name||'document')}','${a.mime||''}')" title="View" style="background:none;border:none;cursor:pointer;color:var(--accent-primary);font-size:14px;padding:0;">👁️</button>
        ${isAdmin() && !a.isNew ? `<button onclick="deleteAttachment('${type}',${i})" title="Delete" style="background:none;border:none;cursor:pointer;color:var(--accent-clay);font-size:14px;padding:0;">🗑️</button>` : ''}
      </div>`).join('')}`;
}

async function deleteAttachment(type, index) {
  if (!_currentWorkerForAttachments) return;
  if (!confirm('Delete this document? This cannot be undone.')) return;
  const w = _currentWorkerForAttachments;
  if (!w.legal?.[type]?.attachments) return;
  w.legal[type].attachments.splice(index, 1);
  await saveWorkerToDB(w);
  loadAttachmentPreviews(w);
  showToast('Document deleted.');
}

function openAttachmentsModal(workerId) {
  const w = workers.find(x => x.id === workerId); if (!w) return;
  const modal = document.getElementById('attachmentsModal');
  const body  = document.getElementById('attachmentsModalBody');
  if (!modal || !body) return;
  const g = w.general || {};
  document.getElementById('attachmentsModalTitle').textContent = `Documents — ${g.name || 'Worker'}`;

  const types = [
    { key: 'passport', label: 'Passport' },
    { key: 'license',  label: 'Labour License' },
    { key: 'permit',   label: 'Work Permit' },
  ];

  body.innerHTML = types.map(t => {
    const history = w.legal?.[t.key]?.attachments || [];
    if (!history.length) return `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border-default);">${t.label}</div>
        <div style="font-size:13px;color:var(--text-tertiary);font-style:italic;">No documents uploaded.</div>
      </div>`;
    return `
      <div style="margin-bottom:20px;">
        <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--border-default);">${t.label} <span style="font-size:11px;font-weight:400;color:var(--text-tertiary);">(${history.length} document${history.length!==1?'s':''})</span></div>
        ${history.map((a,i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:var(--bg-surface);border:1px solid var(--border-default);border-radius:var(--r-md);margin-bottom:8px;">
            <span style="font-size:20px;">${a.mime==='application/pdf'?'📄':'🖼️'}</span>
            <div style="flex:1;min-width:0;">
              <div style="font-size:13px;font-weight:600;color:var(--text-primary);">${esc(a.name||'Document')}</div>
              <div style="font-size:11.5px;color:var(--text-tertiary);">${a.date?new Date(a.date).toLocaleDateString('en-MY',{day:'2-digit',month:'short',year:'numeric'}):''} ${a.reg?'· Reg: '+esc(a.reg):''} ${a.expiry?'· Exp: '+formatDate(a.expiry):''}</div>
            </div>
            <button class="btn-ghost btn-sm" onclick="viewAttachment('${a.data}','${esc(a.name||'document')}','${a.mime||''}')">👁️ View</button>
            <a href="${a.data}" download="${esc(a.name||'document')}" class="btn-secondary btn-sm" style="text-decoration:none;">⬇️</a>
            ${isAdmin()?`<button onclick="deleteAttachmentFromModal('${w.id}','${t.key}',${i})" class="btn-danger btn-sm">🗑️</button>`:''}
          </div>`).join('')}
      </div>`;
  }).join('');

  openModal('attachmentsModal');
}

async function deleteAttachmentFromModal(workerId, type, index) {
  if (!confirm('Delete this document? This cannot be undone.')) return;
  const w = workers.find(x => x.id === workerId); if (!w) return;
  if (!w.legal?.[type]?.attachments) return;
  w.legal[type].attachments.splice(index, 1);
  await saveWorkerToDB(w);
  openAttachmentsModal(workerId); // refresh modal
  showToast('Document deleted.');
}

// Open base64 file in new tab (browsers block data: href navigation)
function viewAttachment(data, name, mime) {
  try {
    // Convert base64 data URI to blob then open as object URL
    const base64 = data.split(',')[1];
    const binary  = atob(base64);
    const bytes   = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob    = new Blob([bytes], { type: mime || 'application/octet-stream' });
    const url     = URL.createObjectURL(blob);
    const win     = window.open(url, '_blank');
    // Revoke after a delay so the tab has time to load
    if (win) setTimeout(() => URL.revokeObjectURL(url), 10000);
    else {
      // Popup blocked — fallback: trigger download
      const a = document.createElement('a');
      a.href = url; a.download = name || 'document';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  } catch(e) {
    showToast('Could not open file: ' + e.message, true);
  }
}