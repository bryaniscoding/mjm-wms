// ============================================================
//  data.js — Supabase backend data layer
//  All localStorage replaced with Supabase REST API calls
// ============================================================

const SUPA_URL = 'https://xbyowjlrkfrvgaypucck.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhieW93amxya2ZydmdheXB1Y2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MTgwNzYsImV4cCI6MjA5NDk5NDA3Nn0.XdGf4T5st6fCGnnLs5cI0JMct2FuKDPYMztbWjgArEg';

const HEADERS = {
  'apikey':        SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY,
  'Content-Type':  'application/json',
  'Prefer':        'return=representation',
};

// ── IN-MEMORY STORES (populated on loadData) ─────────────────
let workers           = [];
let applications      = [];
let apQuotas          = [];
let workLocations     = [];
let locationPrefixes  = {};   // { locationId: 'PREFIX' }
let locationCounters  = {};   // { locationId: lastNumber }
let docPrices         = {};   // legacy compat
let priceHistory      = {};   // { docType: [{id,price,effectiveDate},...] }
let leaveApplications = [];
let apCompanies       = [];

// ── SUPABASE HELPERS ──────────────────────────────────────────
async function sbGet(table, params = '') {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${params}&limit=10000`, { headers: HEADERS });
    if (!res.ok) {
      const err = await res.text();
      console.error(`sbGet error [${table}] ${res.status}:`, err);
      // If 401 Unauthorized — session may have expired
      if (res.status === 401) showToast('Session expired. Please sign in again.', true);
      return [];
    }
    return res.json();
  } catch(e) {
    console.error(`sbGet network error [${table}]:`, e);
    return [];
  }
}

async function sbInsert(table, row) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(row)
  });
  if (!res.ok) { console.error('sbInsert error', table, await res.text()); return null; }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpsert(table, row) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS, 'Prefer': 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify(row)
  });
  if (!res.ok) { console.error('sbUpsert error', table, await res.text()); return null; }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function sbUpdate(table, id, patch) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: HEADERS, body: JSON.stringify(patch)
  });
  if (!res.ok) { console.error('sbUpdate error', table, await res.text()); return null; }
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function sbDelete(table, id) {
  const res = await fetch(`${SUPA_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: HEADERS
  });
  if (!res.ok) console.error('sbDelete error', table, await res.text());
  return res.ok;
}

async function sbDeleteWhere(table, filter) {
  try {
    const res = await fetch(`${SUPA_URL}/rest/v1/${table}?${filter}`, {
      method: 'DELETE',
      headers: { ...HEADERS, 'Prefer': 'return=minimal' }
    });
    if (!res.ok && res.status !== 404) {
      const err = await res.text();
      console.warn('sbDeleteWhere:', res.status, err);
    }
    return res.ok || res.status === 404;
  } catch(e) {
    console.warn('sbDeleteWhere error:', e.message);
    return false;
  }
}

// ── LOAD ALL DATA ─────────────────────────────────────────────
async function loadData() {
  showLoadingOverlay(true);
  try {
    const [
      rawWorkers, rawApps, rawQuotas, rawLocs, rawPrefixes,
      rawPriceHist, rawLeaves, rawFinancials, rawCompanies
    ] = await Promise.all([
      sbGet('workers',           'order=created_at.desc'),
      sbGet('applications',      'order=recorded_at.desc'),
      sbGet('ap_quotas',         'order=created_at.desc'),
      sbGet('work_locations',    'order=name.asc'),
      sbGet('location_prefixes', ''),
      sbGet('price_history',     'order=effective_date.desc'),
      sbGet('leave_applications','order=created_at.desc'),
      sbGet('financials',        'order=date.desc'),
      sbGet('ap_companies',      'order=name.asc'),
    ]);

    // Map DB rows → in-memory objects matching existing JS shape
    workers = rawWorkers.map(mapWorkerFromDB);
    applications = rawApps.map(mapAppFromDB);
    apQuotas = rawQuotas.map(mapQuotaFromDB);
    workLocations = rawLocs.map(r => ({ id: r.id, name: r.name }));
    apCompanies = rawCompanies.map(r => ({ id: r.id, name: r.name, regNo: r.reg_no || '' }));

    locationPrefixes = {};
    locationCounters = {};
    rawPrefixes.forEach(r => {
      locationPrefixes[r.location_id] = r.prefix;
      locationCounters[r.location_id] = r.counter || 0;
    });

    priceHistory = {};
    rawPriceHist.forEach(r => {
      if (!priceHistory[r.doc_type]) priceHistory[r.doc_type] = [];
      priceHistory[r.doc_type].push({ id: r.id, price: parseFloat(r.price), effectiveDate: r.effective_date });
    });
    // Build legacy docPrices from latest entry per type
    docPrices = {};
    Object.entries(priceHistory).forEach(([doc, hist]) => {
      const latest = [...hist].sort((a,b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
      if (latest) docPrices[doc] = latest.price;
    });

    leaveApplications = rawLeaves.map(mapLeaveFromDB);

    // Store financials in memory (read-only for reporting)
    window._financials = rawFinancials.map(mapFinFromDB);

  } catch(e) {
    console.error('loadData failed', e);
    showToast('Failed to load data. Please check your connection and refresh.', true);
  }
  showLoadingOverlay(false);
  console.log(`Loaded: ${workers.length} workers, ${applications.length} apps, ${apQuotas.length} quotas, ${leaveApplications.length} leaves`);
}

// ── LOADING OVERLAY ───────────────────────────────────────────
function showLoadingOverlay(show) {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    el.style.cssText = 'position:fixed;inset:0;background:rgba(255,255,255,.75);z-index:9000;display:flex;align-items:center;justify-content:center;font-family:var(--font-body);font-size:15px;color:var(--text2);gap:12px;backdrop-filter:blur(2px);';
    el.innerHTML = '<div style="width:22px;height:22px;border:3px solid var(--green-mid);border-top-color:var(--green);border-radius:50%;animation:spin .7s linear infinite;"></div> Loading…';
    const style = document.createElement('style');
    style.textContent = '@keyframes spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
    document.body.appendChild(el);
  }
  el.style.display = show ? 'flex' : 'none';
}

// ── MAPPERS: DB → JS ──────────────────────────────────────────
function mapWorkerFromDB(r) {
  return {
    id: r.id,
    general: {
      name: r.name, workerId: r.worker_id, nationality: r.nationality,
      passport: r.passport, joining: r.joining, recruitment: r.recruitment,
      location: r.location, termination: r.termination, departure: r.departure,
      abscondedDate: r.absconded_date, remarks: r.remarks, photo: r.photo,
    },
    legal: (() => {
      const att = r.legal_attachments || {};
      return {
        passport: { number: r.passport_number, expiry: r.passport_expiry, attachments: att.passport || [] },
        quota:    { company: r.quota_company, kdn: r.quota_kdn, slot: r.quota_slot },
        license:  { reg: r.license_reg, expiry: r.license_expiry, attachments: att.license || [] },
        socso:    { reg: r.socso_reg },
        permit:   { reg: r.permit_reg, expiry: r.permit_expiry, attachments: att.permit || [] },
      };
    })(),
    claims: { claim1: r.claim1, claim2: r.claim2, claim3: r.claim3 },
    categoryOverride: r.category_override,
    categoryOverrideMeta: r.category_override_meta,
  };
}

function mapWorkerToDB(w) {
  const g = w.general || {};
  const l = w.legal   || {};
  return {
    id:                    w.id,
    name:                  g.name          || null,
    worker_id:             g.workerId      || null,
    nationality:           g.nationality   || null,
    passport:              g.passport      || null,
    joining:               g.joining       || null,
    recruitment:           g.recruitment   || null,
    location:              g.location      || null,
    termination:           g.termination   || null,
    departure:             g.departure     || null,
    absconded_date:        g.abscondedDate || null,
    remarks:               g.remarks       || null,
    photo:                 g.photo         || null,
    category_override:     w.categoryOverride     || null,
    category_override_meta: w.categoryOverrideMeta || null,
    passport_number:       l.passport?.number  || null,
    passport_expiry:       l.passport?.expiry  || null,
    quota_company:         l.quota?.company    || null,
    quota_kdn:             l.quota?.kdn        || null,
    quota_slot:            l.quota?.slot       || null,
    license_reg:           l.license?.reg      || null,
    license_expiry:        l.license?.expiry   || null,
    socso_reg:             l.socso?.reg        || null,
    permit_reg:            l.permit?.reg       || null,
    permit_expiry:         l.permit?.expiry    || null,
    legal_attachments:     {
      passport: l.passport?.attachments || [],
      license:  l.license?.attachments  || [],
      permit:   l.permit?.attachments   || [],
    },
    claim1:                w.claims?.claim1    || null,
    claim2:                w.claims?.claim2    || null,
    claim3:                w.claims?.claim3    || null,
  };
}

function mapAppFromDB(r) {
  return {
    id: r.id, workerId: r.worker_id, workerName: r.worker_name,
    location: r.location, docType: r.doc_type, appType: r.app_type,
    appDate: r.app_date, durationDays: r.duration_days,
    estReceive: r.est_receive, actualReceive: r.actual_receive,
    handover: r.handover, newExpiry: r.new_expiry,
    regNumber: r.reg_number, cancelled: r.cancelled, recordedAt: r.recorded_at,
  };
}
function mapAppToDB(a) {
  return {
    id: a.id, worker_id: a.workerId, worker_name: a.workerName,
    location: a.location, doc_type: a.docType, app_type: a.appType,
    app_date: a.appDate || null, duration_days: a.durationDays || 0,
    est_receive: a.estReceive || null, actual_receive: a.actualReceive || null,
    handover: a.handover || null, new_expiry: a.newExpiry || null,
    reg_number: a.regNumber || null, cancelled: a.cancelled || false,
  };
}

function mapQuotaFromDB(r) {
  return {
    id: r.id, company: r.company, slots: r.slots,
    appDate: r.app_date, estDuration: r.est_duration,
    estApproval: r.est_approval, approvalDate: r.approval_date,
    kdn: r.kdn, expiry: r.expiry,
  };
}
function mapQuotaToDB(q) {
  return {
    id: q.id, company: q.company, slots: q.slots,
    app_date: q.appDate || null, est_duration: q.estDuration || 60,
    est_approval: q.estApproval || null, approval_date: q.approvalDate || null,
    kdn: q.kdn || null, expiry: q.expiry || null,
  };
}

function mapLeaveFromDB(r) {
  return {
    id: r.id, appNumber: r.app_number, workerId: r.worker_id,
    startDate: r.start_date, duration: r.duration, estReturn: r.est_return,
    actualReturn: r.actual_return, appDate: r.app_date,
    status: r.status, absconded: r.absconded,
  };
}
function mapLeaveToDB(l) {
  return {
    id: l.id, app_number: l.appNumber, worker_id: l.workerId,
    start_date: l.startDate || null, duration: l.duration || 0,
    est_return: l.estReturn || null, actual_return: l.actualReturn || null,
    app_date: l.appDate || null, status: l.status || 'Pending',
    absconded: l.absconded || false,
  };
}

function mapFinFromDB(r) {
  return {
    id: r.id, date: r.date, workerName: r.worker_name,
    location: r.location, docType: r.doc_type, appType: r.app_type,
    qty: r.qty, unitPrice: parseFloat(r.unit_price), total: parseFloat(r.total),
    appId: r.app_id,
  };
}

// ── SAVE FUNCTIONS (called by feature modules) ────────────────

// Workers
async function saveWorkerToDB(w) {
  const row = mapWorkerToDB(w);
  await sbUpsert('workers', row);
  // Update in-memory
  const idx = workers.findIndex(x => x.id === w.id);
  if (idx !== -1) workers[idx] = w; else workers.unshift(w);
}

async function deleteWorkerFromDB(id) {
  await sbDelete('workers', id);
  workers = workers.filter(w => w.id !== id);
}

// Worker location (quick update from inline dropdown)
async function saveWorkerLocationToDB(wId, location) {
  await sbUpdate('workers', wId, { location });
}

// Applications
async function saveApplicationToDB(a) {
  await sbUpsert('applications', mapAppToDB(a));
  const idx = applications.findIndex(x => x.id === a.id);
  if (idx !== -1) applications[idx] = a; else applications.unshift(a);
}

async function deleteApplicationFromDB(id) {
  applications = applications.filter(a => a.id !== id);
  await sbDelete('applications', id);
}

async function deleteFinancialsByAppId(appId) {
  // Remove from memory
  if (window._financials) {
    window._financials = window._financials.filter(f => f.appId !== appId);
  }
  // Remove from Supabase — delete all financial rows linked to this appId
  await sbDeleteWhere('financials', `app_id=eq.${appId}`);
}

async function cancelApplicationInDB(id) {
  await sbUpdate('applications', id, { cancelled: true });
  const a = applications.find(x => x.id === id);
  if (a) a.cancelled = true;
}

// AP Quotas
async function saveApQuotaToDB(q) {
  await sbUpsert('ap_quotas', mapQuotaToDB(q));
  const idx = apQuotas.findIndex(x => x.id === q.id);
  if (idx !== -1) apQuotas[idx] = q; else apQuotas.unshift(q);
}

async function deleteApQuotaFromDB(id) {
  await sbDelete('ap_quotas', id);
  apQuotas = apQuotas.filter(q => q.id !== id);
}

// Work Locations
async function saveLocationToDB(loc, prefix, counter) {
  await sbUpsert('work_locations', { id: loc.id, name: loc.name });
  if (prefix) {
    const cur = counter !== undefined ? counter : (locationCounters[loc.id] || 0);
    await sbUpsert('location_prefixes', { location_id: loc.id, prefix, counter: cur });
    locationPrefixes[loc.id] = prefix;
  } else {
    await sbDelete('location_prefixes', loc.id);
    delete locationPrefixes[loc.id];
  }
  const idx = workLocations.findIndex(l => l.id === loc.id);
  if (idx !== -1) workLocations[idx] = loc; else workLocations.push(loc);
}

async function deleteLocationFromDB(id) {
  await sbDelete('work_locations', id);
  workLocations = workLocations.filter(l => l.id !== id);
  delete locationPrefixes[id];
  delete locationCounters[id];
}

// Price history
async function savePriceHistoryToDB(docType, entry) {
  await sbUpsert('price_history', {
    id: entry.id, doc_type: docType,
    price: entry.price, effective_date: entry.effectiveDate
  });
  if (!priceHistory[docType]) priceHistory[docType] = [];
  const idx = priceHistory[docType].findIndex(h => h.id === entry.id);
  if (idx !== -1) priceHistory[docType][idx] = entry;
  else priceHistory[docType].push(entry);
}

async function deletePriceHistoryFromDB(id) {
  await sbDelete('price_history', id);
  Object.keys(priceHistory).forEach(doc => {
    priceHistory[doc] = priceHistory[doc].filter(h => h.id !== id);
  });
}

// Leave
async function saveLeaveToDB(l) {
  await sbUpsert('leave_applications', mapLeaveToDB(l));
  const idx = leaveApplications.findIndex(x => x.id === l.id);
  if (idx !== -1) leaveApplications[idx] = l; else leaveApplications.unshift(l);
}

async function deleteLeaveFromDB(id) {
  await sbDelete('leave_applications', id);
  leaveApplications = leaveApplications.filter(l => l.id !== id);
}

// Financials
async function saveFinancialEntry(entry) {
  // Guard: don't insert if an entry with same appId already exists in memory
  if (entry.appId && window._financials) {
    const already = window._financials.find(f => f.appId === entry.appId);
    if (already) return;
  }
  await sbInsert('financials', {
    id: entry.id, date: entry.date || null,
    worker_name: entry.workerName, location: entry.location,
    doc_type: entry.docType, app_type: entry.appType,
    qty: entry.qty || 1, unit_price: entry.unitPrice || 0,
    total: entry.total || 0, app_id: entry.appId || null,
  });
  if (!window._financials) window._financials = [];
  window._financials.unshift(entry);
}

function getFinancials() {
  return window._financials || [];
}

// AP Companies
async function saveApCompanyToDB(c) {
  await sbUpsert('ap_companies', { id: c.id, name: c.name, reg_no: c.regNo || null });
  const idx = apCompanies.findIndex(x => x.id === c.id);
  if (idx !== -1) apCompanies[idx] = c; else apCompanies.push(c);
}

async function deleteApCompanyFromDB(id) {
  await sbDelete('ap_companies', id);
  apCompanies = apCompanies.filter(c => c.id !== id);
}

// ── WORKER ID AUTO-ASSIGN (per-location, DB-backed counter) ───
async function generateWorkerId(locationId) {
  const prefix = locationPrefixes[locationId] || '';
  const key    = locationId || '__noloc__';

  if (locationId && prefix) {
    // Increment counter in DB atomically using RPC would be ideal,
    // but for simplicity we read + write (safe for single-user / low concurrency)
    const cur = locationCounters[key] || 0;
    const next = cur + 1;
    locationCounters[key] = next;
    await sbUpsert('location_prefixes', { location_id: locationId, prefix, counter: next });
    return `${prefix}-${String(next).padStart(5,'0')}`;
  }

  // No prefix — use a local counter stored in location_prefixes with a special key
  const cur  = locationCounters[key] || 0;
  const next = cur + 1;
  locationCounters[key] = next;
  return String(next).padStart(5,'0');
}

// ── DERIVED STATE (unchanged logic) ───────────────────────────
function deriveCategory(w) {
  if (w.categoryOverride) return w.categoryOverride;
  const g  = w.general || {};
  const pr = w.legal?.permit?.reg || '';
  if (g.termination) return 'Contractor';
  if (pr)            return 'TKI';
  if (g.joining)     return 'Contractor';
  return '—';
}

function deriveStatus(w) {
  const g = w.general || {};
  if (!g.joining) return '—';
  const today = new Date(); today.setHours(0,0,0,0);

  // Absconded — inactive from absconded date onwards
  if (g.abscondedDate) {
    const absDate = new Date(g.abscondedDate); absDate.setHours(0,0,0,0);
    if (absDate <= today) return 'Inactive';
  }

  // Inactive only when departure date has PASSED
  if (g.departure) {
    const dep = new Date(g.departure); dep.setHours(0,0,0,0);
    if (dep <= today) return 'Inactive';
    // Departing Soon — within 30 days
    const daysUntil = Math.floor((dep - today) / 86400000);
    if (daysUntil <= 30) return 'Departing Soon';
  }

  // On Leave
  const onLeave = leaveApplications.some(l => {
    if (l.workerId !== w.id || l.status !== 'Approved') return false;
    if (!l.startDate) return false;
    const start = new Date(l.startDate); start.setHours(0,0,0,0);
    if (start > today) return false;
    if (l.actualReturn) return false;
    if (l.absconded)    return false;
    return true;
  });
  if (onLeave) return 'On Leave';
  return 'Active';
}

// Termination status for the termination list page
function deriveTerminationStatus(w) {
  const g = w.general || {};
  if (!g.departure && !g.abscondedDate) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  if (g.abscondedDate) {
    const abs = new Date(g.abscondedDate); abs.setHours(0,0,0,0);
    if (abs <= today) return 'Absconded';
  }
  if (g.departure) {
    const dep = new Date(g.departure); dep.setHours(0,0,0,0);
    if (dep <= today) return 'Departed';
    return 'Leaving Soon';
  }
  return null;
}

function deriveApQuotaStatus(aq) {
  if (!aq) return '—';
  const today = new Date(); today.setHours(0,0,0,0);
  if (aq.expiry) { const exp = new Date(aq.expiry); exp.setHours(0,0,0,0); if (exp < today) return 'Expired'; }
  if (aq.approvalDate) return 'Active';
  if (aq.appDate) {
    if (aq.estApproval) { const est = new Date(aq.estApproval); est.setHours(0,0,0,0); if (today > est) return 'Delayed'; }
    return 'Application in Process';
  }
  return '—';
}

function getAssignedWorkers(aq) {
  const today = new Date(); today.setHours(0,0,0,0);
  return workers.filter(w => {
    if (w.legal?.quota?.company !== aq.company || w.legal?.quota?.kdn !== aq.kdn) return false;
    // Only remove from slot if departure date has actually passed
    if (w.general?.departure) {
      const dep = new Date(w.general.departure); dep.setHours(0,0,0,0);
      if (dep <= today) return false;
    }
    return true;
  });
}

function getEligibleWorkers(aq) {
  const st = deriveApQuotaStatus(aq);
  if (st === 'Expired' || !aq.approvalDate) return [];
  return workers.filter(w => {
    if (w.legal?.quota?.company === aq.company && w.legal?.quota?.kdn === aq.kdn) return false;
    if (w.legal?.quota?.company && w.legal?.quota?.slot) return false;
    const qs = deriveQuotaStatus(w);
    return qs === 'Eligible';
  });
}

function getLeaveStatus(leave) {
  if (!leave.startDate) return 'Pending';
  const today = new Date(); today.setHours(0,0,0,0);
  const start = new Date(leave.startDate); start.setHours(0,0,0,0);
  const twoWeeksFromNow = new Date(today); twoWeeksFromNow.setDate(twoWeeksFromNow.getDate()+14);
  if (leave.absconded)    return 'Absconded';
  if (leave.actualReturn) return 'Returned';
  if (leave.status !== 'Approved') return leave.status || 'Pending';
  if (start > today && start <= twoWeeksFromNow) return 'Leave Coming Soon';
  if (start > today) return 'Approved';
  return 'On Leave';
}

function genLeaveAppNumber() {
  const existing = leaveApplications.map(l => {
    const m = (l.appNumber || '').match(/LAF-(\d+)/);
    return m ? parseInt(m[1]) : 0;
  });
  const max = existing.length ? Math.max(...existing) : 0;
  return `LAF-${String(max+1).padStart(6,'0')}`;
}

function getPriceAsOf(docType, dateStr) {
  const history = priceHistory[docType] || [];
  const d = dateStr || new Date().toISOString().slice(0,10);
  const applicable = history
    .filter(h => h.effectiveDate <= d)
    .sort((a,b) => b.effectiveDate.localeCompare(a.effectiveDate));
  if (applicable.length) return parseFloat(applicable[0].price) || 0;
  return parseFloat(docPrices[docType]) || 0;
}

// Legacy saveData — no-op (all saves now go directly to DB via save*ToDB functions)
function saveData() { /* replaced by individual save*ToDB calls */ }

async function cleanOrphanedFinancials() {
  // Valid IDs = application IDs + AP quota IDs + slot IDs (aq.id_slotN)
  const appIds  = new Set(applications.map(a => a.id));
  const aqIds   = new Set(apQuotas.map(q => q.id));

  function isValidAppId(appId) {
    if (!appId) return false;
    if (appIds.has(appId)) return true;   // regular application
    if (aqIds.has(appId))  return true;   // AP quota application
    // Slot assignment IDs are like "aq-id_slotN"
    const base = appId.split('_slot')[0];
    if (aqIds.has(base))   return true;
    return false;
  }

  // Find orphaned entries — no app_id or app_id not in any valid set
  const orphaned = (window._financials || []).filter(f => !isValidAppId(f.appId));

  if (!orphaned.length) {
    showToast('No orphaned records found. Financial report is clean.');
    return;
  }

  const confirmed = confirm(
    `Found ${orphaned.length} orphaned financial record${orphaned.length !== 1 ? 's' : ''} with no matching application.\n\nDelete all of them permanently?`
  );
  if (!confirmed) return;

  // Delete each from Supabase
  const delPromises = orphaned.map(f => {
    if (f.id) return sbDelete('financials', f.id);
    return Promise.resolve();
  });
  // Also delete any with no app_id via WHERE clause
  delPromises.push(sbDeleteWhere('financials', 'app_id=is.null'));

  await Promise.all(delPromises);

  // Remove from memory
  window._financials = (window._financials || []).filter(f => isValidAppId(f.appId));

  if (typeof renderFinancialTable === 'function') renderFinancialTable();
  showToast(`${orphaned.length} orphaned record${orphaned.length !== 1 ? 's' : ''} removed.`);
}