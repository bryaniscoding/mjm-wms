// ============================================================
//  report.js — Live preview report builder + XLSX/PDF export
//  Uses SheetJS (xlsx) for Excel, print window for PDF
// ============================================================

const SUPA_URL_R = 'https://xbyowjlrkfrvgaypucck.supabase.co';
const SUPA_KEY_R = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhieW93amxya2ZydmdheXB1Y2NrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0MTgwNzYsImV4cCI6MjA5NDk5NDA3Nn0.XdGf4T5st6fCGnnLs5cI0JMct2FuKDPYMztbWjgArEg';

// ── SHEETJS CDN LOADER ────────────────────────────────────────
let _xlsxLoaded = false;
function loadXLSX() {
  return new Promise((resolve) => {
    if (_xlsxLoaded || window.XLSX) { _xlsxLoaded = true; resolve(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = () => { _xlsxLoaded = true; resolve(); };
    s.onerror = () => resolve(); // degrade gracefully
    document.head.appendChild(s);
  });
}

// ── COLUMN DEFINITIONS ────────────────────────────────────────
const REPORT_COLUMNS = {
  workers: [
    { key:'workerId',    label:'Worker ID',        width:100, visible:true  },
    { key:'name',        label:'Full Name',         width:160, visible:true  },
    { key:'nationality', label:'Nationality',       width:110, visible:false },
    { key:'passport',    label:'IC / Passport',     width:120, visible:false },
    { key:'category',    label:'Category',          width:90,  visible:true  },
    { key:'status',      label:'Status',            width:90,  visible:true  },
    { key:'location',    label:'Work Location',     width:130, visible:true  },
    { key:'joining',     label:'Joining Date',      width:110, visible:true  },
    { key:'recruitment', label:'Recruitment Date',  width:120, visible:false },
    { key:'termination', label:'Termination',       width:110, visible:false },
    { key:'departure',   label:'Departure',         width:110, visible:false },
    { key:'passportExp', label:'Passport Expiry',   width:120, visible:true  },
    { key:'licenseExp',  label:'License Expiry',    width:120, visible:false },
    { key:'permitExp',   label:'Permit Expiry',     width:120, visible:false },
    { key:'quotaCo',     label:'AP Company',        width:140, visible:false },
    { key:'quotaSlot',   label:'Quota Slot',        width:90,  visible:false },
    { key:'socso',       label:'SOCSO Reg',         width:110, visible:false },
    { key:'remarks',     label:'Remarks',           width:180, visible:false },
  ],
  worker_profile: [
    { key:'field', label:'Field', width:180, visible:true },
    { key:'value', label:'Value', width:260, visible:true },
  ],
  ap_quota: [
    { key:'status',       label:'Status',          width:130, visible:true  },
    { key:'company',      label:'Company',         width:180, visible:true  },
    { key:'kdn',          label:'KDN Reference',   width:140, visible:true  },
    { key:'slots',        label:'Total Slots',     width:90,  visible:true  },
    { key:'usedSlots',    label:'Used Slots',      width:90,  visible:true  },
    { key:'freeSlots',    label:'Free Slots',      width:90,  visible:true  },
    { key:'appDate',      label:'Application Date',width:120, visible:true  },
    { key:'estApproval',  label:'Est. Approval',   width:120, visible:false },
    { key:'approvalDate', label:'Approval Date',   width:120, visible:true  },
    { key:'expiry',       label:'Expiry Date',     width:120, visible:true  },
  ],
  leave_status: [
    { key:'leaveStatus',  label:'Status',          width:130, visible:true  },
    { key:'appNumber',    label:'Leave Ref No.',   width:110, visible:true  },
    { key:'workerName',   label:'Worker Name',     width:150, visible:true  },
    { key:'workerId',     label:'Worker ID',       width:100, visible:true  },
    { key:'location',     label:'Work Location',   width:130, visible:true  },
    { key:'startDate',    label:'Start Date',      width:110, visible:true  },
    { key:'estReturn',    label:'Est. Return',     width:110, visible:true  },
    { key:'actualReturn', label:'Actual Return',   width:120, visible:true  },
    { key:'duration',     label:'Duration (days)', width:110, visible:true  },
    { key:'appDate',      label:'Application Date',width:120, visible:false },
  ],
  doc_status: [
    { key:'docType',  label:'Document Type', width:130, visible:true  },
    { key:'name',     label:'Worker Name',   width:150, visible:true  },
    { key:'location', label:'Work Location', width:130, visible:true  },
    { key:'company',  label:'AP Company',    width:140, visible:false },
    { key:'expiry',   label:'Expiry Date',   width:120, visible:true  },
    { key:'daysLeft', label:'Days Remaining',width:120, visible:true  },
  ],
  financial: [
    { key:'date',       label:'Date',            width:110, visible:true  },
    { key:'workerName', label:'Worker Name',     width:150, visible:true  },
    { key:'docType',    label:'Document Type',   width:130, visible:true  },
    { key:'appType',    label:'Application Type',width:130, visible:false },
    { key:'location',   label:'Work Location',   width:130, visible:true  },
    { key:'qty',        label:'Qty',             width:60,  visible:true  },
    { key:'unitPrice',  label:'Unit Price (RM)', width:110, visible:true  },
    { key:'total',      label:'Total (RM)',      width:110, visible:true  },
  ],
};

const REPORT_TYPES_LIST = [
  { key:'global',         label:'Global Branding',            icon:'🎨', desc:'Company name, logo, accent colour — shared across all reports' },
  { key:'workers',        label:'Worker Profiles List',       icon:'👷', desc:'Export of all workers with current filters' },
  { key:'worker_profile', label:'Individual Worker Profile',  icon:'🪪', desc:'Single worker full detail export' },
  { key:'ap_quota',       label:'AP Quota Status',            icon:'◎', desc:'AP quota records export' },
  { key:'leave_status',   label:'Workers Leave Status',       icon:'🌴', desc:'Approved leave records export' },
  { key:'doc_status',     label:'Document Status',            icon:'📄', desc:'Document expiry records export' },
  { key:'financial',      label:'Financial Report',           icon:'💰', desc:'Financial transaction records export' },
];

let _templates = {};

// ── LOAD / SAVE TEMPLATES ─────────────────────────────────────
async function loadReportTemplates() {
  try {
    const res = await fetch(`${SUPA_URL_R}/rest/v1/report_templates?select=*`, {
      headers: { 'apikey': SUPA_KEY_R, 'Authorization': 'Bearer ' + (window._authToken || SUPA_KEY_R) }
    });
    if (res.ok) { const rows = await res.json(); rows.forEach(r => { _templates[r.report_type] = r; }); }
  } catch(e) { console.warn('Could not load report templates:', e); }
}

function getTemplate(reportType) {
  const g = _templates['global'] || {};
  const t = _templates[reportType] || {};
  const defaultCols = (REPORT_COLUMNS[reportType] || []).map(c => ({ ...c }));
  return {
    companyName:     g.company_name     || 'MJM Groups',
    companySubtitle: t.company_subtitle || g.company_subtitle || '',
    logoUrl:         g.logo_url         || '',
    accentColour:    g.accent_colour    || '#1a8c01',
    fontFamily:      g.font_family      || 'Arial',
    footerText:      g.footer_text      || '',
    columns:         (t.columns && t.columns.length) ? t.columns : defaultCols,
    freezeRow:       t.freeze_row  ?? 1,
    freezeCol:       t.freeze_col  ?? 0,
    pageSize:        t.page_size   || 'A4',
    orientation:     t.orientation || 'landscape',
  };
}

async function saveReportTemplate(reportType, patch) {
  const res = await fetch(`${SUPA_URL_R}/rest/v1/report_templates?report_type=eq.${reportType}`, {
    method: 'PATCH',
    headers: { 'apikey': SUPA_KEY_R, 'Authorization': 'Bearer ' + (window._authToken || SUPA_KEY_R), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() })
  });
  if (res.ok) { if (!_templates[reportType]) _templates[reportType] = { report_type: reportType }; Object.assign(_templates[reportType], patch); }
  return res.ok;
}

// ── DATA EXTRACTORS ───────────────────────────────────────────
function getWorkersReportData(filteredWorkers) {
  return filteredWorkers.map(w => {
    const g = w.general || {}; const l = w.legal || {};
    return {
      workerId:    g.workerId    || '',
      name:        g.name        || '',
      nationality: g.nationality || '',
      passport:    g.passport    || '',
      category:    deriveCategory(w),
      status:      deriveStatus(w),
      location:    g.location    || '',
      joining:     formatDate(g.joining),
      recruitment: formatDate(g.recruitment),
      termination: formatDate(g.termination),
      departure:   formatDate(g.departure),
      // Use expiryLabel so output matches what the table shows e.g. "29 Apr 2034 (7.9yr)"
      passportExp: expiryLabel(l.passport?.expiry),
      licenseExp:  expiryLabel(l.license?.expiry),
      permitExp:   expiryLabel(l.permit?.expiry),
      quotaCo:     l.quota?.company || '',
      quotaSlot:   l.quota?.slot    || '',
      socso:       l.socso?.reg     || '',
      remarks:     g.remarks        || '',
    };
  });
}

function getApQuotaReportData() {
  return apQuotas.map(aq => {
    const used = getAssignedWorkers(aq).length;
    return { status: deriveApQuotaStatus(aq), company: aq.company || '', kdn: aq.kdn || '',
      slots: aq.slots || 0, usedSlots: used, freeSlots: Math.max(0,(aq.slots||0)-used),
      appDate: formatDate(aq.appDate), estApproval: formatDate(aq.estApproval),
      approvalDate: formatDate(aq.approvalDate), expiry: formatDate(aq.expiry) };
  });
}

function getLeaveStatusReportData() {
  return leaveApplications.filter(l => l.status === 'Approved').map(l => {
    const w = workers.find(x => x.id === l.workerId); const g = w?.general || {};
    return { leaveStatus: getLeaveStatus(l), appNumber: l.appNumber || '',
      workerName: g.name || '', workerId: g.workerId || '', location: g.location || '',
      startDate: formatDate(l.startDate), estReturn: formatDate(l.estReturn),
      actualReturn: l.actualReturn ? formatDate(l.actualReturn) : '',
      duration: l.duration || '', appDate: formatDate(l.appDate) };
  });
}

function getDocStatusReportData() {
  const today = new Date(); today.setHours(0,0,0,0);
  const rows = [];
  workers.forEach(w => {
    const g = w.general || {}; const l = w.legal || {};
    [{ type:'Passport',expiry:l.passport?.expiry},{ type:'Labour License',expiry:l.license?.expiry},{ type:'Work Permit',expiry:l.permit?.expiry}]
      .forEach(d => {
        if (!d.expiry) return;
        const exp = new Date(d.expiry); exp.setHours(0,0,0,0);
        const diff = Math.floor((exp-today)/86400000);
        rows.push({ docType:d.type, name:g.name||'', location:g.location||'', company:l.quota?.company||'',
          expiry:formatDate(d.expiry), daysLeft: diff<0?`Expired (${Math.abs(diff)}d ago)`:`${diff}d` });
      });
  });
  return rows.sort((a,b)=>a.expiry.localeCompare(b.expiry));
}

function getFinancialReportData() {
  return getFinancials().map(r => ({
    date: formatDate(r.date), workerName: r.workerName||'', docType: r.docType||'',
    appType: r.appType||'', location: r.location||'', qty: r.qty||1,
    unitPrice: parseFloat(r.unitPrice)||0, total: parseFloat(r.total)||0
  }));
}

function _getFilteredWorkers() {
  // Exactly mirror renderWorkerTable filter + sort logic
  const query = (document.getElementById('workerSearch')?.value || '').toLowerCase().trim();
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

  // Mirror exact same sort key extractor from renderWorkerTable
  if (typeof workerSort !== 'undefined' && typeof applySort === 'function') {
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
        default:         return '';
      }
    });
  }
  return list;
}

// Mirror renderDocTable filter + sort
function _getFilteredDocRows() {
  const query = (document.getElementById('docSearch')?.value || '').toLowerCase().trim();
  const typeF = document.getElementById('docTypeFilter')?.value  || '';
  const locF  = document.getElementById('docLocFilter')?.value   || '';
  const staF  = document.getElementById('docStatusFilter')?.value|| '';

  const today = new Date(); today.setHours(0,0,0,0);
  let rows = [];
  workers.forEach(w => {
    const g = w.general || {}; const l = w.legal || {};
    [{ type:'Passport',expiry:l.passport?.expiry },
     { type:'Labour License',expiry:l.license?.expiry },
     { type:'Work Permit',expiry:l.permit?.expiry }].forEach(d => {
      if (!d.expiry) return;
      if (typeF && d.type !== typeF) return;
      if (locF  && g.location !== locF) return;
      const exp  = new Date(d.expiry); exp.setHours(0,0,0,0);
      const diff = Math.floor((exp - today) / 86400000);
      const label = expiryLabel(d.expiry);
      const r = { docType: d.type, name: g.name||'', workerId: g.workerId||'',
        location: g.location||'', company: l.quota?.company||'',
        expiry: formatDate(d.expiry), daysLeft: diff<0?`Expired (${Math.abs(diff)}d ago)`:`${diff}d`,
        _expiry: d.expiry };
      if (staF) {
        if (staF === 'expired'  && diff >= 0)   return;
        if (staF === 'expiring' && (diff < 0 || diff > 90)) return;
        if (staF === 'ok'       && diff <= 90)  return;
      }
      if (query) {
        const hay = [r.name, r.workerId, r.docType, r.location, r.company].join(' ').toLowerCase();
        if (!hay.includes(query)) return;
      }
      rows.push(r);
    });
  });

  // Apply same sort as doc table
  if (typeof docSort !== 'undefined' && typeof applySort === 'function') {
    rows = applySort(rows, docSort, (r, col) => r[col === 'expiry' ? '_expiry' : col] || '');
  } else {
    rows.sort((a,b) => a._expiry.localeCompare(b._expiry));
  }
  return rows;
}

// Mirror renderLeaveStatusTable filter + sort
function _getFilteredLeaveRows() {
  const query = (document.getElementById('leaveStatusSearch')?.value || '').toLowerCase().trim();
  const locF  = document.getElementById('leaveStatusLocFilter')?.value || '';
  let rows = leaveApplications.filter(l => l.status === 'Approved').map(l => {
    const w = workers.find(x => x.id === l.workerId); const g = w?.general || {};
    return { leaveStatus: getLeaveStatus(l), appNumber: l.appNumber||'',
      workerName: g.name||'', workerId: g.workerId||'', location: g.location||'',
      startDate: formatDate(l.startDate), estReturn: formatDate(l.estReturn),
      actualReturn: l.actualReturn ? formatDate(l.actualReturn) : '',
      duration: l.duration||'', appDate: formatDate(l.appDate), _appDate: l.appDate||'' };
  });
  if (locF) rows = rows.filter(r => r.location === locF);
  if (query) rows = rows.filter(r => [r.workerName, r.workerId, r.appNumber, r.location].join(' ').toLowerCase().includes(query));
  if (typeof leaveSort !== 'undefined' && typeof applySort === 'function') {
    rows = applySort(rows, leaveSort, (r,col) => r[col] || '');
  }
  return rows;
}

// Mirror renderFinancialTable filter + sort
function _getFilteredFinancialRows() {
  const query = (document.getElementById('finSearch')?.value    || '').toLowerCase().trim();
  const locF  = document.getElementById('finLocFilter')?.value  || '';
  const typeF = document.getElementById('finTypeFilter')?.value || '';
  const from  = document.getElementById('finDateFrom')?.value   || '';
  const to    = document.getElementById('finDateTo')?.value     || '';
  let rows = getFinancials().filter(r => {
    if (locF  && r.location !== locF) return false;
    if (typeF && r.docType  !== typeF) return false;
    if (from  && r.date < from)  return false;
    if (to    && r.date > to)    return false;
    if (query) {
      const hay = [r.workerName, r.docType, r.location, r.appType].join(' ').toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  }).map(r => ({
    date: formatDate(r.date), workerName: r.workerName||'', docType: r.docType||'',
    appType: r.appType||'', location: r.location||'',
    qty: r.qty||1,
    unitPrice: `RM ${(parseFloat(r.unitPrice)||0).toFixed(2)}`,
    total:     `RM ${(parseFloat(r.total)||0).toFixed(2)}`,
    _date: r.date||''
  }));
  if (typeof finSort !== 'undefined' && typeof applySort === 'function') {
    rows = applySort(rows, finSort, (r,col) => col === 'date' ? r._date : (r[col]||''));
  }
  return rows;
}

// Per-export column config: user can customise which columns and order for THIS export
// Stored in memory per session (not saved to Supabase — that's the template)
let _exportColumnOverride = {}; // { reportType: [colConfig] }

function getExportColumns(reportType) {
  // User's per-session override takes priority, then saved template, then defaults
  if (_exportColumnOverride[reportType]) return _exportColumnOverride[reportType].filter(c => c.visible);
  return getTemplate(reportType).columns.filter(c => c.visible);
}

// ══════════════════════════════════════════════════════════════
//  LIVE PREVIEW REPORT BUILDER PAGE
// ══════════════════════════════════════════════════════════════

let _previewType    = null;  // current report type in preview
let _previewData    = [];    // current data rows
let _previewCols    = [];    // current column config (mutable)
let _previewTmpl    = {};    // current template settings
let _resizingCol    = null;  // column being resized
let _resizeStartX   = 0;
let _resizeStartW   = 0;
let _dragSrcIdx     = null;  // column drag source index

function renderReportTemplateList() {
  const el = document.getElementById('report-template-list'); if (!el) return;
  const g  = _templates['global'] || {};
  const accent = g.accent_colour || '#1a8c01';
  el.innerHTML = REPORT_TYPES_LIST.map(rt => `
    <div class="settings-card" onclick="openReportBuilder('${rt.key}')">
      <div class="settings-card-icon" style="background:${rt.key==='global'?accent:'var(--offwhite2)'};color:${rt.key==='global'?'#fff':accent};border-radius:8px;width:44px;height:44px;display:flex;align-items:center;justify-content:center;font-size:20px;">${rt.icon}</div>
      <div class="settings-card-body">
        <div class="settings-card-title">${esc(rt.label)}</div>
        <div class="settings-card-sub">${esc(rt.desc)}</div>
      </div>
      <button class="btn-ghost btn-sm">Edit Template →</button>
    </div>`).join('');
}

function openReportBuilder(reportType) {
  _previewType  = reportType;
  _previewTmpl  = getTemplate(reportType);
  _previewCols  = JSON.parse(JSON.stringify(_previewTmpl.columns)); // deep copy

  // Load data for preview
  const isGlobal = reportType === 'global';
  if (!isGlobal) {
    switch(reportType) {
      case 'workers':        _previewData = getWorkersReportData(_getFilteredWorkers()); break;
      case 'ap_quota':       _previewData = getApQuotaReportData();       break;
      case 'leave_status':   _previewData = getLeaveStatusReportData();   break;
      case 'doc_status':     _previewData = getDocStatusReportData();     break;
      case 'financial':      _previewData = getFinancialReportData();     break;
      case 'worker_profile': _previewData = workers.slice(0,3).flatMap(w => buildWorkerProfileRows(w)); break;
      default:               _previewData = [];
    }
  }

  navigateTo('report-builder');
  renderBuilderPage();
}

function renderBuilderPage() {
  const isGlobal = _previewType === 'global';
  const meta     = REPORT_TYPES_LIST.find(r => r.key === _previewType);
  const t        = _previewTmpl;

  const el = document.getElementById('report-builder-content');
  if (!el) return;

  el.innerHTML = `
    <!-- Top toolbar -->
    <div class="rb-toolbar">
      <div class="rb-toolbar-left">
        <button class="btn-ghost btn-sm search-btn" onclick="navigateTo('settings-templates')">← Back</button>
        <span class="rb-title">${esc(meta?.label||_previewType)}</span>
      </div>
      <div class="rb-toolbar-right">
        ${!isGlobal ? `
        <button class="btn-ghost btn-sm export-btn" onclick="exportFromBuilder('pdf')">🖨 Preview PDF</button>
        <button class="btn-ghost btn-sm export-btn" onclick="exportFromBuilder('xlsx')">📊 Export XLSX</button>` : ''}
        ${(typeof isAdmin === 'function' && isAdmin()) ? `<button class="btn-primary btn-sm" onclick="saveBuilderTemplate()">💾 Save Template</button>` : ''}
      </div>
    </div>

    <!-- Split: left controls, right preview -->
    <div class="rb-layout">

      <!-- LEFT PANEL: settings -->
      <div class="rb-controls" id="rb-controls">
        <!-- Branding (always shown) -->
        <div class="rb-section-title">🎨 Branding</div>
        <div class="rb-field"><label>Company Name</label><input type="text" id="rb-company-name" value="${esc(t.companyName)}" oninput="rebuildPreviewHeader()"/></div>
        <div class="rb-field"><label>Report Subtitle</label><input type="text" id="rb-subtitle" value="${esc(t.companySubtitle)}" oninput="rebuildPreviewHeader()"/></div>
        <div class="rb-field"><label>Accent Colour</label><input type="color" id="rb-accent" value="${t.accentColour}" oninput="applyAccentColour(this.value)" style="height:38px;padding:3px 5px;"/></div>
        <div class="rb-field"><label>Font</label>
          <select id="rb-font" onchange="applyFont(this.value)">
            ${['Arial','Helvetica','Times New Roman','Calibri','Georgia'].map(f=>`<option ${f===t.fontFamily?'selected':''}>${f}</option>`).join('')}
          </select>
        </div>
        <div class="rb-field"><label>Footer Text</label><input type="text" id="rb-footer" value="${esc(t.footerText)}" oninput="rebuildPreviewFooter()"/></div>
        <div class="rb-field">
          <label>Logo</label>
          <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
            <img id="rb-logo-preview" src="${t.logoUrl||''}" style="height:40px;border-radius:6px;border:1px solid var(--border);display:${t.logoUrl?'block':'none'};"/>
            <label class="btn-secondary btn-sm upload-label" for="rb-logo-input" style="cursor:pointer;display:inline-block;">Choose</label>
            <input type="file" id="rb-logo-input" accept="image/*" onchange="previewBuilderLogo(event)" style="display:none;"/>
            <button class="btn-ghost btn-sm" onclick="removeBuilderLogo()">✕</button>
          </div>
        </div>

        ${!isGlobal ? `
        <!-- Page setup -->
        <div class="rb-section-title" style="margin-top:16px;">📐 Page Setup</div>
        <div class="rb-field"><label>Page Size</label>
          <select id="rb-page-size">
            ${['A4','A3','Letter'].map(s=>`<option ${s===t.pageSize?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
        <div class="rb-field"><label>Orientation</label>
          <select id="rb-orientation">
            <option ${t.orientation==='landscape'?'selected':''}>landscape</option>
            <option ${t.orientation==='portrait'?'selected':''}>portrait</option>
          </select>
        </div>
        <div class="rb-field"><label>Freeze Rows <span class="field-note">(Excel)</span></label>
          <input type="number" id="rb-freeze-row" value="${t.freezeRow}" min="0" max="10" style="width:70px;"/>
        </div>
        <div class="rb-field"><label>Freeze Cols <span class="field-note">(Excel)</span></label>
          <input type="number" id="rb-freeze-col" value="${t.freezeCol}" min="0" max="10" style="width:70px;"/>
        </div>

        <!-- Column toggles — visible to all roles -->
        <div class="rb-section-title" style="margin-top:16px;">📋 Columns</div>
        <div class="rb-col-hint">Drag to reorder · tick to show/hide</div>
        <div id="rb-col-list">
          ${_previewCols.map((col,i) => `
            <div class="rb-col-item" draggable="true" data-idx="${i}"
              ondragstart="rbColDragStart(event,${i})"
              ondragover="rbColDragOver(event)"
              ondrop="rbColDrop(event,${i})">
              <span class="rb-drag">⠿</span>
              <input type="checkbox" ${col.visible?'checked':''} onchange="rbToggleCol(${i},this.checked)"/>
              <span class="rb-col-name">${esc(col.label)}</span>
            </div>`).join('')}
        </div>
        <div style="margin-top:10px;font-size:11px;color:var(--text-tertiary);font-style:italic;">
          Changes here apply to your current export only.${typeof isAdmin === 'function' && isAdmin() ? ' Use <b>Save Template</b> to persist for everyone.' : ''}
        </div>` : ''}
      </div>

      <!-- RIGHT PANEL: live spreadsheet preview -->
      <div class="rb-preview" id="rb-preview">
        ${isGlobal ? `
        <div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3);font-size:15px;font-style:italic;flex-direction:column;gap:12px;">
          <div style="font-size:36px;">🎨</div>
          <div>Global branding applies to all reports.</div>
          <div style="font-size:13px;">Save your branding settings on the left and they will appear in every PDF and Excel export.</div>
        </div>` : buildPreviewHTML()}
      </div>

    </div>`;

  // Attach column resize listeners after render
  if (!isGlobal) attachColResizeListeners();
}

// ── BUILD PREVIEW HTML (spreadsheet look) ─────────────────────
function buildPreviewHTML() {
  const t      = _previewTmpl;
  const cols   = _previewCols.filter(c => c.visible);
  const accent = t.accentColour;
  const font   = t.fontFamily;
  const rows   = _previewData.slice(0, 50); // show first 50 rows in preview

  return `
    <div class="rb-sheet" id="rb-sheet" style="font-family:${font},Arial,sans-serif;">

      <!-- Header block -->
      <div class="rb-sheet-header" id="rb-sheet-header" style="border-left:5px solid ${accent};">
        <div style="display:flex;align-items:center;gap:14px;">
          <img id="rb-header-logo" src="${t.logoUrl||''}" style="height:48px;display:${t.logoUrl?'block':'none'};border-radius:6px;"/>
          <div>
            <div id="rb-header-company" style="font-size:18px;font-weight:700;color:${accent};">${esc(t.companyName)}</div>
            <div id="rb-header-subtitle" style="font-size:13px;color:#555;">${esc(t.companySubtitle)}</div>
            <div style="font-size:11px;color:#888;margin-top:2px;">Preview — ${new Date().toLocaleDateString('en-MY')}</div>
          </div>
        </div>
      </div>

      <!-- Spreadsheet table -->
      <div class="rb-table-wrap">
        <table class="rb-table" id="rb-table">
          <thead>
            <tr id="rb-header-row">
              <th class="rb-rownum">#</th>
              ${cols.map((col,ci) => `
                <th class="rb-th" data-ci="${ci}" style="background:${accent};min-width:${col.width||100}px;max-width:${col.width||100}px;width:${col.width||100}px;">
                  <div class="rb-th-inner">
                    <span>${esc(col.label)}</span>
                    <div class="rb-resize-handle" data-ci="${ci}"></div>
                  </div>
                </th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row,ri) => `
              <tr class="${ri%2===0?'rb-even':'rb-odd'}">
                <td class="rb-rownum">${ri+1}</td>
                ${cols.map(col => `<td class="rb-td" style="max-width:${col.width||100}px;">${esc(String(row[col.key]??''))}</td>`).join('')}
              </tr>`).join('')}
            ${rows.length === 0 ? `<tr><td colspan="${cols.length+1}" style="text-align:center;padding:32px;color:#888;font-style:italic;">No data to preview.</td></tr>` : ''}
          </tbody>
        </table>
      </div>

      <!-- Footer -->
      <div class="rb-sheet-footer" id="rb-sheet-footer">
        <span id="rb-footer-text">${esc(t.footerText)}</span>
        <span style="float:right;color:#aaa;">Rows shown: ${rows.length}${_previewData.length > 50 ? ` of ${_previewData.length}` : ''}</span>
      </div>

    </div>`;
}

// ── REALTIME PREVIEW UPDATES ──────────────────────────────────
function rebuildPreviewHeader() {
  const co   = document.getElementById('rb-company-name')?.value || '';
  const sub  = document.getElementById('rb-subtitle')?.value     || '';
  document.getElementById('rb-header-company')?.textContent && (document.getElementById('rb-header-company').textContent = co);
  document.getElementById('rb-header-subtitle')?.textContent && (document.getElementById('rb-header-subtitle').textContent = sub);
}
function rebuildPreviewFooter() {
  const ft = document.getElementById('rb-footer')?.value || '';
  const el = document.getElementById('rb-footer-text');
  if (el) el.textContent = ft;
}
function applyAccentColour(colour) {
  document.querySelectorAll('.rb-th').forEach(th => th.style.background = colour);
  const hco = document.getElementById('rb-header-company');
  if (hco) hco.style.color = colour;
  const sheet = document.getElementById('rb-sheet');
  if (sheet) sheet.style.borderLeftColor = colour;
  const shHeader = document.getElementById('rb-sheet-header');
  if (shHeader) shHeader.style.borderLeftColor = colour;
}
function applyFont(font) {
  const sheet = document.getElementById('rb-sheet');
  if (sheet) sheet.style.fontFamily = font + ',Arial,sans-serif';
}
function previewBuilderLogo(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const prev = document.getElementById('rb-logo-preview');
    const hdr  = document.getElementById('rb-header-logo');
    if (prev) { prev.src = ev.target.result; prev.style.display = 'block'; }
    if (hdr)  { hdr.src  = ev.target.result; hdr.style.display  = 'block'; }
  };
  reader.readAsDataURL(file);
}
function removeBuilderLogo() {
  ['rb-logo-preview','rb-header-logo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.src = ''; el.style.display = 'none'; }
  });
}

// ── COLUMN TOGGLE ─────────────────────────────────────────────
function rbToggleCol(idx, visible) {
  if (_previewCols[idx]) _previewCols[idx].visible = visible;
  // Store as per-session override so export uses these columns
  if (_previewType) _exportColumnOverride[_previewType] = JSON.parse(JSON.stringify(_previewCols));
  refreshPreviewTable();
}

function refreshPreviewTable() {
  const preview = document.getElementById('rb-preview');
  if (!preview) return;
  // Sync _previewTmpl columns before rebuilding
  _previewTmpl.columns = _previewCols;
  preview.innerHTML = buildPreviewHTML();
  attachColResizeListeners();
}

// ── COLUMN DRAG TO REORDER ────────────────────────────────────
function rbColDragStart(e, idx) { _dragSrcIdx = idx; e.dataTransfer.effectAllowed = 'move'; }
function rbColDragOver(e)       { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function rbColDrop(e, idx) {
  e.preventDefault();
  if (_dragSrcIdx === null || _dragSrcIdx === idx) return;
  const moved = _previewCols.splice(_dragSrcIdx, 1)[0];
  _previewCols.splice(idx, 0, moved);
  _dragSrcIdx = null;
  // Rebuild col list and table
  const colList = document.getElementById('rb-col-list');
  if (colList) colList.innerHTML = _previewCols.map((col,i) => `
    <div class="rb-col-item" draggable="true" data-idx="${i}"
      ondragstart="rbColDragStart(event,${i})"
      ondragover="rbColDragOver(event)"
      ondrop="rbColDrop(event,${i})">
      <span class="rb-drag">⠿</span>
      <input type="checkbox" ${col.visible?'checked':''} onchange="rbToggleCol(${i},this.checked)"/>
      <span class="rb-col-name">${esc(col.label)}</span>
    </div>`).join('');
  refreshPreviewTable();
}

// ── COLUMN RESIZE ─────────────────────────────────────────────
function attachColResizeListeners() {
  document.querySelectorAll('.rb-resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => {
      const ci     = parseInt(handle.dataset.ci);
      _resizingCol  = ci;
      _resizeStartX = e.clientX;
      _resizeStartW = _previewCols.filter(c=>c.visible)[ci]?.width || 100;
      e.preventDefault();
    });
  });
  document.addEventListener('mousemove', onColResize);
  document.addEventListener('mouseup',   onColResizeEnd);
}
function onColResize(e) {
  if (_resizingCol === null) return;
  const visibleCols = _previewCols.filter(c => c.visible);
  const col         = visibleCols[_resizingCol];
  if (!col) return;
  const newW = Math.max(40, _resizeStartW + (e.clientX - _resizeStartX));
  col.width  = newW;
  // Find the TH and update its width live
  const ths = document.querySelectorAll('#rb-table .rb-th');
  if (ths[_resizingCol]) {
    ths[_resizingCol].style.width    = newW + 'px';
    ths[_resizingCol].style.minWidth = newW + 'px';
    ths[_resizingCol].style.maxWidth = newW + 'px';
  }
  // Update TDs in same column
  document.querySelectorAll(`#rb-table tbody tr`).forEach(row => {
    const tds = row.querySelectorAll('td.rb-td');
    if (tds[_resizingCol]) tds[_resizingCol].style.maxWidth = newW + 'px';
  });
}
function onColResizeEnd() { _resizingCol = null; }

// ── SAVE TEMPLATE FROM BUILDER ────────────────────────────────
async function saveBuilderTemplate() {
  const type     = _previewType; if (!type) return;
  const isGlobal = type === 'global';
  const logoEl   = document.getElementById('rb-logo-preview');
  const logoSrc  = (logoEl && logoEl.style.display !== 'none' && logoEl.src && !logoEl.src.endsWith(window.location.href)) ? logoEl.src : null;

  const patch = {
    company_name:     document.getElementById('rb-company-name')?.value.trim() || '',
    company_subtitle: document.getElementById('rb-subtitle')?.value.trim()      || '',
    logo_url:         logoSrc,
    accent_colour:    document.getElementById('rb-accent')?.value               || '#1a8c01',
    font_family:      document.getElementById('rb-font')?.value                 || 'Arial',
    footer_text:      document.getElementById('rb-footer')?.value.trim()        || '',
    freeze_row:       parseInt(document.getElementById('rb-freeze-row')?.value) || 1,
    freeze_col:       parseInt(document.getElementById('rb-freeze-col')?.value) || 0,
    page_size:        document.getElementById('rb-page-size')?.value            || 'A4',
    orientation:      document.getElementById('rb-orientation')?.value          || 'landscape',
  };
  if (!isGlobal) patch.columns = _previewCols;

  const ok = await saveReportTemplate(type, patch);
  if (ok) { showToast('Template saved.'); renderReportTemplateList(); }
  else      showToast('Failed to save template.', true);
}

// ── EXPORT FROM BUILDER ───────────────────────────────────────
function exportFromBuilder(format) {
  const meta = REPORT_TYPES_LIST.find(r => r.key === _previewType);
  // Always export with current preview column config
  if (_previewType) _exportColumnOverride[_previewType] = JSON.parse(JSON.stringify(_previewCols));
  if (format === 'pdf')  exportPDF(_previewType, _previewData, meta?.label || _previewType);
  if (format === 'xlsx') exportXLSX(_previewType, _previewData, meta?.label || _previewType);
}

// ══════════════════════════════════════════════════════════════
//  PDF EXPORT
// ══════════════════════════════════════════════════════════════
function exportPDF(reportType, rows, title) {
  const t      = getTemplate(reportType);
  const cols   = getExportColumns(reportType).length ? getExportColumns(reportType) : (t.columns.length ? t.columns : (REPORT_COLUMNS[reportType]||[])).filter(c => c.visible);
  const accent = t.accentColour;
  const font   = t.fontFamily;

  const logoHtml = t.logoUrl
    ? `<img src="${t.logoUrl}" style="height:52px;width:auto;border-radius:6px;print-color-adjust:exact;-webkit-print-color-adjust:exact;"/>`
    : `<div style="width:52px;height:52px;background:${accent};color:#fff;font-weight:700;font-size:14px;display:inline-flex;align-items:center;justify-content:center;border-radius:10px;print-color-adjust:exact;-webkit-print-color-adjust:exact;">MJM</div>`;

  const tableHtml = `
    <table style="width:100%;border-collapse:collapse;font-size:11px;font-family:${font},Arial;">
      <thead>
        <tr>
          ${cols.map(c=>`<th style="background:${accent};color:#fff;padding:8px 10px;text-align:left;border:1px solid ${accent};white-space:nowrap;font-weight:600;print-color-adjust:exact;-webkit-print-color-adjust:exact;">${esc(c.label)}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map((r,i)=>`<tr style="background:${i%2===0?'#f4efe6':'#ffffff'};print-color-adjust:exact;-webkit-print-color-adjust:exact;">
          ${cols.map(c=>`<td style="padding:6px 10px;border:1px solid #ddd;vertical-align:top;">${esc(String(r[c.key]??''))}</td>`).join('')}
        </tr>`).join('')}
      </tbody>
    </table>`;

  const win = window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>${esc(title)}</title>
    <style>
      @page { size:${t.pageSize} ${t.orientation}; margin:16mm; }
      * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; color-adjust:exact !important; }
      body { margin:0; font-family:${font},Arial,sans-serif; }
      table { page-break-inside:auto; width:100%; border-collapse:collapse; }
      tr    { page-break-inside:avoid; }
      thead { display:table-header-group; }
      th    { background:${accent} !important; color:#fff !important; }
      /* Toolbar — screen only, completely hidden in print */
      .screen-only { display:flex; }
      @media print { .screen-only { display:none !important; } }
    </style>
  </head><body>

    <!-- SCREEN ONLY toolbar — never prints -->
    <div class="screen-only" style="padding:14px 18px;background:#f0f4ee;border-bottom:2px solid ${accent};gap:14px;align-items:center;position:sticky;top:0;z-index:10;">
      <button onclick="window.print()" style="background:${accent};color:#fff;border:none;padding:10px 26px;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:.3px;">🖨 Print / Save as PDF</button>
      <span style="font-size:13px;color:#5a7a50;">In the print dialog, choose <strong>Save as PDF</strong> as destination.</span>
    </div>

    <!-- DOCUMENT CONTENT — exactly what prints -->
    <div style="padding:0;">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:18px;padding-bottom:14px;border-bottom:3px solid ${accent};">
        ${logoHtml}
        <div>
          <div style="font-size:20px;font-weight:700;color:${accent};font-family:${font},Arial;">${esc(t.companyName)}</div>
          <div style="font-size:13px;color:#555;margin-top:2px;">${esc(t.companySubtitle || title)}</div>
          <div style="font-size:11px;color:#888;margin-top:3px;">Generated: ${new Date().toLocaleString('en-MY')} &nbsp;·&nbsp; ${rows.length} record${rows.length!==1?'s':''}</div>
        </div>
      </div>
      ${tableHtml}
      ${t.footerText ? `<div style="margin-top:16px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:8px;">${esc(t.footerText)}</div>` : ''}
    </div>

  </body></html>`);
  win.document.close();
}

// ══════════════════════════════════════════════════════════════
//  XLSX EXPORT — real .xlsx with SheetJS
// ══════════════════════════════════════════════════════════════
async function exportXLSX(reportType, rows, title) {
  await loadXLSX();
  if (!window.XLSX) { showToast('XLSX library not loaded. Please check your connection.', true); return; }

  const t      = getTemplate(reportType);
  const cols   = getExportColumns(reportType).length ? getExportColumns(reportType) : (t.columns.length ? t.columns : (REPORT_COLUMNS[reportType]||[])).filter(c => c.visible);
  const accent = t.accentColour.replace('#','');
  const XLSX   = window.XLSX;

  // Build worksheet data
  const headerRow = cols.map(c => c.label);
  const dataRows  = rows.map(r => cols.map(c => {
    const v = r[c.key] ?? '';
    const s = String(v);
    // Only treat as number if the ENTIRE value is numeric (no letters/spaces)
    // This prevents "29 Apr 2034 (7.9yr)" being parsed as 29
    if (s.trim() !== '' && /^-?[\d,]+(\.\d+)?$/.test(s.replace(/,/g,''))) {
      return parseFloat(s.replace(/,/g,''));
    }
    return s;
  }));

  const wsData = [headerRow, ...dataRows];
  const ws     = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = cols.map(c => ({ wch: Math.round((c.width||100)/7) }));

  // Freeze panes
  if (t.freezeRow > 0 || t.freezeCol > 0) {
    ws['!freeze'] = { xSplit: t.freezeCol, ySplit: t.freezeRow, topLeftCell: XLSX.utils.encode_cell({ r: t.freezeRow, c: t.freezeCol }) };
  }

  // Header row styling
  cols.forEach((col, ci) => {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: ci });
    if (!ws[cellAddr]) return;
    ws[cellAddr].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' }, name: t.fontFamily || 'Arial', sz: 11 },
      fill:      { fgColor: { rgb: accent } },
      alignment: { horizontal: 'left', vertical: 'center', wrapText: false },
      border:    { bottom: { style: 'thin', color: { rgb: 'FFFFFF' } } }
    };
  });

  // Alternating row fill for data rows
  dataRows.forEach((row, ri) => {
    row.forEach((_, ci) => {
      const addr = XLSX.utils.encode_cell({ r: ri + 1, c: ci });
      if (!ws[addr]) return;
      ws[addr].s = {
        fill:      { fgColor: { rgb: ri % 2 === 0 ? 'F8F9F6' : 'FFFFFF' } },
        font:      { name: t.fontFamily || 'Arial', sz: 10 },
        alignment: { vertical: 'top', wrapText: false },
        border:    { bottom: { style: 'hair', color: { rgb: 'E0E0E0' } } }
      };
    });
  });

  // Create workbook with metadata
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: title, Author: t.companyName, CreatedDate: new Date() };
  XLSX.utils.book_append_sheet(wb, ws, title.slice(0, 31)); // sheet name max 31 chars

  // Add header/footer metadata (for Excel print header/footer)
  ws['!margins'] = { left:0.7, right:0.7, top:1, bottom:1, header:0.3, footer:0.3 };

  // Download
  const fileName = `${title.replace(/[\s/\\?%*:|"<>]/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName, { bookType:'xlsx', type:'binary', cellStyles: true });
  showToast(`${title} exported as XLSX.`);
}

// ══════════════════════════════════════════════════════════════
//  EXPORT ENTRY POINTS (called by page buttons)
// ══════════════════════════════════════════════════════════════
function exportWorkersReport(format) {
  const rows = getWorkersReportData(_getFilteredWorkers());
  format==='pdf' ? exportPDF('workers',rows,'Worker Profiles Report') : exportXLSX('workers',rows,'Worker Profiles Report');
}
function exportWorkerProfile(workerId, format) {
  const w = workers.find(x => x.id === workerId); if (!w) return;
  const rows = buildWorkerProfileRows(w);
  const name = w.general?.name || workerId;
  format==='pdf' ? exportPDF('worker_profile',rows,`Worker Profile — ${name}`) : exportXLSX('worker_profile',rows,`Worker Profile — ${name}`);
}
function exportApQuotaReport(format) {
  const rows = getApQuotaReportData();
  format==='pdf' ? exportPDF('ap_quota',rows,'AP Quota Status Report') : exportXLSX('ap_quota',rows,'AP Quota Status Report');
}
function exportLeaveStatusReport(format) {
  const rows = getLeaveStatusReportData();
  format==='pdf' ? exportPDF('leave_status',rows,'Workers Leave Status Report') : exportXLSX('leave_status',rows,'Workers Leave Status Report');
}
function exportDocStatusReport(format) {
  const rows = getDocStatusReportData();
  format==='pdf' ? exportPDF('doc_status',rows,'Document Status Report') : exportXLSX('doc_status',rows,'Document Status Report');
}
function exportFinancialReport(format) {
  const rows = getFinancialReportData();
  format==='pdf' ? exportPDF('financial',rows,'Financial Report') : exportXLSX('financial',rows,'Financial Report');
}

// Worker profile: field-value rows
function buildWorkerProfileRows(w) {
  const g=w.general||{}; const l=w.legal||{}; const c=w.claims||{};
  return [
    {field:'Worker ID',        value:g.workerId||''},
    {field:'Full Name',        value:g.name||''},
    {field:'Nationality',      value:g.nationality||''},
    {field:'IC / Passport',    value:g.passport||''},
    {field:'Category',         value:deriveCategory(w)},
    {field:'Status',           value:deriveStatus(w)},
    {field:'Work Location',    value:g.location||''},
    {field:'Joining Date',     value:formatDate(g.joining)},
    {field:'Recruitment Date', value:formatDate(g.recruitment)},
    {field:'Termination',      value:formatDate(g.termination)},
    {field:'Departure',        value:formatDate(g.departure)},
    {field:'Passport No.',     value:l.passport?.number||''},
    {field:'Passport Expiry',  value:formatDate(l.passport?.expiry)},
    {field:'AP Company',       value:l.quota?.company||''},
    {field:'KDN Ref.',         value:l.quota?.kdn||''},
    {field:'Quota Slot',       value:l.quota?.slot||''},
    {field:'License Reg.',     value:l.license?.reg||''},
    {field:'License Expiry',   value:formatDate(l.license?.expiry)},
    {field:'SOCSO Reg.',       value:l.socso?.reg||''},
    {field:'Permit Reg.',      value:l.permit?.reg||''},
    {field:'Permit Expiry',    value:formatDate(l.permit?.expiry)},
    {field:'1st Claim',        value:c.claim1?formatDate(c.claim1):'Not claimed'},
    {field:'2nd Claim',        value:c.claim2?formatDate(c.claim2):'Not claimed'},
    {field:'3rd Claim',        value:c.claim3?formatDate(c.claim3):'Not claimed'},
    {field:'Remarks',          value:g.remarks||''},
  ];
}

// Existing generateFinReport kept for compatibility
function generateFinReport() { exportFinancialReport('xlsx'); }

// ══════════════════════════════════════════════════════════════
//  EXPORT COLUMN PICKER — per-export popup (all users)
// ══════════════════════════════════════════════════════════════

let _pickerType   = null;   // report type being exported
let _pickerCols   = [];     // mutable column list for this export
let _pickerDragSrc = null;

function openExportPicker(reportType) {
  _pickerType = reportType;
  const t    = getTemplate(reportType);
  const meta = REPORT_TYPES_LIST.find(r => r.key === reportType);

  // Start from saved template columns (or defaults), deep copy
  const saved = (t.columns && t.columns.length) ? t.columns : (REPORT_COLUMNS[reportType] || []);
  _pickerCols = JSON.parse(JSON.stringify(saved));

  // Title
  const titleEl = document.getElementById('exportPickerTitle');
  if (titleEl) titleEl.textContent = `Export — ${meta?.label || reportType}`;

  // Note
  const noteEl = document.getElementById('exportPickerNote');
  if (noteEl) noteEl.textContent = typeof isAdmin === 'function' && isAdmin()
    ? 'Column widths are set in Settings → Report Templates.'
    : 'Admins can set default column widths in Settings → Report Templates.';

  renderPickerCols();
  openModal('exportPickerModal');
}

function renderPickerCols() {
  const el = document.getElementById('exportPickerCols');
  if (!el) return;
  el.innerHTML = _pickerCols.map((col, i) => `
    <div class="export-picker-row" draggable="true" data-idx="${i}"
      ondragstart="pickerDragStart(event,${i})"
      ondragover="pickerDragOver(event)"
      ondrop="pickerDrop(event,${i})"
      ondragend="pickerDragEnd()">
      <span class="rb-drag" style="padding:0 8px;color:var(--text-tertiary);font-size:15px;">⠿</span>
      <input type="checkbox" ${col.visible ? 'checked' : ''} onchange="pickerToggle(${i},this.checked)"
        style="width:16px;height:16px;cursor:pointer;accent-color:var(--accent-primary);flex-shrink:0;"/>
      <span style="font-size:13.5px;color:var(--text-primary);flex:1;font-family:var(--font-body);">${esc(col.label)}</span>
    </div>`).join('');
}

function pickerToggle(idx, visible) {
  if (_pickerCols[idx]) _pickerCols[idx].visible = visible;
}

function pickerDragStart(e, idx) {
  _pickerDragSrc = idx;
  e.dataTransfer.effectAllowed = 'move';
  e.currentTarget.style.opacity = '0.5';
}
function pickerDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }
function pickerDragEnd()   { document.querySelectorAll('.export-picker-row').forEach(r => r.style.opacity = '1'); }
function pickerDrop(e, idx) {
  e.preventDefault();
  if (_pickerDragSrc === null || _pickerDragSrc === idx) return;
  const moved = _pickerCols.splice(_pickerDragSrc, 1)[0];
  _pickerCols.splice(idx, 0, moved);
  _pickerDragSrc = null;
  renderPickerCols();
}

function closeExportPicker()     { closeModal('exportPickerModal'); }
function closeExportPickerOutside(e) { closeModalOutsideStack(e, 'exportPickerModal'); }

function doExport(format) {
  // Apply picker selection as override
  if (_pickerType) _exportColumnOverride[_pickerType] = JSON.parse(JSON.stringify(_pickerCols));

  const meta  = REPORT_TYPES_LIST.find(r => r.key === _pickerType);
  const title = meta?.label || _pickerType;

  // Get the right data — always use filtered+sorted versions matching the visible table
  let rows = [];
  switch (_pickerType) {
    case 'workers':        rows = getWorkersReportData(_getFilteredWorkers()); break;
    case 'worker_profile': rows = buildWorkerProfileRows(workers.find(w => w.id === (typeof _currentViewId !== 'undefined' ? _currentViewId : null)) || workers[0]); break;
    case 'ap_quota':       rows = getApQuotaReportData();        break;
    case 'leave_status':   rows = _getFilteredLeaveRows();       break;
    case 'doc_status':     rows = _getFilteredDocRows();         break;
    case 'financial':      rows = _getFilteredFinancialRows();   break;
    default:               rows = [];
  }

  closeExportPicker();
  if (format === 'pdf')  exportPDF(_pickerType, rows, title);
  if (format === 'xlsx') exportXLSX(_pickerType, rows, title);
}