// ============================================================
//  navigation.js — Routing, sidebar, topbar, full dashboard
// ============================================================

const PAGE_MAP = {
  'dashboard':          'page-dashboard',
  'worker-list':         'page-worker-list',
  'worker-termination':  'page-worker-termination',
  'doc-status':         'page-doc-status',
  'doc-application':    'page-doc-application',
  'ap-quota':           'page-ap-quota',
  'financial-report':   'page-financial-report',
  'leave-applications': 'page-leave-applications',
  'leave-status':       'page-leave-status',
  'settings':           'page-settings',
  'settings-locations': 'page-settings-locations',
  'settings-prices':    'page-settings-prices',
  'settings-companies':  'page-settings-companies',
  'user-management':     'page-user-management',
  'new-registrations':   'page-new-registrations',
};

const BREADCRUMB_MAP = {
  'dashboard':          'Dashboard',
  'worker-list':         'Worker Data › All Worker Profiles',
  'worker-termination':  'Worker Data › Worker Termination',
  'doc-status':         'Legal Documents › Document Status',
  'doc-application':    'Legal Documents › Document Application',
  'ap-quota':           'AP Quota › AP Quota Status',
  'financial-report':   'Reports & Analytics › Legal Documents Financial Report',
  'leave-applications': 'Workers Leave › Leave Applications',
  'leave-status':       'Workers Leave › Leave Status',
  'settings':           'System › Settings',
  'settings-locations': 'System › Settings › Work Locations & Prefixes',
  'settings-prices':    'System › Settings › Document Application Prices',
  'settings-companies': 'System › Settings › AP Quota Companies',
  'user-management':    'User Management › All Users',
  'new-registrations':  'User Management › New Registrations',
};

function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById(PAGE_MAP[page] || 'page-coming-soon');
  if (target) target.classList.add('active');
  document.getElementById('breadcrumb').textContent = BREADCRUMB_MAP[page] || 'Coming Soon';
  document.querySelectorAll('[data-page]').forEach(el => {
    el.classList.remove('active-page');
    if (el.dataset.page === page) el.classList.add('active-page');
  });
  if (window.innerWidth <= 900) closeMobileSidebar();

  if (page === 'worker-list')        { populateWorkerFilters(); renderWorkerTable(); }
  if (page === 'worker-termination')  { renderTerminationTable(); }
  if (page === 'dashboard')          { initialiseDashDates(); updateDashboardStats(); renderDashboardChart(); renderDashPanels(); renderOnboardingBanner(); if(typeof renderNewRegBanner==='function') renderNewRegBanner(); }
  if (page === 'doc-status')         { populateDocFilters(); renderDocTable(); }
  if (page === 'doc-application')    { populateAppFilters(); renderAppTable(); }
  if (page === 'ap-quota')           renderApQuotaTable();
  if (page === 'financial-report')   { populateFinFilters(); renderFinancialTable(); }
  if (page === 'leave-applications') renderLeaveTable();
  if (page === 'leave-status')       renderLeaveStatusTable();
  if (page === 'settings')           { /* overview only */ }
  if (page === 'settings-locations') renderLocationTable();
  if (page === 'settings-prices')    renderPriceGrid();
  if (page === 'settings-companies') renderApCompanyTable();

  if (page === 'user-management')    loadAllUsers();
  if (page === 'new-registrations')  { if (typeof loadAllUsers === 'function') loadAllUsers(); }
}

function toggleSidebar() { document.getElementById('sidebar')?.classList.toggle('open'); }

// ── DATE / GREETING ───────────────────────────────────────────
function updateDate() {
  const el = document.getElementById('topbar-date-text') || document.getElementById('topbar-date');
  if (el) el.textContent = new Date().toLocaleDateString('en-MY',{weekday:'short',year:'numeric',month:'long',day:'numeric'});
}

function updateGreeting() {
  const h = new Date().getHours();
  const g = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  const name = (typeof _displayName !== 'undefined' && _displayName)
    ? _displayName
    : (typeof _userEmail !== 'undefined' && _userEmail ? _userEmail.split('@')[0] : '');
  const el = document.getElementById('greeting-text');
  if (el) el.textContent = name ? `${g}, ${name}.` : `${g}.`;
}

// ══════════════════════════════════════════════════════════════
//  PART A — WORKFORCE KPI STATS
// ══════════════════════════════════════════════════════════════
function updateDashboardStats() {
  updateGreeting();
  const activeWorkers    = workers.filter(w => deriveStatus(w) === 'Active');
  const onLeaveWorkers   = workers.filter(w => deriveStatus(w) === 'On Leave');
  const abscondedWorkers = workers.filter(w => w.general?.abscondedDate);
  const activeTKI        = activeWorkers.filter(w => deriveCategory(w) === 'TKI').length;
  const activeContractor = activeWorkers.filter(w => deriveCategory(w) === 'Contractor').length;

  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent = v; };
  set('kpi-active',     activeWorkers.length || '0');
  set('kpi-tki',        activeTKI            || '0');
  set('kpi-contractor', activeContractor      || '0');
  set('kpi-leave',      onLeaveWorkers.length || '0');
  set('kpi-absconded',  abscondedWorkers.length || '0');


}

// ══════════════════════════════════════════════════════════════
//  PART A — COMBO CHART (area lines + bars)
// ══════════════════════════════════════════════════════════════

function initialiseDashDates() {
  const now    = new Date();
  const today  = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const fromEl = document.getElementById('dash-date-from');
  const toEl   = document.getElementById('dash-date-to');

  // Always set 'to' to today
  if (toEl) toEl.value = today;

  // Always reset 'from' to 3 years ago as default
  if (fromEl) {
    const d = new Date(); d.setFullYear(d.getFullYear() - 3);
    fromEl.value = d.toISOString().slice(0,10);
  }
}

function getDateRange() {
  const from = document.getElementById('dash-date-from')?.value || '';
  const to   = document.getElementById('dash-date-to')?.value   || '';
  // Build today's date as YYYY-MM-DD in LOCAL time (not UTC, to avoid timezone shift)
  const now   = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const allDates = workers.map(w => w.general?.joining).filter(Boolean).sort();
  const minDate = from || allDates[0] || today;
  const maxDate = to   || today;
  return { from: minDate, to: maxDate };
}

function resetDashChartFilter() {
  const allDates = workers.map(w => w.general?.joining).filter(Boolean).sort();
  const fromEl   = document.getElementById('dash-date-from');
  const toEl     = document.getElementById('dash-date-to');
  const now      = new Date();
  const today    = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  if (fromEl) fromEl.value = allDates[0] || '';
  if (toEl)   toEl.value   = today;
  renderDashboardChart();
}

function buildLabels(from, to, granularity) {
  const labels = [];
  // Parse date strings manually to avoid UTC timezone shift
  // "2026-05-26" parsed as new Date() becomes May 25 in UTC+8 timezones
  function parseLocal(str) {
    const [y,m,d] = str.split('-').map(Number);
    return new Date(y, m-1, d, 23, 59, 59, 999);
  }
  const end = parseLocal(to);

  if (granularity === 'year') {
    const cur = new Date(new Date(from).getFullYear(), 0, 1);
    while (cur <= end) {
      labels.push(cur.getFullYear() + '');
      cur.setFullYear(cur.getFullYear() + 1);
    }
  } else if (granularity === 'week') {
    const wStart = new Date(from); wStart.setHours(0,0,0,0);
    const day = wStart.getDay(); wStart.setDate(wStart.getDate() - (day===0?6:day-1));
    const wCur = new Date(wStart);
    while (wCur <= end) {
      // Build YYYY-MM-DD from local date to avoid UTC timezone shift
      const yy = wCur.getFullYear();
      const mm = String(wCur.getMonth()+1).padStart(2,'0');
      const dd = String(wCur.getDate()).padStart(2,'0');
      labels.push(`${yy}-${mm}-${dd}`);
      wCur.setDate(wCur.getDate() + 7);
    }
  } else {
    // Month: always include the month containing 'to' date
    // Parse from manually to avoid timezone shift
    const [fy,fm] = from.split('-').map(Number);
    const cur = new Date(fy, fm-1, 1, 0, 0, 0, 0); // first of from-month, local
    const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cur <= endMonth) {
      // Build YYYY-MM from local year/month — never use toISOString() (UTC shift)
      const yy = cur.getFullYear();
      const mm = String(cur.getMonth() + 1).padStart(2, '0');
      labels.push(`${yy}-${mm}`);
      cur.setMonth(cur.getMonth() + 1);
    }
  }
  return labels;
}

function getSnapshotForPeriod(label, granularity) {
  // Determine period start and end
  let periodStart, periodEnd;
  if (granularity === 'year') {
    periodStart = new Date(parseInt(label), 0, 1);
    periodEnd   = new Date(parseInt(label), 11, 31);
  } else if (granularity === 'week') {
    periodStart = new Date(label);
    periodEnd   = new Date(label); periodEnd.setDate(periodEnd.getDate() + 6);
  } else {
    const [y,m] = label.split('-').map(Number);
    periodStart = new Date(y, m-1, 1);
    periodEnd   = new Date(y, m, 0); // last day of month
  }
  periodStart.setHours(0,0,0,0);
  periodEnd.setHours(23,59,59,999);

  let active=0, tki=0, contractor=0, onLeave=0, absconded=0;

  workers.forEach(w => {
    const g = w.general || {};

    // Must have joined before or during this period
    const joinDate = g.joining ? new Date(g.joining) : null;
    if (!joinDate) return;
    joinDate.setHours(0,0,0,0);
    if (joinDate > periodEnd) return;

    // Departure: if worker departed BEFORE this period started, skip entirely
    const depDate = g.departure ? new Date(g.departure) : null;
    if (depDate) depDate.setHours(0,0,0,0);
    if (depDate && depDate < periodStart) return;

    // Absconded: only mark as absconded if abscondedDate falls within or before this period
    if (g.abscondedDate) {
      const absDate = new Date(g.abscondedDate); absDate.setHours(0,0,0,0);
      if (absDate <= periodEnd) { absconded++; return; }
    }

    // On Leave: check if any approved leave overlaps with this period
    // Leave overlaps if: leaveStart <= periodEnd AND leaveEnd >= periodStart
    // leaveEnd = actualReturn if recorded, else estReturn if set, else periodEnd (still on leave during period)
    const isOnLeave = leaveApplications.some(l => {
      if (l.workerId !== w.id || l.status !== 'Approved') return false;
      if (!l.startDate) return false;

      const ls = new Date(l.startDate); ls.setHours(0,0,0,0);
      if (ls > periodEnd) return false; // leave starts after this period

      // Determine when leave ended for this worker
      let le;
      if (l.actualReturn) {
        le = new Date(l.actualReturn); le.setHours(23,59,59,999);
      } else if (l.estReturn) {
        le = new Date(l.estReturn); le.setHours(23,59,59,999);
      } else {
        // No return recorded — treat as still on leave through the period
        le = periodEnd;
      }

      return le >= periodStart;
    });

    if (isOnLeave) { onLeave++; return; }

    active++;
    const cat = deriveCategory(w);
    if (cat === 'TKI')        tki++;
    if (cat === 'Contractor') contractor++;
  });
  return { active, tki, contractor, onLeave, absconded };
}

function renderDashboardChart() {
  const canvas  = document.getElementById('workforceChart');
  const emptyEl = document.getElementById('dash-empty-chart');
  if (!canvas) return;

  const { from, to } = getDateRange();
  const gran = document.getElementById('dash-granularity')?.value || 'month';
  const labels = buildLabels(from, to, gran);

  if (!workers.length || !labels.length) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  const snapshots = labels.map(l => getSnapshotForPeriod(l, gran));

  // Draw now
  const doDraw = () => drawComboChart(canvas, labels, snapshots, gran);
  requestAnimationFrame(doDraw);

  // Reattach ResizeObserver whenever chart is rendered (labels/data may change)
  if (canvas._resizeObserver) canvas._resizeObserver.disconnect();
  canvas._resizeObserver = new ResizeObserver(() => requestAnimationFrame(doDraw));
  if (canvas.parentElement) canvas._resizeObserver.observe(canvas.parentElement);
}

function drawComboChart(canvas, labels, snapshots, gran) {
  // Always read width from parent container — never from canvas itself
  // This ensures zoom in/out works correctly
  const parent = canvas.parentElement;
  const W   = parent ? parent.getBoundingClientRect().width : 600;
  const H   = 280;
  const dpr = window.devicePixelRatio || 1;
  // Reset canvas to 100% width via CSS, then read the actual pixel size
  canvas.style.width  = '100%';
  canvas.style.height = H + 'px';
  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, W, H);

  const PAD = { top:24, right:60, bottom:56, left:52 }; // extra right for last label
  const cW  = W - PAD.left - PAD.right;
  const cH  = H - PAD.top  - PAD.bottom;
  const n   = labels.length;
  if (n === 0) return;

  const allVals = snapshots.flatMap(s => [s.active, s.tki, s.contractor, s.onLeave, s.absconded]);
  const maxVal  = Math.max(...allVals, 1);
  const ySteps  = 5;
  const yStep   = Math.ceil(maxVal / ySteps) || 1;
  const yMax    = yStep * ySteps;

  const xPos = i => PAD.left + (n === 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yPos = v => PAD.top  + cH - (cH * Math.min(v, yMax) / yMax);

  // ── Y GRID + LABELS ───────────────────────────────────────────
  ctx.font      = '11px DM Sans,sans-serif';
  ctx.fillStyle = '#8aaa82';
  ctx.textAlign = 'right';
  for (let i = 0; i <= ySteps; i++) {
    const val = yStep * i;
    const y   = yPos(val);
    ctx.strokeStyle = '#e8ede6'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + cW, y);
    ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillText(String(val), PAD.left - 8, y + 4);
  }

  // ── X LABELS — no overlap ─────────────────────────────────────
  ctx.textAlign = 'center'; ctx.fillStyle = '#8aaa82';
  ctx.font = '11px DM Sans,sans-serif';

  // Measure label width to decide step
  const sampleLabel = gran === 'month' ? "Jan '24" : gran === 'year' ? '2024' : '01-01';
  const labelW = ctx.measureText(sampleLabel).width + 12;
  const maxFit = Math.max(1, Math.floor(cW / labelW));
  const step = Math.ceil(n / maxFit);

  // Build display text for a label
  function labelText(lbl) {
    if (gran === 'month') {
      const [yr, mo] = lbl.split('-');
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(mo)-1];
      return `${m} '${yr.slice(2)}`;
    }
    if (gran === 'week') return lbl.slice(5);
    return lbl;
  }

  // Decide which indices to draw: every `step` labels + always include the last
  const toDraw = new Set();
  for (let i = 0; i < n; i += step) toDraw.add(i);
  toDraw.add(n - 1); // always draw the last label (current month/period)

  // Decide final set of labels to draw with no overlap
  // Strategy: pick evenly spaced indices, then replace last with n-1 if it fits
  const drawn = [];
  let lastX = -Infinity;
  for (let i = 0; i < n; i++) {
    if (i % step !== 0) continue;
    const x = xPos(i);
    if (x - lastX >= labelW) { drawn.push(i); lastX = x; }
  }
  // Ensure last data point label is shown — replace last drawn if too close, or append
  const lastIdx = n - 1;
  const lastX2  = xPos(lastIdx);
  if (drawn[drawn.length - 1] !== lastIdx) {
    if (lastX2 - xPos(drawn[drawn.length - 1]) >= labelW) {
      drawn.push(lastIdx); // enough room — add it
    } else {
      drawn[drawn.length - 1] = lastIdx; // replace last with actual end date
    }
  }

  ctx.fillStyle = '#9A8778';
  ctx.textAlign = 'center';
  drawn.forEach(i => {
    const x = xPos(i);
    ctx.fillText(labelText(labels[i]), x, PAD.top + cH + 20);
    ctx.strokeStyle = '#d0dcc8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, PAD.top + cH); ctx.lineTo(x, PAD.top + cH + 5); ctx.stroke();
  });

  // ── AREA FILLS ────────────────────────────────────────────────
  // Colours exactly matching the legend in index.html
  const areas = [
    { key:'active',     color:'#1460aa', alpha:0.18 },  // blue
    { key:'tki',        color:'#1a8c01', alpha:0.18 },  // green
    { key:'contractor', color:'#e65100', alpha:0.15 },  // orange
  ];
  areas.forEach(a => {
    // Fill
    ctx.beginPath();
    snapshots.forEach((s, i) => {
      const x = xPos(i); const y = yPos(s[a.key] || 0);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(xPos(n - 1), PAD.top + cH);
    ctx.lineTo(xPos(0),     PAD.top + cH);
    ctx.closePath();
    ctx.fillStyle = a.color + Math.round(a.alpha * 255).toString(16).padStart(2, '0');
    ctx.fill();
    // Line
    ctx.beginPath();
    snapshots.forEach((s, i) => {
      const x = xPos(i); const y = yPos(s[a.key] || 0);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = a.color; ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.stroke();
  });

  // ── BARS (onLeave amber, absconded red) ───────────────────────
  const barSeries = [
    { key:'onLeave',   color:'#d4820a' },  // amber — matches legend
    { key:'absconded', color:'#d93025' },  // red — matches legend
  ];
  const barTotal = Math.max(4, Math.min(16, Math.floor(cW / n / 2.5)));
  const barW     = Math.floor(barTotal / 2);
  const barGap   = 2;
  barSeries.forEach((b, bi) => {
    ctx.fillStyle = b.color + 'cc';
    snapshots.forEach((s, i) => {
      const v = s[b.key] || 0;
      if (!v) return;
      const cx = xPos(i);
      const offset = bi === 0 ? -(barW + barGap / 2) : barGap / 2;
      const bx = cx + offset;
      const by = yPos(v);
      ctx.fillRect(bx, by, barW, PAD.top + cH - by);
    });
  });

  // ── DOTS on area lines (only when few data points) ────────────
  if (n <= 30) {
    areas.forEach(a => {
      snapshots.forEach((s, i) => {
        const v = s[a.key] || 0;
        ctx.beginPath();
        ctx.arc(xPos(i), yPos(v), 3.5, 0, Math.PI * 2);
        ctx.fillStyle   = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = a.color; ctx.lineWidth = 2;
        ctx.stroke();
      });
    });
  }
}

// ══════════════════════════════════════════════════════════════
//  PART B — DOCUMENTATION OVERVIEW
// ══════════════════════════════════════════════════════════════
function renderDashPanels() {
  renderDocPanel();
  renderApPanel();
}

function renderDocPanel() {
  const el = document.getElementById('dash-doc-list'); if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const in90  = new Date(today); in90.setDate(in90.getDate()+90);

  const docs = [];
  workers.forEach(w => {
    const l = w.legal || {};
    [l.passport?.expiry, l.license?.expiry, l.permit?.expiry]
      .filter(Boolean).forEach(expiry => docs.push(expiry));
  });

  const expiringSoon = docs.filter(d => { const e=new Date(d); return e>=today && e<=in90; }).length;
  const expired      = docs.filter(d => new Date(d) < today).length;
  const inProgress   = applications.filter(a => !a.cancelled && !a.handover && !a.actualReceive && a.appDate && a.appType !== 'Data Entry').length;

  el.innerHTML = `
    <div class="dash-capsule orange">
      <div class="dash-capsule-label">⚠️ Documents Expiring Soon</div>
      <div class="dash-capsule-num">${expiringSoon}</div>
    </div>
    <div class="dash-capsule red">
      <div class="dash-capsule-label">🚨 Documents Expired</div>
      <div class="dash-capsule-num">${expired}</div>
    </div>
    <div class="dash-capsule blue">
      <div class="dash-capsule-label">⏳ Application In Progress</div>
      <div class="dash-capsule-num">${inProgress}</div>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
//  PART C — AP QUOTA OVERVIEW
// ══════════════════════════════════════════════════════════════
function renderApPanel() {
  const el = document.getElementById('dash-ap-list'); if (!el) return;
  const today = new Date(); today.setHours(0,0,0,0);
  const in14  = new Date(today); in14.setDate(in14.getDate()+14);

  // Available slots — active quotas with free slots
  const activeQuotas  = apQuotas.filter(q => deriveApQuotaStatus(q) === 'Active');
  const availableSlots = activeQuotas.reduce((s,q) => {
    return s + Math.max(0, (q.slots||0) - getAssignedWorkers(q).length);
  }, 0);

  // Expiring within 2 weeks — count slots
  const expiringQuotas = apQuotas.filter(q => {
    if (!q.expiry) return false;
    const e = new Date(q.expiry); return e >= today && e <= in14;
  });
  const expiringSlots = expiringQuotas.reduce((s,q) => s+(q.slots||0), 0);

  // In progress — count slots
  const inProcessQuotas = apQuotas.filter(q => {
    const s = deriveApQuotaStatus(q);
    return s === 'Application in Process' || s === 'Delayed';
  });
  const inProcessSlots = inProcessQuotas.reduce((s,q) => s+(q.slots||0), 0);

  el.innerHTML = `
    <div class="dash-capsule green">
      <div class="dash-capsule-label">✅ AP Quota Available</div>
      <div class="dash-capsule-meta">Free slots</div>
      <div class="dash-capsule-num">${availableSlots}</div>
    </div>
    <div class="dash-capsule orange">
      <div class="dash-capsule-label">⚠️ AP Quota Expiring Soon</div>
      <div class="dash-capsule-meta">Within 2 weeks</div>
      <div class="dash-capsule-num">${expiringSlots}</div>
    </div>
    <div class="dash-capsule blue">
      <div class="dash-capsule-label">⏳ AP Quota In Progress</div>
      <div class="dash-capsule-meta">Pending approval</div>
      <div class="dash-capsule-num">${inProcessSlots}</div>
    </div>`;
}

// Legacy populateDashYearFilters — kept for compatibility but no longer used
function populateDashYearFilters() {}

// ── ONBOARDING BANNER ─────────────────────────────────────────
function renderOnboardingBanner() {
  const el = document.getElementById('onboarding-banner');
  if (!el) return;

  // Only show if no workers AND admin role
  const hasWorkers  = workers.length > 0;
  const hasLocations= typeof workLocations !== 'undefined' && workLocations.length > 0;

  if (hasWorkers || typeof isAdmin !== 'function' || !isAdmin()) {
    el.style.display = 'none'; return;
  }

  const steps = [
    { done: hasLocations,     icon: '📍', label: 'Add a Work Location', action: "navigateTo('settings-locations')", desc: 'Required before adding workers' },
    { done: false,            icon: '👷', label: 'Add Your First Worker', action: "openAddWorkerModal()", desc: 'Start building your workforce register' },
    { done: false,            icon: '◎',  label: 'Register an AP Quota', action: "navigateTo('ap-quota')", desc: 'Track government-issued worker slots' },
    { done: false,            icon: '💰', label: 'Set Document Prices',  action: "navigateTo('settings-prices')", desc: 'Needed for financial report accuracy' },
  ];

  el.style.display = 'block';
  el.innerHTML = `
    <div class="onboarding-card">
      <div class="onboarding-header">
        <div>
          <div class="onboarding-title">👋 Welcome to MJM Groups WMS</div>
          <div class="onboarding-sub">Complete these steps to get your system ready.</div>
        </div>
        <button onclick="document.getElementById('onboarding-banner').style.display='none'"
          style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:18px;padding:4px;">✕</button>
      </div>
      <div class="onboarding-steps">
        ${steps.map((s,i) => `
          <div class="onboarding-step ${s.done?'done':''}">
            <div class="onboarding-step-num">${s.done ? '✓' : i+1}</div>
            <div class="onboarding-step-body">
              <div class="onboarding-step-label">${s.icon} ${s.label}</div>
              <div class="onboarding-step-desc">${s.desc}</div>
            </div>
            ${!s.done ? `<button class="btn-ghost btn-sm" onclick="${s.action}" style="flex-shrink:0;">Go →</button>` : ''}
          </div>`).join('')}
      </div>
    </div>`;
}