// ============================================================
//  leave.js — Workers Leave Applications & Status
//  Depends on: utils.js, data.js
// ============================================================

let leaveSort       = { col: 'appDate', dir: 2 };
let leaveStatusSort = { col: '_priority', dir: 1 };
let editingLeaveId  = null;
let deletingLeaveId = null;
let viewLeaveWorkerId = null;

// ══════════════════════════════════════════════════════════════
//  LEAVE APPLICATIONS PAGE
// ══════════════════════════════════════════════════════════════

function renderLeaveTable() {
  const query   = (document.getElementById('leaveSearch')?.value       || '').toLowerCase().trim();
  const staF    = document.getElementById('leaveStatusFilter')?.value  || '';
  const locF    = document.getElementById('leaveLocFilter')?.value     || '';
  const aFrom   = document.getElementById('leaveAppFrom')?.value       || '';
  const aTo     = document.getElementById('leaveAppTo')?.value         || '';
  const sFrom   = document.getElementById('leaveStartFrom')?.value     || '';
  const sTo     = document.getElementById('leaveStartTo')?.value       || '';
  const rFrom   = document.getElementById('leaveReturnFrom')?.value    || '';
  const rTo     = document.getElementById('leaveReturnTo')?.value      || '';

  let rows = leaveApplications.map(l => {
    const w = workers.find(x => x.id === l.workerId);
    return { ...l, _worker: w, _loc: w?.general?.location || '—' };
  });

  if (query) rows = rows.filter(r => [r.appNumber, r._worker?.general?.name, r._worker?.general?.workerId, r._loc].join(' ').toLowerCase().includes(query));
  if (staF)  rows = rows.filter(r => r.status === staF);
  if (locF)  rows = rows.filter(r => r._loc   === locF);
  if (aFrom) rows = rows.filter(r => (r.appDate    || '') >= aFrom);
  if (aTo)   rows = rows.filter(r => (r.appDate    || '') <= aTo);
  if (sFrom) rows = rows.filter(r => (r.startDate  || '') >= sFrom);
  if (sTo)   rows = rows.filter(r => (r.startDate  || '') <= sTo);
  if (rFrom) rows = rows.filter(r => (r.estReturn  || '') >= rFrom);
  if (rTo)   rows = rows.filter(r => (r.estReturn  || '') <= rTo);

  rows = applySort(rows, leaveSort, (r, col) => r[col] || '');
  updateSortIcons('page-leave-applications', leaveSort);

  const tbody = document.getElementById('leave-table-body');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state">
      <div class="empty-icon">${leaveApplications.length===0?'🌴':'🔍'}</div>
      <div class="empty-title">${leaveApplications.length===0?'No leave applications yet':'No applications found'}</div>
      <p>${leaveApplications.length===0?'Record a leave application when a worker takes time off.':'Try adjusting your filters or date range.'}</p>
      ${leaveApplications.length===0?'<button class="btn-primary" onclick="openLeaveModal()">+ Add Leave Application</button>':''}
    </div></td></tr>`;
    document.getElementById('leave-count').textContent = ''; return;
  }

  const statusCls = { 'Approved':'ls-active', 'Rejected':'ls-expired', 'Pending':'ls-ineligible' };
  tbody.innerHTML = rows.map(r => {
    const g = r._worker?.general || {};
    const avatar = g.photo ? `<img class="worker-avatar" src="${esc(g.photo)}" alt=""/>` : `<div class="worker-avatar-initials">${getInitials(g.name)}</div>`;
    return `<tr>
      <td><span class="legal-status-badge ${statusCls[r.status]||'ls-ineligible'}">${esc(r.status||'Pending')}</span></td>
      <td><strong>${esc(r.appNumber)}</strong></td>
      <td><div class="worker-cell">${avatar}<div><div class="worker-name">${esc(g.name||'—')}</div><div class="worker-id">${esc(g.workerId||'—')}</div></div></div></td>
      <td>${esc(r._loc)}</td>
      <td>${formatDate(r.appDate)}</td>
      <td>${formatDate(r.startDate)}</td>
      <td style="text-align:center;">${r.duration||'—'} day${r.duration!==1?'s':''}</td>
      <td>${formatDate(r.estReturn)}</td>
      <td><div class="action-group">
        <button class="action-btn" title="View Record"   onclick="openLeaveViewModal('${r.workerId}')">👁️</button>
        <button class="action-btn" title="Approve"       onclick="setLeaveStatus('${r.id}','Approved')" ${r.status==='Approved'?'style="opacity:.4;pointer-events:none;"':''}>✅</button>
        <button class="action-btn" title="Reject"        onclick="setLeaveStatus('${r.id}','Rejected')"  ${r.status==='Rejected'?'style="opacity:.4;pointer-events:none;"':''}>❌</button>
        <button class="action-btn" title="Edit"          onclick="openLeaveModal('${r.id}')">✏️</button>
        <button class="action-btn danger" title="Delete" onclick="openDeleteLeaveModal('${r.id}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');

  const total = leaveApplications.length;
  document.getElementById('leave-count').textContent = rows.length < total ? `Showing ${rows.length} of ${total}` : ` ${total} application${total!==1?'s':''}`;
}

function sortLeave(col)     { handleSort(leaveSort, col, renderLeaveTable); }
function filterLeave()      { renderLeaveTable(); }
function clearLeaveFilters() {
  ['leaveSearch','leaveStatusFilter','leaveLocFilter','leaveAppFrom','leaveAppTo','leaveStartFrom','leaveStartTo','leaveReturnFrom','leaveReturnTo']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  renderLeaveTable();
}

function populateLeaveFilters() {
  const locs = [...new Set(workers.map(w=>w.general?.location).filter(Boolean))].sort();
  ['leaveLocFilter','leaveStatusLocFilter'].forEach(id => {
    const sel = document.getElementById(id); if(!sel) return;
    const cur = sel.value;
    sel.innerHTML = `<option value="">All Locations</option>`+locs.map(l=>`<option ${l===cur?'selected':''}>${esc(l)}</option>`).join('');
  });
}

// ── LEAVE MODAL (Add / Edit) ──────────────────────────────────
function openLeaveModal(leaveId) {
  editingLeaveId = leaveId || null;
  const leave = leaveId ? leaveApplications.find(l=>l.id===leaveId) : null;
  const isUpdate = !!leave;
  document.getElementById('leaveModalTitle').textContent = isUpdate ? 'Edit Leave Application' : 'New Leave Application';
  document.getElementById('leave_app_number').value     = leave?.appNumber || '(Auto-assigned)';
  document.getElementById('leave_worker_id_display').value   = leave ? (workers.find(w=>w.id===leave.workerId)?.general?.workerId||'') : '';
  document.getElementById('leave_location_display').value    = leave ? (workers.find(w=>w.id===leave.workerId)?.general?.location||'') : '';
  document.getElementById('leave_start').value      = leave?.startDate || '';
  document.getElementById('leave_est_return').value = leave?.estReturn  || '';
  document.getElementById('leave_duration').value   = leave?.duration   || '';
  document.getElementById('leave_app_date').value       = leave?.appDate    || new Date().toISOString().slice(0,10);
  document.getElementById('leaveModalError').style.display = 'none';

  // Worker search
  const searchEl = document.getElementById('leave_worker_search');
  if (searchEl) {
    searchEl.value = leave ? (workers.find(w=>w.id===leave.workerId)?.general?.name||'') : '';
    searchEl.dataset.selectedId = leave?.workerId || '';
  }
  document.getElementById('leave_worker_dropdown').style.display = 'none';

  openModal('leaveModal');
}

function closeLeaveModal() { closeModal('leaveModal'); editingLeaveId=null; }
function closeLeaveModalOutside(e) { closeModalOutsideStack(e, 'leaveModal'); }

// Worker search dropdown inside leave modal
function onLeaveWorkerSearch() {
  const input  = document.getElementById('leave_worker_search');
  const dd     = document.getElementById('leave_worker_dropdown');
  const q      = (input?.value||'').toLowerCase().trim();
  if (!q) { dd.style.display='none'; return; }
  const matches = workers.filter(w=>[w.general?.name,w.general?.workerId].join(' ').toLowerCase().includes(q)).slice(0,8);
  if (!matches.length) { dd.style.display='none'; return; }
  dd.innerHTML = matches.map(w=>`<div class="slot-assign-item" onclick="selectLeaveWorker('${w.id}')">
    <strong>${esc(w.general?.name||'—')}</strong> <span style="color:var(--text3);">${esc(w.general?.workerId||'')} · ${esc(w.general?.location||'—')}</span>
  </div>`).join('');
  dd.style.display='block';
}
function selectLeaveWorker(wId) {
  const w = workers.find(x=>x.id===wId); if(!w) return;
  const searchEl = document.getElementById('leave_worker_search');
  if(searchEl){ searchEl.value = w.general?.name||''; searchEl.dataset.selectedId = wId; }
  document.getElementById('leave_worker_id_display').value  = w.general?.workerId||'';
  document.getElementById('leave_location_display').value   = w.general?.location||'';
  document.getElementById('leave_worker_dropdown').style.display='none';
}
function calcLeaveReturn() {
  // Now: start + return date → auto-calculate duration
  const start  = document.getElementById('leave_start')?.value;
  const ret    = document.getElementById('leave_est_return')?.value;
  const durEl  = document.getElementById('leave_duration');
  if (start && ret) {
    const s = new Date(start); const r = new Date(ret);
    const diff = Math.round((r - s) / 86400000);
    if (durEl) durEl.value = diff > 0 ? diff : '';
  } else {
    if (durEl) durEl.value = '';
  }
}

async function saveLeave() {
  const searchEl  = document.getElementById('leave_worker_search');
  const workerId  = searchEl?.dataset?.selectedId || '';
  const startDate = document.getElementById('leave_start')?.value;
  const estReturnInput = document.getElementById('leave_est_return')?.value;
  const duration  = parseInt(document.getElementById('leave_duration')?.value)||0;
  const appDate   = document.getElementById('leave_app_date')?.value;
  const errEl     = document.getElementById('leaveModalError');
  errEl.style.display='none';
  if(!workerId)  { errEl.textContent='Please select a worker.';     errEl.style.display='block'; return; }
  if(!startDate) { errEl.textContent='Please enter a start date.';  errEl.style.display='block'; return; }
  if(!estReturnInput) { errEl.textContent='Please enter the return date.';errEl.style.display='block'; return; }
  if(!appDate)   { errEl.textContent='Please enter application date.';errEl.style.display='block'; return; }
  const estReturn = estReturnInput;

  let leaveObj;
  if(editingLeaveId){
    const idx = leaveApplications.findIndex(l=>l.id===editingLeaveId);
    if(idx!==-1){ leaveApplications[idx]={...leaveApplications[idx],workerId,startDate,duration,estReturn,appDate}; leaveObj=leaveApplications[idx]; }
  } else {
    leaveObj={ id:genId(), appNumber:genLeaveAppNumber(), workerId, startDate, duration, estReturn, appDate, status:'Pending', actualReturn:'', absconded:false };
    leaveApplications.unshift(leaveObj);
  }
  if(leaveObj){
    saveLeaveToDB(leaveObj).then(()=>{ closeLeaveModal(); renderLeaveTable(); renderLeaveStatusTable(); showToast(editingLeaveId?'Leave updated.':'Leave submitted.'); });
  }
}

function setLeaveStatus(id, status) {
  const lv = leaveApplications.find(x=>x.id===id); if(!lv) return;
  lv.status=status;
  saveLeaveToDB(lv).then(()=>{ renderLeaveTable(); renderLeaveStatusTable(); showToast(`Leave ${status.toLowerCase()}.`); });
}

// Delete
function openDeleteLeaveModal(id) {
  const l=leaveApplications.find(x=>x.id===id); if(!l) return;
  deletingLeaveId=id;
  document.getElementById('deleteLeaveNumber').textContent=l.appNumber||id;
  openModal('deleteLeaveModal');
}
function closeDeleteLeaveModal()    { closeModal('deleteLeaveModal'); deletingLeaveId=null; }
function closeDeleteLeaveOutside(e) { closeModalOutsideStack(e, 'deleteLeaveModal'); }
function confirmDeleteLeave() {
  if(!deletingLeaveId) return;
  deleteLeaveFromDB(deletingLeaveId).then(()=>{ closeDeleteLeaveModal(); renderLeaveTable(); renderLeaveStatusTable(); showToast('Leave application deleted.'); });
}

// View worker leave record
function openLeaveViewModal(workerId) {
  const w = workers.find(x=>x.id===workerId); if(!w) return;
  const g = w.general||{};
  const cat = deriveCategory(w); const sta = deriveStatus(w);
  const avatar = g.photo?`<img class="profile-view-avatar" src="${esc(g.photo)}" alt=""/>`:`<div class="profile-view-avatar-initials">${getInitials(g.name)}</div>`;
  const leaves = leaveApplications.filter(l=>l.workerId===workerId).sort((a,b)=>(b.appDate||'').localeCompare(a.appDate||''));
  const leaveRows = leaves.length ? leaves.map(l=>`<tr>
    <td>${esc(l.appNumber)}</td>
    <td>${formatDate(l.startDate)}</td>
    <td>${formatDate(l.estReturn)}</td>
    <td style="text-align:center;">${l.duration||'—'}</td>
    <td><span class="legal-status-badge ${l.status==='Approved'?'ls-active':l.status==='Rejected'?'ls-expired':'ls-ineligible'}">${esc(l.status||'Pending')}</span></td>
  </tr>`).join('') : `<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:18px;">No leave records.</td></tr>`;

  document.getElementById('leaveViewBody').innerHTML=`
    <div class="profile-view-header">${avatar}<div>
      <div class="profile-view-name">${esc(g.name)}</div>
      <div class="profile-view-id">${esc(g.workerId||'—')}</div>
      <span class="status-badge ${statusClass(sta)}" style="margin-right:6px;">${esc(sta)}</span>
      <span class="cat-badge ${cat}">${esc(cat)}</span>
      <div style="font-size:13px;color:var(--text3);margin-top:4px;">📍 ${esc(g.location||'—')}</div>
    </div></div>
    <div class="kdn-workers-title">Leave History (${leaves.length})</div>
    <div class="table-wrap" style="margin-top:8px;">
      <table class="data-table" style="min-width:0;">
        <thead><tr><th>Ref No.</th><th>Start Date</th><th>Est. Return</th><th>Days</th><th>Status</th></tr></thead>
        <tbody>${leaveRows}</tbody>
      </table>
    </div>`;
  openModal('leaveViewModal');
}
function closeLeaveViewModal()    { closeModal('leaveViewModal'); }
function closeLeaveViewOutside(e) { closeModalOutsideStack(e, 'leaveViewModal'); }

// ══════════════════════════════════════════════════════════════
//  LEAVE STATUS PAGE
// ══════════════════════════════════════════════════════════════

function renderLeaveStatusTable() {
  const query  = (document.getElementById('leaveStatusSearch')?.value      || '').toLowerCase().trim();
  const staF   = document.getElementById('leaveStatusStatusFilter')?.value || '';
  const locF   = document.getElementById('leaveStatusLocFilter')?.value    || '';
  const sFrom  = document.getElementById('leaveStatusStartFrom')?.value    || '';
  const sTo    = document.getElementById('leaveStatusStartTo')?.value      || '';
  const rFrom  = document.getElementById('leaveStatusReturnFrom')?.value   || '';
  const rTo    = document.getElementById('leaveStatusReturnTo')?.value     || '';
  const aFrom  = document.getElementById('leaveStatusActualFrom')?.value   || '';
  const aTo    = document.getElementById('leaveStatusActualTo')?.value     || '';

  // Only approved leaves
  let rows = leaveApplications
    .filter(l => l.status === 'Approved')
    .map(l => {
      const w = workers.find(x => x.id === l.workerId);
      const displayStatus = getLeaveStatus(l);
      return { ...l, _worker: w, _loc: w?.general?.location||'—', _displayStatus: displayStatus };
    });

  if (query) rows = rows.filter(r => [r.appNumber, r._worker?.general?.name, r._worker?.general?.workerId, r._loc].join(' ').toLowerCase().includes(query));
  if (staF)  rows = rows.filter(r => r._displayStatus === staF);
  if (locF)  rows = rows.filter(r => r._loc === locF);
  if (sFrom) rows = rows.filter(r => (r.startDate    ||'') >= sFrom);
  if (sTo)   rows = rows.filter(r => (r.startDate    ||'') <= sTo);
  if (rFrom) rows = rows.filter(r => (r.estReturn    ||'') >= rFrom);
  if (rTo)   rows = rows.filter(r => (r.estReturn    ||'') <= rTo);
  if (aFrom) rows = rows.filter(r => (r.actualReturn ||'') >= aFrom);
  if (aTo)   rows = rows.filter(r => (r.actualReturn ||'') <= aTo);

  const LEAVE_STATUS_PRIORITY = { 'On Leave':0, 'Leave Coming Soon':1, 'Approved':2, 'Returned':3, 'Absconded':4 };
  rows = applySort(rows, leaveStatusSort, (r, col) => {
    if (col === '_priority') {
      const pri = String(LEAVE_STATUS_PRIORITY[r._displayStatus] ?? 5).padStart(2,'0');
      // within On Leave, sort by estReturn asc (fewer remaining = more urgent first)
      return pri + (r.estReturn || 'z');
    }
    return r[col] || '';
  });
  updateSortIcons('page-leave-status', leaveStatusSort);

  const tbody = document.getElementById('leave-status-table-body');
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">🌴</div><p>No approved leave records to display.</p></div></td></tr>`;
    document.getElementById('leave-status-count').textContent=''; return;
  }

  const today = new Date(); today.setHours(0,0,0,0);
  const statusStyle = { 'Returned':'ls-active', 'On Leave':'ls-expiring', 'Leave Coming Soon':'ls-eligible', 'Approved':'ls-eligible', 'Absconded':'ls-expired' };

  tbody.innerHTML = rows.map(r => {
    const g = r._worker?.general||{};
    const avatar = g.photo?`<img class="worker-avatar" src="${esc(g.photo)}" alt=""/>`:`<div class="worker-avatar-initials">${getInitials(g.name)}</div>`;

    // Remaining days cell
    let remainCell = '—';
    if (r.estReturn && !r.actualReturn && !r.absconded) {
      const est = new Date(r.estReturn); est.setHours(0,0,0,0);
      const diff = Math.floor((est-today)/86400000);
      let cls = diff > 7 ? 'exp-safe' : diff >= 0 ? 'exp-warn' : diff >= -7 ? 'exp-urgent' : 'exp-danger';
      const overdue = diff < 0;
      const label = diff > 0 ? `${diff}d remaining` : diff === 0 ? 'Today' : `${Math.abs(diff)}d overdue`;
      remainCell = `<span class="${cls}" style="font-weight:600;${overdue?'color:var(--red);':''}">${label}</span>`;
    }

    return `<tr>
      <td><span class="legal-status-badge ${statusStyle[r._displayStatus]||'ls-ineligible'}">${esc(r._displayStatus)}</span></td>
      <td><div class="worker-cell">${avatar}<div><div class="worker-name">${esc(g.name||'—')}</div><div class="worker-id">${esc(g.workerId||'—')}</div></div></div></td>
      <td>${esc(r.appNumber)}</td>
      <td>${esc(r._loc)}</td>
      <td>${formatDate(r.startDate)}</td>
      <td>${formatDate(r.estReturn)}</td>
      <td>${remainCell}</td>
      <td>${r.actualReturn ? formatDate(r.actualReturn) : '—'}</td>
      <td><button class="btn-renew" onclick="openLeaveUpdateModal('${r.id}')">Update</button></td>
    </tr>`;
  }).join('');

  document.getElementById('leave-status-count').textContent = ` ${rows.length} record${rows.length!==1?'s':''}`;
}

function sortLeaveStatus(col) { handleSort(leaveStatusSort, col, renderLeaveStatusTable); }
function filterLeaveStatus()  { renderLeaveStatusTable(); }
function clearLeaveStatusFilters() {
  ['leaveStatusSearch','leaveStatusStatusFilter','leaveStatusLocFilter','leaveStatusStartFrom','leaveStatusStartTo','leaveStatusReturnFrom','leaveStatusReturnTo','leaveStatusActualFrom','leaveStatusActualTo']
    .forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
  renderLeaveStatusTable();
}

// Update Leave Modal (fill actual return / mark absconded)
let updatingLeaveId = null;
function openLeaveUpdateModal(id) {
  const l = leaveApplications.find(x=>x.id===id); if(!l) return;
  updatingLeaveId = id;
  const w = workers.find(x=>x.id===l.workerId);
  document.getElementById('leaveUpdateRef').textContent      = l.appNumber||'—';
  document.getElementById('leaveUpdateWorker').textContent   = w?.general?.name||'—';
  document.getElementById('leaveUpdateId').textContent       = w?.general?.workerId||'—';
  document.getElementById('leaveUpdateLoc').textContent      = w?.general?.location||'—';
  document.getElementById('leaveUpdateStart').textContent    = formatDate(l.startDate);
  document.getElementById('leaveUpdateEst').textContent      = formatDate(l.estReturn);
  document.getElementById('leaveUpdateDur').textContent      = `${l.duration||'—'} day${l.duration!==1?'s':''}`;
  document.getElementById('lu_actual_return').value          = l.actualReturn||'';
  document.getElementById('lu_absconded').checked            = !!l.absconded;
  document.getElementById('leaveUpdateError').style.display  = 'none';
  openModal('leaveUpdateModal');
}
function closeLeaveUpdateModal()    { closeModal('leaveUpdateModal'); updatingLeaveId=null; }
function closeLeaveUpdateOutside(e) { closeModalOutsideStack(e, 'leaveUpdateModal'); }

async function saveLeaveUpdate() {
  const l = leaveApplications.find(x=>x.id===updatingLeaveId); if(!l) return;
  const actualReturn = document.getElementById('lu_actual_return')?.value||'';
  const absconded    = document.getElementById('lu_absconded')?.checked||false;

  l.actualReturn = actualReturn;
  l.absconded    = absconded;

  const savePs = [saveLeaveToDB(l)];
  if (absconded) {
    const w = workers.find(x=>x.id===l.workerId);
    if (w) {
      if (!w.general) w.general={};
      const abscondDate = new Date().toISOString().slice(0,10);
      w.general.departure    = w.general.departure    || abscondDate;
      w.general.abscondedDate = w.general.abscondedDate || abscondDate;
      savePs.push(saveWorkerToDB(w));
    }
  }
  Promise.all(savePs).then(()=>{ closeLeaveUpdateModal(); renderLeaveStatusTable(); renderLeaveTable(); renderWorkerTable(); showToast(absconded?'Worker marked as absconded.':'Leave record updated.'); });
}