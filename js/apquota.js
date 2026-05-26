// ============================================================
//  apquota.js — AP Quota overview and all related modals
//  Depends on: utils.js, data.js
// ============================================================

// ── MODULE STATE ──────────────────────────────────────────────
let updatingApId = null;
let editingApId  = null;
let deletingApId = null;
let apSort       = { col: '_priority', dir: 0 };

// Floating slot-assign menu reference
let _slotMenu = null;

// ── SORT / FILTER ─────────────────────────────────────────────
function sortAp(col)    { handleSort(apSort, col, renderApQuotaTable); }
function filterApQuota(){ renderApQuotaTable(); }
function clearApFilters() {
  const el = document.getElementById('apSearch'); if (el) el.value = '';
  renderApQuotaTable();
}

// ── RENDER TABLE ──────────────────────────────────────────────
function renderApQuotaTable() {
  const query = (document.getElementById('apSearch')?.value || '').toLowerCase().trim();

  const statusPriority = { 'Active': 0, 'Application in Process': 1, 'Delayed': 2, 'Expired': 3, '—': 4 };
  let rows = apQuotas.map(aq => ({ ...aq, _status: deriveApQuotaStatus(aq) }));
  if (query) rows = rows.filter(q => [q.company, q.kdn].join(' ').toLowerCase().includes(query));

  // Default: status priority → company A-Z
  rows.sort((a, b) => {
    const pa = statusPriority[a._status] ?? 4;
    const pb = statusPriority[b._status] ?? 4;
    if (pa !== pb) return pa - pb;
    return (a.company || '').localeCompare(b.company || '');
  });

  // Override with user sort
  if (apSort.dir > 0) {
    rows = applySort(rows, apSort, (q, col) => {
      switch (col) {
        case 'aqStatus': return q._status;
        case 'company':  return q.company || '';
        case 'kdn':      return q.kdn     || '';
        case 'slots':    return String(q.slots || 0);
        case 'expiry':   return q.expiry       || '';
        case 'appDate':  return q.appDate      || '';
        case 'approval': return q.approvalDate || '';
        default: return '';
      }
    });
  }
  updateSortIcons('page-ap-quota', apSort);

  const tbody = document.getElementById('ap-table-body');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">${apQuotas.length === 0 ? '◎' : '🔍'}</div>
      <div class="empty-title">${apQuotas.length === 0 ? 'No AP Quota entries yet' : 'No entries found'}</div>
      <p>${apQuotas.length === 0 ? 'Register your first AP Quota application to start tracking slots and approvals.' : 'Try adjusting your search.'}</p>
      ${apQuotas.length === 0 ? '<button class="btn-primary" onclick="openApQuotaModal()">+ Add AP Quota</button>' : ''}
    </div></td></tr>`;
    document.getElementById('ap-count').textContent = ''; return;
  }

  const aqStatusCls = {
    'Active':                 'aq-active',
    'Application in Process': 'aq-process',
    'Delayed':                'aq-delayed',
    'Expired':                'aq-expired',
  };

  tbody.innerHTML = rows.map(aq => {
    const assigned  = getAssignedWorkers(aq);
    const aqStatus  = aq._status;
    const isExpired = aqStatus === 'Expired';
    const isInProcess = aqStatus === 'Application in Process' || aqStatus === 'Delayed';
    const eligible  = (isExpired || !aq.approvalDate) ? [] : getEligibleWorkers(aq);

    // Slot chips
    const slotChips = Array.from({ length: aq.slots }, (_, i) => {
      const slotNum     = i + 1;
      const workerInSlot = assigned.find(w => parseInt((w.legal?.quota?.slot || '').replace(/\D/g, '')) === slotNum);

      if (workerInSlot) {
        const g = workerInSlot.general || {};
        return `<span class="slot-chip taken" onmouseenter="positionSlotTip(event)">
          <span class="slot-tip">${esc(g.name || 'Worker')} · ${esc(g.location || '—')}</span>
          ${slotNum}
        </span>`;
      }
      if (isExpired) {
        return `<span class="slot-chip expired-slot" onmouseenter="positionSlotTip(event)">
          <span class="slot-tip">Expired</span>${slotNum}
        </span>`;
      }
      // Vacant — clicking opens floating assign menu
      const eligibleJson = JSON.stringify(eligible.map(w => ({ id: w.id, name: w.general?.name || '' })));
      return `<span class="slot-chip vacant" onclick="showSlotAssignMenu(event,'${aq.id}',${esc(eligibleJson)})" onmouseenter="positionSlotTip(event)">
        <span class="slot-tip">Slot ${slotNum} — Click to assign</span>${slotNum}
      </span>`;
    }).join('');

    // Action buttons
    const actions = isInProcess
      ? `<div class="action-group">
          <button class="action-btn" title="Approve" onclick="openApQuotaUpdateModal('${aq.id}')">✅</button>
          <button class="action-btn danger" title="Delete" onclick="openDeleteApModal('${aq.id}')">🗑️</button>
        </div>`
      : `<div class="action-group">
          <button class="action-btn" title="Edit"   onclick="openApQuotaEditModal('${aq.id}')">✏️</button>
          <button class="action-btn danger" title="Delete" onclick="openDeleteApModal('${aq.id}')">🗑️</button>
        </div>`;

    const kdnCell = aq.kdn
      ? `<span class="kdn-link" onclick="openKdnDetailModal('${aq.id}')">${esc(aq.kdn)}</span>`
      : '—';

    return `<tr>
      <td><span class="aq-status-badge ${aqStatusCls[aqStatus] || ''}">${esc(aqStatus)}</span></td>
      <td>${esc(aq.company)}</td>
      <td>${kdnCell}</td>
      <td style="text-align:center;">${aq.slots}</td>
      <td><div class="slot-grid">${slotChips}</div></td>
      <td>${expiryCell(aq.expiry, 'short')}</td>
      <td>${formatDate(aq.appDate)}</td>
      <td>${formatDate(aq.approvalDate)}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');

  const total = apQuotas.length;
  document.getElementById('ap-count').textContent =
    query ? `Showing ${rows.length} of ${total} entr${total !== 1 ? 'ies' : 'y'}` : ` ${total} AP Quota entr${total !== 1 ? 'ies' : 'y'}`;
}

// ── SLOT ASSIGN FLOATING MENU ─────────────────────────────────
function showSlotAssignMenu(e, aqId, eligible) {
  closeSlotMenu();
  _slotMenu = document.createElement('div');
  _slotMenu.className = 'slot-assign-menu';

  if (!eligible.length) {
    _slotMenu.innerHTML = `<div class="slot-assign-empty">No eligible workers</div>`;
  } else {
    _slotMenu.innerHTML = eligible.map(w =>
      `<div class="slot-assign-item" onclick="assignWorkerToSlot('${aqId}','${w.id}');closeSlotMenu()">${esc(w.name)}</div>`
    ).join('');
  }

  document.body.appendChild(_slotMenu);
  const r = e.target.getBoundingClientRect();
  _slotMenu.style.top  = (r.bottom + window.scrollY + 4) + 'px';
  _slotMenu.style.left = (r.left   + window.scrollX)     + 'px';
  setTimeout(() => document.addEventListener('click', closeSlotMenu, { once: true }), 0);
}

function closeSlotMenu() {
  if (_slotMenu) { _slotMenu.remove(); _slotMenu = null; }
}

async function assignWorkerToSlot(aqId, wId) {
  const aq = apQuotas.find(q => q.id === aqId);
  const w  = workers.find(x => x.id === wId);
  if (!aq || !w) return;

  const aqStatus = deriveApQuotaStatus(aq);
  if (aqStatus === 'Expired')   { showToast('Cannot assign to expired quota.', true); return; }
  if (!aq.approvalDate)         { showToast('Quota must be Active before assigning.', true); return; }

  const assigned  = getAssignedWorkers(aq);
  if (assigned.length >= aq.slots) { showToast('No available slots.', true); return; }

  const used = assigned.map(x => parseInt((x.legal?.quota?.slot || '').replace(/\D/g, ''))).filter(n => !isNaN(n));
  let next = 1;
  for (let i = 1; i <= aq.slots; i++) { if (!used.includes(i)) { next = i; break; } }

  if (!w.legal) w.legal = {};
  if (!w.legal.quota) w.legal.quota = {};
  w.legal.quota.company = aq.company;
  w.legal.quota.kdn     = aq.kdn;
  w.legal.quota.slot    = `Slot ${next}`;

  // Financial transaction — AP Quota per slot
  const price = parseFloat(docPrices['AP Quota']) || 0;
  if (price > 0) {
    saveFinancialEntry({ id: genId(), date: new Date().toISOString().slice(0, 10), workerName: w.general?.name || '—', location: w.general?.location || '—', docType: 'AP Quota', appType: 'Slot Assignment', qty: 1, unitPrice: price, total: price, appId: aq.id });
  }

  const savePs = [saveWorkerToDB(w)];
  const apPrice = parseFloat(docPrices['AP Quota']) || 0;
  if (apPrice > 0) {
    savePs.push(saveFinancialEntry({ id: genId(), date: new Date().toISOString().slice(0,10), workerName: w.general?.name||'—', location: w.general?.location||'—', docType:'AP Quota', appType:'Slot Assignment', qty:1, unitPrice:apPrice, total:apPrice, appId:aq.id }));
  }
  Promise.all(savePs).then(() => { renderApQuotaTable(); renderWorkerTable(); showToast(`${w.general?.name||'Worker'} assigned to Slot ${next}.`); });
}

// ── NEW AP QUOTA MODAL ────────────────────────────────────────
function openApQuotaModal() {
  ['aq_slots','aq_app_date','aq_est_approval'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('aq_est_dur_display').value = '60 days';
  document.getElementById('apQuotaError').style.display = 'none';
  // Populate company dropdown from Supabase apCompanies array
  const sel = document.getElementById('aq_company');
  if (sel) {
    if (apCompanies && apCompanies.length) {
      sel.innerHTML = `<option value="">Select company…</option>` +
        [...apCompanies].sort((a,b)=>a.name.localeCompare(b.name))
          .map(c=>`<option value="${esc(c.name)}">${esc(c.name)}${c.regNo?' ('+esc(c.regNo)+')':''}</option>`).join('');
    } else {
      sel.innerHTML = `<option value="">No companies in Settings yet</option>`;
    }
    sel.value = '';
  }
  openModal('apQuotaModal');
}
function closeApQuotaModal()     { closeModal('apQuotaModal'); }
function closeApQuotaModalOutside(e) { closeModalOutsideStack(e, 'apQuotaModal'); }

function calcAqEstApproval() {
  const appDate = document.getElementById('aq_app_date').value;
  if (appDate) {
    const est = new Date(appDate); est.setDate(est.getDate() + 60);
    document.getElementById('aq_est_approval').value =
      est.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
  } else {
    document.getElementById('aq_est_approval').value = '';
  }
}

async function saveApQuota() {
  const company = (document.getElementById('aq_company')?.value || '').trim();
  const slots   = parseInt(document.getElementById('aq_slots').value) || 0;
  const appDate = document.getElementById('aq_app_date').value;

  const errEl = document.getElementById('apQuotaError');
  if (!company) { errEl.textContent = 'Registering Company is required.'; errEl.style.display = 'block'; return; }
  if (!slots || slots < 1) { errEl.textContent = 'Please enter a valid number of slots.'; errEl.style.display = 'block'; return; }
  if (!appDate) { errEl.textContent = 'Application Date is required.'; errEl.style.display = 'block'; return; }

  const est = new Date(appDate); est.setDate(est.getDate() + 60);
  const data = { id: genId(), company, slots, appDate, estDuration: 60, estApproval: est.toISOString().slice(0, 10), approvalDate: '', kdn: '', expiry: '' };

  // Financial: slots × AP Quota price
  const price = parseFloat(docPrices['AP Quota']) || 0;
  if (price > 0) {
    saveFinancialEntry({ id: genId(), date: appDate, workerName: '—', location: '—', docType: 'AP Quota', appType: 'New Application', qty: slots, unitPrice: price, total: slots * price, appId: data.id });
  }

  const aqPrice = parseFloat(docPrices['AP Quota']) || 0;
  const savePs = [saveApQuotaToDB(data)];
  if (aqPrice > 0) {
    savePs.push(saveFinancialEntry({ id: genId(), date: appDate, workerName:'—', location:'—', docType:'AP Quota', appType:'New Application', qty:slots, unitPrice:aqPrice, total:slots*aqPrice, appId:data.id }));
  }
  showLoadingOverlay(true);
  Promise.all(savePs).then(() => { showLoadingOverlay(false); closeApQuotaModal(); renderApQuotaTable(); showToast('AP Quota application submitted.'); })
    .catch(e => { showLoadingOverlay(false); showToast('Save failed.',true); console.error(e); });
}

// ── UPDATE (APPROVE) MODAL ────────────────────────────────────
function openApQuotaUpdateModal(aqId) {
  const aq = apQuotas.find(q => q.id === aqId); if (!aq) return;
  updatingApId = aqId;
  document.getElementById('aqUpdateInfo').innerHTML =
    `<strong>${esc(aq.company)}</strong><br/>
    <span style="font-size:12.5px;color:var(--text3);">Applied: ${formatDate(aq.appDate)} &nbsp;·&nbsp; Est. Approval: ${formatDate(aq.estApproval)}</span>`;
  ['aq_approval_date','aq_kdn','aq_expiry'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('apQuotaUpdateError').style.display = 'none';
  openModal('apQuotaUpdateModal');
}
function closeApQuotaUpdateModal()     { closeModal('apQuotaUpdateModal'); updatingApId = null; }
function closeApQuotaUpdateOutside(e)  { closeModalOutsideStack(e, 'apQuotaUpdateModal'); }

function saveApQuotaUpdate() {
  const approvalDate = document.getElementById('aq_approval_date').value;
  const kdn          = document.getElementById('aq_kdn').value.trim();
  const expiry       = document.getElementById('aq_expiry').value;
  const errEl        = document.getElementById('apQuotaUpdateError');
  if (!approvalDate) { errEl.textContent = 'Date of Approval is required.';      errEl.style.display = 'block'; return; }
  if (!kdn)          { errEl.textContent = 'KDN Reference Number is required.';  errEl.style.display = 'block'; return; }
  if (!expiry)       { errEl.textContent = 'Quota Expiry Date is required.';      errEl.style.display = 'block'; return; }
  const aq = apQuotas.find(q => q.id === updatingApId);
  if (aq) { aq.approvalDate = approvalDate; aq.kdn = kdn; aq.expiry = expiry;
    saveApQuotaToDB(aq).then(() => { closeApQuotaUpdateModal(); renderApQuotaTable(); showToast('AP Quota approved and activated.'); });
  }
}

// ── EDIT MODAL ────────────────────────────────────────────────
function openApQuotaEditModal(aqId) {
  const aq = apQuotas.find(q => q.id === aqId); if (!aq) return;
  editingApId = aqId;
  const map = { aqe_company: 'company', aqe_slots: 'slots', aqe_app_date: 'appDate', aqe_approval_date: 'approvalDate', aqe_kdn: 'kdn', aqe_expiry: 'expiry' };
  Object.entries(map).forEach(([elId, key]) => { const el = document.getElementById(elId); if (el) el.value = aq[key] || ''; });
  document.getElementById('apQuotaEditError').style.display = 'none';
  openModal('apQuotaEditModal');
}
function closeApQuotaEditModal()    { closeModal('apQuotaEditModal'); editingApId = null; }
function closeApQuotaEditOutside(e) { closeModalOutsideStack(e, 'apQuotaEditModal'); }

function saveApQuotaEdit() {
  const aq = apQuotas.find(q => q.id === editingApId); if (!aq) return;
  aq.slots        = parseInt(document.getElementById('aqe_slots').value)          || aq.slots;
  aq.approvalDate = document.getElementById('aqe_approval_date').value;
  aq.kdn          = document.getElementById('aqe_kdn').value.trim();
  aq.expiry       = document.getElementById('aqe_expiry').value;
  saveApQuotaToDB(aq).then(() => { closeApQuotaEditModal(); renderApQuotaTable(); showToast('AP Quota updated.'); });
}

// ── DELETE MODAL ──────────────────────────────────────────────
function openDeleteApModal(id) {
  const aq = apQuotas.find(q => q.id === id); if (!aq) return;
  deletingApId = id;
  document.getElementById('deleteApName').textContent = aq.company;
  openModal('deleteApModal');
}
function closeDeleteApModal()    { closeModal('deleteApModal'); deletingApId = null; }
function closeDeleteApOutside(e) { closeModalOutsideStack(e, 'deleteApModal'); }
function confirmDeleteAp() {
  if (!deletingApId) return;
  deleteApQuotaFromDB(deletingApId).then(() => { closeDeleteApModal(); renderApQuotaTable(); showToast('AP Quota deleted.'); });
}

// ── KDN DETAIL MODAL ──────────────────────────────────────────
function openKdnDetailModal(aqId) {
  const aq       = apQuotas.find(q => q.id === aqId); if (!aq) return;
  const assigned = getAssignedWorkers(aq);
  const status   = deriveApQuotaStatus(aq);

  // Categorise assigned workers
  const activeW   = assigned.filter(w => deriveStatus(w) === 'Active');
  const onLeaveW  = assigned.filter(w => deriveStatus(w) === 'On Leave');
  const freeSlots = Math.max(0, (aq.slots||0) - assigned.length);

  let html = `<div class="kdn-detail-meta">
    <div><div class="kdn-meta-label">Company</div>        <div class="kdn-meta-value">${esc(aq.company)}</div></div>
    <div><div class="kdn-meta-label">KDN Reference</div>  <div class="kdn-meta-value">${esc(aq.kdn || '—')}</div></div>
    <div><div class="kdn-meta-label">Status</div>         <div class="kdn-meta-value">${esc(status)}</div></div>
    <div><div class="kdn-meta-label">Total Slots</div>    <div class="kdn-meta-value">${aq.slots} (${assigned.length} used)</div></div>
    <div><div class="kdn-meta-label">Application Date</div><div class="kdn-meta-value">${formatDate(aq.appDate)}</div></div>
    <div><div class="kdn-meta-label">Date of Approval</div><div class="kdn-meta-value">${formatDate(aq.approvalDate)}</div></div>
    <div><div class="kdn-meta-label">Quota Expiry</div>   <div class="kdn-meta-value">${formatDate(aq.expiry)}</div></div>
    <div><div class="kdn-meta-label">Est. Approval</div>  <div class="kdn-meta-value">${formatDate(aq.estApproval)}</div></div>
  </div>

  <!-- Status capsules -->
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px;">
    <div class="dash-capsule green" style="flex:1;min-width:130px;">
      <div class="dash-capsule-label">✅ Active</div>
      <div class="dash-capsule-num">${activeW.length}</div>
    </div>
    <div class="dash-capsule orange" style="flex:1;min-width:130px;">
      <div class="dash-capsule-label">🌴 On Leave</div>
      <div class="dash-capsule-num">${onLeaveW.length}</div>
    </div>
    <div class="dash-capsule blue" style="flex:1;min-width:130px;">
      <div class="dash-capsule-label">◻ Free Slots</div>
      <div class="dash-capsule-num">${freeSlots}</div>
    </div>
  </div>

  <div class="kdn-workers-title">Registered Workers (${assigned.length})</div>`;

  if (!assigned.length) {
    html += `<p style="color:var(--text3);font-style:italic;font-size:13.5px;">No workers currently assigned to this quota.</p>`;
  } else {
    html += `<table class="data-table" style="min-width:0;">
      <thead><tr><th>Slot</th><th>Worker Name</th><th>Work Location</th><th>Status</th></tr></thead>
      <tbody>` +
      assigned.map(w => `<tr>
        <td>${esc(w.legal?.quota?.slot || '—')}</td>
        <td>${esc(w.general?.name     || '—')}</td>
        <td>${esc(w.general?.location || '—')}</td>
        <td><span class="status-badge ${deriveStatus(w)}">${esc(deriveStatus(w))}</span></td>
      </tr>`).join('') +
      `</tbody></table>`;
  }

  document.getElementById('kdnDetailBody').innerHTML = html;
  openModal('kdnDetailModal');
}
function closeKdnDetailModal()    { closeModal('kdnDetailModal'); }
function closeKdnDetailOutside(e) { closeModalOutsideStack(e, 'kdnDetailModal'); }

// ── SLOT TIP — global singleton that follows mouse cursor ─────
let _slotTipEl = null;

function _getSlotTip() {
  if (!_slotTipEl) {
    _slotTipEl = document.createElement('div');
    _slotTipEl.className = 'slot-tip';
    _slotTipEl.id = 'global-slot-tip';
    document.body.appendChild(_slotTipEl);
    // Arrow pseudo via a child span since we can't JS-style ::after
  }
  return _slotTipEl;
}

function positionSlotTip(e) {
  const chip = e.currentTarget;
  const localTip = chip.querySelector('.slot-tip');
  const text = localTip ? localTip.textContent : '';

  const tip = _getSlotTip();
  tip.textContent = text;
  tip.style.display = 'block';

  function moveTip(ev) {
    // Position above cursor, centred horizontally on cursor
    const x = ev.clientX;
    const y = ev.clientY;
    // Keep tip within viewport
    const tipW = tip.offsetWidth;
    const left = Math.min(Math.max(x - tipW/2, 4), window.innerWidth - tipW - 4);
    tip.style.left = left + 'px';
    tip.style.top  = (y - tip.offsetHeight - 12) + 'px';
  }

  moveTip(e);
  chip._moveTip = moveTip;
  document.addEventListener('mousemove', moveTip);

  chip.addEventListener('mouseleave', () => {
    tip.style.display = 'none';
    document.removeEventListener('mousemove', chip._moveTip);
    chip._moveTip = null;
  }, { once: true });
}