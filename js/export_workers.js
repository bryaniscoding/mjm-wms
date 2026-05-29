// ══════════════════════════════════════════════════════════════
//  WORKER PROFILES EXPORT — PDF & XLSX
//  Template: MJM Groups Worker Profiles
// ══════════════════════════════════════════════════════════════

// All available columns matching the template exactly
const WORKER_EXPORT_COLS = [
  { key: 'workerId',      label: 'Worker ID',             width: 12 },
  { key: 'photo',         label: 'Profile Picture',       width: 16, isPhoto: true },
  { key: 'name',          label: 'Name',                  width: 19 },
  { key: 'status',        label: 'Status',                width: 9  },
  { key: 'gender',        label: 'Gender',                width: 9  },
  { key: 'category',      label: 'Category',              width: 13 },
  { key: 'quotaCompany',  label: 'AP Quota Company',      width: 20 },
  { key: 'location',      label: 'Work Location',         width: 16 },
  { key: 'nationality',   label: 'Nationality',           width: 12 },
  { key: 'passportNo',    label: 'Passport No.',          width: 9  },
  { key: 'passportExpiry',label: 'Passport Expiry',       width: 12 },
  { key: 'passportStatus',label: 'Passport Status',       width: 12 },
  { key: 'joiningDate',   label: 'Joining Date',          width: 13 },
  { key: 'recruitment',   label: 'Recruitment Date',      width: 15 },
  { key: 'socso',         label: 'SOCSO No.',             width: 15 },
  { key: 'licenseNo',     label: 'Labour License No.',    width: 35 },
  { key: 'licenseExpiry', label: 'Labour License Expiry', width: 15 },
  { key: 'permitNo',      label: 'Work Permit No.',       width: 22 },
  { key: 'permitExpiry',  label: 'Work Permit Exp.',      width: 12 },
  { key: 'termination',   label: 'Termination Date',      width: 14 },
  { key: 'departure',     label: 'Departure Date',        width: 15 },
];

// Which columns are selected (all by default)
let _exportSelectedCols = null; // null = all

// Get currently filtered + sorted workers (mirrors renderWorkerTable exactly)
function getFilteredSortedWorkers() {
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

// Build row data from a worker
function buildWorkerExportRow(w) {
  const g = w.general || {};
  const l = w.legal   || {};
  const passExpiry = l.passport?.expiry || '';
  const today = new Date(); today.setHours(0,0,0,0);
  let passStatus = '';
  if (passExpiry) {
    const exp = new Date(passExpiry); exp.setHours(0,0,0,0);
    passStatus = exp < today ? 'Expired' : 'With Worker';
  }
  return {
    workerId:       g.workerId      || '',
    photo:          g.photo         || '',
    name:           g.name          || '',
    status:         deriveStatus(w),
    gender:         g.gender        || '',
    category:       deriveCategory(w),
    quotaCompany:   l.quota?.company || '',
    location:       g.location      || '',
    nationality:    g.nationality   || '',
    passportNo:     l.passport?.number || g.passport || '',
    passportExpiry: passExpiry ? formatDate(passExpiry) : '',
    passportStatus: passStatus,
    joiningDate:    formatDate(g.joining)      || '',
    recruitment:    formatDate(g.recruitment)  || '',
    socso:          l.socso?.reg               || '',
    licenseNo:      l.license?.reg             || '',
    licenseExpiry:  formatDate(l.license?.expiry) || '',
    permitNo:       l.permit?.reg              || '',
    permitExpiry:   formatDate(l.permit?.expiry)  || '',
    termination:    formatDate(g.termination)  || '',
    departure:      formatDate(g.departure)    || '',
  };
}

// ── COLUMN PICKER MODAL ───────────────────────────────────────
function openWorkerExportPicker() {
  const modal = document.getElementById('workerExportPickerModal');
  if (!modal) return;

  // Build column checkboxes
  const list = document.getElementById('wep-col-list');
  if (!list) return;

  const selected = _exportSelectedCols || WORKER_EXPORT_COLS.map(c => c.key);

  list.innerHTML = WORKER_EXPORT_COLS.map(col => `
    <label style="display:flex;align-items:center;gap:10px;padding:9px 14px;border-bottom:1px solid var(--border-default);cursor:pointer;transition:background .12s;" onmouseover="this.style.background='rgba(139,105,20,.04)'" onmouseout="this.style.background=''">
      <input type="checkbox" value="${col.key}" ${selected.includes(col.key) ? 'checked' : ''}
        style="width:16px;height:16px;accent-color:var(--accent-primary);cursor:pointer;flex-shrink:0;"
        onchange="updateWepSelectAll()"/>
      <span style="font-size:13.5px;color:var(--text-primary);font-family:var(--font-body);">${esc(col.label)}</span>
    </label>`).join('');

  updateWepSelectAll();
  openModal('workerExportPickerModal');
}

function updateWepSelectAll() {
  const boxes    = document.querySelectorAll('#wep-col-list input[type="checkbox"]');
  const allBox   = document.getElementById('wep-select-all');
  if (!allBox) return;
  const total    = boxes.length;
  const checked  = [...boxes].filter(b => b.checked).length;
  allBox.checked       = checked === total;
  allBox.indeterminate = checked > 0 && checked < total;
}

function toggleWepAll(cb) {
  document.querySelectorAll('#wep-col-list input[type="checkbox"]')
    .forEach(b => b.checked = cb.checked);
}

function getWepSelectedKeys() {
  return [...document.querySelectorAll('#wep-col-list input[type="checkbox"]:checked')]
    .map(b => b.value);
}

function closeWorkerExportPicker() { closeModal('workerExportPickerModal'); }
function closeWorkerExportPickerOutside(e) { closeModalOutsideStack(e, 'workerExportPickerModal'); }

function doWorkerExport(format) {
  const keys = getWepSelectedKeys();
  if (!keys.length) { showToast('Please select at least one column.', true); return; }
  _exportSelectedCols = keys;
  const cols = WORKER_EXPORT_COLS.filter(c => keys.includes(c.key));
  const data = getFilteredSortedWorkers().map(buildWorkerExportRow);
  closeWorkerExportPicker();

  // Get active filter labels for header
  const locF  = document.getElementById('locationFilter')?.value  || '';
  const compF = document.getElementById('companyFilter')?.value   || '';

  if (format === 'pdf')  exportWorkersPDF(cols, data, locF, compF);
  if (format === 'xlsx') exportWorkersXLSX(cols, data, locF, compF);
}

// ── PDF EXPORT ────────────────────────────────────────────────
function exportWorkersPDF(cols, rows, locationFilter, companyFilter) {
  const ACCENT = '#1a5c2a'; // dark green header from template
  const ROW_H  = 70; // px row height for photo rows

  // Build table header row HTML
  const thHTML = cols.map(c =>
    `<th style="background:${ACCENT};color:#fff;padding:6px 5px;border:1px solid #999;font-size:9px;font-weight:700;text-align:center;vertical-align:middle;word-break:break-word;">${esc(c.label)}</th>`
  ).join('');

  // Build data rows
  const trHTML = rows.map(r => {
    const tds = cols.map(col => {
      let val = r[col.key] || '';
      if (col.isPhoto && val) {
        return `<td style="padding:3px;border:1px solid #ccc;text-align:center;vertical-align:middle;">
          <img src="${val}" style="width:50px;height:60px;object-fit:cover;border-radius:3px;" onerror="this.style.display='none'"/>
        </td>`;
      }
      return `<td style="padding:4px 5px;border:1px solid #ccc;font-size:9px;text-align:center;vertical-align:middle;word-break:break-word;">${esc(String(val))}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  const now = new Date().toLocaleString('en-MY', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head>
    <title>MJM Groups Worker Profiles</title>
    <style>
      @page { size: A4 landscape; margin: 6mm 6mm 10mm 6mm; }
      * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      body { margin:0; font-family:Calibri,Arial,sans-serif; font-size:9px; }
      table { border-collapse:collapse; width:100%; table-layout:fixed; }
      th, td { word-break:break-word; overflow-wrap:break-word; }
      .screen-only { display:flex; }
      @media print { .screen-only { display:none !important; } }
    </style>
  </head><body>

  <!-- Print toolbar -->
  <div class="screen-only" style="padding:10px 14px;background:#f0f4f0;border-bottom:2px solid ${ACCENT};gap:14px;align-items:center;position:sticky;top:0;z-index:10;">
    <button onclick="window.print()" style="background:${ACCENT};color:#fff;border:none;padding:10px 24px;border-radius:7px;font-size:13px;font-weight:700;cursor:pointer;">🖨 Print / Save as PDF</button>
    <span style="font-size:12px;color:#444;">In print dialog, select <strong>Save as PDF</strong> and set paper to <strong>A4 Landscape</strong>.</span>
  </div>

  <!-- Document header -->
  <div style="text-align:center;font-size:13px;font-weight:700;margin-bottom:6px;margin-top:4px;">MJM Groups Worker Profiles</div>
  <table style="margin-bottom:6px;border:none;width:auto;">
    <tr><td style="font-size:9px;font-weight:700;border:none;padding:1px 6px 1px 0;">AP Quota Company :</td><td style="font-size:9px;border:none;padding:1px 0;">${esc(companyFilter || 'All')}</td></tr>
    <tr><td style="font-size:9px;font-weight:700;border:none;padding:1px 6px 1px 0;">Work Location :</td><td style="font-size:9px;border:none;padding:1px 0;">${esc(locationFilter || 'All')}</td></tr>
    <tr><td style="font-size:9px;color:#666;border:none;padding:1px 6px 1px 0;">Generated :</td><td style="font-size:9px;color:#666;border:none;padding:1px 0;">${now} &nbsp;·&nbsp; ${rows.length} records</td></tr>
  </table>

  <table>
    <thead><tr>${thHTML}</tr></thead>
    <tbody>${trHTML}</tbody>
  </table>

  </body></html>`);
  win.document.close();
}

// ── XLSX EXPORT ───────────────────────────────────────────────
async function exportWorkersXLSX(cols, rows, locationFilter, companyFilter) {
  showToast('Generating Excel file…');

  // Load SheetJS from CDN
  if (!window.XLSX) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = resolve; s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const wb  = XLSX.utils.book_new();
  const now = new Date().toLocaleDateString('en-MY', { day:'2-digit', month:'2-digit', year:'numeric' });
  const nowFull = new Date().toLocaleString('en-MY', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });

  // Row 1: title
  // Row 2: AP Quota Company
  // Row 3: Work Location
  // Row 4: Generated / blank
  // Row 5: headers
  // Row 6+: data

  const aoa = [];
  aoa.push(['MJM Groups Worker Profiles', ...Array(cols.length - 1).fill('')]);
  aoa.push(['AP Quota Company :', companyFilter || 'All', ...Array(cols.length - 2).fill('')]);
  aoa.push(['Work Location :',    locationFilter || 'All', ...Array(cols.length - 2).fill('')]);
  aoa.push([`Generated: ${nowFull}  ·  ${rows.length} records`, ...Array(cols.length - 1).fill('')]);
  aoa.push(cols.map(c => c.label)); // header row (row 5)

  rows.forEach(r => {
    aoa.push(cols.map(c => {
      if (c.isPhoto) return '[Photo]'; // can't embed images in SheetJS community
      return r[c.key] || '';
    }));
  });

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = cols.map(c => ({ wch: c.width }));

  // Row heights
  const rowHeights = [
    { hpt: 20 }, // title
    { hpt: 14 }, // AP company
    { hpt: 14 }, // location
    { hpt: 14 }, // generated
    { hpt: 28 }, // header
    ...rows.map(() => ({ hpt: 72 })), // data rows
  ];
  ws['!rows'] = rowHeights;

  // Merge title row A1 across all columns
  const lastCol = XLSX.utils.encode_col(cols.length - 1);
  ws['!merges'] = [
    { s: { r:0, c:0 }, e: { r:0, c:cols.length-1 } },
  ];

  // Styling using SheetJS styles (requires xlsx-style or write with styles)
  // Apply basic formatting via cell styles
  const GREEN_FILL = { patternType: 'solid', fgColor: { rgb: '1A5C2A' } };
  const WHITE_FONT = { bold: true, color: { rgb: 'FFFFFF' }, sz: 9, name: 'Calibri' };
  const BOLD_FONT  = { bold: true, sz: 11, name: 'Calibri' };
  const NORM_FONT  = { sz: 9, name: 'Calibri' };
  const CENTER     = { horizontal: 'center', vertical: 'center', wrapText: true };
  const LEFT       = { horizontal: 'left',   vertical: 'center', wrapText: true };
  const BORDER     = { top:{style:'thin'}, bottom:{style:'thin'}, left:{style:'thin'}, right:{style:'thin'} };

  // Title cell
  const titleCell = ws['A1'];
  if (titleCell) {
    titleCell.s = { font: BOLD_FONT, alignment: CENTER };
  }

  // Header row (row index 4 = row 5)
  cols.forEach((c, ci) => {
    const addr = XLSX.utils.encode_cell({ r: 4, c: ci });
    if (ws[addr]) {
      ws[addr].s = {
        font: WHITE_FONT,
        fill: GREEN_FILL,
        alignment: CENTER,
        border: BORDER,
      };
    }
  });

  // Data rows
  rows.forEach((r, ri) => {
    cols.forEach((c, ci) => {
      const addr = XLSX.utils.encode_cell({ r: 5 + ri, c: ci });
      if (ws[addr]) {
        ws[addr].s = {
          font: NORM_FONT,
          alignment: c.isPhoto ? CENTER : (ci === 2 ? LEFT : CENTER),
          border: BORDER,
        };
      }
    });
  });

  // Page setup: landscape A4
  ws['!pageSetup'] = {
    paperSize: 8,  // A4
    orientation: 'landscape',
    fitToWidth: 1,
    fitToHeight: 0,
  };
  ws['!printOptions'] = { gridLines: false };

  XLSX.utils.book_append_sheet(wb, ws, 'Worker Profiles');
  XLSX.writeFile(wb, `MJM_Worker_Profiles_${now.replace(/\//g,'-')}.xlsx`);
  showToast('Excel file downloaded.');
}