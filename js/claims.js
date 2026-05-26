// ============================================================
//  claims.js — Claims eligibility and UI
//  Depends on: utils.js, data.js, legal.js
// ============================================================

// ── EVALUATE ALL 3 CLAIMS ─────────────────────────────────────
function evaluateClaims() {
  const rv  = document.getElementById('f_recruitment')?.value || '';
  const ps  = derivePermitStatus(buildTempWorker());
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Claim 1 — always eligible once form is open
  setClaimEl(1, true, '');

  // Claim 2 — 3 months after recruitment
  if (!rv) {
    setClaimEl(2, false, 'Set a recruitment date to check eligibility.');
  } else {
    const recruit    = new Date(rv);
    const threeMonths = new Date(recruit);
    threeMonths.setMonth(threeMonths.getMonth() + 3);
    threeMonths.setHours(0, 0, 0, 0);

    if (today >= threeMonths) {
      setClaimEl(2, true, `Eligible since ${formatDate(threeMonths.toISOString().slice(0, 10))}.`);
    } else {
      const d = Math.ceil((threeMonths - today) / 86400000);
      setClaimEl(2, false, `Eligible on ${formatDate(threeMonths.toISOString().slice(0, 10))} (${d} day${d !== 1 ? 's' : ''} remaining).`);
    }
  }

  // Claim 3 — work permit must be Active or Expiring Soon
  if (ps === 'Active' || ps === 'Expiring Soon') {
    setClaimEl(3, true, 'Work permit is Active — eligible.');
  } else {
    setClaimEl(3, false, `Work permit status: "${ps}". Must be Active.`);
  }
}

// ── SET CLAIM CARD STATE ──────────────────────────────────────
function setClaimEl(num, eligible, note) {
  const statusEl  = document.getElementById(`claim${num}-status`);
  const noteEl    = document.getElementById(`claim${num}-note`);
  const dateInput = document.getElementById(`f_claim${num}_date`);
  const card      = document.getElementById(`claim${num}-card`);
  const tick      = document.getElementById(`claim${num}-tick`);

  // Don't downgrade a "Claimed" status
  if (statusEl && statusEl.textContent === 'Claimed') return;

  if (statusEl) {
    statusEl.textContent = eligible ? 'Eligible' : 'Not Eligible';
    statusEl.className   = 'claim-status-badge' + (eligible ? '' : ' ineligible');
  }
  if (noteEl)    noteEl.textContent = note;
  if (dateInput) dateInput.disabled = !eligible;
  if (tick)      tick.disabled      = !eligible;
  if (card) {
    card.classList.toggle('eligible',   eligible);
    card.classList.toggle('ineligible', !eligible);
  }
}

// ── SAVE CLAIM DATE ───────────────────────────────────────────
function saveClaim(num) {
  const dateEl = document.getElementById(`f_claim${num}_date`);
  if (!dateEl || !dateEl.value) {
    showModalError(`Please select a date for Claim ${num} before saving.`);
    return;
  }
  const statusEl = document.getElementById(`claim${num}-status`);
  const card     = document.getElementById(`claim${num}-card`);
  const remove   = document.getElementById(`claim${num}-remove`);

  if (statusEl) { statusEl.textContent = 'Claimed'; statusEl.className = 'claim-status-badge claimed'; }
  if (card)     { card.classList.remove('eligible', 'ineligible'); card.classList.add('claimed'); }
  if (remove)   remove.style.display = 'flex';

  showToast(`Claim ${num} date saved.`);
}

// ── REMOVE CLAIM DATE ─────────────────────────────────────────
function removeClaim(num) {
  const dateEl   = document.getElementById(`f_claim${num}_date`);
  const statusEl = document.getElementById(`claim${num}-status`);
  const card     = document.getElementById(`claim${num}-card`);
  const remove   = document.getElementById(`claim${num}-remove`);

  if (dateEl)   dateEl.value = '';
  if (statusEl) { statusEl.textContent = 'Eligible'; statusEl.className = 'claim-status-badge'; }
  if (card)     { card.classList.remove('claimed', 'ineligible'); card.classList.add('eligible'); }
  if (remove)   remove.style.display = 'none';
}
