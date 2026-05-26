// ============================================================
//  legal.js — Legal document status logic
//  Depends on: utils.js, data.js
// ============================================================

// ── PASSPORT STATUS ───────────────────────────────────────────
function derivePassportStatus(w) {
  const exp = w.legal?.passport?.expiry;
  if (!exp) return '—';
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const e     = new Date(exp); e.setHours(0, 0, 0, 0);
  const days  = Math.floor((e - today) / 86400000);
  if (days < 0)   return 'Expired';
  if (days <= 90) return 'Expiring Soon';
  return 'Valid';
}

function passportDaysLeft(w) {
  const exp = w.legal?.passport?.expiry;
  if (!exp) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const e     = new Date(exp); e.setHours(0, 0, 0, 0);
  return Math.floor((e - today) / 86400000);
}

function passportOverTwoYears(w) {
  const d = passportDaysLeft(w);
  return d !== null && d > 730;
}

// ── LABOUR QUOTA STATUS ───────────────────────────────────────
// Active     = company + KDN + slot all filled
// Eligible   = passport valid > 2 years
// Ineligible = otherwise
function deriveQuotaStatus(w) {
  const l = w.legal || {};
  if (l.quota?.company && l.quota?.kdn && l.quota?.slot) return 'Active';
  if (passportOverTwoYears(w)) return 'Eligible';
  return 'Ineligible';
}

// ── LABOUR LICENSE STATUS ─────────────────────────────────────
// Active / Expiring Soon / Expired = has reg + expiry
// Eligible   = quota Active + passport > 2yr, no reg yet
// Ineligible = otherwise
function deriveLicenseStatus(w) {
  const l   = w.legal || {};
  const reg = l.license?.reg   || '';
  const exp = l.license?.expiry || '';
  const qs  = deriveQuotaStatus(w);

  if (reg && exp) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const e     = new Date(exp); e.setHours(0, 0, 0, 0);
    const days  = Math.floor((e - today) / 86400000);
    if (days < 0)   return 'Expired';
    if (days <= 90) return 'Expiring Soon';
    return 'Active';
  }
  if (!reg && !exp && qs === 'Active' && passportOverTwoYears(w)) return 'Eligible';
  return 'Ineligible';
}

// ── WORK PERMIT STATUS ────────────────────────────────────────
// Active / Expiring Soon / Expired = has reg + expiry
// Eligible   = passport > 2yr + quota Active + license Active, no reg yet
// Ineligible = otherwise
function derivePermitStatus(w) {
  const l   = w.legal || {};
  const reg = l.permit?.reg   || '';
  const exp = l.permit?.expiry || '';
  const qs  = deriveQuotaStatus(w);
  const ls  = deriveLicenseStatus(w);

  if (reg && exp) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const e     = new Date(exp); e.setHours(0, 0, 0, 0);
    const days  = Math.floor((e - today) / 86400000);
    if (days < 0)   return 'Expired';
    if (days <= 90) return 'Expiring Soon';
    return 'Active';
  }
  if (!reg && passportOverTwoYears(w) && qs === 'Active' && ls === 'Active') return 'Eligible';
  return 'Ineligible';
}

// ── CSS CLASS FOR STATUS ──────────────────────────────────────
function legalStatusClass(s) {
  if (s === 'Active' || s === 'Valid') return 'ls-active';
  if (s === 'Eligible')               return 'ls-eligible';
  if (s === 'Expiring Soon')          return 'ls-expiring';
  if (s === 'Expired')                return 'ls-expired';
  return 'ls-ineligible';
}

// ── BUILD TEMP WORKER FROM FORM ───────────────────────────────
function buildTempWorker() {
  const quotaCompany = document.getElementById('f_quota_company')?.value || '';
  const quotaKdn     = document.getElementById('f_quota_kdn')?.value     || '';
  const quotaSlot    = document.getElementById('f_quota_slot')?.value    || '';
  return {
    general: {
      joining:     document.getElementById('f_joining')?.value,
      termination: document.getElementById('f_termination')?.value,
      departure:   document.getElementById('f_departure')?.value,
    },
    legal: {
      passport: { expiry: document.getElementById('f_passport_expiry')?.value },
      quota: { company: quotaCompany, kdn: quotaKdn, slot: quotaSlot },
      license: {
        reg:    document.getElementById('f_license_reg')?.value,
        expiry: document.getElementById('f_license_expiry')?.value,
      },
      permit: {
        reg:    document.getElementById('f_permit_reg')?.value,
        expiry: document.getElementById('f_permit_expiry')?.value,
      },
    },
    categoryOverride: document.getElementById('f_category_override')?.value || null,
  };
}

// ── REFRESH ALL STATUS BADGES IN MODAL ───────────────────────
function refreshLegalStatuses() {
  const temp       = buildTempWorker();
  const passStatus = derivePassportStatus(temp);
  const qs         = deriveQuotaStatus(temp);
  const ls         = deriveLicenseStatus(temp);
  const ps         = derivePermitStatus(temp);

  const setB = (id, s) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = s; el.className = `legal-status-badge ${legalStatusClass(s)}`; }
  };
  setB('lq_passport_badge', passStatus);
  setB('lq_status_badge',   qs);
  setB('ll_status_badge',   ls);
  setB('wp_status_badge',   ps);

  // Enable / disable sections based on eligibility
  toggleSectionDisabled('quota-section',   qs === 'Ineligible');
  toggleSectionDisabled('license-section', ls === 'Ineligible');
  toggleSectionDisabled('permit-section',  ps === 'Ineligible');

  // Renew / Add New buttons inside each section
  buildLegalActionBtns('passport-actions', 'Passport',        passStatus);
  buildLegalActionBtns('license-actions',  'Labour License',  ls);
  buildLegalActionBtns('permit-actions',   'Work Permit',     ps);

  // In-progress indicators
  updateLegalAppIndicators();

  // Re-evaluate claims whenever legal statuses change
  evaluateClaims();
}

function toggleSectionDisabled(id, disabled) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('section-disabled', disabled);
}

// ── RENEW / ADD NEW BUTTONS INSIDE LEGAL SECTIONS ────────────
function buildLegalActionBtns(containerId, docType, status) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';

  const wId = editingId || currentAppWorkerId;

  if (status === 'Expiring Soon' || status === 'Expired') {
    const btn = document.createElement('button');
    btn.className = 'btn-renew';
    btn.textContent = '↻ Renew';
    btn.onclick = () => { openAppModal(wId || '__NEW__', docType, 'Renew', true); };
    el.appendChild(btn);
    const note = document.createElement('span');
    note.style.cssText = 'font-size:12px;color:var(--text3);margin-left:8px;font-style:italic;';
    note.textContent = status === 'Expired' ? 'Expired — renewal required.' : 'Expiring within 3 months.';
    el.appendChild(note);

  } else if (status === 'Eligible') {
    const btn = document.createElement('button');
    btn.className = 'btn-addnew';
    btn.textContent = '+ Add New';
    btn.onclick = () => { openAppModal(wId || '__NEW__', docType, 'New Application', true); };
    el.appendChild(btn);
    const note = document.createElement('span');
    note.style.cssText = 'font-size:12px;color:var(--text3);margin-left:8px;font-style:italic;';
    note.textContent = 'Prerequisites met — ready to apply.';
    el.appendChild(note);
  }
}

// ── APPLICATION-IN-PROGRESS INDICATORS ───────────────────────
function updateLegalAppIndicators() {
  const container = document.getElementById('legal-app-indicators');
  if (!container) return;

  const wId = editingId || currentAppWorkerId;
  if (!wId) { container.style.display = 'none'; container.innerHTML = ''; return; }

  const relevant = applications.filter(a =>
    a.workerId === wId &&
    a.appDate &&
    !a.handover &&
    a.appType !== 'Data Entry' &&
    ['Passport', 'Labour License', 'Work Permit'].includes(a.docType)
  );

  if (!relevant.length) { container.style.display = 'none'; container.innerHTML = ''; return; }

  let html = `<span class="legal-app-ind-title">⏳ Applications in progress</span>`;
  relevant.forEach(a => {
    html += `<span class="app-indicator">
      ${esc(a.docType)}
      <div class="app-indicator-tooltip">
        <strong>${esc(a.docType)}</strong> — ${esc(a.appType)}<br/>
        Applied: ${formatDate(a.appDate)}<br/>
        Est. Receive: ${formatDate(a.estReceive)}
      </div>
    </span>`;
  });
  container.innerHTML = html;
  container.style.display = 'flex';
}