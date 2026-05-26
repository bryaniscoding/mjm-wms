// ============================================================
//  settings.js — System Settings: Locations, Prices, Prefixes
// ============================================================

let deletingLocationId = null;
let editingLocationId  = null;
let editingPriceHistId = null; // {docType, id}

const PRICE_DOCS = ['Passport', 'Labour License', 'Work Permit', 'C.O.M', 'AP Quota'];

// ══════════════════════════════════════════════════════════════
//  WORK LOCATIONS
// ══════════════════════════════════════════════════════════════

function renderLocationTable() {
  const tbody = document.getElementById('location-table-body');
  if (!tbody) return;
  if (!workLocations.length) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">📍</div><p>No work locations registered yet.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = [...workLocations].sort((a,b) => a.name.localeCompare(b.name)).map(loc => {
    const prefix  = locationPrefixes[loc.id] || '';
    const counter = locationCounters[loc.id]  || 0;
    const nextNum = counter + 1;
    const nextId  = prefix ? `${prefix}-${String(nextNum).padStart(5,'0')}` : String(nextNum).padStart(5,'0');
    return `<tr>
      <td>${esc(loc.name)}</td>
      <td>${prefix ? esc(prefix) : '<span style="color:var(--text3);">—</span>'}</td>
      <td style="font-size:12.5px;color:var(--text3);">${esc(nextId)}</td>
      <td><div class="action-group">
        <button class="action-btn" title="Edit" onclick="openEditLocationModal('${loc.id}')">✏️</button>
        <button class="action-btn danger" title="Delete" onclick="openDeleteLocationModal('${loc.id}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}

function openAddLocationModal() {
  editingLocationId = null;
  document.getElementById('locationModalTitle').textContent = 'Add Work Location';
  document.getElementById('loc_name').value = '';
  document.getElementById('loc_prefix').value = '';
  document.getElementById('locationError').style.display = 'none';
  openModal('locationModal');
}
function openEditLocationModal(id) {
  const loc = workLocations.find(l => l.id === id); if (!loc) return;
  editingLocationId = id;
  document.getElementById('locationModalTitle').textContent = 'Edit Work Location';
  document.getElementById('loc_name').value   = loc.name;
  document.getElementById('loc_prefix').value = locationPrefixes[id] || '';
  document.getElementById('locationError').style.display = 'none';
  openModal('locationModal');
}
function closeLocationModal()     { closeModal('locationModal'); editingLocationId = null; }
function closeLocationModalOutside(e) { closeModalOutsideStack(e, 'locationModal'); }

async function saveLocation() {
  const name   = document.getElementById('loc_name').value.trim();
  const prefix = document.getElementById('loc_prefix').value.trim().toUpperCase();
  const errEl  = document.getElementById('locationError');
  if (!name) { errEl.textContent = 'Location name is required.'; errEl.style.display = 'block'; return; }

  const counterVal = Math.max(0, parseInt(document.getElementById('loc_counter')?.value) || 0);
  let locObj;
  if (editingLocationId) {
    locObj = workLocations.find(l => l.id === editingLocationId);
    if (locObj) {
      const dup = workLocations.find(l => l.name.toLowerCase() === name.toLowerCase() && l.id !== editingLocationId);
      if (dup) { errEl.textContent = 'This location name already exists.'; errEl.style.display = 'block'; return; }
      locObj.name = name;
    }
    if (prefix) locationPrefixes[editingLocationId] = prefix;
    else delete locationPrefixes[editingLocationId];
    locationCounters[editingLocationId] = counterVal;
    showToast('Location updated.');
  } else {
    if (workLocations.find(l => l.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = 'This location already exists.'; errEl.style.display = 'block'; return;
    }
    locObj = { id: genId(), name };
    workLocations.push(locObj);
    if (prefix) locationPrefixes[locObj.id] = prefix;
    locationCounters[locObj.id] = counterVal;
    showToast('Location added.');
  }
  await saveLocationToDB(locObj, prefix, counterVal);
  closeLocationModal(); renderLocationTable();
  populateWorkerFilters(); populateLocationDropdown();
}

function openDeleteLocationModal(id) {
  const loc = workLocations.find(l => l.id === id); if (!loc) return;
  deletingLocationId = id;
  document.getElementById('deleteLocationName').textContent = loc.name;
  openModal('deleteLocationModal');
}
function closeDeleteLocationModal()    { closeModal('deleteLocationModal'); deletingLocationId = null; }
function closeDeleteLocationOutside(e) { closeModalOutsideStack(e, 'deleteLocationModal'); }
function confirmDeleteLocation() {
  if (!deletingLocationId) return;
  deleteLocationFromDB(deletingLocationId).then(() => { closeDeleteLocationModal(); renderLocationTable(); populateWorkerFilters(); populateLocationDropdown(); showToast('Location deleted.'); });

}

// ══════════════════════════════════════════════════════════════
//  DOCUMENT PRICES (with history)
// ══════════════════════════════════════════════════════════════

function renderPriceGrid() {
  const el = document.getElementById('price-grid'); if (!el) return;
  el.innerHTML = PRICE_DOCS.map(doc => {
    const key = doc.replace(/[\s.]/g,'_');
    // current latest price
    const history = priceHistory[doc] || [];
    const latest  = [...history].sort((a,b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
    const curPrice = latest ? parseFloat(latest.price).toFixed(2) : '0.00';
    const curDate  = latest ? latest.effectiveDate : '';
    return `<div class="price-row">
      <span class="price-label">${esc(doc)}${doc==='AP Quota'?'<span style="font-size:11.5px;color:var(--text3);font-style:italic;"> (per slot)</span>':''}</span>
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div class="price-input-wrap">
          <span class="price-prefix">RM</span>
          <input type="number" class="price-input" id="price_${key}" value="${curPrice}" min="0" step="0.01" placeholder="0.00"/>
        </div>
        <div class="price-input-wrap">
          <span class="price-prefix" style="font-size:12px;">Effective</span>
          <input type="date" class="price-input" id="pricedate_${key}" value="${curDate}" style="width:145px;"/>
        </div>
        <button class="btn-ghost btn-sm" onclick="saveSinglePrice('${doc}')">Save</button>
        <button class="btn-ghost btn-sm" onclick="openPriceHistory('${doc}')">📋 History</button>
      </div>
    </div>`;
  }).join('');
}

async function saveSinglePrice(doc) {
  const key      = doc.replace(/[\s.]/g,'_');
  const priceEl  = document.getElementById('price_'+key);
  const dateEl   = document.getElementById('pricedate_'+key);
  if (!priceEl || !dateEl) return;
  const price   = parseFloat(priceEl.value) || 0;
  const effDate = dateEl.value;
  if (!effDate) { showToast('Please set an effective date before saving.', true); return; }
  if (!priceHistory[doc]) priceHistory[doc] = [];
  // Update existing entry for same date, or add new
  const existing = priceHistory[doc].find(h => h.effectiveDate === effDate);
  if (existing) { existing.price = price; }
  else          { priceHistory[doc].push({ id: genId(), price, effectiveDate: effDate }); }
  docPrices[doc] = price;
  await savePriceHistoryToDB(doc, existing || priceHistory[doc][priceHistory[doc].length-1]);
  renderPriceGrid();
  showToast(`Price for ${doc} saved.`);
}

// Price History Modal
let _priceHistDoc = null;
function openPriceHistory(doc) {
  _priceHistDoc = doc;
  renderPriceHistoryModal();
  openModal('priceHistoryModal');
}
function closePriceHistoryModal() { closeModal('priceHistoryModal'); _priceHistDoc = null; editingPriceHistId = null; }
function closePriceHistoryOutside(e) { closeModalOutsideStack(e, 'priceHistoryModal'); }

function renderPriceHistoryModal() {
  const doc     = _priceHistDoc;
  const history = [...(priceHistory[doc] || [])].sort((a,b) => b.effectiveDate.localeCompare(a.effectiveDate));
  document.getElementById('priceHistoryTitle').textContent = `Price History — ${doc}`;
  const tbody = document.getElementById('price-history-body');
  if (!history.length) { tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:20px;">No history yet.</td></tr>`; return; }
  tbody.innerHTML = history.map(h => {
    if (editingPriceHistId && editingPriceHistId.id === h.id) {
      return `<tr>
        <td><input type="date" id="ph_edit_date" value="${h.effectiveDate}" style="width:130px;"/></td>
        <td><input type="number" id="ph_edit_price" value="${h.price}" step="0.01" min="0" style="width:100px;text-align:right;"/></td>
        <td><div class="action-group"><button class="btn-primary btn-sm" onclick="savePriceHistEdit('${doc}','${h.id}')">Save</button><button class="btn-ghost btn-sm" onclick="cancelPriceHistEdit()">Cancel</button></div></td>
      </tr>`;
    }
    return `<tr>
      <td>${formatDate(h.effectiveDate)}</td>
      <td style="text-align:right;">RM ${parseFloat(h.price).toFixed(2)}</td>
      <td><div class="action-group">
        <button class="action-btn" title="Edit" onclick="startPriceHistEdit('${doc}','${h.id}')">✏️</button>
        <button class="action-btn danger" title="Delete" onclick="deletePriceHist('${doc}','${h.id}')">🗑️</button>
      </div></td>
    </tr>`;
  }).join('');
}
function startPriceHistEdit(doc, id) { editingPriceHistId = {doc, id}; renderPriceHistoryModal(); }
function cancelPriceHistEdit()       { editingPriceHistId = null; renderPriceHistoryModal(); }
async function savePriceHistEdit(doc, id)  {
  const entry = priceHistory[doc]?.find(h => h.id === id); if (!entry) return;
  entry.price = parseFloat(document.getElementById('ph_edit_price')?.value) || 0;
  entry.effectiveDate = document.getElementById('ph_edit_date')?.value || entry.effectiveDate;
  editingPriceHistId = null;
  await savePriceHistoryToDB(doc, entry);
  renderPriceHistoryModal(); renderPriceGrid(); showToast('Price record updated.');
}
async function deletePriceHist(doc, id) {
  await deletePriceHistoryFromDB(id);
  renderPriceHistoryModal(); renderPriceGrid(); showToast('Price record deleted.');
}

// ══════════════════════════════════════════════════════════════
//  AP QUOTA COMPANIES
// ══════════════════════════════════════════════════════════════

let deletingApCompanyId = null;
let editingApCompanyId  = null;

function getApCompanies() { return apCompanies; }

function renderApCompanyTable() {
  const tbody = document.getElementById('ap-company-table-body'); if (!tbody) return;
  const list = apCompanies;
  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="3"><div class="empty-state"><div class="empty-icon">🏢</div><p>No companies registered yet.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = [...list].sort((a,b) => a.name.localeCompare(b.name)).map(c => `<tr>
    <td>${esc(c.name)}</td>
    <td>${esc(c.regNo||'—')}</td>
    <td><div class="action-group">
      <button class="action-btn" title="Edit"   onclick="openApCompanyModal('${c.id}')">✏️</button>
      <button class="action-btn danger" title="Delete" onclick="openDeleteApCompanyModal('${c.id}')">🗑️</button>
    </div></td>
  </tr>`).join('');
}

function openApCompanyModal(id) {
  const list = getApCompanies();
  const c    = id ? list.find(x => x.id === id) : null;
  editingApCompanyId = id || null;
  document.getElementById('apCompanyModalTitle').textContent = c ? 'Edit AP Quota Company' : 'Add AP Quota Company';
  document.getElementById('apc_name').value  = c?.name  || '';
  document.getElementById('apc_regno').value = c?.regNo || '';
  document.getElementById('apCompanyError').style.display = 'none';
  openModal('apCompanyModal');
}
function closeApCompanyModal()     { closeModal('apCompanyModal'); editingApCompanyId = null; }
function closeApCompanyModalOutside(e) { closeModalOutsideStack(e, 'apCompanyModal'); }

async function saveApCompany() {
  const name  = document.getElementById('apc_name').value.trim();
  const regNo = document.getElementById('apc_regno').value.trim();
  const errEl = document.getElementById('apCompanyError');
  if (!name) { errEl.textContent = 'Company name is required.'; errEl.style.display = 'block'; return; }
  const list = getApCompanies();
  if (editingApCompanyId) {
    const c = list.find(x => x.id === editingApCompanyId);
    if (c) { c.name = name; c.regNo = regNo; }
    showToast('Company updated.');
  } else {
    if (list.find(x => x.name.toLowerCase() === name.toLowerCase())) {
      errEl.textContent = 'Company already exists.'; errEl.style.display = 'block'; return;
    }
    list.push({ id: genId(), name, regNo });
    showToast('Company added.');
  }
  await saveApCompanyToDB(editingApCompanyId ? list.find(x=>x.id===editingApCompanyId) : list[list.length-1]);
  closeApCompanyModal(); renderApCompanyTable();
}

function openDeleteApCompanyModal(id) {
  const list = getApCompanies(); const c = list.find(x => x.id === id); if (!c) return;
  deletingApCompanyId = id;
  document.getElementById('deleteApCompanyName').textContent = c.name;
  openModal('deleteApCompanyModal');
}
function closeDeleteApCompanyModal()    { closeModal('deleteApCompanyModal'); deletingApCompanyId = null; }
function closeDeleteApCompanyOutside(e) { if (e.target === document.getElementById('deleteApCompanyModal')) closeDeleteApCompanyModal(); }
function confirmDeleteApCompany() {
  if (!deletingApCompanyId) return;
  deleteApCompanyFromDB(deletingApCompanyId).then(() => { closeDeleteApCompanyModal(); renderApCompanyTable(); showToast('Company deleted.'); });
}

async function saveAllPrices() {
  const PRICE_DOCS_LIST = typeof PRICE_DOCS !== 'undefined' ? PRICE_DOCS :
    ['Passport','Labour License','Work Permit (Renew)','Work Permit (New)','COM','AP Quota'];
  let saved = 0; let errors = [];
  for (const doc of PRICE_DOCS_LIST) {
    const key    = doc.replace(/[\s.]/g,'_');
    const priceEl = document.getElementById('price_' + key);
    const dateEl  = document.getElementById('pricedate_' + key);
    if (!priceEl || !dateEl) continue;
    const price   = parseFloat(priceEl.value) || 0;
    const effDate = dateEl.value;
    if (!effDate) { errors.push(doc); continue; }
    if (!priceHistory[doc]) priceHistory[doc] = [];
    const existing = priceHistory[doc].find(h => h.effectiveDate === effDate);
    if (existing) { existing.price = price; }
    else          { priceHistory[doc].push({ id: genId(), price, effectiveDate: effDate }); }
    docPrices[doc] = price;
    await savePriceHistoryToDB(doc, existing || priceHistory[doc][priceHistory[doc].length-1]);
    saved++;
  }
  renderPriceGrid();
  if (errors.length) showToast(`Saved ${saved}. Missing effective date for: ${errors.join(', ')}`, true);
  else               showToast(`All ${saved} prices saved successfully.`);
}