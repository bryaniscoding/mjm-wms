// ============================================================
//  documents.js — Document Status + Document Application Status
//  Depends on: utils.js, data.js, legal.js
// ============================================================

// ── MODULE STATE ──────────────────────────────────────────────
let editingAppId        = null;
let currentAppWorkerId  = null;
let returnToWorker      = false;

let docSort = { col: 'expiry', dir: 1 };
let appSort = { col: '_statusOrder', dir: 1 };

// ── DURATION & TYPE RULES ─────────────────────────────────────
const DURATION_RULES = {
  'Passport':       { 'Renew': 7,  'New Application': 7   },
  'Labour License': { 'Renew': 14, 'New Application': 14  },
  'Work Permit':    { 'Renew': 45, 'New Application': 120 },
  'C.O.M':         { 'Renew': 1,  'New Application': 1   },
};
const LOCKED_TYPE = { 'Passport': 'Renew', 'C.O.M': 'New Application' };
const REG_LABELS  = {
  'Passport':       'Passport Number',
  'Labour License': 'Labour License Reg. No.',
  'Work Permit':    'Work Permit Reg. No.',
  'C.O.M':         'C.O.M Reference No.',
};

// ══════════════════════════════════════════════════════════════
//  DOCUMENT STATUS PAGE
// ══════════════════════════════════════════════════════════════

function buildDocRows() {
  const rows = [];
  workers.forEach(w => {
    const g  = w.general || {};
    const co = w.legal?.quota?.company || '—';
    [
      { type: 'Passport',       expiry: w.legal?.passport?.expiry || '', mode: 'long'  },
      { type: 'Labour License', expiry: w.legal?.license?.expiry  || '', mode: 'short' },
      { type: 'Work Permit',    expiry: w.legal?.permit?.expiry   || '', mode: 'short' },
    ].forEach(doc => {
      if (!doc.expiry) return;
      rows.push({
        workerId: w.id,
        docType:  doc.type,
        name:     g.name     || '—',
        location: g.location || '—',
        company:  co,
        expiry:   doc.expiry,
        mode:     doc.mode,
      });
    });
  });
  return rows;
}

function populateDocFilters() {
  const locs = [...new Set(workers.map(w => w.general?.location).filter(Boolean))].sort();
  const cos  = [...new Set(workers.map(w => w.legal?.quota?.company).filter(Boolean))].sort();
  const locSel = document.getElementById('docLocationFilter');
  const coSel  = document.getElementById('docCompanyFilter');
  if (locSel) locSel.innerHTML = `<option value="">All Locations</option>`  + locs.map(l => `<option>${esc(l)}</option>`).join('');
  if (coSel)  coSel.innerHTML  = `<option value="">All AP Companies</option>` + cos.map(c => `<option>${esc(c)}</option>`).join('');
  // docType filter – static, no need to populate dynamically
}

function sortDocs(col)    { handleSort(docSort, col, renderDocTable); }
function filterDocs()     { renderDocTable(); }
function clearDocFilters() {
  ['docSearch','docDocTypeFilter','docLocationFilter','docCompanyFilter','docDateFrom','docDateTo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderDocTable();
}

function renderDocTable() {
  const query    = (document.getElementById('docSearch')?.value        || '').toLowerCase().trim();
  const docTF    = document.getElementById('docDocTypeFilter')?.value  || '';
  const locF     = document.getElementById('docLocationFilter')?.value || '';
  const compF    = document.getElementById('docCompanyFilter')?.value  || '';
  const dateFrom = document.getElementById('docDateFrom')?.value       || '';
  const dateTo   = document.getElementById('docDateTo')?.value         || '';

  let rows = buildDocRows();
  if (query)    rows = rows.filter(r => [r.docType, r.name, r.location, r.company].join(' ').toLowerCase().includes(query));
  if (docTF)    rows = rows.filter(r => r.docType  === docTF);
  if (locF)     rows = rows.filter(r => r.location === locF);
  if (compF)    rows = rows.filter(r => r.company  === compF);
  if (dateFrom) rows = rows.filter(r => r.expiry   >= dateFrom);
  if (dateTo)   rows = rows.filter(r => r.expiry   <= dateTo);
  rows = applySort(rows, docSort, (r, col) => r[col] || '');
  updateSortIcons('page-doc-status', docSort);

  const tbody = document.getElementById('doc-table-body');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><div class="empty-icon">📄</div>
      <p>${workers.length === 0 ? 'No workers registered yet.' : 'No documents match your search.'}</p>
    </div></td></tr>`;
    document.getElementById('doc-count').textContent = ''; return;
  }

  tbody.innerHTML = rows.map(r => `<tr>
    <td><span class="doc-type-badge">${esc(r.docType)}</span></td>
    <td>${esc(r.name)}</td>
    <td>${esc(r.location)}</td>
    <td>${esc(r.company)}</td>
    <td>${expiryCell(r.expiry, r.mode)}</td>
    <td><button class="btn-renew" onclick="openAppModal('${esc(r.workerId)}','${esc(r.docType)}','Renew',false)">Renew</button></td>
  </tr>`).join('');

  const total = buildDocRows().length;
  document.getElementById('doc-count').textContent =
    (query || locF || compF || dateFrom || dateTo)
      ? `Showing ${rows.length} of ${total}`
      : ` ${total} document${total !== 1 ? 's' : ''}`;
}

// ══════════════════════════════════════════════════════════════
//  APPLICATION MODAL
// ══════════════════════════════════════════════════════════════

function openAppModal(workerId, prefillDocType, prefillAppType, fromWorkerModal) {
  currentAppWorkerId = workerId;
  editingAppId       = null;
  returnToWorker     = !!fromWorkerModal;

  // Try to find saved worker first; if not found, read from the open worker form
  const w = workers.find(x => x.id === workerId);
  const nameFromForm     = document.getElementById('f_name')?.value?.trim()     || '';
  const locationFromForm = document.getElementById('f_location')?.value         || '';
  document.getElementById('appModalTitle').textContent      = 'Document Application';
  document.getElementById('app_worker_name').value          = w?.general?.name     || nameFromForm     || '';
  document.getElementById('app_location').value             = w?.general?.location || locationFromForm || '';
  document.getElementById('app_doc_type').value             = prefillDocType        || '';
  document.getElementById('appReturnBtn').style.display     = returnToWorker ? 'inline-flex' : 'none';
  document.getElementById('appModalError').style.display    = 'none';
  const searchRow2 = document.getElementById('app_worker_search_row');
  if (searchRow2) searchRow2.style.display = 'none';
  // Use stack so closing appModal restores the parent (workerModal etc.)
  openModal('appModal');

  ['app_date','app_actual_receive','app_handover','app_new_expiry','app_reg_number']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('app_duration').value    = '';
  document.getElementById('app_est_receive').value = '';

  onAppDocTypeChange();
  if (prefillAppType && !LOCKED_TYPE[prefillDocType]) {
    document.getElementById('app_type').value = prefillAppType;
    onAppTypeChange();
  }
  openModal('appModal');
}

function openAppModalForEdit(appId) {
  const app = applications.find(a => a.id === appId); if (!app) return;
  currentAppWorkerId = app.workerId;
  editingAppId       = appId;
  returnToWorker     = false;

  document.getElementById('appModalTitle').textContent   = 'Update Application';
  document.getElementById('app_worker_name').value       = app.workerName    || '';
  document.getElementById('app_location').value          = app.location      || '';
  document.getElementById('app_doc_type').value          = app.docType       || '';
  document.getElementById('app_date').value              = app.appDate       || '';
  document.getElementById('app_actual_receive').value    = app.actualReceive || '';
  document.getElementById('app_handover').value          = app.handover      || '';
  document.getElementById('app_new_expiry').value        = app.newExpiry     || '';
  document.getElementById('app_reg_number').value        = app.regNumber     || '';
  document.getElementById('appReturnBtn').style.display  = 'none';
  document.getElementById('appModalError').style.display = 'none';

  onAppDocTypeChange();
  document.getElementById('app_type').value = app.appType || '';
  onAppTypeChange();
  calcEstReceive();
  openModal('appModal');
}

function returnToWorkerModal() {
  closeAppModal();
  // If worker modal was parked (worker form was open), restore it
  const modal = document.getElementById('workerModal');
  if (editingId || currentAppWorkerId) {
    restoreWorkerModal();
    switchTab(1); // return to Legal Info tab
  }
}

function onAppDocTypeChange() {
  const docType = document.getElementById('app_doc_type').value;
  const sel     = document.getElementById('app_type');
  const locked  = LOCKED_TYPE[docType];

  if (!docType) {
    sel.innerHTML = `<option value="">Select type</option><option value="Renew">Renew</option><option value="New Application">New Application</option><option value="Data Entry">Data Entry</option>`;
    sel.disabled  = false;
  } else if (locked) {
    sel.innerHTML = `<option value="${locked}">${locked}</option><option value="Data Entry">Data Entry</option>`;
    sel.value     = locked; sel.disabled = false;
  } else {
    sel.innerHTML = `<option value="">Select type</option><option value="Renew">Renew</option><option value="New Application">New Application</option><option value="Data Entry">Data Entry</option>`;
    sel.disabled  = false;
  }

  const regLabel = document.getElementById('app_reg_label');
  if (regLabel) regLabel.textContent = REG_LABELS[docType] || 'Registration Number';
  onAppTypeChange();
}

function onAppTypeChange() {
  const appType     = document.getElementById('app_type').value;
  const isDataEntry = appType === 'Data Entry';

  ['app_date','app_duration','app_est_receive','app_actual_receive','app_handover'].forEach(id => {
    const el = document.getElementById(id); if (!el) return;
    el.disabled = isDataEntry;
    el.classList.toggle('readonly-field', isDataEntry);
    if (isDataEntry) el.value = '';
  });

  const expiryLabel = document.getElementById('app_expiry_label');
  if (expiryLabel) expiryLabel.textContent = isDataEntry ? 'Expiry Date' : 'New Expiry Date';
  calcEstReceive();
}

function calcEstReceive() {
  const docType = document.getElementById('app_doc_type').value;
  const appType = document.getElementById('app_type').value;
  const appDate = document.getElementById('app_date').value;
  if (!docType || !appType || appType === 'Data Entry') {
    document.getElementById('app_duration').value    = '';
    document.getElementById('app_est_receive').value = ''; return;
  }
  const days = DURATION_RULES[docType]?.[appType];
  document.getElementById('app_duration').value = days ? `${days} day${days !== 1 ? 's' : ''}` : '';
  if (appDate && days) {
    const est = new Date(appDate); est.setDate(est.getDate() + days);
    document.getElementById('app_est_receive').value =
      est.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  } else {
    document.getElementById('app_est_receive').value = '';
  }
}

async function saveApplication() {
  const docType = document.getElementById('app_doc_type').value;
  const appType = document.getElementById('app_type').value;
  if (!docType) { showAppError('Please select a document type.'); return; }
  if (!appType) { showAppError('Please select an application type.'); return; }
  const isDataEntry = appType === 'Data Entry';
  if (!isDataEntry && !document.getElementById('app_date').value) {
    showAppError('Please enter an application date.'); return;
  }
  const actualReceive = document.getElementById('app_actual_receive').value;
  if (actualReceive && !isDataEntry) {
    const reg    = document.getElementById('app_reg_number').value.trim();
    const expiry = document.getElementById('app_new_expiry').value;
    if (!reg)    { showAppError('Registration number is required when Actual Date of Receive is filled.'); return; }
    if (!expiry) { showAppError('New Expiry Date is required when Actual Date of Receive is filled.'); return; }
  }

  const days    = DURATION_RULES[docType]?.[appType] || 0;
  const appDate = document.getElementById('app_date').value;
  const estDate = (!isDataEntry && appDate)
    ? (() => { const d = new Date(appDate); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); })()
    : '';
  const newExpiry  = document.getElementById('app_new_expiry').value;
  const regNumber  = document.getElementById('app_reg_number').value.trim();

  const appData = {
    id:            editingAppId || genId(),
    workerId:      currentAppWorkerId,
    workerName:    document.getElementById('app_worker_name').value,
    location:      document.getElementById('app_location').value,
    docType, appType,
    appDate:        isDataEntry ? '' : appDate,
    durationDays:   isDataEntry ? 0 : days,
    estReceive:     estDate,
    actualReceive:  isDataEntry ? '' : document.getElementById('app_actual_receive').value,
    handover:       isDataEntry ? '' : document.getElementById('app_handover').value,
    newExpiry, regNumber,
    recordedAt:    new Date().toISOString(),
  };

  // Apply new expiry / registration number to worker record
  if (currentAppWorkerId && currentAppWorkerId !== '__NEW__') {
    // Worker already saved — update in memory + DB
    const w = workers.find(x => x.id === currentAppWorkerId);
    if (w) {
      if (!w.legal) w.legal = {};
      if (docType === 'Passport') {
        if (!w.legal.passport) w.legal.passport = {};
        if (newExpiry)  w.legal.passport.expiry = newExpiry;
        if (regNumber)  w.legal.passport.number = regNumber;
      }
      if (docType === 'Labour License') {
        if (!w.legal.license) w.legal.license = {};
        if (newExpiry)  w.legal.license.expiry = newExpiry;
        if (regNumber)  w.legal.license.reg    = regNumber;
      }
      if (docType === 'Work Permit') {
        if (!w.legal.permit) w.legal.permit = {};
        if (newExpiry)  w.legal.permit.expiry = newExpiry;
        if (regNumber)  w.legal.permit.reg    = regNumber;
      }
    }
  } else if (currentAppWorkerId === '__NEW__') {
    // Worker not saved yet — write back into the open worker form fields
    // so the data is captured when the worker is eventually saved
    if (docType === 'Passport') {
      if (newExpiry)  { const el = document.getElementById('f_passport_expiry'); if (el) el.value = newExpiry; }
      if (regNumber)  { const el = document.getElementById('f_passport_num'); if (el) { el.readOnly = false; el.value = regNumber; el.readOnly = true; } }
    }
    if (docType === 'Labour License') {
      if (newExpiry)  { const el = document.getElementById('f_license_expiry'); if (el) el.value = newExpiry; }
      if (regNumber)  { const el = document.getElementById('f_license_reg');    if (el) el.value = regNumber; }
    }
    if (docType === 'Work Permit') {
      if (newExpiry)  { const el = document.getElementById('f_permit_expiry'); if (el) el.value = newExpiry; }
      if (regNumber)  { const el = document.getElementById('f_permit_reg');    if (el) el.value = regNumber; }
    }
    // Refresh legal status display in the worker form
    if (typeof refreshLegalStatuses === 'function') refreshLegalStatuses();
    showToast('Legal data saved to form — remember to save the worker profile.');
  }

  // Financial entry is saved once below inside savePromises (uses getPriceAsOf)

  if (editingAppId) {
    const idx = applications.findIndex(a => a.id === editingAppId);
    if (idx !== -1) applications[idx] = appData;
    showToast('Application updated.');
  } else {
    applications.unshift(appData);
    showToast('Application saved.');
  }

  showLoadingOverlay(true);
  // Save application + worker legal updates
  const savePromises = [saveApplicationToDB(appData)];
  if (currentAppWorkerId && currentAppWorkerId !== '__NEW__') {
    const w = workers.find(x => x.id === currentAppWorkerId);
    if (w) savePromises.push(saveWorkerToDB(w));
  }
  // Note: for __NEW__ workers, legal data is written to form fields above
  // and will be saved when the worker profile is saved
  // Save financial entry
  if (!isDataEntry && !editingAppId) {
    const price = getPriceAsOf(docType, appDate);
    if (price > 0) {
      const finEntry = { id: genId(), date: appDate || new Date().toISOString().slice(0,10), workerName: appData.workerName, location: appData.location, docType, appType, qty: 1, unitPrice: price, total: price, appId: appData.id };
      savePromises.push(saveFinancialEntry(finEntry));
    }
  }
  Promise.all(savePromises).then(() => {
    showLoadingOverlay(false);
    if (returnToWorker) {
      closeAppModal();
      restoreWorkerModal();
      switchTab(1);
      refreshLegalStatuses();
      updateLegalAppIndicators();
    } else if (typeof _returnToView !== 'undefined' && _returnToView) {
      _returnToView = false;
      closeAppModal();
      // Re-open view modal with fresh data
      if (typeof _returnToViewId !== 'undefined' && _returnToViewId) viewWorker(_returnToViewId);
    }
    else { closeAppModal(); renderAppTable(); renderDocTable(); renderWorkerTable(); }
    showToast(editingAppId ? 'Application updated.' : 'Application saved.');
  }).catch(e => { showLoadingOverlay(false); showToast('Save failed.', true); console.error(e); });
}

function closeAppModal() {
  closeModal('appModal');
  editingAppId = null;
  // If opened from view profile modal, restore it
  if (typeof _returnToView !== 'undefined' && _returnToView) {
    _returnToView = false;
    restoreViewModal();
  }
  currentAppWorkerId = null; returnToWorker = false;
}
function closeAppModalOutside(e) { closeModalOutsideStack(e, 'appModal'); }

// ══════════════════════════════════════════════════════════════
//  APPLICATION STATUS TABLE  (excludes Data Entry)
// ══════════════════════════════════════════════════════════════

// Status order for sorting: 0=IN PROGRESS, 1=PENDING RETURN, 2=COMPLETED, 3=CANCELLED
const APP_STATUS_ORDER = { 'IN PROGRESS': 0, 'PENDING RETURN': 1, 'COMPLETED': 2, 'CANCELLED': 3 };

function deriveAppStatus(app) {
  if (app.cancelled)      return 'CANCELLED';
  if (app.handover)       return 'COMPLETED';
  if (app.actualReceive)  return 'PENDING RETURN';
  if (app.appDate)        return 'IN PROGRESS';
  return '—';
}

function populateAppFilters() {
  const locs   = [...new Set(workers.map(w => w.general?.location).filter(Boolean))].sort();
  const locSel = document.getElementById('appLocationFilter');
  if (locSel) locSel.innerHTML = `<option value="">All Locations</option>` + locs.map(l => `<option>${esc(l)}</option>`).join('');
}

function cancelApplication(id) {
  cancelApplicationInDB(id).then(() => { renderAppTable(); showToast('Application cancelled.'); });
}

function deleteApplicationRecord(id) {
  if (!confirm('Permanently delete this application record and its financial entry? This cannot be undone.')) return;
  Promise.all([
    deleteApplicationFromDB(id),
    deleteFinancialsByAppId(id),
  ]).then(() => {
    renderAppTable(); renderDocTable(); renderWorkerTable();
    if (typeof renderFinancialTable === 'function') renderFinancialTable();
    showToast('Application and financial record deleted.');
  }).catch(() => showToast('Failed to delete record.', true));
}

function openNewApplicationModal() {
  // Open app modal with worker search — reuse openAppModal but without prefilling worker
  currentAppWorkerId = null; editingAppId = null; returnToWorker = false;
  document.getElementById('appModalTitle').textContent = 'New Document Application';
  document.getElementById('app_worker_name').value = '';
  document.getElementById('app_location').value    = '';
  document.getElementById('app_doc_type').value    = '';
  ['app_date','app_actual_receive','app_handover','app_new_expiry','app_reg_number']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('app_duration').value    = '';
  document.getElementById('app_est_receive').value = '';
  document.getElementById('appReturnBtn').style.display = 'none';
  document.getElementById('appModalError').style.display = 'none';
  // Show worker search row
  const searchRow = document.getElementById('app_worker_search_row');
  if (searchRow) searchRow.style.display = '';
  onAppDocTypeChange();
  openModal('appModal');
}

function onAppWorkerSearch() {
  const input = document.getElementById('app_worker_search');
  const dd    = document.getElementById('app_worker_dropdown');
  const q     = (input?.value || '').toLowerCase().trim();
  if (!q) { dd.style.display = 'none'; return; }
  const matches = workers.filter(w => [w.general?.name, w.general?.workerId].join(' ').toLowerCase().includes(q)).slice(0, 8);
  if (!matches.length) { dd.style.display = 'none'; return; }
  dd.innerHTML = matches.map(w => `<div class="slot-assign-item" onclick="selectAppWorker('${w.id}')">
    <strong>${esc(w.general?.name||'—')}</strong>
    <span style="color:var(--text3);font-size:12.5px;"> ${esc(w.general?.workerId||'')} · ${esc(w.general?.location||'—')}</span>
  </div>`).join('');
  dd.style.display = 'block';
}

function selectAppWorker(wId) {
  const w = workers.find(x => x.id === wId); if (!w) return;
  currentAppWorkerId = wId;
  const searchEl = document.getElementById('app_worker_search');
  if (searchEl) { searchEl.value = w.general?.name || ''; searchEl.dataset.selectedId = wId; }
  document.getElementById('app_worker_name').value = w.general?.name     || '';
  document.getElementById('app_location').value    = w.general?.location || '';
  document.getElementById('app_worker_dropdown').style.display = 'none';
}

function sortApps(col)    { handleSort(appSort, col, renderAppTable); }
function filterApplications() { renderAppTable(); }
function clearAppFilters() {
  ['appSearch','appDocTypeFilter','appLocationFilter','appStatusFilter',
   'appDateFrom','appDateTo','appRecvFrom','appRecvTo','appHandFrom','appHandTo']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderAppTable();
}

function renderAppTable() {
  const query  = (document.getElementById('appSearch')?.value        || '').toLowerCase().trim();
  const docF   = document.getElementById('appDocTypeFilter')?.value  || '';
  const locF   = document.getElementById('appLocationFilter')?.value || '';
  const staF   = document.getElementById('appStatusFilter')?.value   || '';
  const aFrom  = document.getElementById('appDateFrom')?.value       || '';
  const aTo    = document.getElementById('appDateTo')?.value         || '';
  const rFrom  = document.getElementById('appRecvFrom')?.value       || '';
  const rTo    = document.getElementById('appRecvTo')?.value         || '';
  const hFrom  = document.getElementById('appHandFrom')?.value       || '';
  const hTo    = document.getElementById('appHandTo')?.value         || '';

  // Exclude Data Entry
  let rows = applications
    .filter(a => a.appType !== 'Data Entry')
    .map(a => {
      const _status = deriveAppStatus(a);
      return { ...a, _status, _statusOrder: APP_STATUS_ORDER[_status] ?? 99 };
    });

  if (query) rows = rows.filter(a => [a.workerName, a.docType, a.appType, a.location, a._status].join(' ').toLowerCase().includes(query));
  if (docF)  rows = rows.filter(a => a.docType  === docF);
  if (locF)  rows = rows.filter(a => a.location === locF);
  if (staF)  rows = rows.filter(a => a._status  === staF);
  if (aFrom) rows = rows.filter(a => a.appDate       >= aFrom);
  if (aTo)   rows = rows.filter(a => a.appDate       <= aTo);
  if (rFrom) rows = rows.filter(a => a.actualReceive >= rFrom);
  if (rTo)   rows = rows.filter(a => a.actualReceive <= rTo);
  if (hFrom) rows = rows.filter(a => a.handover      >= hFrom);
  if (hTo)   rows = rows.filter(a => a.handover      <= hTo);

  rows = applySort(rows, appSort, (a, col) => {
    if (col === '_statusOrder') return String(a._statusOrder ?? 99).padStart(3,'0') + (a.appDate||'');
    const m = { appStatus: '_status', docType: 'docType', appType: 'appType', location: 'location', workerName: 'workerName', appDate: 'appDate', estReceive: 'estReceive' };
    return a[m[col]] || '';
  });
  updateSortIcons('page-doc-application', appSort);

  const tbody = document.getElementById('app-table-body');
  const nonDataEntryTotal = applications.filter(a => a.appType !== 'Data Entry').length;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state"><div class="empty-icon">${nonDataEntryTotal === 0 ? '📋' : '🔍'}</div>
      <div class="empty-title">${nonDataEntryTotal === 0 ? 'No applications yet' : 'No applications found'}</div>
      <p>${nonDataEntryTotal === 0 ? 'Create a document application when a worker needs a passport renewal, permit or license.' : 'Try adjusting your search or date range.'}</p>
      ${nonDataEntryTotal === 0 ? '<button class="btn-primary" onclick="openNewApplicationModal()">+ New Application</button>' : ''}
    </div></td></tr>`;
    document.getElementById('app-count').textContent = ''; return;
  }

  const statusCls = { 'IN PROGRESS': 'IN-PROGRESS', 'PENDING RETURN': 'PENDING-RETURN', 'COMPLETED': 'COMPLETED', 'CANCELLED': 'CANCELLED' };
  tbody.innerHTML = rows.map(a => `<tr>
    <td><span class="app-status ${statusCls[a._status] || ''}">${esc(a._status)}</span></td>
    <td><span class="doc-type-badge">${esc(a.docType)}</span></td>
    <td>${esc(a.appType)}</td>
    <td>${esc(a.location || '—')}</td>
    <td>${esc(a.workerName || '—')}</td>
    <td>${formatDate(a.appDate)}</td>
    <td>${formatDate(a.estReceive)}</td>
    <td><div class="action-group">
      ${a._status !== 'CANCELLED' && a._status !== 'COMPLETED' ? `<button class="btn-renew" onclick="openAppModalForEdit('${a.id}')">Update</button>` : ''}
      ${a._status !== 'CANCELLED' && a._status !== 'COMPLETED' ? `<button class="btn-renew" style="color:var(--red);border-color:var(--red);" onclick="cancelApplication('${a.id}')">Cancel</button>` : ''}
      <button class="action-btn danger" title="Delete Record" onclick="deleteApplicationRecord('${a.id}')">🗑️</button>
    </div></td>
  </tr>`).join('');

  document.getElementById('app-count').textContent =
    (query || docF || locF || staF || aFrom || aTo || rFrom || rTo || hFrom || hTo)
      ? `Showing ${rows.length} of ${nonDataEntryTotal}`
      : ` ${nonDataEntryTotal} application${nonDataEntryTotal !== 1 ? 's' : ''}`;
}